"""7-card Texas Hold'em hand evaluator.

Given up to 7 cards, find the best 5-card poker hand. Returns a comparable
score tuple (bigger is better) plus a human readable category name and the
best five cards used.
"""
from __future__ import annotations

from itertools import combinations

from app.poker.cards import RANK_VALUE

CATEGORY_NAMES = {
    8: "Straight Flush",
    7: "Four of a Kind",
    6: "Full House",
    5: "Flush",
    4: "Straight",
    3: "Three of a Kind",
    2: "Two Pair",
    1: "One Pair",
    0: "High Card",
}


def _straight_high(values: list[int]) -> int | None:
    """Return the high card of a straight from a set of distinct rank values,
    or None. Handles the A-2-3-4-5 wheel."""
    uniq = sorted(set(values), reverse=True)
    # Ace can be low
    if 14 in uniq:
        uniq.append(1)
    run = 1
    for i in range(1, len(uniq)):
        if uniq[i] == uniq[i - 1] - 1:
            run += 1
            if run >= 5:
                return uniq[i] + 4
        else:
            run = 1
    return None


def eval5(cards: list[str]) -> tuple:
    """Score exactly 5 cards. Returns (category, *tiebreakers)."""
    values = sorted((RANK_VALUE[c[0]] for c in cards), reverse=True)
    suits = [c[1] for c in cards]
    is_flush = len(set(suits)) == 1
    straight_high = _straight_high(values)

    # count ranks
    counts: dict[int, int] = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    # sort by (count desc, value desc)
    by_count = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    count_pattern = tuple(c for _, c in by_count)
    ordered_values = tuple(v for v, _ in by_count)

    if is_flush and straight_high:
        return (8, straight_high)
    if count_pattern[0] == 4:
        return (7, ordered_values[0], ordered_values[1])
    if count_pattern[:2] == (3, 2):
        return (6, ordered_values[0], ordered_values[1])
    if is_flush:
        return (5, *values)
    if straight_high:
        return (4, straight_high)
    if count_pattern[0] == 3:
        return (3, ordered_values[0], *ordered_values[1:])
    if count_pattern[:2] == (2, 2):
        return (2, ordered_values[0], ordered_values[1], ordered_values[2])
    if count_pattern[0] == 2:
        return (1, ordered_values[0], *ordered_values[1:])
    return (0, *values)


def evaluate(cards: list[str]) -> tuple[tuple, list[str], str]:
    """Best 5-card hand out of up to 7 cards.

    Returns (score_tuple, best_five_cards, category_name).
    """
    if len(cards) < 5:
        raise ValueError("Need at least 5 cards to evaluate")
    best_score: tuple | None = None
    best_combo: tuple[str, ...] = ()
    for combo in combinations(cards, 5):
        score = eval5(list(combo))
        if best_score is None or score > best_score:
            best_score = score
            best_combo = combo
    assert best_score is not None
    return best_score, list(best_combo), CATEGORY_NAMES[best_score[0]]


def compare(cards_a: list[str], cards_b: list[str]) -> int:
    """Return 1 if a wins, -1 if b wins, 0 tie."""
    sa, _, _ = evaluate(cards_a)
    sb, _, _ = evaluate(cards_b)
    return (sa > sb) - (sa < sb)
