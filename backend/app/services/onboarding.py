"""Progressive onboarding & feature gating — server-authoritative.

A new player starts with Quick Play as the only lit action; every other surface is shown
locked and reveals itself as the player levels up. Level is the gate (defined here, one
source of truth), the client only renders what this says, and the gated *action* endpoints
call ``require_feature`` so a locked feature can't be reached by a deep link or a hand-made
request either.

Admin testing: an admin with no sandbox bypasses every gate. Setting an
``onboarding.sandbox.effective_level`` makes that admin experience the app *as if* they were
that level — locks, reveals and 403s included — so the whole flow is walkable in-app.

See docs/prd/onboarding.md for the full spec.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.config import settings


@dataclass(frozen=True)
class Gate:
    key: str
    min_level: int
    tab: str      # bottom-nav tab it lives under (groups reveals): lobby|shop|cards|ranks|profile
    title: str    # player-facing name
    blurb: str    # one-line value, shown on the locked explainer sheet


# The registry. Always-on surfaces (Quick Play, joining an invited table, the daily reward,
# the changelog) are intentionally NOT here — they are available from level 1.
FEATURE_GATES: dict[str, Gate] = {
    "create_room": Gate("create_room", 2, "lobby",   "Create Room", "Host your own table and invite friends."),
    "customize":   Gate("customize",   2, "profile", "Customize",   "Choose your avatar and colors."),
    "friends":     Gate("friends",     3, "ranks",   "Friends",     "Add friends and play together."),
    "shop":        Gate("shop",        3, "shop",    "Shop",        "Coins, gems and card skins."),
    "quests":      Gate("quests",      3, "profile", "Quests",      "Daily goals for extra rewards."),
    "cards":       Gate("cards",       4, "cards",   "Cards",       "Collect and trade card skins."),
    "leaderboard": Gate("leaderboard", 4, "ranks",   "Leaderboard", "See where you rank."),
    "league":      Gate("league",      5, "ranks",   "League",      "Ranked seasons with promotion."),
    "clubs":       Gate("clubs",       7, "lobby",   "Clubs",       "Join a club and play as a team."),
}


def is_admin(user) -> bool:
    return bool(user.telegram_id) and user.telegram_id in settings.admin_ids


def _sandbox(user) -> dict | None:
    return (getattr(user, "onboarding", None) or {}).get("sandbox")


def admin_bypass(user) -> bool:
    """An admin with no sandbox override sees everything (day-to-day admin isn't gated)."""
    return is_admin(user) and not _sandbox(user)


def effective_level(user) -> int:
    """The level gates are evaluated against — the sandbox override if one is set (admins
    testing the flow), otherwise the player's real level."""
    sb = _sandbox(user) or {}
    lvl = sb.get("effective_level")
    if lvl is not None:
        try:
            return max(1, int(lvl))
        except (TypeError, ValueError):
            pass
    return int(getattr(user, "level", 1) or 1)


def is_unlocked(user, key: str) -> bool:
    if not settings.ONBOARDING_ENABLED:
        return True
    g = FEATURE_GATES.get(key)
    if g is None:
        return True  # unknown / always-on surface
    if admin_bypass(user):
        return True
    return effective_level(user) >= g.min_level


def require_feature(user, key: str) -> None:
    """Guard a gated action endpoint. Raises 403 when the caller hasn't unlocked it."""
    if not is_unlocked(user, key):
        g = FEATURE_GATES.get(key)
        n = g.min_level if g else 1
        raise HTTPException(403, f"Locked — unlocks at level {n}. Keep playing!")


def _seen(user) -> list[str]:
    return list((getattr(user, "onboarding", None) or {}).get("seen_reveals") or [])


def mark_seen(user, key: str) -> None:
    """Record that a feature's one-time reveal spotlight has been shown. Reassigns the JSONB
    (SQLAlchemy tracks reassignment, not in-place mutation)."""
    ob = dict(getattr(user, "onboarding", None) or {})
    seen = list(ob.get("seen_reveals") or [])
    if key not in seen:
        seen.append(key)
    ob["seen_reveals"] = seen
    user.onboarding = ob


def payload(user) -> dict:
    """The client's single source of truth for what's unlocked, what's next, and which
    reveals still owe a spotlight."""
    bypass = admin_bypass(user)
    lvl = effective_level(user)
    seen = set(_seen(user))

    features: dict[str, dict] = {}
    pending: list[str] = []
    for key, g in FEATURE_GATES.items():
        unlocked = True if bypass else lvl >= g.min_level
        reveal_seen = key in seen
        features[key] = {
            "min_level": g.min_level, "unlocked": unlocked, "reveal_seen": reveal_seen,
            "title": g.title, "blurb": g.blurb, "tab": g.tab,
        }
        # a reveal is owed when a feature just became reachable and hasn't been spotlighted
        if unlocked and not reveal_seen and not bypass:
            pending.append(key)

    locked = sorted(
        (g for k, g in FEATURE_GATES.items() if lvl < g.min_level),
        key=lambda g: g.min_level,
    )
    nxt = (
        {"feature": locked[0].key, "min_level": locked[0].min_level, "title": locked[0].title}
        if locked else None
    )
    return {
        "enabled": settings.ONBOARDING_ENABLED,
        "level": lvl,
        "real_level": int(getattr(user, "level", 1) or 1),
        "admin": is_admin(user),
        "sandbox": _sandbox(user),
        "features": features,
        "pending_reveals": pending,
        "next_unlock": nxt,
    }
