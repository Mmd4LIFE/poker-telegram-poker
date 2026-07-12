"""My Cards: the 52-card collection, the mint shop, and equipping."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import CardDesign, CardSkin, MarketListing, Transaction, User
from app.services import cards as C
from app.services.economy import InsufficientFunds, debit

router = APIRouter(prefix="/api/cards", tags=["cards"])


def _design_out(d: CardDesign) -> dict:
    return {
        "code": d.code,
        "name": d.name,
        "rarity": d.rarity,
        "palette": d.palette or {},
        "mint_per_card": d.mint_per_card,
        "tradable": d.tradable,
        "base_price_coins": d.base_price_coins,
        "base_price_gems": d.base_price_gems,
    }


async def _designs(session: AsyncSession, only_active: bool = True) -> list[CardDesign]:
    q = select(CardDesign)
    if only_active:
        q = q.where(CardDesign.active.is_(True))
    return list((await session.scalars(q.order_by(CardDesign.sort, CardDesign.id))).all())


@router.get("/designs")
async def designs(session: AsyncSession = Depends(get_session)):
    """Palette dictionary for the renderer. Cached client-side."""
    return {
        "default": C.DEFAULT_DESIGN,
        "designs": [_design_out(d) for d in await _designs(session)],
        "suit_mult": C.SUIT_MULT,
        "rank_mult": C.RANK_MULT,
    }


@router.get("/collection")
async def collection(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Every card the user owns a skin for, plus what's equipped on each."""
    skins = list(
        (
            await session.scalars(
                select(CardSkin)
                .where(CardSkin.owner_id == user.id)
                .order_by(CardSkin.card, CardSkin.serial)
            )
        ).all()
    )
    by_card: dict[str, list[dict]] = {}
    for s in skins:
        by_card.setdefault(s.card, []).append(
            {
                "id": s.id,
                "uid": s.uid,
                "design": s.design_code,
                "serial": s.serial,
                "on_market": s.on_market,
            }
        )
    eq = user.equipped_skins or {}
    items = [
        {
            "card": card,
            "equipped": (eq.get(card) or {}).get("d") or C.DEFAULT_DESIGN,
            "equipped_id": (eq.get(card) or {}).get("id"),
            "owned": by_card.get(card, []),
        }
        for card in C.DECK
    ]
    return {
        "cards": items,
        "owned_total": len(skins),
        "skinned": sum(1 for i in items if i["equipped"] != C.DEFAULT_DESIGN),
        "deck_size": len(C.DECK),
    }


@router.get("/shop")
async def shop(
    design: str | None = None,
    card: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Mint shop. `design` -> that design across 52 cards. `card` -> all designs
    for that one card. Neither -> the design list with supply summary."""
    ds = await _designs(session)
    dmap = {d.code: d for d in ds}

    if design:
        d = dmap.get(design)
        if not d:
            raise HTTPException(404, "Unknown design")
        minted = await C.minted_counts(session, d.code)
        owned = set(
            (
                await session.scalars(
                    select(CardSkin.card).where(
                        CardSkin.owner_id == user.id, CardSkin.design_code == d.code
                    )
                )
            ).all()
        )
        out = []
        for c in C.DECK:
            coins, gems = C.price_of(d, c)
            m = minted.get(c, 0)
            out.append(
                {
                    "card": c,
                    "price_coins": coins,
                    "price_gems": gems,
                    "minted": m,
                    "remaining": max(0, d.mint_per_card - m) if d.mint_per_card else 0,
                    "owned": c in owned,
                }
            )
        return {"design": _design_out(d), "cards": out}

    if card:
        if not C.is_card(card):
            raise HTTPException(400, "Unknown card")
        out = []
        for d in ds:
            if not d.mint_per_card:
                continue
            coins, gems = C.price_of(d, card)
            m = int(
                await session.scalar(
                    select(func.count())
                    .select_from(CardSkin)
                    .where(CardSkin.design_code == d.code, CardSkin.card == card)
                )
                or 0
            )
            out.append(
                {
                    **_design_out(d),
                    "price_coins": coins,
                    "price_gems": gems,
                    "minted": m,
                    "remaining": max(0, d.mint_per_card - m),
                }
            )
        return {"card": card, "designs": out}

    # overview: one row per design with total supply left
    out = []
    for d in ds:
        minted = await C.minted_counts(session, d.code)
        total = d.mint_per_card * len(C.DECK) if d.mint_per_card else 0
        out.append(
            {
                **_design_out(d),
                "minted_total": sum(minted.values()),
                "supply_total": total,
                # cheapest card in the design: the two of clubs
                "from_coins": C.price_of(d, "2c")[0],
                "from_gems": C.price_of(d, "2c")[1],
            }
        )
    return {"designs": out}


class BuyIn(BaseModel):
    design: str
    card: str
    currency: str = "coins"


@router.post("/buy")
async def buy(
    body: BuyIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not C.is_card(body.card):
        raise HTTPException(400, "Unknown card")
    d = await session.scalar(
        select(CardDesign).where(
            CardDesign.code == body.design, CardDesign.active.is_(True)
        )
    )
    if not d or not d.mint_per_card:
        raise HTTPException(404, "Not for sale")

    coins, gems = C.price_of(d, body.card)
    cur = body.currency if body.currency in ("coins", "gems") else "coins"
    price = coins if cur == "coins" else gems
    if not price:
        # design is single-currency; fall back to whichever it actually has
        cur = "coins" if coins else "gems"
        price = coins or gems
    if not price:
        raise HTTPException(400, "Not purchasable")

    skin = await C.mint(session, d, body.card, user, source="shop")
    if skin is None:
        raise HTTPException(409, "Sold out — try the market")

    try:
        await debit(
            session,
            user,
            price,
            "card_skin_buy",
            currency=cur,
            ref=f"{d.code}:{body.card}",
            meta={"serial": skin.serial},
        )
    except InsufficientFunds as e:
        raise HTTPException(400, str(e))

    C.equip(user, body.card, skin)  # you bought it — wear it
    await session.commit()
    return {
        "skin": {
            "id": skin.id,
            "design": d.code,
            "card": body.card,
            "serial": skin.serial,
        },
        "paid": price,
        "currency": cur,
        "remaining": max(0, d.mint_per_card - skin.serial),
    }


class EquipIn(BaseModel):
    card: str
    skin_id: int | None = None  # null -> back to the classic look


@router.post("/equip")
async def equip(
    body: EquipIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not C.is_card(body.card):
        raise HTTPException(400, "Unknown card")
    if body.skin_id is None:
        C.equip(user, body.card, None)
        await session.commit()
        return {"card": body.card, "design": C.DEFAULT_DESIGN}

    skin = await session.get(CardSkin, body.skin_id)
    if not skin or skin.owner_id != user.id:
        raise HTTPException(404, "You don't own that skin")
    if skin.card != body.card:
        raise HTTPException(400, "That skin belongs to another card")
    if skin.on_market:
        raise HTTPException(400, "Listed on the market — cancel the listing first")
    C.equip(user, body.card, skin)
    await session.commit()
    return {"card": body.card, "design": skin.design_code, "serial": skin.serial}


@router.get("/purchases")
async def purchases(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Everything this user minted from the shop, newest first."""
    rows = list(
        (
            await session.scalars(
                select(Transaction)
                .where(
                    Transaction.user_id == user.id,
                    Transaction.kind == "card_skin_buy",
                )
                .order_by(Transaction.created_at.desc())
                .limit(60)
            )
        ).all()
    )
    out = []
    for t in rows:
        design, _, card = (t.ref or "").partition(":")
        out.append(
            {
                "design": design,
                "card": card,
                "serial": (t.meta or {}).get("serial"),
                "price": abs(t.amount),
                "currency": t.currency,
                "at": t.created_at,
            }
        )
    return {"purchases": out}


@router.get("/skins/{skin_id}")
async def skin_detail(
    skin_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    skin = await session.get(CardSkin, skin_id)
    if not skin:
        raise HTTPException(404, "Not found")
    owner = await session.get(User, skin.owner_id)
    d = await session.scalar(select(CardDesign).where(CardDesign.code == skin.design_code))
    sales = list(
        (
            await session.scalars(
                select(MarketListing)
                .where(
                    MarketListing.skin_id == skin.id,
                    MarketListing.status == "sold",
                )
                .order_by(MarketListing.closed_at.desc())
                .limit(10)
            )
        ).all()
    )
    return {
        "id": skin.id,
        "uid": skin.uid,
        "card": skin.card,
        "design": _design_out(d) if d else None,
        "serial": skin.serial,
        "mint": d.mint_per_card if d else 0,
        "owner": {"id": owner.id, "name": owner.display_name} if owner else None,
        "is_mine": skin.owner_id == user.id,
        "on_market": skin.on_market,
        "history": [
            {"price": s.price, "currency": s.currency, "at": s.closed_at} for s in sales
        ],
    }
