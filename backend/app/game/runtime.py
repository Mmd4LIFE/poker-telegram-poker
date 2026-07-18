"""RoomRuntime — the async loop that drives a single poker table."""
from __future__ import annotations

import asyncio
import logging
import secrets
import time

from sqlalchemy import delete, select

from app.config import settings
from app.database import SessionLocal
from app.game.bots import pick_bots
from app.game.connection import hub
from app.models import Hand, PlayerHand, Room, RoomPlayer, User
from app.poker import ai, ranges, scoring
from app.poker.holdem import HoldemGame, Seat, Street
from app.models import PlayerStats
from app.services import dna as DNA
from app.services.cards import equipped_map
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
        self.bots_only = bool(getattr(room, "is_bot_table", False))
        # --- Sit & Go (league) ---
        self.mode = getattr(room, "mode", "cash") or "cash"
        self.cohort_id = getattr(room, "cohort_id", None)
        self.is_sng = self.mode == "sng"
        # finishing order, filled from the bottom up as players bust out
        self._knockouts: list[int] = []
        self._placed: set[int] = set()   # league members already awarded their place
        self._dq_buffer: list = []       # (user_id, score, street) pending flush
        self._dq_cfg: dict = {}
        self._sng_done = False
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
        # last time an unwatched self-play table dealt a hand — used to throttle it
        self._idle_hand_at: float = 0.0
        # per-seat live table stats (CS:GO-style scoreboard), reset with the runtime
        self._board: dict[int, dict] = {}

    # ---- lifecycle -------------------------------------------------------
    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._alive = False
        if self._task:
            self._task.cancel()

    # ---- seat management (called by manager, holds glock) ----------------
    async def reseat(self, user: User, stack: int, seat_no: int) -> int:
        """Put a player who is already persisted in RoomPlayer back into the live
        game — used when a seat row exists but the running table never got it."""
        async with self.glock:
            if self.game.get_seat(user.id) is not None:
                return seat_no
            used = {s.seat for s in self.game.seats}
            if seat_no in used:
                seat_no = next(
                    (i for i in range(self.max_players) if i not in used), seat_no
                )
            self.game.add_seat(Seat(
                user_id=user.id, name=user.display_name, seat=seat_no,
                stack=stack, is_bot=user.is_bot, avatar=user.avatar or "user",
                name_color=user.name_color or "",
                avatar_color=effective_avatar_color(user),
                skins=equipped_map(user),
                owes_bb=self.game.hand_no > 0,
                bot_personality=user.bot_personality, bot_skill=user.bot_skill,
            ))
        self.start()
        await self.broadcast_state()
        return seat_no

    async def add_seat(self, user: User, stack: int) -> int:
        async with self.glock:
            used = {s.seat for s in self.game.seats}
            seat_no = next(i for i in range(self.max_players) if i not in used)
            self.game.add_seat(Seat(
                user_id=user.id, name=user.display_name, seat=seat_no,
                stack=stack, is_bot=user.is_bot, avatar=user.avatar or "user",
                name_color=user.name_color or "",
                avatar_color=effective_avatar_color(user),
                skins=equipped_map(user),
                # joining a game already under way -> pay to enter
                owes_bb=self.game.hand_no > 0,
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

    async def evict_one_bot(self) -> int | None:
        """Kick one bot to free a seat for an arriving human. Prefers a bot that isn't
        the one currently to act (and, among those, one already out of the hand), so an
        in-progress hand is disturbed as little as possible. Returns the freed seat."""
        async with self.glock:
            cur_uid = (
                self.game.seats[self.game.current].user_id
                if self.game.current is not None
                and 0 <= self.game.current < len(self.game.seats)
                else None
            )
            cands = [s for s in self.game.seats if s.is_bot and s.user_id != cur_uid]
            if not cands:
                return None
            cands.sort(key=lambda s: 0 if (s.folded or not s.in_hand) else 1)
            seat = cands[0]
            seat_no = seat.seat
            self.game.remove_seat(seat.user_id)
            self._bot_ids.discard(seat.user_id)
            self._board.pop(seat.user_id, None)
        await self.broadcast_state()
        return seat_no

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
        watched = hub.has_viewers(self.code)

        # A self-play table with nobody watching deals on a slow heartbeat, not at full
        # speed — it only needs to look alive in the lobby. The moment a human opens it
        # (becomes a viewer) it drops back to full speed. This is the single biggest CPU
        # /DB saving on the shared box; without it two tables ground ~9.7k hands in 5 days.
        if self.bots_only and not watched:
            if time.time() - self._idle_hand_at < settings.BOT_TABLE_IDLE_SECONDS:
                await asyncio.sleep(2)
                return
            self._idle_hand_at = time.time()

        # Pause when nobody is watching — except a self-play table, which exists
        # precisely to run unwatched (throttled above).
        if not watched and not self.bots_only and not self.is_sng:
            await asyncio.sleep(2)
            return

        if self.is_sng and self._sng_done:
            await asyncio.sleep(2)
            return

        started = False
        newly_out: list[int] = []
        alive_after = 0
        finished = False
        async with self.glock:
            if self.game.street == Street.IDLE:
                if self.is_sng:
                    newly_out = self._reap_busted()
                    alive_after = len(self.game.seats)
                    if self._sng_over():
                        finished = True
                    else:
                        self._apply_blind_level()
                else:
                    await self._fill_bots()
                if not finished and self.game.can_start():
                    self.game.start_hand()
                    started = True

        # eliminations are booked immediately — a busted player's place is already
        # locked, so there's no reason to make them wait for the game to end
        for i, uid in enumerate(newly_out):
            place = alive_after + len(newly_out) - i  # worst-first -> lowest place
            await self._award(uid, place)
        if finished:
            await self._finish_sng()
            return

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
                # What each live opponent plausibly holds, given what they've DONE
                # this hand. Without this the bot imagines everyone on random cards
                # and calls raises it should be folding.
                opp_ranges = [
                    ranges.range_of(
                        o.last_action,
                        o.user_id == self.game.preflop_aggressor,
                    )
                    for o in self.game.in_hand_seats()
                    if o.user_id != seat.user_id and not o.folded
                ]

            if is_bot:
                await self.broadcast_state()
                think = settings.BOT_THINK_MIN + (
                    secrets.randbelow(1000) / 1000.0
                ) * (settings.BOT_THINK_MAX - settings.BOT_THINK_MIN)
                await asyncio.sleep(think)
                action, amount = ai.decide(
                    legal, hole, board, max(1, n_opp), personality, skill, pot, stack,
                    opp_ranges=opp_ranges,
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
            self._score_decision(user_id, action, amount, legal)
            applied = action
            try:
                events = self.game.apply_action(user_id, action, amount)
            except ValueError:
                applied = "check" if legal.get("check") else "fold"
                events = self.game.apply_action(user_id, applied, 0)
            self._board_action(user_id, applied)
        await self.broadcast_events(events)
        await self.broadcast_state()

    # ---- decision-quality scoring ---------------------------------------
    async def _flush_dq(self, session) -> None:
        if not self._dq_buffer:
            return
        buf, self._dq_buffer = self._dq_buffer, []
        by_user: dict[int, list] = {}
        for uid, res, street in buf:
            by_user.setdefault(uid, []).append((res, street))
        for uid, items in by_user.items():
            st = await session.get(PlayerStats, uid)
            if st is None:
                st = PlayerStats(user_id=uid)
                session.add(st)
            for f in ("dq_decisions", "dq_weight", "dq_weighted", "dq_blunders", "skill_sp"):
                if getattr(st, f, None) is None:
                    setattr(st, f, 0)
            worst = list(st.dq_worst or [])
            for res, street in items:
                st.dq_decisions += 1
                st.dq_weight = (st.dq_weight or 0) + res["weight"]
                st.dq_weighted = (st.dq_weighted or 0) + res["dq"] * res["weight"]
                st.skill_sp = (st.skill_sp or 0) + int(round(res.get("sp", 0)))
                if res["label"] == "blunder":
                    st.dq_blunders += 1
                    worst.append({
                        "dq": res["dq"], "street": street,
                        "best": res["best"], "chosen": res["chosen"],
                        "loss": res["ev_loss_frac"],
                    })
            # keep only the 8 worst, so the column stays small
            worst.sort(key=lambda w: w["dq"])
            st.dq_worst = worst[:8]


    def _score_decision(self, user_id: int, action: str, amount: int, legal: dict) -> None:
        """Grade this action by EV (see poker/scoring.py) and buffer it for the flush
        at hand end. Equity uses the TRUE hand vs opponent ranges — the answer key a
        fish's own misjudged equity is graded against."""
        seat = self.game.get_seat(user_id)
        if seat is None or not seat.hole or seat.hole[0] == "??":
            return
        opp_seats = [
            o for o in self.game.in_hand_seats()
            if o.user_id != user_id and not o.folded
        ]
        n_opp = max(1, len(opp_seats))
        try:
            from app.poker.ranges import range_of
            from app.poker.ai import estimate_equity
            opp_ranges = [
                range_of(o.last_action, o.user_id == self.game.preflop_aggressor)
                for o in opp_seats
            ]
            equity = estimate_equity(list(seat.hole), list(self.game.board), opp_ranges, 80)
        except Exception:
            return

        to_call = self.game.current_bet - seat.bet
        raise_to = amount if action in ("raise", "bet", "all-in", "allin") else 0
        try:
            res = scoring.score_action(
                equity=equity, pot=self.game.pot_total, to_call=to_call,
                stack=seat.stack, big_blind=self.game.big_blind, n_opp=n_opp,
                action=action, raise_to=raise_to, current_bet=self.game.current_bet,
                cfg=self._dq_cfg,
            )
        except Exception:
            return
        self._dq_buffer.append((user_id, res, self.game.street.value))
        # feed the live table scoreboard too (same score, EV-weighted)
        b = self._board_of(user_id)
        b["dq_wt"] += res["weight"]
        b["dq_sum"] += res["dq"] * res["weight"]

    # ---- live table scoreboard ------------------------------------------
    def _board_of(self, uid: int) -> dict:
        b = self._board.get(uid)
        if b is None:
            b = {"hands": 0, "fold": 0, "check": 0, "call": 0, "raise": 0,
                 "net": 0, "dq_wt": 0.0, "dq_sum": 0.0}
            self._board[uid] = b
        return b

    def _board_action(self, uid: int, action: str) -> None:
        a = (action or "").lower()
        bucket = (
            "fold" if a == "fold" else
            "check" if a == "check" else
            "call" if a == "call" else
            "raise" if a in ("bet", "raise", "all-in", "allin") else None
        )
        if bucket:
            self._board_of(uid)[bucket] += 1

    async def scoreboard(self, session) -> list[dict]:
        """Live per-player stats for everyone currently seated, ordered by table DQ.
        Includes bots — they're players at the table, and seeing who's actually playing
        well (not just winning) is the whole point."""
        seats = list(self.game.seats)
        ids = [s.user_id for s in seats]
        users = {}
        if ids:
            us = await session.scalars(select(User).where(User.id.in_(ids)))
            users = {u.id: u for u in us.all()}
        rows = []
        for s in seats:
            b = self._board.get(s.user_id, {})
            dq_wt = b.get("dq_wt", 0.0)
            dq = round(b["dq_sum"] / dq_wt, 1) if dq_wt else None
            u = users.get(s.user_id)
            rows.append({
                "user_id": s.user_id,
                "name": (u.display_name if u else None) or ("Bot" if s.is_bot else "Player"),
                "avatar": u.avatar if u else "user",
                "avatar_color": effective_avatar_color(u) if u else "",
                "name_color": (u.name_color or "") if u else "",
                "is_bot": s.is_bot,
                "stack": s.stack,
                "hands": b.get("hands", 0),
                "fold": b.get("fold", 0),
                "check": b.get("check", 0),
                "call": b.get("call", 0),
                "raise": b.get("raise", 0),
                "net": b.get("net", 0),
                "dq": dq,
            })
        # highest DQ first; unrated (no scored decisions yet) sink to the bottom
        rows.sort(key=lambda r: (r["dq"] is not None, r["dq"] or 0), reverse=True)
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        return rows

    # ---- Sit & Go --------------------------------------------------------
    #
    # A turbo structure: blinds climb every few hands so a six-handed table finishes
    # in ~10-15 minutes rather than grinding on for an hour. Without escalation a
    # tournament with no rebuys can literally never end.
    BLIND_LEVELS = [
        (25, 50), (50, 100), (75, 150), (100, 200), (150, 300),
        (200, 400), (300, 600), (500, 1000), (800, 1600), (1200, 2400),
    ]
    HANDS_PER_LEVEL = 5

    def _apply_blind_level(self) -> None:
        lvl = min(
            self.game.hand_no // self.HANDS_PER_LEVEL, len(self.BLIND_LEVELS) - 1
        )
        sb, bb = self.BLIND_LEVELS[lvl]
        self.game.small_blind, self.game.big_blind = sb, bb

    def _reap_busted(self) -> list[int]:
        """Anyone who ran out of chips is out — for good. Returns the newly-busted
        user_ids, worst finisher first (they get the lowest remaining place)."""
        busted = [s for s in self.game.seats if s.stack <= 0]
        # two players out on the same hand: the one who put MORE in outlasted the
        # other, so they finish higher — award the smaller stack the worse place
        busted.sort(key=lambda s: s.committed)
        out = []
        for s in busted:
            if s.user_id not in self._knockouts:
                self._knockouts.append(s.user_id)
                out.append(s.user_id)
            self.game.remove_seat(s.user_id)
        return out

    def _sng_over(self) -> bool:
        return len(self.game.seats) <= 1

    async def forfeit(self, user_id: int) -> dict:
        """A player leaves a league game. They finish at their CURRENT standing —
        the worst of everyone still in — booked immediately. This is the anti-coast
        rule: walking away can only lock your place, never ladder you up by folding.
        """
        async with self.glock:
            seat = self.game.get_seat(user_id)
            if seat is None:
                return {"forfeited": False}
            place = len(self.game.active_seats())  # you + everyone still alive
            if user_id not in self._knockouts:
                self._knockouts.append(user_id)
            self.game.remove_seat(user_id)
            over = len(self.game.seats) <= 1
        await self._award(user_id, place)
        if over:
            await self._finish_sng()
        else:
            await self.broadcast_state()
        return {"forfeited": True, "place": place}

    async def _award(self, user_id: int, place: int) -> None:
        """Book one league finish immediately (bust, forfeit, or win) and tell the
        player. Guarded so nobody is paid twice."""
        if not self.cohort_id or user_id in self._placed:
            return
        self._placed.add(user_id)
        from app.services import league as L

        res = None
        async with SessionLocal() as session:
            cfg = await L.get_config(session)
            res = await L.award_place(session, self.cohort_id, user_id, place, cfg)
            await session.commit()
        if res:
            await hub.broadcast(
                self.code,
                {"type": "placed", "user_id": user_id, "place": place, "lp": res["lp"]},
            )

    async def _finish_sng(self) -> None:
        if self._sng_done:
            return
        self._sng_done = True

        # the winner is the last one standing — place 1. Everyone else was already
        # paid the instant they busted or forfeited.
        for s in self.game.seats:
            await self._award(s.user_id, 1)

        order = [s.user_id for s in self.game.seats] + list(reversed(self._knockouts))

        from app.services import league as L
        from app.models import LeagueGame

        async with SessionLocal() as session:
            room = await session.get(Room, self.room_id)
            if self.cohort_id and order:
                # one history row for the whole game (LP already booked per elimination)
                results = [{"user_id": uid, "place": i + 1} for i, uid in enumerate(order)]
                session.add(
                    LeagueGame(
                        cohort_id=self.cohort_id,
                        room_code=self.code,
                        simulated=False,
                        results=results,
                    )
                )
            if room:
                room.status = "finished"
            # Clear the seats. They can't be cashed out (tournament chips aren't money),
            # but left behind they'd make the player look "seated" forever — which is
            # exactly what dragged Quick Play back into finished league tables.
            await session.execute(
                delete(RoomPlayer).where(RoomPlayer.room_id == self.room_id)
            )
            await session.commit()

        await hub.broadcast(
            self.code,
            {"type": "sng_over", "order": order},
        )
        logger.info("SNG %s finished: %s", self.code, order)
        self._alive = False

    # ---- bots ------------------------------------------------------------
    async def _fill_bots(self) -> None:
        if not self.allow_bots:
            return
        active = len(self.game.active_seats())
        if active >= 2 and not self.bots_only:
            return
        # A normal table only summons bots once a human is there to play against. A
        # self-play table is the exception — it exists precisely to run without one.
        if not self.bots_only:
            human_present = any(not s.is_bot for s in self.game.seats)
            if not human_present:
                return
        target = min(
            self.max_players,
            settings.BOT_TABLE_SEATS if self.bots_only else TARGET_TABLE_SIZE,
        )
        need = target - len(self.game.seats)
        if need <= 0:
            return
        async with SessionLocal() as session:
            # Exclude bots seated at THIS table AND every other live table — otherwise
            # one bot gets dealt into two games at once (the double-seating bug).
            from app.game.manager import manager  # lazy: avoids an import cycle
            exclude = self.seated_user_ids() | manager.busy_bot_ids()
            bots = await pick_bots(session, exclude, need)
            # Every existing bot is busy — mint fresh ones so a table is never starved.
            if len(bots) < need:
                from app.game.bots import generate_bot
                for k in range(need - len(bots)):
                    bots.append(await generate_bot(session, len(exclude) + k))
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
                    skins=equipped_map(bot),
                    owes_bb=self.game.hand_no > 0,
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

                # live table scoreboard: this player was dealt into a hand here
                bd = self._board_of(seat.user_id)
                bd["hands"] += 1
                bd["net"] += net

                # --- Poker DNA telemetry (bots included: their radar is the whole
                #     point of the admin monitor)
                stats = await session.get(PlayerStats, seat.user_id)
                if stats is None:
                    stats = PlayerStats(user_id=seat.user_id)
                    session.add(stats)
                reached_showdown = bool(showdown) and not seat.folded and seat.in_hand
                DNA.ingest_hand(
                    stats,
                    user_id=seat.user_id,
                    hand_log=self.game.hand_log,
                    preflop_aggressor=self.game.preflop_aggressor,
                    saw_flop=len(result.get("board") or []) >= 3 and not seat.folded,
                    went_to_showdown=reached_showdown,
                    won_showdown=reached_showdown and won_amt > 0,
                    won_amount=won_amt,
                    committed=seat.committed,
                    # stack has already been credited with winnings by now
                    start_stack=max(1, seat.stack - won_amt + seat.committed),
                )
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

            # --- flush decision-quality scores (folded players included: they made
            #     decisions too) ---
            await self._flush_dq(session)
            await session.commit()

        # drop busted bots so fresh ones can join
        async with self.glock:
            for seat in list(self.game.seats):
                if seat.is_bot and seat.stack <= 0:
                    self.game.remove_seat(seat.user_id)
                    self._bot_ids.discard(seat.user_id)
                    self._board.pop(seat.user_id, None)  # bound scoreboard memory
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
