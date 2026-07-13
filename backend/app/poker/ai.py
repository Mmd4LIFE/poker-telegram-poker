"""Heuristic + Monte-Carlo poker AI for bot players.

Each bot has a *personality* and a *skill* in [0,1]. Skill scales how closely
the bot plays to correct pot-odds; personality biases aggression and looseness.
"Bad bots" (low skill) call too much and misvalue hands; "good bots" fold weak
hands, value-bet and bluff selectively.
"""
from __future__ import annotations

import random

from app.poker.cards import FULL_DECK
from app.poker.evaluator import evaluate
from app.poker.ranges import in_range, threshold

# personality -> (aggression, looseness, bluff)
PERSONALITIES = {
    "rock":       (0.25, 0.20, 0.03),   # very tight/passive
    "tight":      (0.45, 0.35, 0.08),
    "balanced":   (0.55, 0.50, 0.12),
    "loose":      (0.55, 0.75, 0.15),
    "aggressive": (0.80, 0.55, 0.22),
    "maniac":     (0.95, 0.90, 0.35),   # spews chips, bluffs constantly
}


# The REAL deck is shuffled with a CSPRNG (see poker/cards.py) — that matters, money
# rides on it. A bot's imagination does not: nobody can exploit the RNG behind a
# hypothetical hand it simulated. Using secrets here was costing ~an order of
# magnitude in the Monte-Carlo hot loop, which is exactly what self-play burns.
_rng = random.Random()


def _rng_choice(seq):
    return _rng.choice(seq)


def estimate_equity(
    hole: list[str],
    board: list[str],
    opp_ranges: list[float],
    samples: int,
) -> float:
    """Monte-Carlo win probability against opponents drawn from their RANGES.

    `opp_ranges` is one percentile per live opponent: 0.15 means "top 15% of
    starting hands". Dealing them random cards instead — which is what this used to
    do — makes a raise look far weaker than it is, and the bot calls off its stack.
    """
    known = set(hole) | set(board)
    pool = [c for c in FULL_DECK if c not in known]
    need_board = 5 - len(board)
    ranges = opp_ranges or [1.0]
    threshes = [threshold(p) for p in ranges]
    wins = 0.0

    for _ in range(samples):
        deck = pool.copy()

        def draw() -> str:
            j = _rng.randrange(len(deck))
            deck[j], deck[-1] = deck[-1], deck[j]
            return deck.pop()

        opp_holes = []
        for th in threshes:
            # Rejection-sample a hand inside their range. Capped: a very narrow range
            # against a depleted deck could otherwise spin, and an occasional
            # off-range hand is realistic anyway — nobody's range is perfectly tight.
            pair = None
            for _try in range(12):
                a, b = draw(), draw()
                if in_range(a, b, th):
                    pair = [a, b]
                    break
                deck.extend((a, b))  # put them back and try again
            if pair is None:
                pair = [draw(), draw()]
            opp_holes.append(pair)

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
    opp_ranges: list[float] | None = None,
) -> tuple[str, int]:
    """Return (action, amount). action in fold/check/call/raise.

    `opp_ranges` narrows each opponent by what they've actually done this hand. A
    weak bot (low skill) ignores that and keeps treating everyone as random — which
    is precisely the mistake that makes it a weak bot.
    """
    aggr, loose, bluff_freq = PERSONALITIES.get(personality, PERSONALITIES["balanced"])
    to_call = legal.get("to_call", 0)

    n_opponents = max(1, n_opponents)
    if not opp_ranges:
        opp_ranges = [1.0] * n_opponents

    # Reading ranges is a skill. A fish looks at a raise and still imagines random
    # cards; a shark puts them on a range. So we blend each range toward "any two"
    # by (1 - skill) instead of giving every bot perfect range-reading for free.
    blended = [r + (1.0 - r) * (1.0 - skill) for r in opp_ranges[:n_opponents]]

    samples = int(60 + 140 * skill)  # smarter bots think harder
    equity = estimate_equity(hole, board, blended, samples)

    # weak bots misjudge their equity (noise), strong bots are accurate
    noise = (1.0 - skill) * 0.25
    jitter = (_rng.random() * 2.0 - 1.0) * noise
    perceived = min(0.99, max(0.01, equity + jitter))

    # pot odds
    pot_odds = to_call / (pot + to_call) if (pot + to_call) > 0 else 0.0

    can_raise = legal.get("raise", False)
    can_check = legal.get("check", False)
    min_raise_to = legal.get("min_raise_to", 0)
    max_raise_to = legal.get("max_raise_to", 0)

    # occasional bluff
    bluffing = _rng.random() < bluff_freq and can_raise

    # decide raise threshold — looser/aggressive bots value-raise wider
    value_threshold = 0.62 - 0.15 * aggr
    call_threshold = pot_odds * (1.0 - 0.3 * loose)

    def size_raise() -> int:
        # bet between 45% and 100% of pot, scaled by aggression
        frac = 0.45 + 0.55 * aggr * _rng.random()
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
        if perceived > 0.85 and _rng.random() < 0.30:
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
