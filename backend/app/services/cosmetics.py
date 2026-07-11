"""Profile cosmetics: avatars and username colors (catalog + buy/equip)."""
from __future__ import annotations

from app.models import User
from app.services.economy import InsufficientFunds, credit, debit

# --- Avatar catalog. Avatars are icon *codes* (rendered as lucide icons on
#     the client). price 0 = free/default (always owned). ---------------------
DEFAULT_AVATAR = "user"

AVATARS: list[dict] = [
    # free starter set
    *[{"code": c, "price_coins": 0, "price_gems": 0, "tier": "free"} for c in
      ["user", "cat", "dog", "bird", "fish", "rabbit", "ghost", "smile", "dice", "club"]],
    # coin avatars
    *[{"code": c, "price_coins": p, "price_gems": 0, "tier": "coins"} for c, p in [
        ("squirrel", 30_000), ("turtle", 30_000), ("snail", 40_000), ("bug", 40_000),
        ("rocket", 60_000), ("bot", 60_000), ("brain", 80_000), ("target", 80_000),
        ("anchor", 100_000), ("flame", 120_000),
    ]],
    # gem avatars (premium)
    *[{"code": c, "price_coins": 0, "price_gems": g, "tier": "gems"} for c, g in [
        ("crown", 40), ("gem", 30), ("skull", 50), ("diamond", 60),
        ("swords", 25), ("zap", 35), ("star", 45), ("trophy", 80),
    ]],
]

# --- Name color catalog. css "" = classic (default). -------------------------
COLORS: list[dict] = [
    {"code": "", "label": "Classic", "css": "", "price_coins": 0, "price_gems": 0},
    {"code": "#f5c518", "label": "Gold", "css": "#f5c518", "price_coins": 60_000, "price_gems": 0},
    {"code": "#ff4d6d", "label": "Crimson", "css": "#ff4d6d", "price_coins": 40_000, "price_gems": 0},
    {"code": "#3fa9ff", "label": "Azure", "css": "#3fa9ff", "price_coins": 40_000, "price_gems": 0},
    {"code": "#2ecc71", "label": "Emerald", "css": "#2ecc71", "price_coins": 40_000, "price_gems": 0},
    {"code": "#a06bff", "label": "Violet", "css": "#a06bff", "price_coins": 70_000, "price_gems": 0},
    {"code": "#38e0d0", "label": "Cyan", "css": "#38e0d0", "price_coins": 70_000, "price_gems": 0},
    {"code": "#ff9e3f", "label": "Amber", "css": "#ff9e3f", "price_coins": 50_000, "price_gems": 0},
    {"code": "#ff6bd6", "label": "Rose", "css": "#ff6bd6", "price_coins": 0, "price_gems": 20},
    {"code": "#7CFC00", "label": "Neon", "css": "#7CFC00", "price_coins": 0, "price_gems": 25},
]

AVATAR_MAP = {a["code"]: a for a in AVATARS}
COLOR_MAP = {c["code"]: c for c in COLORS}

# Every avatar defaults to "classic" (empty string -> inherits the gold theme).
CLASSIC_AVATAR_COLOR = ""


def avatar_color_of(user: User, code: str) -> str:
    """The color applied to a specific avatar (classic if none set)."""
    return (user.avatar_colors or {}).get(code, CLASSIC_AVATAR_COLOR)


def effective_avatar_color(user: User) -> str:
    """Color of the user's currently-equipped avatar."""
    return avatar_color_of(user, user.avatar)


_KEY = {"avatar": "a:", "color": "c:", "avatar_color": "ac:"}


def _owned_set(user: User) -> set[str]:
    return set(user.owned_cosmetics or [])


def _item(kind: str, code: str):
    return AVATAR_MAP.get(code) if kind == "avatar" else COLOR_MAP.get(code)


def _equipped(user: User, kind: str) -> str:
    if kind == "avatar":
        return user.avatar
    if kind == "color":
        return user.name_color or ""
    # avatar_color: whatever is applied to the currently-equipped avatar
    return avatar_color_of(user, user.avatar)


def is_free(kind: str, code: str) -> bool:
    it = _item(kind, code)
    return bool(it) and it["price_coins"] == 0 and it["price_gems"] == 0


def owns(user: User, kind: str, code: str) -> bool:
    if is_free(kind, code):
        return True
    # whatever is currently equipped is always owned (never lose your current)
    if _equipped(user, kind) == code:
        return True
    return (_KEY[kind] + code) in _owned_set(user)


def catalog(user: User) -> dict:
    current_color = avatar_color_of(user, user.avatar)
    return {
        "avatars": [{
            **a, "owned": owns(user, "avatar", a["code"]),
            "equipped": user.avatar == a["code"],
            "color": avatar_color_of(user, a["code"]),  # this avatar's own color
        } for a in AVATARS],
        "colors": [{
            **c, "owned": owns(user, "color", c["code"]),
            "equipped": (user.name_color or "") == c["code"],
        } for c in COLORS],
        # colors selectable for the CURRENT avatar. owned = globally owned.
        "avatar_colors": [{
            **c, "owned": owns(user, "avatar_color", c["code"]),
            "equipped": current_color == c["code"],
        } for c in COLORS],
        "current_avatar": user.avatar,
        "current_avatar_color": current_color,
    }


async def buy(session, user: User, kind: str, code: str) -> dict:
    item = _item(kind, code)
    if not item:
        raise ValueError("Unknown item")
    if owns(user, kind, code):
        return {"owned": True}
    coins, gems = item["price_coins"], item["price_gems"]
    try:
        if gems:
            await debit(session, user, gems, "cosmetic", currency="gems", ref=code)
        elif coins:
            await debit(session, user, coins, "cosmetic", ref=code)
    except InsufficientFunds as e:
        raise ValueError(str(e)) from e
    user.owned_cosmetics = [*(user.owned_cosmetics or []), _KEY[kind] + code]
    return {"owned": True}


async def equip(session, user: User, kind: str, code: str) -> dict:
    if not owns(user, kind, code):
        raise ValueError("You don't own this item")
    if not _item(kind, code):
        raise ValueError("Unknown item")
    if kind == "avatar":
        user.avatar = code
    elif kind == "color":
        user.name_color = code
    else:
        # apply the color to the currently-equipped avatar only
        colors = dict(user.avatar_colors or {})
        if code:
            colors[user.avatar] = code
        else:
            colors.pop(user.avatar, None)  # classic
        user.avatar_colors = colors
    return {"equipped": code}
