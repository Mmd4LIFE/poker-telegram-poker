"""XP, levels and degree/rank tiers."""
from __future__ import annotations

import math

# XP awarded for various events
XP_PER_HAND = 5
XP_PER_HAND_WON = 25
XP_PER_SHOWDOWN_WIN = 15
XP_PER_GAME = 20

# Degree tiers keyed by minimum level.
DEGREES = [
    (1, "rookie", "🃏 Rookie"),
    (5, "amateur", "♦️ Amateur"),
    (10, "pro", "♣️ Pro"),
    (20, "shark", "🦈 Shark"),
    (35, "elite", "♠️ Elite"),
    (50, "master", "👑 Master"),
    (75, "legend", "🏆 Legend"),
]


def level_for_xp(xp: int) -> int:
    """Smooth curve: each level costs progressively more XP."""
    if xp <= 0:
        return 1
    return int(math.floor((math.sqrt(1 + 8 * xp / 100) - 1) / 2)) + 1


def xp_for_level(level: int) -> int:
    """Cumulative XP required to reach the start of `level`."""
    n = level - 1
    return int(100 * n * (n + 1) / 2)


def level_progress(xp: int) -> dict:
    lvl = level_for_xp(xp)
    cur_floor = xp_for_level(lvl)
    next_floor = xp_for_level(lvl + 1)
    span = max(1, next_floor - cur_floor)
    return {
        "level": lvl,
        "xp": xp,
        "level_floor": cur_floor,
        "next_level_xp": next_floor,
        "into_level": xp - cur_floor,
        "level_span": span,
        "progress": round((xp - cur_floor) / span, 4),
        "degree": degree_for_level(lvl)[0],
        "degree_label": degree_for_level(lvl)[1],
    }


def club_level_progress(xp: int) -> dict:
    """Club level curve: level n reached at xp = 2500 * (n-1)^2."""
    xp = max(0, int(xp))
    level = int(math.floor(math.sqrt(xp / 2500))) + 1
    cur = 2500 * (level - 1) ** 2
    nxt = 2500 * level ** 2
    span = max(1, nxt - cur)
    return {
        "level": level, "xp": xp, "next_level_xp": nxt,
        "progress": round((xp - cur) / span, 4),
    }


def degree_for_level(level: int) -> tuple[str, str]:
    code, label = "rookie", "🃏 Rookie"
    for min_lvl, c, lab in DEGREES:
        if level >= min_lvl:
            code, label = c, lab
    return code, label
