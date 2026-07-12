"""Player-to-player skin market.

Buying is the only place two users' balances move at once, so it takes row locks
on the listing and both wallets, re-checks the listing under the lock, and only
then transfers. The house fee is *burned* (never credited anywhere), which makes
the market a coin/gem sink rather than an inflation source.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_session
from app.models import CardDesign, CardSkin, MarketListing, User
from app.services import cards as C
from app.services.economy import InsufficientFunds, adjust_balance, credit

router = APIRouter(prefix="/api/market", tags=["market"])

MAX_ACTIVE_LISTINGS = 50
MIN_PRICE = {"coins": 100, "gems": 1}
MAX_PRICE = {"coins": 5_000_000_000, "gems": 1_000_000}


def _fee(price: int) -> int:
    return max(1, price * settings.MARKET_FEE_PCT // 100) if price else 0


def _listing_out(l: MarketListing, seller: User | None = None) -> dict:
    return {
        "id": l.id,
        "skin_id": l.skin_id,
        "design": l.design_code,
        "card": l.card,
        "serial": l.serial,
        "price": l.price,
        "currency": l.currency,
        "seller_id": l.seller_id,
        "seller_name": seller.display_name if seller else None,
        "at": l.created_at,
    }


async def _sellers(session: AsyncSession, ls: list[MarketListing]) -> dict[int, User]:
    ids = {l.seller_id for l in ls}
    if not ids:
        return {}
    rows = await session.scalars(select(User).where(User.id.in_(ids)))
    return {u.id: u for u in rows.all()}


@router.get("")
async def browse(
    card: str | None = None,
    design: str | None = None,
    rarity: str | None = None,
    currency: str | None = None,
    sort: str = "price",  # price | -price | recent | serial
    limit: int = Query(60, le=120),
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    q = select(MarketListing).where(MarketListing.status == "active")
    if card:
        q = q.where(MarketListing.card == card)
    if design:
        q = q.where(MarketListing.design_code == design)
    if currency in ("coins", "gems"):
        q = q.where(MarketListing.currency == currency)
    if rarity:
        codes = list(
            (
                await session.scalars(
                    select(CardDesign.code).where(CardDesign.rarity == rarity)
                )
            ).all()
        )
        q = q.where(MarketListing.design_code.in_(codes or ["~none~"]))

    order = {
        "price": MarketListing.price.asc(),
        "-price": MarketListing.price.desc(),
        "recent": MarketListing.created_at.desc(),
        "serial": MarketListing.serial.asc(),
    }.get(sort, MarketListing.price.asc())

    total = int(
        await session.scalar(select(func.count()).select_from(q.subquery())) or 0
    )
    rows = list(
        (await session.scalars(q.order_by(order).offset(offset).limit(limit))).all()
    )
    smap = await _sellers(session, rows)
    return {
        "total": total,
        "listings": [
            {**_listing_out(l, smap.get(l.seller_id)), "is_mine": l.seller_id == user.id}
            for l in rows
        ],
        "fee_pct": settings.MARKET_FEE_PCT,
    }


@router.get("/stats")
async def stats(
    design: str,
    card: str,
    session: AsyncSession = Depends(get_session),
):
    """Floor / last sale / 24h volume for one (design, card) pair — per currency."""
    out: dict[str, dict] = {}
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    for cur in ("coins", "gems"):
        base = (
            MarketListing.design_code == design,
            MarketListing.card == card,
            MarketListing.currency == cur,
        )
        floor = await session.scalar(
            select(func.min(MarketListing.price)).where(
                *base, MarketListing.status == "active"
            )
        )
        listed = await session.scalar(
            select(func.count()).where(*base, MarketListing.status == "active")
        )
        last = await session.scalar(
            select(MarketListing.price)
            .where(*base, MarketListing.status == "sold")
            .order_by(MarketListing.closed_at.desc())
            .limit(1)
        )
        vol = await session.scalar(
            select(func.count()).where(
                *base, MarketListing.status == "sold", MarketListing.closed_at >= since
            )
        )
        out[cur] = {
            "floor": int(floor) if floor else None,
            "listed": int(listed or 0),
            "last": int(last) if last else None,
            "sales_24h": int(vol or 0),
        }
    sales = list(
        (
            await session.scalars(
                select(MarketListing)
                .where(
                    MarketListing.design_code == design,
                    MarketListing.card == card,
                    MarketListing.status == "sold",
                )
                .order_by(MarketListing.closed_at.desc())
                .limit(15)
            )
        ).all()
    )
    return {
        "design": design,
        "card": card,
        **out,
        "history": [
            {"price": s.price, "currency": s.currency, "serial": s.serial, "at": s.closed_at}
            for s in sales
        ],
    }


class ListIn(BaseModel):
    skin_id: int
    price: int
    currency: str = "coins"


@router.post("/list")
async def create_listing(
    body: ListIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cur = body.currency if body.currency in ("coins", "gems") else "coins"
    if body.price < MIN_PRICE[cur] or body.price > MAX_PRICE[cur]:
        raise HTTPException(400, f"Price must be {MIN_PRICE[cur]}–{MAX_PRICE[cur]} {cur}")

    skin = await session.get(CardSkin, body.skin_id, with_for_update=True)
    if not skin or skin.owner_id != user.id:
        raise HTTPException(404, "You don't own that skin")
    if skin.on_market:
        raise HTTPException(400, "Already listed")

    d = await session.scalar(
        select(CardDesign).where(CardDesign.code == skin.design_code)
    )
    if d and not d.tradable:
        raise HTTPException(400, "This design can't be traded")

    active = int(
        await session.scalar(
            select(func.count()).where(
                MarketListing.seller_id == user.id, MarketListing.status == "active"
            )
        )
        or 0
    )
    if active >= MAX_ACTIVE_LISTINGS:
        raise HTTPException(400, f"Max {MAX_ACTIVE_LISTINGS} active listings")

    C.unequip_skin(user, skin)  # can't wear what's on the shelf
    skin.on_market = True
    listing = MarketListing(
        skin_id=skin.id,
        seller_id=user.id,
        design_code=skin.design_code,
        card=skin.card,
        serial=skin.serial,
        price=body.price,
        currency=cur,
        status="active",
    )
    session.add(listing)
    await session.commit()
    return {
        **_listing_out(listing, user),
        "you_receive": body.price - _fee(body.price),
        "fee": _fee(body.price),
    }


class IdIn(BaseModel):
    listing_id: int


@router.post("/cancel")
async def cancel(
    body: IdIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    l = await session.get(MarketListing, body.listing_id, with_for_update=True)
    if not l or l.seller_id != user.id:
        raise HTTPException(404, "Listing not found")
    if l.status != "active":
        raise HTTPException(400, "Listing is no longer active")
    l.status = "cancelled"
    l.closed_at = datetime.now(timezone.utc)
    skin = await session.get(CardSkin, l.skin_id, with_for_update=True)
    if skin:
        skin.on_market = False
    await session.commit()
    return {"ok": True}


@router.post("/buy")
async def buy(
    body: IdIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Lock the listing first: two buyers racing on the same item serialise here,
    # and the loser sees status != active.
    l = await session.get(MarketListing, body.listing_id, with_for_update=True)
    if not l or l.status != "active":
        raise HTTPException(409, "Already sold or cancelled")
    if l.seller_id == user.id:
        raise HTTPException(400, "That's your own listing")

    skin = await session.get(CardSkin, l.skin_id, with_for_update=True)
    if not skin or skin.owner_id != l.seller_id:
        raise HTTPException(409, "Item no longer available")

    # Lock both wallets in a fixed order (lowest id first). Two users buying from
    # each other at the same moment would otherwise deadlock.
    wallets: dict[int, User | None] = {}
    for uid in sorted({l.seller_id, user.id}):
        wallets[uid] = await session.get(User, uid, with_for_update=True)
    seller, buyer = wallets[l.seller_id], wallets[user.id]
    if seller is None or buyer is None:
        raise HTTPException(409, "Seller is gone")

    fee = _fee(l.price)
    payout = l.price - fee
    try:
        await adjust_balance(
            session,
            buyer,
            -l.price,
            "market_buy",
            currency=l.currency,
            ref=f"listing:{l.id}",
            meta={"design": l.design_code, "card": l.card, "serial": l.serial},
        )
    except InsufficientFunds as e:
        raise HTTPException(400, str(e))

    await credit(
        session,
        seller,
        payout,
        "market_sale",
        currency=l.currency,
        ref=f"listing:{l.id}",
        meta={
            "design": l.design_code,
            "card": l.card,
            "serial": l.serial,
            "gross": l.price,
            "fee": fee,  # burned, not paid to anyone
        },
    )

    C.unequip_skin(seller, skin)
    skin.owner_id = buyer.id
    skin.on_market = False
    skin.source = "market"
    skin.acquired_at = datetime.now(timezone.utc)

    l.status = "sold"
    l.buyer_id = buyer.id
    l.fee = fee
    l.closed_at = datetime.now(timezone.utc)

    await session.commit()
    return {
        "skin_id": skin.id,
        "design": l.design_code,
        "card": l.card,
        "serial": l.serial,
        "paid": l.price,
        "currency": l.currency,
    }


@router.get("/mine")
async def mine(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    active = list(
        (
            await session.scalars(
                select(MarketListing)
                .where(
                    MarketListing.seller_id == user.id,
                    MarketListing.status == "active",
                )
                .order_by(MarketListing.created_at.desc())
            )
        ).all()
    )
    history = list(
        (
            await session.scalars(
                select(MarketListing)
                .where(
                    or_(
                        MarketListing.seller_id == user.id,
                        MarketListing.buyer_id == user.id,
                    ),
                    MarketListing.status == "sold",
                )
                .order_by(MarketListing.closed_at.desc())
                .limit(30)
            )
        ).all()
    )
    return {
        "active": [_listing_out(l, user) for l in active],
        "history": [
            {
                **_listing_out(l),
                "side": "sold" if l.seller_id == user.id else "bought",
                "net": l.price - l.fee if l.seller_id == user.id else l.price,
                "at": l.closed_at,
            }
            for l in history
        ],
        "fee_pct": settings.MARKET_FEE_PCT,
    }
