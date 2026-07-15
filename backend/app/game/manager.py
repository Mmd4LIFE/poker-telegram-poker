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
from app.services.cosmetics import effective_avatar_color
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
                    stack=rp.stack, is_bot=user.is_bot, avatar=user.avatar or "user",
                    name_color=user.name_color or "",
                    avatar_color=effective_avatar_color(user),
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
            # The DB says you're seated; the live table may disagree. A runtime only
            # hydrates seats from RoomPlayer when it is FIRST built, so a row added to
            # an already-running table (a bot table, say) never reached the game — and
            # the player got stuck as a spectator who "is already seated" and cannot
            # sit. Re-attach them instead of shouting at them. No debit: they already
            # paid for this seat.
            rt = await self.get_runtime(session, room)
            if rt.game.get_seat(user.id) is None:
                await rt.reseat(user, existing.stack, existing.seat)
                logger.info(
                    "Re-attached orphaned seat: user=%s room=%s stack=%s",
                    user.id, room.code, existing.stack,
                )
                return {"seat": existing.seat, "stack": existing.stack, "resumed": True}
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
        # You cannot cash out of a tournament. Sit & Go chips are TOURNAMENT chips —
        # they are not money, and paying a stack out as coins would mint currency from
        # nothing (league entry is free). Busting out or walking away leaves the seat
        # in place; the tournament plays on and blinds you off.
        #
        # Every cash-out path in the app funnels through here — leaving, the idle-seat
        # janitor, and close_room — so this one guard seals all of them. The callers
        # already treat ValueError as "skip this seat".
        if getattr(room, "mode", "cash") == "sng":
            raise ValueError("You can't cash out of a tournament")

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
        # A tournament has no rebuys. Buying more chips mid-Sit&Go would break its
        # whole premise (fixed stacks, play to the death) and — since league entry is
        # free — it would also debit real coins for tournament chips that are never
        # cashed back out. Bust = you're out.
        if getattr(room, "mode", "cash") == "sng":
            raise ValueError("No rebuys in a tournament")
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

    async def forfeit_league(self, room: Room, user_id: int) -> dict:
        rt = self._runtimes.get(room.id)
        if rt is None:
            return {"forfeited": False}
        return await rt.forfeit(user_id)

    async def close_room(self, session: AsyncSession, room: Room) -> dict:
        """Cash everyone out, stop the runtime and retire the table."""
        players = (await session.execute(
            select(RoomPlayer, User)
            .join(User, User.id == RoomPlayer.user_id)
            .where(RoomPlayer.room_id == room.id)
        )).all()
        refunded = 0
        for rp, u in players:
            try:
                res = await self.unseat_player(session, room, u)
                refunded += int(res.get("refunded") or 0)
            except ValueError:
                pass
        rt = self._runtimes.pop(room.id, None)
        if rt:
            await rt.stop()
        room.status = "finished"
        logger.info("Closed room %s (refunded %s)", room.code, refunded)
        return {"refunded": refunded}

    async def _close_idle_rooms(self) -> None:
        hours = settings.ROOM_IDLE_CLOSE_HOURS
        if not hours:
            return
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        async with SessionLocal() as session:
            rooms = (await session.execute(
                select(Room).where(
                    Room.status != "finished",
                    Room.last_active_at.isnot(None),
                    Room.last_active_at < cutoff,
                )
            )).scalars().all()
            for room in rooms:
                # keep alive if humans are still watching/playing
                if hub.has_viewers(room.code):
                    room.last_active_at = datetime.now(timezone.utc)
                    continue
                try:
                    await self.close_room(session, room)
                except Exception:
                    logger.exception("close idle room %s failed", room.code)
            await session.commit()

    # ---- idle-seat janitor ----------------------------------------------
    def start_janitor(self) -> None:
        if self._janitor is None or self._janitor.done():
            self._janitor = asyncio.create_task(self._janitor_loop())

    async def _janitor_loop(self) -> None:
        logger.info("Seat janitor started (grace=%ss)", settings.IDLE_SEAT_GRACE_SECONDS)
        while True:
            try:
                await asyncio.sleep(settings.JANITOR_INTERVAL_SECONDS)
                # Each chore is isolated. They used to run in one try block, so a
                # failure in the first silently starved every one behind it.
                for chore in (
                    self._reap_idle_seats,
                    self._close_idle_rooms,
                    self._ensure_bot_tables,
                    self._resume_tournaments,
                ):
                    try:
                        await chore()
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.exception("janitor chore %s failed", chore.__name__)
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
                .where(
                    RoomPlayer.updated_at < cutoff,
                    # A tournament seat is not an orphan. You can't be reaped out of a
                    # Sit & Go — it plays on and blinds you off.
                    Room.mode != "sng",
                )
            )).all()
            # Snapshot to plain values FIRST. A rollback below expires every ORM object
            # in this session, and touching an expired attribute afterwards triggers a
            # lazy load in async context, which raises and kills the whole janitor pass
            # — starving the bot tables and the tournament resumer behind it.
            targets = [(room.id, room.code, user.id) for _rp, room, user in rows]

            for room_id, code, user_id in targets:
                if room_id in self._runtimes:
                    continue  # handled by the presence logic
                if hub.has_viewers(code):
                    continue  # someone is connecting
                room = await session.get(Room, room_id)
                user = await session.get(User, user_id)
                if not room or not user:
                    continue
                try:
                    await self.unseat_player(session, room, user)
                    await session.commit()
                    logger.info("Reaped orphan seat: user=%s room=%s", user_id, code)
                except ValueError:
                    await session.rollback()
                except Exception:
                    await session.rollback()
                    logger.exception("orphan reap failed user=%s", user_id)

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

    async def _resume_tournaments(self) -> None:
        """Restart any Sit & Go that isn't finished.

        A tournament that stops mid-way never books anyone's result — no finishing
        places, no LP, nothing. That can happen across a deploy, or if the process
        restarts. They're not optional to finish: someone's league standing depends
        on it. So we hunt them down and play them out.
        """
        async with SessionLocal() as session:
            rooms = list(
                (
                    await session.scalars(
                        select(Room).where(
                            Room.mode == "sng", Room.status != "finished"
                        )
                    )
                ).all()
            )
            for r in rooms:
                rt0 = self._runtimes.get(r.id)
                if rt0 is not None and rt0._task is not None and not rt0._task.done():
                    continue
                rt = await self.get_runtime(session, r)
                rt.start()
                logger.info("resumed unfinished tournament %s", r.code)

    # ---- self-play tables ---------------------------------------------------
    async def _ensure_bot_tables(self) -> None:
        """Keep a small, fixed number of bot-only tables running.

        These are ordinary rooms, so they show up in Open Tables and a human can sit
        down at any time — self-play doubles as a lobby that's never empty. The cap
        is the RAM budget: each live table is an asyncio task plus a Monte-Carlo
        thinking bot per seat, and this box has 1GB shared with other services.
        """
        want = settings.BOT_TABLES
        if want <= 0:
            return
        async with SessionLocal() as session:
            rooms = list(
                (
                    await session.scalars(
                        # NOT status == "open": rooms are created as "waiting", so
                        # that filter matched nothing and the janitor cheerfully
                        # opened two more tables every single pass.
                        select(Room).where(
                            Room.is_bot_table.is_(True),
                            Room.status != "finished",
                        )
                    )
                ).all()
            )
            # a table whose runtime died is a ghost — retire it rather than leak it
            alive = []
            for r in rooms:
                rt = await self.get_runtime(session, r)
                # get_runtime only BUILDS the runtime — seat_player is what normally
                # starts its task, and nobody ever seats at a bot table. Start it.
                rt.start()
                alive.append(r)

            missing = want - len(alive)
            if missing <= 0:
                return

            from app.game.bots import pick_bots
            from app.services.rooms import generate_room_code

            for _ in range(missing):
                hosts = await pick_bots(session, set(), 1)
                if not hosts:
                    return
                host = hosts[0]
                code = await generate_room_code(session)
                room = Room(
                    code=code,
                    name=f"{host.display_name}'s Table",
                    host_id=host.id,
                    allow_bots=True,
                    is_bot_table=True,
                    max_players=settings.BOT_TABLE_SEATS + 1,  # leave a human a seat
                )
                session.add(room)
                await session.flush()
                rt = await self.get_runtime(session, room)
                rt.start()
                await session.commit()
                logger.info("bot table %s opened (host=%s)", code, host.display_name)


manager = GameManager()
