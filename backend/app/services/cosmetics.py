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

# Each avatar has a themed default icon color.
DEFAULT_AVATAR_COLORS: dict[str, str] = {
    "user": "#9aa7b8", "cat": "#ff9e3f", "dog": "#c08457", "bird": "#3fa9ff",
    "fish": "#38e0d0", "rabbit": "#ff6bd6", "ghost": "#a06bff", "smile": "#f5c518",
    "dice": "#e6edf3", "club": "#2ecc71", "squirrel": "#c08457", "turtle": "#2ecc71",
    "snail": "#a06bff", "bug": "#7CFC00", "rocket": "#ff4d6d", "bot": "#9aa7b8",
    "brain": "#ff6bd6", "target": "#ff4d6d", "anchor": "#3fa9ff", "flame": "#ff6a00",
    "crown": "#f5c518", "gem": "#38e0d0", "skull": "#cfd8e3", "diamond": "#7ee0ff",
    "swords": "#c0c0c0", "zap": "#f5c518", "star": "#f5c518", "trophy": "#f5c518",
}


def effective_avatar_color(user: User) -> str:
    return user.avatar_color or DEFAULT_AVATAR_COLORS.get(user.avatar, "#f5c518")


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
    return user.avatar_color or ""


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
    return {
        "avatars": [{
            **a, "owned": owns(user, "avatar", a["code"]),
            "equipped": user.avatar == a["code"],
            "default_color": DEFAULT_AVATAR_COLORS.get(a["code"], "#f5c518"),
        } for a in AVATARS],
        "colors": [{
            **c, "owned": owns(user, "color", c["code"]),
            "equipped": (user.name_color or "") == c["code"],
        } for c in COLORS],
        "avatar_colors": [{
            **c, "owned": owns(user, "avatar_color", c["code"]),
            "equipped": (user.avatar_color or "") == c["code"],
        } for c in COLORS],
        "current_avatar_color": effective_avatar_color(user),
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
        user.avatar_color = code
    return {"equipped": code}
