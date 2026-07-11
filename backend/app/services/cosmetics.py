"""Profile cosmetics: avatars and username colors (catalog + buy/equip)."""
from __future__ import annotations

from app.models import User
from app.services.economy import InsufficientFunds, credit, debit

# --- Avatar catalog. price 0 = free/default (always owned). ------------------
AVATARS: list[dict] = [
    # free starter set
    *[{"emoji": e, "price_coins": 0, "price_gems": 0, "tier": "free"} for e in
      ["🎩", "🃏", "🎲", "😎", "🤠", "🦊", "🐱", "🐼", "🐵", "🐸"]],
    # coin avatars
    *[{"emoji": e, "price_coins": p, "price_gems": 0, "tier": "coins"} for e, p in [
        ("🦁", 30_000), ("🐯", 30_000), ("🐺", 40_000), ("🦉", 40_000),
        ("🚀", 60_000), ("🤖", 60_000), ("👽", 80_000), ("🧠", 80_000),
        ("🎯", 100_000), ("🔥", 120_000),
    ]],
    # gem avatars (premium)
    *[{"emoji": e, "price_coins": 0, "price_gems": g, "tier": "gems"} for e, g in [
        ("👑", 40), ("🦈", 30), ("🐋", 50), ("💎", 60),
        ("🀄", 25), ("🎰", 35), ("💰", 45), ("🏆", 80),
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

AVATAR_MAP = {a["emoji"]: a for a in AVATARS}
COLOR_MAP = {c["code"]: c for c in COLORS}


def _owned_set(user: User) -> set[str]:
    return set(user.owned_cosmetics or [])


def is_free(kind: str, code: str) -> bool:
    if kind == "avatar":
        a = AVATAR_MAP.get(code)
        return bool(a) and a["price_coins"] == 0 and a["price_gems"] == 0
    c = COLOR_MAP.get(code)
    return bool(c) and c["price_coins"] == 0 and c["price_gems"] == 0


def owns(user: User, kind: str, code: str) -> bool:
    if is_free(kind, code):
        return True
    key = ("a:" if kind == "avatar" else "c:") + code
    return key in _owned_set(user)


def catalog(user: User) -> dict:
    return {
        "avatars": [{
            **a, "owned": owns(user, "avatar", a["emoji"]),
            "equipped": user.avatar == a["emoji"],
        } for a in AVATARS],
        "colors": [{
            **c, "owned": owns(user, "color", c["code"]),
            "equipped": (user.name_color or "") == c["code"],
        } for c in COLORS],
    }


async def buy(session, user: User, kind: str, code: str) -> dict:
    item = AVATAR_MAP.get(code) if kind == "avatar" else COLOR_MAP.get(code)
    if not item:
        raise ValueError("Unknown item")
    if owns(user, kind, code):
        return {"owned": True}
    coins = item["price_coins"]
    gems = item["price_gems"]
    try:
        if gems:
            await debit(session, user, gems, "cosmetic", currency="gems", ref=code)
        elif coins:
            await debit(session, user, coins, "cosmetic", ref=code)
    except InsufficientFunds as e:
        raise ValueError(str(e)) from e
    key = ("a:" if kind == "avatar" else "c:") + code
    user.owned_cosmetics = [*(user.owned_cosmetics or []), key]
    return {"owned": True}


async def equip(session, user: User, kind: str, code: str) -> dict:
    if not owns(user, kind, code):
        raise ValueError("You don't own this item")
    if kind == "avatar":
        if code not in AVATAR_MAP:
            raise ValueError("Unknown avatar")
        user.avatar = code
    else:
        if code not in COLOR_MAP:
            raise ValueError("Unknown color")
        user.name_color = code
    return {"equipped": code}
