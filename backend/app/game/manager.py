"""GameManager — owns all live RoomRuntimes and mediates seating/economy."""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.game.runtime import RoomRuntime
from app.models import Room, RoomPlayer, User
from app.poker.holdem import Seat
from app.services.economy import InsufficientFunds, credit, debit

logger = logging.getLogger("poker.manager")


class GameManager:
    def __init__(self) -> None:
        self._runtimes: dict[int, RoomRuntime] = {}
        self._lock = asyncio.Lock()

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

    async def shutdown(self) -> None:
        for rt in self._runtimes.values():
            await rt.stop()


manager = GameManager()
