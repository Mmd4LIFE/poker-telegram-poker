"""RoomRuntime — the async loop that drives a single poker table."""
from __future__ import annotations

import asyncio
import logging
import secrets
import time

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.game.bots import pick_bots
from app.game.connection import hub
from app.models import Hand, PlayerHand, Room, RoomPlayer, User
from app.poker import ai
from app.poker.holdem import HoldemGame, Seat, Street
from app.services.cosmetics import effective_avatar_color
from app.services.progression import record_hand

logger = logging.getLogger("poker.runtime")

# how many seats we try to keep filled (incl. bots) when a human is present
TARGET_TABLE_SIZE = 4


class RoomRuntime:
    def __init__(self, room: Room):
        self.room_id = room.id
        self.code = room.code
        self.max_players = room.max_players
        self.allow_bots = room.allow_bots
        self.min_buy_in = room.min_buy_in
        self.max_buy_in = room.max_buy_in
        self.game = HoldemGame(room.small_blind, room.big_blind)
        self.game.hand_no = room.hand_no

        self._alive = True
        self._task: asyncio.Task | None = None
        self.glock = asyncio.Lock()
        self._human_future: asyncio.Future | None = None
        self._awaiting_user: int | None = None
        self._turn_deadline: float | None = None
        self._bot_ids: set[int] = set()

    # ---- lifecycle -------------------------------------------------------
    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._alive = False
        if self._task:
            self._task.cancel()

    # ---- seat management (called by manager, holds glock) ----------------
    async def add_seat(self, user: User, stack: int) -> int:
        async with self.glock:
            used = {s.seat for s in self.game.seats}
            seat_no = next(i for i in range(self.max_players) if i not in used)
            self.game.add_seat(Seat(
                user_id=user.id, name=user.display_name, seat=seat_no,
                stack=stack, is_bot=user.is_bot, avatar=user.avatar or "user",
                name_color=user.name_color or "",
                avatar_color=effective_avatar_color(user),
                bot_personality=user.bot_personality, bot_skill=user.bot_skill,
            ))
            if user.is_bot:
                self._bot_ids.add(user.id)
        self.start()
        await self.broadcast_state()
        return seat_no

    async def remove_seat(self, user_id: int) -> int:
        """Remove a seat, returning the chips to be refunded to the wallet."""
        async with self.glock:
            seat = self.game.get_seat(user_id)
            if seat is None:
                return 0
            # if they are in an active hand, fold them first
            if seat.in_hand and not seat.folded and self.game.street != Street.IDLE:
                seat.folded = True
                seat.has_acted = True
            refund = seat.stack
            self.game.remove_seat(user_id)
            self._bot_ids.discard(user_id)
        await self.broadcast_state()
        return refund

    def seated_user_ids(self) -> set[int]:
        return {s.user_id for s in self.game.seats}

    # ---- human action delivery ------------------------------------------
    def submit_action(self, user_id: int, action: str, amount: int) -> bool:
        if (
            self._awaiting_user == user_id
            and self._human_future is not None
            and not self._human_future.done()
        ):
            self._human_future.set_result((action, amount))
            return True
        return False

    # ---- main loop -------------------------------------------------------
    async def _run(self) -> None:
        logger.info("Room %s runtime started", self.code)
        while self._alive:
            try:
                await self._tick()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Room %s tick error", self.code)
                await asyncio.sleep(1)
        logger.info("Room %s runtime stopped", self.code)

    async def _tick(self) -> None:
        # pause the table when no humans are watching
        if not hub.has_viewers(self.code):
            await asyncio.sleep(2)
            return

        started = False
        async with self.glock:
            if self.game.street == Street.IDLE:
                await self._fill_bots()
                if self.game.can_start():
                    self.game.start_hand()
                    started = True

        if not started and self.game.street == Street.IDLE:
            await self.broadcast_state()
            await asyncio.sleep(1.5)
            return

        if started:
            await self.broadcast_state()
            await asyncio.sleep(1.2)

        await self._play_until_idle()

    async def _play_until_idle(self) -> None:
        while self._alive:
            async with self.glock:
                cur = self.game.current
                if cur is None:
                    break
                seat = self.game.seats[cur]
                is_bot = seat.is_bot
                legal = self.game.legal_actions(seat.user_id)
                n_opp = len(self.game.in_hand_seats()) - 1
                hole = list(seat.hole)
                board = list(self.game.board)
                pot = self.game.pot_total
                stack = seat.stack
                personality = seat.bot_personality or "balanced"
                skill = seat.bot_skill

            if is_bot:
                await self.broadcast_state()
                think = settings.BOT_THINK_MIN + (
                    secrets.randbelow(1000) / 1000.0
                ) * (settings.BOT_THINK_MAX - settings.BOT_THINK_MIN)
                await asyncio.sleep(think)
                action, amount = ai.decide(
                    legal, hole, board, max(1, n_opp), personality, skill, pot, stack
                )
                await self._apply(seat.user_id, action, amount, legal)
            else:
                self._turn_deadline = time.time() + settings.TURN_TIMEOUT_SECONDS
                await self.broadcast_state()
                loop = asyncio.get_running_loop()
                self._human_future = loop.create_future()
                self._awaiting_user = seat.user_id
                try:
                    action, amount = await asyncio.wait_for(
                        self._human_future, settings.TURN_TIMEOUT_SECONDS + 2
                    )
                except (asyncio.TimeoutError, TimeoutError):
                    action = "check" if legal.get("check") else "fold"
                    amount = 0
                finally:
                    self._awaiting_user = None
                    self._human_future = None
                    self._turn_deadline = None
                await self._apply(seat.user_id, action, amount, legal)

        await self._settle_hand()
        await asyncio.sleep(4.5)

    async def _apply(self, user_id: int, action: str, amount: int, legal: dict) -> None:
        async with self.glock:
            if (
                self.game.current is None
                or self.game.seats[self.game.current].user_id != user_id
            ):
                return
            try:
                events = self.game.apply_action(user_id, action, amount)
            except ValueError:
                fallback = "check" if legal.get("check") else "fold"
                events = self.game.apply_action(user_id, fallback, 0)
        await self.broadcast_events(events)
        await self.broadcast_state()

    # ---- bots ------------------------------------------------------------
    async def _fill_bots(self) -> None:
        if not self.allow_bots:
            return
        active = len(self.game.active_seats())
        if active >= 2:
            return
        # only fill when at least one human is connected
        human_present = any(not s.is_bot for s in self.game.seats)
        if not human_present:
            return
        target = min(self.max_players, TARGET_TABLE_SIZE)
        need = target - len(self.game.seats)
        if need <= 0:
            return
        async with SessionLocal() as session:
            bots = await pick_bots(session, self.seated_user_ids(), need)
            for bot in bots:
                buy = min(self.max_buy_in, max(self.min_buy_in, self.game.big_blind * 100))
                used = {s.seat for s in self.game.seats}
                seat_no = next((i for i in range(self.max_players) if i not in used), None)
                if seat_no is None:
                    break
                self.game.add_seat(Seat(
                    user_id=bot.id, name=bot.display_name, seat=seat_no,
                    stack=buy, is_bot=True, avatar=bot.avatar or "bot",
                    name_color=bot.name_color or "",
                    avatar_color=effective_avatar_color(bot),
                    bot_personality=bot.bot_personality, bot_skill=bot.bot_skill,
                ))
                self._bot_ids.add(bot.id)

    # ---- persistence & settlement ---------------------------------------
    async def _settle_hand(self) -> None:
        result = self.game.last_result
        if not result:
            return
        won_map = {r["user_id"]: r["won"] for r in result["results"]}
        name_map = {r["user_id"]: r.get("hand_name", "") for r in result["results"]}
        showdown = result.get("showdown", False)

        async with SessionLocal() as session:
            # persist hand history
            session.add(Hand(
                room_id=self.room_id, hand_no=result["hand_no"],
                pot=result["pot"], board=result["board"], results=result["results"],
            ))
            room = await session.get(Room, self.room_id)
            if room:
                room.hand_no = self.game.hand_no
                from datetime import datetime, timezone
                room.last_active_at = datetime.now(timezone.utc)

            for seat in self.game.seats:
                if not seat.in_hand:
                    continue
                won_amt = won_map.get(seat.user_id, 0)
                net = won_amt - seat.committed
                if not seat.is_bot:
                    user = await session.get(User, seat.user_id)
                    if user:
                        await record_hand(
                            session, user,
                            won=won_amt > 0,
                            showdown_win=showdown and won_amt > 0,
                            net=net,
                            pot=result["pot"],
                        )
                        # match-history row (powers friend history)
                        session.add(PlayerHand(
                            user_id=seat.user_id, room_id=self.room_id,
                            room_code=self.code, hand_no=result["hand_no"],
                            net=net, won=won_amt > 0,
                            showdown=showdown and won_amt > 0,
                            hand_name=name_map.get(seat.user_id, "Folded" if seat.folded else ""),
                            pot=result["pot"],
                        ))
                # sync table stack back to RoomPlayer
                rp = (await session.execute(
                    select(RoomPlayer).where(
                        RoomPlayer.room_id == self.room_id,
                        RoomPlayer.user_id == seat.user_id,
                    )
                )).scalar_one_or_none()
                if rp:
                    rp.stack = seat.stack
            await session.commit()

        # drop busted bots so fresh ones can join
        async with self.glock:
            for seat in list(self.game.seats):
                if seat.is_bot and seat.stack <= 0:
                    self.game.remove_seat(seat.user_id)
                    self._bot_ids.discard(seat.user_id)
                elif seat.stack <= 0:
                    seat.sitting_out = True  # busted human waits for rebuy

        await self.broadcast(
            {"type": "hand_result", "result": result}
        )
        await self.broadcast_state()

    # ---- broadcasting ----------------------------------------------------
    def _render(self, user_id: int) -> dict:
        state = self.game.public_state(user_id)
        state["type"] = "state"
        state["room_code"] = self.code
        you = {"seated": self.game.get_seat(user_id) is not None}
        if (
            self.game.current is not None
            and self.game.seats[self.game.current].user_id == user_id
        ):
            you["legal"] = self.game.legal_actions(user_id)
            you["deadline"] = self._turn_deadline
        state["you"] = you
        return state

    async def broadcast_state(self) -> None:
        await hub.send_personalised(self.code, self._render)

    async def broadcast_events(self, events: list[dict]) -> None:
        if events:
            await hub.broadcast(self.code, {"type": "events", "events": events})

    async def broadcast(self, payload: dict) -> None:
        await hub.broadcast(self.code, payload)
