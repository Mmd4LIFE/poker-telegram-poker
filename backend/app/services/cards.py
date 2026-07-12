"""Card-skin economy: rank-scaled pricing, minting, equipping.

The 52 cards are not equal: a skinned Ace is a trophy, a skinned deuce is not.
Price(design, card) = design.base_price * RANK_MULT[rank], so the same design
costs ~4.5x more on an Ace than on a 2. Supply is finite per (design, card).
"""
from __future__ import annotations

import math
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CardDesign, CardSkin, User

RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
# Ordered by prestige (and price): spades > diamonds > hearts > clubs.
SUITS = ["s", "d", "h", "c"]
DECK = [r + s for s in SUITS for r in RANKS]
DECK_SET = set(DECK)

# The value curve. Face cards and the Ace carry the prestige, so they carry the price.
RANK_MULT: dict[str, float] = {
    "2": 1.00, "3": 1.05, "4": 1.10, "5": 1.20, "6": 1.30, "7": 1.45,
    "8": 1.60, "9": 1.80, "T": 2.00, "J": 2.40, "Q": 2.80, "K": 3.40, "A": 4.50,
}

# Suits aren't equal either -- a spade is the trophy suit.
SUIT_MULT: dict[str, float] = {"s": 1.30, "d": 1.15, "h": 1.05, "c": 1.00}

RARITY_ORDER = {"common": 0, "rare": 1, "epic": 2, "legendary": 3, "mythic": 4}

# The look everybody starts with. Not minted, not tradable, never runs out.
DEFAULT_DESIGN = "classic"


# Crockford-ish: no I/O/0/1, so a uid can be read aloud or retyped without error.
_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def new_uid() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"{body[:4]}-{body[4:]}"


def is_card(code: str) -> bool:
    return code in DECK_SET


def price_of(design: CardDesign, card: str) -> tuple[int, int]:
    """(coins, gems) for one copy of `design` applied to `card`."""
    mult = RANK_MULT.get(card[0], 1.0) * SUIT_MULT.get(card[1], 1.0)
    coins = (
        max(500, int(round(design.base_price_coins * mult / 500.0)) * 500)
        if design.base_price_coins
        else 0
    )
    gems = math.ceil(design.base_price_gems * mult) if design.base_price_gems else 0
    return coins, gems


async def minted_counts(session: AsyncSession, design_code: str) -> dict[str, int]:
    """How many copies of each card of this design have been minted."""
    rows = await session.execute(
        select(CardSkin.card, func.count())
        .where(CardSkin.design_code == design_code)
        .group_by(CardSkin.card)
    )
    return {c: int(n) for c, n in rows.all()}


async def mint(
    session: AsyncSession,
    design: CardDesign,
    card: str,
    owner: User,
    source: str = "shop",
) -> CardSkin | None:
    """Mint the next serial of (design, card) to `owner`. None if sold out.

    The row lock on the design serialises concurrent buyers of the same design so
    two people can't be handed the same serial.
    """
    await session.execute(
        select(CardDesign.id).where(CardDesign.id == design.id).with_for_update()
    )
    minted = await session.scalar(
        select(func.count())
        .select_from(CardSkin)
        .where(CardSkin.design_code == design.code, CardSkin.card == card)
    )
    minted = int(minted or 0)
    if design.mint_per_card and minted >= design.mint_per_card:
        return None
    skin = CardSkin(
        uid=new_uid(),
        design_code=design.code,
        card=card,
        serial=minted + 1,
        owner_id=owner.id,
        source=source,
    )
    session.add(skin)
    await session.flush()
    return skin


def equipped_map(user: User) -> dict[str, str]:
    """{card: design_code} for the table renderer. Public, static cosmetic info."""
    return {c: v["d"] for c, v in (user.equipped_skins or {}).items() if v.get("d")}


def equip(user: User, card: str, skin: CardSkin | None) -> None:
    eq = dict(user.equipped_skins or {})
    if skin is None:
        eq.pop(card, None)
    else:
        eq[card] = {"id": skin.id, "d": skin.design_code}
    user.equipped_skins = eq


def unequip_skin(user: User, skin: CardSkin) -> None:
    """Drop a skin from the equipped map if it's the one in use (sold/listed)."""
    eq = dict(user.equipped_skins or {})
    cur = eq.get(skin.card)
    if cur and cur.get("id") == skin.id:
        eq.pop(skin.card, None)
        user.equipped_skins = eq


# --- runtime settings (admin-tunable, DB-backed) -----------------------------

MARKET_FEE_KEY = "market_fee_pct"


async def market_fee_pct(session: AsyncSession) -> int:
    """House cut on market sales. Falls back to the env default if never set."""
    from app.config import settings
    from app.models import AppSetting

    row = await session.get(AppSetting, MARKET_FEE_KEY)
    if row and isinstance(row.value, dict) and "pct" in row.value:
        return int(row.value["pct"])
    return int(settings.MARKET_FEE_PCT)


async def set_market_fee_pct(session: AsyncSession, pct: int) -> int:
    from app.models import AppSetting

    pct = max(0, min(50, int(pct)))
    row = await session.get(AppSetting, MARKET_FEE_KEY)
    if row:
        row.value = {"pct": pct}
    else:
        session.add(AppSetting(key=MARKET_FEE_KEY, value={"pct": pct}))
    return pct
