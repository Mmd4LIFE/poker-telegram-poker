"""Admin dashboard: revenue and purchase analytics.

NOTE: The Stars themselves live in your bot's Telegram balance (withdraw via
Fragment). This endpoint reports the *sales records* our app stored.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.config import settings
from app.database import get_session
from app.models import (
    Box,
    CardDesign,
    CardSkin,
    MarketListing,
    Product,
    Purchase,
    Transaction,
    User,
    UserBox,
)
from app.services import cards as CARDS
from app.services.economy_balance import box_stats, suggest_price

router = APIRouter(prefix="/api/admin", tags=["admin"])


class BoxUpdate(BaseModel):
    price_coins: int | None = None
    price_gems: int | None = None
    is_active: bool | None = None
    rewards: list[dict] | None = None


class ProductUpdate(BaseModel):
    base_price: int | None = None
    discount_pct: int | None = None
    coins: int | None = None
    gems: int | None = None
    is_active: bool | None = None


@router.get("/stats")
async def admin_stats(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    total_users = (await session.execute(
        select(func.count(User.id)).where(User.is_bot.is_(False))
    )).scalar_one()

    # Stars
    stars_revenue = (await session.execute(
        select(func.coalesce(func.sum(Purchase.amount), 0))
        .where(Purchase.provider == "stars", Purchase.status == "paid")
    )).scalar_one()
    stars_orders = (await session.execute(
        select(func.count(Purchase.id))
        .where(Purchase.provider == "stars", Purchase.status == "paid")
    )).scalar_one()

    # TON (nanoTON)
    ton_revenue_nano = (await session.execute(
        select(func.coalesce(func.sum(Purchase.amount), 0))
        .where(Purchase.provider == "ton", Purchase.status == "paid")
    )).scalar_one()

    paying_users = (await session.execute(
        select(func.count(func.distinct(Purchase.user_id)))
        .where(Purchase.status == "paid")
    )).scalar_one()

    recent = (await session.execute(
        select(Purchase, User)
        .join(User, User.id == Purchase.user_id)
        .where(Purchase.status == "paid")
        .order_by(Purchase.id.desc()).limit(25)
    )).all()

    top = (await session.execute(
        select(User, func.coalesce(func.sum(Purchase.amount), 0).label("spent"))
        .join(Purchase, Purchase.user_id == User.id)
        .where(Purchase.provider == "stars", Purchase.status == "paid")
        .group_by(User.id).order_by(func.sum(Purchase.amount).desc()).limit(10)
    )).all()

    return {
        "total_users": int(total_users),
        "paying_users": int(paying_users),
        "stars_revenue": int(stars_revenue),     # total Stars earned
        "stars_orders": int(stars_orders),
        "ton_revenue_ton": round(int(ton_revenue_nano) / 1e9, 4),
        "recent_purchases": [{
            "user": u.display_name,
            "telegram_id": u.telegram_id,
            "provider": p.provider,
            "product": p.product_code,
            "amount": p.amount,
            "coins": p.coins_granted,
            "gems": p.gems_granted,
            "at": p.created_at.isoformat() if p.created_at else None,
        } for p, u in recent],
        "top_spenders": [{
            "user": u.display_name,
            "telegram_id": u.telegram_id,
            "stars": int(spent),
        } for u, spent in top],
    }


# ---- Economy: loot boxes ---------------------------------------------------
@router.get("/boxes")
async def admin_boxes(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Box definitions with EV/RTP + real payout monitoring."""
    boxes = (await session.execute(select(Box))).scalars().all()
    out = []
    for b in boxes:
        opens = int((await session.execute(
            select(func.count(UserBox.id)).where(UserBox.box_id == b.id)
        )).scalar_one())
        # actual paid out (coins) for this box, from the ledger
        paid = int((await session.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.kind == "box_open",
                Transaction.ref == b.code,
                Transaction.currency == "coins",
                Transaction.amount > 0,
            )
        )).scalar_one())
        spent = int((await session.execute(
            select(func.coalesce(func.sum(-Transaction.amount), 0)).where(
                Transaction.kind == "box_open",
                Transaction.ref == b.code,
                Transaction.currency == "coins",
                Transaction.amount < 0,
            )
        )).scalar_one())
        st = box_stats(b)
        out.append({
            "code": b.code, "name": b.name, "tier": b.tier,
            "price_coins": b.price_coins, "price_gems": b.price_gems,
            "is_active": b.is_active, "rewards": b.rewards,
            "opens": opens,
            "coins_spent": spent, "coins_paid": paid,
            "actual_rtp": round(paid / spent, 4) if spent else None,
            "suggested_price": suggest_price(b.rewards or []),
            **st,
        })
    return {"boxes": out, "daily_limit": settings.BOX_DAILY_LIMIT}


@router.patch("/boxes/{code}")
async def admin_update_box(
    code: str,
    body: BoxUpdate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    box = (await session.execute(select(Box).where(Box.code == code))).scalar_one_or_none()
    if not box:
        raise HTTPException(404, "Box not found")
    if body.price_coins is not None:
        box.price_coins = max(0, body.price_coins)
    if body.price_gems is not None:
        box.price_gems = max(0, body.price_gems)
    if body.is_active is not None:
        box.is_active = body.is_active
    if body.rewards is not None:
        box.rewards = body.rewards
    await session.flush()
    return {"code": box.code, **box_stats(box)}


# ---- Economy: packs (Stars / TON) ------------------------------------------
@router.get("/products")
async def admin_products(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(select(Product).order_by(Product.sort_order))).scalars().all()
    out = []
    for p in rows:
        sold = int((await session.execute(
            select(func.count(Purchase.id)).where(
                Purchase.product_code == p.code, Purchase.status == "paid"
            )
        )).scalar_one())
        revenue = int((await session.execute(
            select(func.coalesce(func.sum(Purchase.amount), 0)).where(
                Purchase.product_code == p.code, Purchase.status == "paid"
            )
        )).scalar_one())
        out.append({
            "code": p.code, "kind": p.kind, "label": p.label,
            "base_price": p.base_price, "price": p.price,
            "discount_pct": p.discount_pct, "coins": p.coins, "gems": p.gems,
            "is_active": p.is_active, "sold": sold, "revenue": revenue,
        })
    return out


@router.patch("/products/{code}")
async def admin_update_product(
    code: str,
    body: ProductUpdate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    p = (await session.execute(select(Product).where(Product.code == code))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    if body.base_price is not None:
        p.base_price = max(1, body.base_price)
    if body.discount_pct is not None:
        p.discount_pct = max(0, min(90, body.discount_pct))
    if body.coins is not None:
        p.coins = max(0, body.coins)
    if body.gems is not None:
        p.gems = max(0, body.gems)
    if body.is_active is not None:
        p.is_active = body.is_active
    await session.flush()
    return {"code": p.code, "price": p.price, "discount_pct": p.discount_pct}


# --- card skin economy ------------------------------------------------------


@router.get("/cards")
async def admin_cards(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Supply burn-down per design plus market turnover and fees destroyed."""
    designs = list(
        (await session.scalars(select(CardDesign).order_by(CardDesign.sort))).all()
    )
    out = []
    for d in designs:
        minted = int(
            await session.scalar(
                select(func.count())
                .select_from(CardSkin)
                .where(CardSkin.design_code == d.code)
            )
            or 0
        )
        listed = int(
            await session.scalar(
                select(func.count()).where(
                    MarketListing.design_code == d.code,
                    MarketListing.status == "active",
                )
            )
            or 0
        )
        supply = d.mint_per_card * 52
        out.append(
            {
                "code": d.code,
                "name": d.name,
                "rarity": d.rarity,
                "base_price_coins": d.base_price_coins,
                "base_price_gems": d.base_price_gems,
                "mint_per_card": d.mint_per_card,
                "supply_total": supply,
                "minted": minted,
                "sold_out_pct": round(100 * minted / supply, 1) if supply else 0,
                "listed": listed,
                "active": d.active,
                "tradable": d.tradable,
                "ace_price_coins": CARDS.price_of(d, "As")[0],
                "ace_price_gems": CARDS.price_of(d, "As")[1],
            }
        )

    market = {}
    for cur in ("coins", "gems"):
        vol = int(
            await session.scalar(
                select(func.coalesce(func.sum(MarketListing.price), 0)).where(
                    MarketListing.status == "sold", MarketListing.currency == cur
                )
            )
            or 0
        )
        burned = int(
            await session.scalar(
                select(func.coalesce(func.sum(MarketListing.fee), 0)).where(
                    MarketListing.status == "sold", MarketListing.currency == cur
                )
            )
            or 0
        )
        sales = int(
            await session.scalar(
                select(func.count()).where(
                    MarketListing.status == "sold", MarketListing.currency == cur
                )
            )
            or 0
        )
        market[cur] = {"volume": vol, "burned": burned, "sales": sales}

    return {
        "designs": out,
        "market": market,
        "fee_pct": await CARDS.market_fee_pct(session),
    }


class DesignUpdate(BaseModel):
    base_price_coins: int | None = None
    base_price_gems: int | None = None
    mint_per_card: int | None = None
    active: bool | None = None
    tradable: bool | None = None


@router.patch("/cards/{code}")
async def admin_update_design(
    code: str,
    body: DesignUpdate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    d = (
        await session.execute(select(CardDesign).where(CardDesign.code == code))
    ).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Design not found")
    if body.base_price_coins is not None:
        d.base_price_coins = max(0, body.base_price_coins)
    if body.base_price_gems is not None:
        d.base_price_gems = max(0, body.base_price_gems)
    if body.mint_per_card is not None:
        # Never cut the mint below what's already been minted -- that would make
        # existing serials invalid (e.g. #700 of a mint of 500).
        minted = int(
            await session.scalar(
                select(func.coalesce(func.max(CardSkin.serial), 0)).where(
                    CardSkin.design_code == d.code
                )
            )
            or 0
        )
        d.mint_per_card = max(minted, body.mint_per_card)
    if body.active is not None:
        d.active = body.active
    if body.tradable is not None:
        d.tradable = body.tradable
    await session.flush()
    return {"code": d.code, "mint_per_card": d.mint_per_card, "active": d.active}


class MarketSettings(BaseModel):
    fee_pct: int


@router.patch("/market")
async def admin_market_settings(
    body: MarketSettings,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """The market fee is burned, so this dial controls how hard the sink pulls."""
    pct = await CARDS.set_market_fee_pct(session, body.fee_pct)
    await session.flush()
    return {"fee_pct": pct}


# --- audience segments & broadcasts -----------------------------------------

from app.models import Broadcast, Segment  # noqa: E402
from app.services import notify as NOTIFY  # noqa: E402
from app.services import segments as SEG  # noqa: E402


def _seg_out(s: Segment) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "rules": s.rules or {},
        "user_count": s.user_count,
        "computed_at": s.computed_at,
    }


@router.get("/segments")
async def admin_segments(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    rows = list((await session.scalars(select(Segment).order_by(Segment.id))).all())
    total = await SEG.preview_count(session, {})
    return {
        "segments": [_seg_out(s) for s in rows],
        "fields": SEG.FIELDS,
        "total_users": total,
    }


class SegmentIn(BaseModel):
    name: str
    rules: dict = {}


@router.post("/segments")
async def admin_create_segment(
    body: SegmentIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    s = Segment(name=body.name[:64], rules=body.rules or {})
    session.add(s)
    await session.flush()
    return _seg_out(s)


@router.patch("/segments/{seg_id}")
async def admin_update_segment(
    seg_id: int,
    body: SegmentIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    s = await session.get(Segment, seg_id)
    if not s:
        raise HTTPException(404, "Segment not found")
    s.name = body.name[:64]
    s.rules = body.rules or {}
    s.user_count = 0  # rules changed -> the old membership is meaningless
    s.computed_at = None
    await session.flush()
    return _seg_out(s)


@router.delete("/segments/{seg_id}")
async def admin_delete_segment(
    seg_id: int,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    s = await session.get(Segment, seg_id)
    if s:
        await session.delete(s)
    return {"ok": True}


@router.post("/segments/{seg_id}/compute")
async def admin_compute_segment(
    seg_id: int,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Materialise membership. Expensive, so it only runs when asked (or on send)."""
    s = await session.get(Segment, seg_id)
    if not s:
        raise HTTPException(404, "Segment not found")
    n = await SEG.compute(session, s)
    await session.flush()
    return {"user_count": n, "computed_at": s.computed_at}


class PreviewIn(BaseModel):
    rules: dict = {}


@router.post("/segments/preview")
async def admin_preview_segment(
    body: PreviewIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Count without persisting — lets the admin tune rules before saving."""
    return {"user_count": await SEG.preview_count(session, body.rules)}


class BroadcastIn(BaseModel):
    text: str
    segment_id: int | None = None


@router.post("/broadcast")
async def admin_broadcast(
    body: BroadcastIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Message is empty")

    name = "Everyone"
    if body.segment_id:
        seg = await session.get(Segment, body.segment_id)
        if not seg:
            raise HTTPException(404, "Segment not found")
        name = seg.name

    b = Broadcast(text=text, segment_id=body.segment_id, segment_name=name)
    session.add(b)
    await session.commit()

    # Fire and forget: the segment is recomputed inside, so it's never stale.
    import asyncio

    asyncio.create_task(NOTIFY.run_broadcast(b.id))
    return {"id": b.id, "status": "queued", "segment": name}


@router.get("/broadcasts")
async def admin_broadcasts(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    rows = list(
        (
            await session.scalars(
                select(Broadcast).order_by(Broadcast.id.desc()).limit(25)
            )
        ).all()
    )
    return [
        {
            "id": b.id,
            "text": b.text,
            "segment": b.segment_name,
            "status": b.status,
            "total": b.total,
            "sent": b.sent,
            "failed": b.failed,
            "at": b.created_at,
        }
        for b in rows
    ]


class ReminderIn(BaseModel):
    enabled: bool | None = None
    hour: int | None = None
    keep_text: str | None = None
    miss_text: str | None = None


@router.get("/reminder")
async def admin_reminder(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await NOTIFY.get_config(session)


@router.patch("/reminder")
async def admin_update_reminder(
    body: ReminderIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    cfg = await NOTIFY.set_config(session, body.model_dump())
    await session.flush()
    return cfg
