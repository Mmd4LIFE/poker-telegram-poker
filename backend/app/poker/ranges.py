"""Preflop hand ranges — what an opponent plausibly holds, given what they did.

The old equity estimator dealt opponents *random* cards. But a player who just
raised does not hold random cards: they hold a strong range. Simulating them as
random systematically overestimates our equity against aggression, which makes
every bot call too much. This module is what lets us simulate them honestly.

Hands are ranked by the Chen formula — cheap, well-understood, and good enough to
order starting hands. We precompute the score of all 1326 combos once at import,
then a range like "top 15%" becomes a simple score threshold.
"""
from __future__ import annotations

from app.poker.cards import FULL_DECK

RANKS = "23456789TJQKA"
_RANK_VAL = {r: i + 2 for i, r in enumerate(RANKS)}  # 2..14

# Chen's high-card values.
_CHEN_HIGH = {14: 10.0, 13: 8.0, 12: 7.0, 11: 6.0}


def chen(c1: str, c2: str) -> float:
    """Chen formula score for a two-card starting hand. Roughly -1 (72o) to 20 (AA)."""
    a, b = _RANK_VAL[c1[0]], _RANK_VAL[c2[0]]
    hi, lo = max(a, b), min(a, b)
    suited = c1[1] == c2[1]

    score = _CHEN_HIGH.get(hi, hi / 2.0)

    if hi == lo:  # pair
        score = max(5.0, score * 2)
        return score

    if suited:
        score += 2.0

    gap = hi - lo - 1
    if gap == 1:
        score -= 1.0
    elif gap == 2:
        score -= 2.0
    elif gap == 3:
        score -= 4.0
    elif gap >= 4:
        score -= 5.0

    # straight bonus: connected-ish, and no high card blocking the straight
    if gap <= 1 and hi < 12:
        score += 1.0

    return score


def _build() -> list[float]:
    scores = []
    for i in range(len(FULL_DECK)):
        for j in range(i + 1, len(FULL_DECK)):
            scores.append(chen(FULL_DECK[i], FULL_DECK[j]))
    scores.sort(reverse=True)  # best first
    return scores


_SORTED = _build()          # 1326 scores, best -> worst
_N = len(_SORTED)


def threshold(pct: float) -> float:
    """Minimum Chen score to be inside the top `pct` of starting hands.

    pct >= 1.0 means "any two cards", so the threshold is below every hand.
    """
    if pct >= 1.0:
        return -99.0
    idx = max(0, min(_N - 1, int(_N * max(0.01, pct)) - 1))
    return _SORTED[idx]


def in_range(c1: str, c2: str, thresh: float) -> bool:
    return chen(c1, c2) >= thresh


# --- what a range looks like, given what they did ---------------------------
#
# Deliberately conservative: assuming an opponent is tighter than they are makes a
# bot fold too much; assuming looser makes it pay off too much. These are the
# ranges a competent-but-not-paranoid player would put someone on.

RANGE_RAISED = 0.15     # they raised — top 15%
RANGE_CALLED = 0.45     # they called — a middling range
RANGE_PASSIVE = 0.85    # limped/checked — almost anything
RANGE_ANY = 1.0


def range_of(last_action: str | None, was_preflop_aggressor: bool) -> float:
    if was_preflop_aggressor or last_action in ("raise", "all-in"):
        return RANGE_RAISED
    if last_action == "call":
        return RANGE_CALLED
    if last_action in ("check", "bet", None):
        return RANGE_PASSIVE
    return RANGE_ANY
