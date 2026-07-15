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
    daily_limit: int | None = None   # 0 = unlimited
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
            "daily_limit": b.daily_limit or settings.BOX_DAILY_LIMIT or 0,
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
    if body.daily_limit is not None:
        box.daily_limit = max(0, body.daily_limit)  # 0 = unlimited
    if body.rewards is not None:
        box.rewards = body.rewards
    await session.flush()
    return {"code": box.code, "daily_limit": box.daily_limit, **box_stats(box)}


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
        "variables": NOTIFY.VARIABLES,
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
    cfg = await NOTIFY.get_config(session)
    return {
        **cfg,
        "variables": NOTIFY.VARIABLES,
        "keep_variables": NOTIFY.KEEP_VARIABLES,
    }


@router.patch("/reminder")
async def admin_update_reminder(
    body: ReminderIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    cfg = await NOTIFY.set_config(session, body.model_dump())
    await session.flush()
    return cfg


# --- bot monitor ------------------------------------------------------------

from app.models import PlayerStats  # noqa: E402
from app.services import dna as DNA  # noqa: E402


@router.get("/bots")
async def admin_bots(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Every bot with its Poker DNA. This is the honest view: the radar is computed
    from hands they actually played, not from the personality we configured."""
    bots = list(
        (
            await session.scalars(
                select(User).where(User.is_bot.is_(True)).order_by(User.id.desc())
            )
        ).all()
    )
    ids = [b.id for b in bots]
    stats = {}
    if ids:
        rows = await session.scalars(
            select(PlayerStats).where(PlayerStats.user_id.in_(ids))
        )
        stats = {s.user_id: s for s in rows.all()}

    out = []
    for b in bots:
        d = DNA.compute(stats.get(b.id))
        from app.services import dq as DQ
        dqd = DQ.compute(stats.get(b.id))
        out.append(
            {
                "id": b.id,
                "name": b.display_name,
                "avatar": b.avatar,
                "personality": b.bot_personality,
                "skill": round(b.bot_skill or 0, 2),
                "dq": dqd["dq"],
                "dq_blunder_rate": dqd["blunder_rate"],
                "hands": d["hands"],
                "hands_won": d["hands_won"],
                "win_rate": d["win_rate"],
                "hands_played": b.hands_played,
                "net_won": d["raw"]["net_won"],
                "style": DNA.style_of(d["scores"]),
                "scores": d["scores"],
                "raw": d["raw"],
                "confidence": d["confidence"],
            }
        )
    # No re-sorting: the list stays in id-desc order so a bot never moves under your
    # finger between refreshes.
    return {
        "bots": out,
        "axes": DNA.AXES,
        "min_hands": DNA.MIN_HANDS,
        "kpis": DNA.KPI_DOCS,
        "personalities": DNA.PERSONALITY_KEYS,
    }


@router.get("/bots/{bot_id}")
async def admin_bot_detail(
    bot_id: int,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    from app.models import PlayerHand

    b = await session.get(User, bot_id)
    if not b or not b.is_bot:
        raise HTTPException(404, "Bot not found")
    st = await session.get(PlayerStats, bot_id)
    d = DNA.compute(st)

    hands = list(
        (
            await session.scalars(
                select(PlayerHand)
                .where(PlayerHand.user_id == bot_id)
                .order_by(PlayerHand.id.desc())
                .limit(20)
            )
        ).all()
    )
    return {
        "id": b.id,
        "name": b.display_name,
        "avatar": b.avatar,
        "personality": b.bot_personality,
        "skill": round(b.bot_skill or 0, 2),
        "coins": b.coins,
        "level": b.level,
        "kpis": DNA.KPI_DOCS,
        "axis_docs": DNA.AXIS_DOCS,
        "shrinkage": DNA.SHRINKAGE_NOTE,
        "biggest_pot": b.biggest_pot,
        "style": DNA.style_of(d["scores"]),
        **d,
        "recent": [
            {
                "room": h.room_code,
                "hand_no": h.hand_no,
                "net": h.net,
                "won": h.won,
                "hand_name": h.hand_name,
                "pot": h.pot,
                "at": h.created_at,
            }
            for h in hands
        ],
        "league": await _bot_league_roadmap(session, bot_id),
        "dq": _dq_of(st),
    }


def _dq_of(st):
    from app.services import dq as DQ
    return DQ.compute(st)


@router.get("/dq")
async def admin_dq(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """The validation machine: is DQ actually measuring skill?"""
    from app.services import dq as DQ
    from app.poker.scoring import DEFAULTS
    return {
        **await DQ.validate(session),
        "model": DEFAULTS,
        "distribution": await DQ.distribution(session),
        "grades": await DQ.get_grades(session),
    }


@router.post("/dq/recompute")
async def admin_dq_recompute(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Recompute grade cutoffs from the live DQ distribution (percentile bands)."""
    from app.services import dq as DQ
    res = await DQ.recompute_grades(session)
    await session.flush()
    return res


async def _bot_league_roadmap(session: AsyncSession, bot_id: int) -> dict:
    """A bot's climb and fall through the tiers, newest first — so the admin can
    watch which bots are grinding upward and which are sinking."""
    from app.models import Cohort as _C
    from app.models import CohortMember as _CM
    from app.models import LeagueSeason as _S
    from app.services import league as _L

    cfg = await _L.get_config(session)
    rows = (
        await session.execute(
            select(_S, _C, _CM)
            .join(_C, _C.season_id == _S.id)
            .join(_CM, _CM.cohort_id == _C.id)
            .where(_CM.user_id == bot_id, _S.status == "closed")
            .order_by(_S.day.desc())
            .limit(30)
        )
    ).all()
    days = [
        {
            "day": str(season.day),
            "tier": cohort.tier,
            "tier_name": _L.tier_of(cfg, cohort.tier)["name"],
            "rank": m.rank,
            "lp": m.lp or 0,
            "games": m.ranked_games or 0,
            "wins": m.wins or 0,
            "outcome": m.outcome or "held",
        }
        for season, cohort, m in rows
    ]
    order = [t["key"] for t in cfg["tiers"]]
    best = None
    for d in days:
        if best is None or order.index(d["tier"]) > order.index(best):
            best = d["tier"]
    return {
        "days": days,
        "seasons": len(days),
        "promotions": sum(1 for d in days if d["outcome"] == "promoted"),
        "demotions": sum(1 for d in days if d["outcome"] == "demoted"),
        "best_tier": best,
        "best_tier_name": _L.tier_of(cfg, best)["name"] if best else None,
    }


class BotCreate(BaseModel):
    name: str
    personality: str = "balanced"
    skill: float = 0.5
    avatar: str = "bot"


@router.post("/bots")
async def admin_create_bot(
    body: BotCreate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Hand-roll a bot. It joins the pool immediately and starts accruing DNA the
    moment it's dealt into a table — including the self-play tables."""
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Give it a name")
    if body.personality not in DNA.PERSONALITY_KEYS:
        raise HTTPException(400, f"personality must be one of {DNA.PERSONALITY_KEYS}")

    exists = await session.scalar(
        select(User).where(User.is_bot.is_(True), User.first_name == name)
    )
    if exists:
        raise HTTPException(409, "A bot with that name already exists")

    bot = User(
        first_name=name[:64],
        is_bot=True,
        bot_personality=body.personality,
        bot_skill=max(0.0, min(1.0, float(body.skill))),
        avatar=body.avatar or "bot",
        coins=1_000_000,   # bots need a bankroll to sit down with
    )
    session.add(bot)
    await session.flush()
    return {"id": bot.id, "name": bot.display_name}


@router.delete("/bots/{bot_id}")
async def admin_delete_bot(
    bot_id: int,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(User, bot_id)
    if not b or not b.is_bot:
        raise HTTPException(404, "Bot not found")
    await session.delete(b)
    return {"ok": True}


# --- league -----------------------------------------------------------------

from app.models import Cohort, CohortMember, LeagueSeason  # noqa: E402
from app.services import league as LG  # noqa: E402


@router.get("/league")
async def admin_league(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    cfg = await LG.get_config(session)
    season = await session.scalar(
        select(LeagueSeason).where(LeagueSeason.day == LG.league_day(cfg))
    )
    cohorts = []
    if season:
        rows = list(
            (
                await session.scalars(
                    select(Cohort).where(Cohort.season_id == season.id).order_by(Cohort.id)
                )
            ).all()
        )
        for c in rows:
            members = list(
                (
                    await session.scalars(
                        select(CohortMember).where(CohortMember.cohort_id == c.id)
                    )
                ).all()
            )
            members.sort(key=lambda m: (-(m.lp or 0), m.ranked_games or 0))
            ids = [m.user_id for m in members]
            users = {}
            if ids:
                us = await session.scalars(select(User).where(User.id.in_(ids)))
                users = {u.id: u for u in us.all()}
            cohorts.append(
                {
                    "id": c.id,
                    "tier": c.tier,
                    "idx": c.idx + 1,
                    "capacity": c.capacity,
                    "humans": sum(1 for m in members if not m.is_bot),
                    "bots": sum(1 for m in members if m.is_bot),
                    "members": [
                        {
                            "rank": i + 1,
                            "name": users[m.user_id].display_name
                            if m.user_id in users
                            else "?",
                            "is_bot": m.is_bot,
                            "personality": users[m.user_id].bot_personality
                            if m.user_id in users
                            else None,
                            "skill": round(users[m.user_id].bot_skill or 0, 2)
                            if m.user_id in users and m.is_bot
                            else None,
                            "lp": m.lp or 0,
                            "games": m.ranked_games or 0,
                            "wins": m.wins or 0,
                        }
                        for i, m in enumerate(members)
                    ],
                }
            )
    return {
        "config": cfg,
        "day": str(LG.league_day(cfg)),
        "seconds_to_close": LG.seconds_to_close(cfg),
        "cohorts": cohorts,
    }


class LeagueCfg(BaseModel):
    enabled: bool | None = None
    unlock_level: int | None = None
    timezone: str | None = None
    ranked_games_per_day: int | None = None
    bot_fill: bool | None = None
    shards_per_skin: int | None = None


@router.patch("/league")
async def admin_league_cfg(
    body: LeagueCfg,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    cfg = await LG.set_config(session, body.model_dump())
    await session.flush()
    return cfg


@router.post("/league/close")
async def admin_league_close(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Force the day to end now — promotions, demotions, rewards. For testing a
    one-day league without waiting for midnight."""
    cfg = await LG.get_config(session)
    season = await session.scalar(
        select(LeagueSeason).where(
            LeagueSeason.day == LG.league_day(cfg), LeagueSeason.status == "open"
        )
    )
    if not season:
        raise HTTPException(404, "No open season")
    summary = await LG.close_season(session, season, cfg)
    await session.commit()
    await LG.ensure_season(session)
    await session.commit()
    return summary


@router.post("/league/simulate")
async def admin_league_simulate(
    rounds: int = 1,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Fast-forward the bots' day."""
    cfg = await LG.get_config(session)
    n = await LG.simulate_bot_games(session, cfg, rounds=max(1, min(20, rounds)))
    await session.commit()
    return {"games": n}


# --- analytics dashboards ---------------------------------------------------

from app.services import analytics as ANALYTICS  # noqa: E402


@router.get("/dash/economy")
async def admin_dash_economy(
    days: int = 30,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    # keep today's snapshot fresh on view
    from datetime import datetime, timezone
    await ANALYTICS.snapshot_daily(session, datetime.now(timezone.utc).date())
    await session.commit()
    return await ANALYTICS.economy_dashboard(session, max(7, min(90, days)))


@router.get("/dash/engagement")
async def admin_dash_engagement(
    days: int = 30,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    from datetime import datetime, timezone
    await ANALYTICS.snapshot_daily(session, datetime.now(timezone.utc).date())
    await session.commit()
    return await ANALYTICS.engagement_dashboard(session, max(7, min(90, days)))


@router.post("/dash/backfill")
async def admin_dash_backfill(
    days: int = 30,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Snapshot the last N days from the event tables (flows are accurate historically)."""
    n = await ANALYTICS.backfill(session, max(1, min(120, days)))
    await session.commit()
    return {"snapshotted": n}
