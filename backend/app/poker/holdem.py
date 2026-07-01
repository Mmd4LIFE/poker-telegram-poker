"""No-Limit Texas Hold'em engine.

Pure, in-memory, framework-agnostic game logic. It knows nothing about the
database, websockets or bots — it just enforces the rules and exposes a
serialisable state. The GameManager drives it (timers, persistence, bots,
broadcasting).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.poker.cards import make_deck, shuffle
from app.poker.evaluator import evaluate


class Street(str, Enum):
    IDLE = "idle"
    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"
    SHOWDOWN = "showdown"


class Action(str, Enum):
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    BET = "bet"
    RAISE = "raise"
    ALLIN = "allin"


@dataclass
class Seat:
    user_id: int
    name: str
    seat: int
    stack: int
    is_bot: bool = False
    avatar: str = "🎩"
    bot_personality: str | None = None
    bot_skill: float = 0.5

    # per-hand state
    hole: list[str] = field(default_factory=list)
    bet: int = 0            # committed this street
    committed: int = 0      # committed this hand (side-pot accounting)
    folded: bool = False
    all_in: bool = False
    has_acted: bool = False
    in_hand: bool = False
    sitting_out: bool = False
    last_action: str | None = None

    def reset_for_hand(self) -> None:
        self.hole = []
        self.bet = 0
        self.committed = 0
        self.folded = False
        self.all_in = False
        self.has_acted = False
        self.last_action = None
        self.in_hand = not self.sitting_out and self.stack > 0

    def reset_for_street(self) -> None:
        self.bet = 0
        self.has_acted = False
        if not self.folded and not self.all_in:
            self.last_action = None


class HoldemGame:
    def __init__(self, small_blind: int, big_blind: int):
        self.small_blind = small_blind
        self.big_blind = big_blind
        self.seats: list[Seat] = []
        self.button: int = -1
        self.street: Street = Street.IDLE
        self.board: list[str] = []
        self.deck: list[str] = []
        self.current: int | None = None
        self.current_bet: int = 0
        self.min_raise: int = big_blind
        self.pots: list[dict] = []  # computed at showdown [{amount, eligible:[uid]}]
        self.pot_total: int = 0
        self.hand_no: int = 0
        self.events: list[dict] = []
        self.last_result: dict | None = None

    # ---- seat management -------------------------------------------------
    def add_seat(self, seat: Seat) -> None:
        self.seats.append(seat)
        self.seats.sort(key=lambda s: s.seat)

    def remove_seat(self, user_id: int) -> None:
        self.seats = [s for s in self.seats if s.user_id != user_id]

    def get_seat(self, user_id: int) -> Seat | None:
        return next((s for s in self.seats if s.user_id == user_id), None)

    def active_seats(self) -> list[Seat]:
        """Players eligible to be dealt into a hand."""
        return [s for s in self.seats if not s.sitting_out and s.stack > 0]

    def in_hand_seats(self) -> list[Seat]:
        return [s for s in self.seats if s.in_hand and not s.folded]

    # ---- hand lifecycle --------------------------------------------------
    def can_start(self) -> bool:
        return self.street == Street.IDLE and len(self.active_seats()) >= 2

    def start_hand(self) -> list[dict]:
        self.events = []
        players = self.active_seats()
        if len(players) < 2:
            return []

        self.hand_no += 1
        self.board = []
        self.pots = []
        self.pot_total = 0
        self.last_result = None
        for s in self.seats:
            s.reset_for_hand()

        self.deck = make_deck()
        shuffle(self.deck)

        # advance button to next eligible seat
        self.button = self._next_occupied(self.button)
        players = self.in_hand_seats()
        n = len(players)

        idx = [self.seats.index(s) for s in players]
        # heads-up: button posts SB
        if n == 2:
            sb_i = self.button
            bb_i = self._next_in_hand(self.button)
        else:
            sb_i = self._next_in_hand(self.button)
            bb_i = self._next_in_hand(sb_i)

        self._log("hand_start", hand_no=self.hand_no, button=self.seats[self.button].user_id)

        self._post_blind(sb_i, self.small_blind, "small_blind")
        self._post_blind(bb_i, self.big_blind, "big_blind")

        self.current_bet = self.big_blind
        self.min_raise = self.big_blind

        # deal two hole cards to each in-hand player, starting left of button
        for _ in range(2):
            i = self._next_in_hand(self.button)
            for _ in range(n):
                self.seats[i].hole.append(self.deck.pop())
                i = self._next_in_hand(i)

        self.street = Street.PREFLOP
        # first to act preflop = left of BB (or SB in heads-up = button)
        self.current = self._next_in_hand(bb_i)
        # blinds have not "acted" yet (BB gets option)
        self.seats[sb_i].has_acted = False
        self.seats[bb_i].has_acted = False

        self._log("deal_hole")
        self._log("street", street=self.street.value)
        return self.events

    def _post_blind(self, idx: int, amount: int, kind: str) -> None:
        s = self.seats[idx]
        pay = min(amount, s.stack)
        s.stack -= pay
        s.bet += pay
        s.committed += pay
        self.pot_total += pay
        if s.stack == 0:
            s.all_in = True
        s.last_action = kind
        self._log(kind, user_id=s.user_id, amount=pay)

    # ---- navigation helpers ---------------------------------------------
    def _next_occupied(self, start: int) -> int:
        n = len(self.seats)
        for step in range(1, n + 1):
            i = (start + step) % n
            if self.seats[i] in self.active_seats():
                return i
        return start

    def _next_in_hand(self, start: int) -> int:
        n = len(self.seats)
        for step in range(1, n + 1):
            i = (start + step) % n
            s = self.seats[i]
            if s.in_hand and not s.folded:
                return i
        return start

    def _next_to_act(self, start: int) -> int | None:
        n = len(self.seats)
        for step in range(1, n + 1):
            i = (start + step) % n
            s = self.seats[i]
            if s.in_hand and not s.folded and not s.all_in:
                if not s.has_acted or s.bet != self.current_bet:
                    return i
        return None

    def _num_can_act(self) -> int:
        return sum(
            1 for s in self.seats if s.in_hand and not s.folded and not s.all_in
        )

    # ---- action handling -------------------------------------------------
    def legal_actions(self, user_id: int) -> dict:
        s = self.get_seat(user_id)
        if s is None or self.current is None or self.seats[self.current].user_id != user_id:
            return {"can_act": False}
        to_call = self.current_bet - s.bet
        actions: dict = {"can_act": True, "to_call": to_call}
        actions["fold"] = True
        actions["check"] = to_call == 0
        actions["call"] = to_call > 0 and s.stack > 0
        actions["call_amount"] = min(to_call, s.stack)
        # min raise total
        min_raise_to = self.current_bet + self.min_raise
        max_raise_to = s.bet + s.stack  # all-in
        can_raise = s.stack > to_call
        actions["raise"] = can_raise
        actions["min_raise_to"] = min(min_raise_to, max_raise_to)
        actions["max_raise_to"] = max_raise_to
        actions["stack"] = s.stack
        actions["pot"] = self.pot_total
        return actions

    def apply_action(self, user_id: int, action: str, amount: int = 0) -> list[dict]:
        self.events = []
        if self.current is None:
            raise ValueError("No active turn")
        s = self.seats[self.current]
        if s.user_id != user_id:
            raise ValueError("Not your turn")

        act = Action(action) if not isinstance(action, Action) else action
        to_call = self.current_bet - s.bet

        if act == Action.FOLD:
            s.folded = True
            s.has_acted = True
            s.last_action = "fold"
            self._log("action", user_id=user_id, action="fold")

        elif act == Action.CHECK:
            if to_call != 0:
                raise ValueError("Cannot check facing a bet")
            s.has_acted = True
            s.last_action = "check"
            self._log("action", user_id=user_id, action="check")

        elif act == Action.CALL:
            pay = min(to_call, s.stack)
            self._commit(s, pay)
            s.has_acted = True
            s.last_action = "call"
            self._log("action", user_id=user_id, action="call", amount=pay)

        elif act in (Action.BET, Action.RAISE, Action.ALLIN):
            if act == Action.ALLIN:
                raise_to = s.bet + s.stack
            else:
                raise_to = amount
            max_to = s.bet + s.stack
            if raise_to > max_to:
                raise_to = max_to
            # must at least call; if not a full min-raise it's only legal all-in
            if raise_to <= self.current_bet and raise_to < max_to:
                raise ValueError("Raise must exceed current bet")
            min_to = self.current_bet + self.min_raise
            is_all_in = raise_to == max_to
            if raise_to < min_to and not is_all_in:
                raise ValueError(f"Minimum raise is to {min_to}")
            pay = raise_to - s.bet
            raise_increment = raise_to - self.current_bet
            self._commit(s, pay)
            # a full raise re-opens action
            if raise_increment >= self.min_raise:
                self.min_raise = raise_increment
                for other in self.seats:
                    if other is not s and other.in_hand and not other.folded and not other.all_in:
                        other.has_acted = False
            self.current_bet = max(self.current_bet, s.bet)
            s.has_acted = True
            s.last_action = "all-in" if is_all_in else "raise"
            self._log(
                "action", user_id=user_id,
                action="allin" if is_all_in else "raise", amount=pay, raise_to=raise_to,
            )
        else:
            raise ValueError(f"Unknown action {action}")

        self._progress()
        return self.events

    def _commit(self, s: Seat, pay: int) -> None:
        pay = max(0, min(pay, s.stack))
        s.stack -= pay
        s.bet += pay
        s.committed += pay
        self.pot_total += pay
        if s.stack == 0:
            s.all_in = True

    # ---- progression -----------------------------------------------------
    def _progress(self) -> None:
        alive = self.in_hand_seats()
        if len(alive) == 1:
            self._end_hand_uncontested(alive[0])
            return

        nxt = self._next_to_act(self.current if self.current is not None else self.button)
        if nxt is not None and self._num_can_act() >= 1 and self._betting_open():
            self.current = nxt
            self._log("turn", user_id=self.seats[nxt].user_id)
            return

        # betting round complete
        self._close_street()

    def _betting_open(self) -> bool:
        """True while more voluntary action is possible this street."""
        if self._num_can_act() == 0:
            return False
        # If only one player can act and everyone else is all-in/folded and the
        # lone player has matched the bet, betting is closed.
        actionable = [
            s for s in self.seats if s.in_hand and not s.folded and not s.all_in
        ]
        if len(actionable) == 1:
            s = actionable[0]
            if s.has_acted and s.bet == self.current_bet:
                return False
        return True

    def _close_street(self) -> None:
        # collect bets into pot already tracked via pot_total; reset street bets
        for s in self.seats:
            s.reset_for_street()
        self.current_bet = 0
        self.min_raise = self.big_blind

        # if <2 players can still act, run out the board to showdown
        if self._num_can_act() < 2:
            self._run_out_and_showdown()
            return

        if self.street == Street.PREFLOP:
            self._deal_board(3, Street.FLOP)
        elif self.street == Street.FLOP:
            self._deal_board(1, Street.TURN)
        elif self.street == Street.TURN:
            self._deal_board(1, Street.RIVER)
        elif self.street == Street.RIVER:
            self._showdown()
            return

        self.current = self._next_in_hand(self.button)
        # if the first player is all-in, find next actionable
        nxt = self._next_to_act(self.button)
        self.current = nxt if nxt is not None else self._next_in_hand(self.button)
        self._log("turn", user_id=self.seats[self.current].user_id)

    def _deal_board(self, count: int, street: Street) -> None:
        self.deck.pop()  # burn
        for _ in range(count):
            self.board.append(self.deck.pop())
        self.street = street
        self._log("street", street=street.value, board=list(self.board))

    def _run_out_and_showdown(self) -> None:
        while len(self.board) < 5:
            if self.street == Street.PREFLOP:
                self._deal_board(3, Street.FLOP)
            elif self.street == Street.FLOP:
                self._deal_board(1, Street.TURN)
            elif self.street == Street.TURN:
                self._deal_board(1, Street.RIVER)
            else:
                break
        self._showdown()

    # ---- pots & showdown -------------------------------------------------
    def _build_pots(self) -> list[dict]:
        contribs = sorted({s.committed for s in self.seats if s.committed > 0})
        pots: list[dict] = []
        prev = 0
        for level in contribs:
            contributors = [s for s in self.seats if s.committed >= level]
            layer = (level - prev) * len(contributors)
            eligible = [s.user_id for s in contributors if not s.folded]
            if layer > 0:
                pots.append({"amount": layer, "eligible": eligible})
            prev = level
        # merge consecutive pots with identical eligibility
        merged: list[dict] = []
        for p in pots:
            if merged and merged[-1]["eligible"] == p["eligible"]:
                merged[-1]["amount"] += p["amount"]
            else:
                merged.append(p)
        return merged

    def _showdown(self) -> None:
        self.street = Street.SHOWDOWN
        self.pots = self._build_pots()
        contenders = [s for s in self.seats if s.in_hand and not s.folded]

        ranked: dict[int, tuple] = {}
        best_cards: dict[int, list[str]] = {}
        names: dict[int, str] = {}
        for s in contenders:
            score, five, name = evaluate(s.hole + self.board)
            ranked[s.user_id] = score
            best_cards[s.user_id] = five
            names[s.user_id] = name

        payouts: dict[int, int] = {uid: 0 for uid in ranked}
        pot_wins: list[dict] = []
        for pot in self.pots:
            eligible = [uid for uid in pot["eligible"] if uid in ranked]
            if not eligible:
                continue
            best = max(ranked[uid] for uid in eligible)
            winners = [uid for uid in eligible if ranked[uid] == best]
            share = pot["amount"] // len(winners)
            remainder = pot["amount"] - share * len(winners)
            for uid in winners:
                payouts[uid] += share
            if remainder:
                payouts[winners[0]] += remainder
            pot_wins.append({"amount": pot["amount"], "winners": winners})

        for uid, amt in payouts.items():
            if amt:
                self.get_seat(uid).stack += amt

        results = []
        for s in contenders:
            results.append({
                "user_id": s.user_id,
                "name": s.name,
                "cards": s.hole,
                "hand_name": names[s.user_id],
                "won": payouts[s.user_id],
            })
        self.last_result = {
            "hand_no": self.hand_no,
            "board": list(self.board),
            "pot": self.pot_total,
            "results": results,
            "pots": pot_wins,
            "showdown": True,
        }
        self._log("showdown", **self.last_result)
        self.current = None
        self.street = Street.IDLE

    def _end_hand_uncontested(self, winner: Seat) -> None:
        winner.stack += self.pot_total
        self.last_result = {
            "hand_no": self.hand_no,
            "board": list(self.board),
            "pot": self.pot_total,
            "results": [{
                "user_id": winner.user_id,
                "name": winner.name,
                "cards": winner.hole,
                "hand_name": "Uncontested",
                "won": self.pot_total,
            }],
            "pots": [{"amount": self.pot_total, "winners": [winner.user_id]}],
            "showdown": False,
        }
        self._log("win_uncontested", user_id=winner.user_id, amount=self.pot_total)
        self.current = None
        self.street = Street.IDLE

    # ---- serialisation ---------------------------------------------------
    def _log(self, type_: str, **data) -> None:
        self.events.append({"type": type_, **data})

    def public_state(self, viewer_id: int | None = None) -> dict:
        seats = []
        for s in self.seats:
            reveal = (
                viewer_id is not None and s.user_id == viewer_id
            ) or (self.street == Street.SHOWDOWN and not s.folded and s.in_hand)
            seats.append({
                "user_id": s.user_id,
                "name": s.name,
                "avatar": s.avatar,
                "seat": s.seat,
                "stack": s.stack,
                "bet": s.bet,
                "folded": s.folded,
                "all_in": s.all_in,
                "in_hand": s.in_hand,
                "sitting_out": s.sitting_out,
                "is_bot": s.is_bot,
                "last_action": s.last_action,
                "hole": s.hole if reveal else (["??", "??"] if s.in_hand and not s.folded else []),
                "is_turn": self.current is not None and self.seats[self.current].user_id == s.user_id,
            })
        current_uid = self.seats[self.current].user_id if self.current is not None else None
        return {
            "street": self.street.value,
            "board": list(self.board),
            "pot": self.pot_total,
            "current_bet": self.current_bet,
            "min_raise": self.min_raise,
            "button": self.seats[self.button].user_id if 0 <= self.button < len(self.seats) else None,
            "current": current_uid,
            "hand_no": self.hand_no,
            "small_blind": self.small_blind,
            "big_blind": self.big_blind,
            "seats": seats,
            "last_result": self.last_result,
        }
