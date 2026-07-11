"""GameManager — owns all live RoomRuntimes and mediates seating/economy."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal
from app.game.connection import hub
from app.game.runtime import RoomRuntime
from app.models import Room, RoomPlayer, User
from app.poker.holdem import Seat
from app.services.economy import InsufficientFunds, credit, debit

logger = logging.getLogger("poker.manager")


class GameManager:
    def __init__(self) -> None:
        self._runtimes: dict[int, RoomRuntime] = {}
        self._lock = asyncio.Lock()
        # (room_id, user_id) -> epoch when we first noticed them disconnected
        self._missing_since: dict[tuple[int, int], float] = {}
        self._janitor: asyncio.Task | None = None

    async def get_runtime(self, session: AsyncSession, room: Room) -> RoomRuntime:
        async with self._lock:
            rt = self._runtimes.get(room.id)
            if rt is not None:
                return rt
            rt = RoomRuntime(room)
            # hydrate persisted human seats
            players = (await session.execute(
                select(RoomPlayer, User)
                .join(User, User.id == RoomPlayer.user_id)
                .where(RoomPlayer.room_id == room.id)
            )).all()
            for rp, user in players:
                rt.game.add_seat(Seat(
                    user_id=user.id, name=user.display_name, seat=rp.seat,
                    stack=rp.stack, is_bot=user.is_bot, avatar=user.avatar or "🎩",
                    name_color=user.name_color or "",
                    bot_personality=user.bot_personality, bot_skill=user.bot_skill,
                    sitting_out=(rp.status == "sitting_out"),
                ))
            self._runtimes[room.id] = rt
            return rt

    async def seat_player(
        self, session: AsyncSession, room: Room, user: User, buy_in: int
    ) -> dict:
        if buy_in < room.min_buy_in or buy_in > room.max_buy_in:
            raise ValueError(
                f"Buy-in must be between {room.min_buy_in} and {room.max_buy_in}"
            )
        existing = (await session.execute(
            select(RoomPlayer).where(
                RoomPlayer.room_id == room.id, RoomPlayer.user_id == user.id
            )
        )).scalar_one_or_none()
        if existing:
            raise ValueError("Already seated at this table")

        seated_count = (await session.execute(
            select(RoomPlayer).where(RoomPlayer.room_id == room.id)
        )).scalars().all()
        if len(seated_count) >= room.max_players:
            raise ValueError("Table is full")

        try:
            await debit(session, user, buy_in, "buy_in", ref=room.code)
        except InsufficientFunds as e:
            raise ValueError(str(e)) from e

        rt = await self.get_runtime(session, room)
        # find a free seat number
        used = {s.seat for s in rt.game.seats} | {rp.seat for rp in seated_count}
        seat_no = next((i for i in range(room.max_players) if i not in used), None)
        if seat_no is None:
            raise ValueError("No free seat")

        rp = RoomPlayer(
            room_id=room.id, user_id=user.id, seat=seat_no, stack=buy_in,
            status="seated",
        )
        session.add(rp)
        user.games_played += 1
        await session.flush()
        await rt.add_seat(user, buy_in)
        logger.info("User %s seated in room %s (%s chips)", user.id, room.code, buy_in)
        return {"seat": seat_no, "stack": buy_in}

    async def unseat_player(
        self, session: AsyncSession, room: Room, user: User
    ) -> dict:
        rp = (await session.execute(
            select(RoomPlayer).where(
                RoomPlayer.room_id == room.id, RoomPlayer.user_id == user.id
            )
        )).scalar_one_or_none()
        if rp is None:
            raise ValueError("Not seated at this table")
        rt = self._runtimes.get(room.id)
        refund = await rt.remove_seat(user.id) if rt else rp.stack
        await session.delete(rp)
        if refund > 0:
            await credit(session, user, refund, "cash_out", ref=room.code)
        return {"refunded": refund}

    async def rebuy(
        self, session: AsyncSession, room: Room, user: User, amount: int
    ) -> dict:
        rp = (await session.execute(
            select(RoomPlayer).where(
                RoomPlayer.room_id == room.id, RoomPlayer.user_id == user.id
            )
        )).scalar_one_or_none()
        if rp is None:
            raise ValueError("Not seated")
        if rp.stack + amount > room.max_buy_in:
            raise ValueError("Exceeds max buy-in")
        await debit(session, user, amount, "buy_in", ref=room.code)
        rt = self._runtimes.get(room.id)
        if rt:
            async with rt.glock:
                seat = rt.game.get_seat(user.id)
                if seat:
                    seat.stack += amount
                    seat.sitting_out = False
        rp.stack += amount
        rp.status = "seated"
        return {"stack": rp.stack}

    def handle_action(self, room_id: int, user_id: int, action: str, amount: int) -> bool:
        rt = self._runtimes.get(room_id)
        if rt is None:
            return False
        return rt.submit_action(user_id, action, amount)

    def get_live(self, room_id: int) -> RoomRuntime | None:
        return self._runtimes.get(room_id)

    # ---- idle-seat janitor ----------------------------------------------
    def start_janitor(self) -> None:
        if self._janitor is None or self._janitor.done():
            self._janitor = asyncio.create_task(self._janitor_loop())

    async def _janitor_loop(self) -> None:
        logger.info("Seat janitor started (grace=%ss)", settings.IDLE_SEAT_GRACE_SECONDS)
        while True:
            try:
                await asyncio.sleep(settings.JANITOR_INTERVAL_SECONDS)
                await self._reap_idle_seats()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("janitor error")

    async def _reap_idle_seats(self) -> None:
        """Release seats of players who have been disconnected past the grace
        period, refunding their chips. Runtimes are the source of truth for
        who is seated; the connection hub tells us who is currently online."""
        now = time.time()
        grace = settings.IDLE_SEAT_GRACE_SECONDS
        for room_id, rt in list(self._runtimes.items()):
            present = hub.viewers(rt.code)
            humans = [s for s in rt.game.seats if not s.is_bot]
            for seat in humans:
                key = (room_id, seat.user_id)
                if seat.user_id in present:
                    self._missing_since.pop(key, None)
                    continue
                first = self._missing_since.get(key)
                if first is None:
                    self._missing_since[key] = now
                elif now - first >= grace:
                    self._missing_since.pop(key, None)
                    await self._reap_seat(room_id, seat.user_id)

        await self._reap_orphan_seats(grace)

    async def _reap_orphan_seats(self, grace: int) -> None:
        """Reap seats persisted in rooms that have no live runtime (e.g. after a
        backend restart) once they are older than the grace period. A returning
        player recreates a runtime first, which moves them under the presence
        logic above, so this only ever touches genuinely abandoned seats."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(grace, 60))
        async with SessionLocal() as session:
            rows = (await session.execute(
                select(RoomPlayer, Room, User)
                .join(Room, Room.id == RoomPlayer.room_id)
                .join(User, User.id == RoomPlayer.user_id)
                .where(RoomPlayer.updated_at < cutoff)
            )).all()
            for rp, room, user in rows:
                if room.id in self._runtimes:
                    continue  # handled by the presence logic
                if hub.has_viewers(room.code):
                    continue  # someone is connecting
                try:
                    await self.unseat_player(session, room, user)
                    await session.commit()
                    logger.info("Reaped orphan seat: user=%s room=%s", user.id, room.code)
                except ValueError:
                    await session.rollback()
                except Exception:
                    await session.rollback()
                    logger.exception("orphan reap failed user=%s", user.id)

    async def _reap_seat(self, room_id: int, user_id: int) -> None:
        async with SessionLocal() as session:
            room = await session.get(Room, room_id)
            user = await session.get(User, user_id)
            if not room or not user:
                return
            try:
                result = await self.unseat_player(session, room, user)
                await session.commit()
                logger.info(
                    "Reaped idle seat: user=%s room=%s refunded=%s",
                    user_id, room.code, result.get("refunded"),
                )
            except ValueError:
                await session.rollback()
            except Exception:
                await session.rollback()
                logger.exception("reap failed for user=%s room=%s", user_id, room_id)

    async def shutdown(self) -> None:
        if self._janitor:
            self._janitor.cancel()
        for rt in self._runtimes.values():
            await rt.stop()


manager = GameManager()
