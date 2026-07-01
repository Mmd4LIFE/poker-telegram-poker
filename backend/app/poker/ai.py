"""Heuristic + Monte-Carlo poker AI for bot players.

Each bot has a *personality* and a *skill* in [0,1]. Skill scales how closely
the bot plays to correct pot-odds; personality biases aggression and looseness.
"Bad bots" (low skill) call too much and misvalue hands; "good bots" fold weak
hands, value-bet and bluff selectively.
"""
from __future__ import annotations

import secrets

from app.poker.cards import FULL_DECK
from app.poker.evaluator import evaluate

# personality -> (aggression, looseness, bluff)
PERSONALITIES = {
    "rock":       (0.25, 0.20, 0.03),   # very tight/passive
    "tight":      (0.45, 0.35, 0.08),
    "balanced":   (0.55, 0.50, 0.12),
    "loose":      (0.55, 0.75, 0.15),
    "aggressive": (0.80, 0.55, 0.22),
    "maniac":     (0.95, 0.90, 0.35),   # spews chips, bluffs constantly
}


def _rng_choice(seq):
    return seq[secrets.randbelow(len(seq))]


def estimate_equity(hole: list[str], board: list[str], n_opponents: int, samples: int) -> float:
    """Monte-Carlo win probability vs random opponents."""
    known = set(hole) | set(board)
    pool = [c for c in FULL_DECK if c not in known]
    need_board = 5 - len(board)
    wins = 0.0
    n_opponents = max(1, n_opponents)
    for _ in range(samples):
        deck = pool.copy()
        # draw opponents' holes + remaining board without full shuffle
        drawn: list[str] = []

        def draw() -> str:
            j = secrets.randbelow(len(deck))
            deck[j], deck[-1] = deck[-1], deck[j]
            return deck.pop()

        opp_holes = [[draw(), draw()] for _ in range(n_opponents)]
        sim_board = board + [draw() for _ in range(need_board)]
        my_score, _, _ = evaluate(hole + sim_board)
        best_opp = max(evaluate(oh + sim_board)[0] for oh in opp_holes)
        if my_score > best_opp:
            wins += 1
        elif my_score == best_opp:
            wins += 0.5
    return wins / samples


def decide(
    legal: dict,
    hole: list[str],
    board: list[str],
    n_opponents: int,
    personality: str,
    skill: float,
    pot: int,
    stack: int,
) -> tuple[str, int]:
    """Return (action, amount). action in fold/check/call/raise."""
    aggr, loose, bluff_freq = PERSONALITIES.get(personality, PERSONALITIES["balanced"])
    to_call = legal.get("to_call", 0)

    samples = int(60 + 140 * skill)  # smarter bots think harder
    equity = estimate_equity(hole, board, n_opponents, samples)

    # weak bots misjudge their equity (noise), strong bots are accurate
    noise = (1.0 - skill) * 0.25
    jitter = (secrets.randbelow(2000) / 1000.0 - 1.0) * noise
    perceived = min(0.99, max(0.01, equity + jitter))

    # pot odds
    pot_odds = to_call / (pot + to_call) if (pot + to_call) > 0 else 0.0

    can_raise = legal.get("raise", False)
    can_check = legal.get("check", False)
    min_raise_to = legal.get("min_raise_to", 0)
    max_raise_to = legal.get("max_raise_to", 0)

    # occasional bluff
    bluffing = (secrets.randbelow(1000) / 1000.0) < bluff_freq and can_raise

    # decide raise threshold — looser/aggressive bots value-raise wider
    value_threshold = 0.62 - 0.15 * aggr
    call_threshold = pot_odds * (1.0 - 0.3 * loose)

    def size_raise() -> int:
        # bet between 45% and 100% of pot, scaled by aggression
        frac = 0.45 + 0.55 * aggr * (secrets.randbelow(1000) / 1000.0)
        target = legal.get("call_amount", 0) + int(pot * frac) + min_raise_to
        return max(min_raise_to, min(target, max_raise_to))

    if to_call == 0:
        # no bet to face: check or bet
        if can_raise and (perceived >= value_threshold or bluffing):
            return "raise", size_raise()
        return "check", 0

    # facing a bet
    if perceived >= value_threshold and can_raise:
        # sometimes just call to trap with monsters
        if perceived > 0.85 and secrets.randbelow(100) < 30:
            return "call", 0
        return "raise", size_raise()

    if bluffing and stack > to_call * 3:
        return "raise", size_raise()

    if perceived >= call_threshold:
        return "call", 0

    # not worth it
    if can_check:
        return "check", 0
    return "fold", 0
