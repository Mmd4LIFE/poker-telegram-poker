"""Shop: Telegram Stars invoices, TON top-ups, loot boxes."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from aiogram.types import LabeledPrice
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_session
from app.models import Box, Product, Purchase, User, UserBox
from app.schemas import BuyStarsRequest, OpenBoxRequest
from app.services import cosmetics as C
from app.services.economy import InsufficientFunds, credit, debit

router = APIRouter(prefix="/api/shop", tags=["shop"])
logger = logging.getLogger("poker.shop")


async def _product(session: AsyncSession, code: str, kind: str) -> Product:
    p = (await session.execute(
        select(Product).where(
            Product.code == code, Product.kind == kind, Product.is_active.is_(True)
        )
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Unknown product")
    return p


def _product_dict(p: Product) -> dict:
    d = {
        "code": p.code, "label": p.label, "coins": p.coins, "gems": p.gems,
        "discount_pct": p.discount_pct, "base_price": p.base_price,
        "price": p.price,
    }
    if p.kind == "ton":
        d["ton"] = round(p.price / 1e9, 4)
        d["base_ton"] = round(p.base_price / 1e9, 4)
    else:
        d["stars"] = p.price
        d["base_stars"] = p.base_price
    return d


@router.get("/catalog")
async def catalog(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order)
    )).scalars().all()
    return {
        "stars": [_product_dict(p) for p in rows if p.kind == "stars"],
        "ton": [_product_dict(p) for p in rows if p.kind == "ton"],
        "ton_wallet": settings.TON_WALLET_ADDRESS,
    }


# ---- Telegram Stars --------------------------------------------------------
@router.post("/stars/invoice")
async def stars_invoice(
    body: BuyStarsRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    product = await _product(session, body.product_code, "stars")
    price = product.price  # discount applied

    payload = f"stars_{user.id}_{secrets.token_hex(8)}"
    session.add(Purchase(
        user_id=user.id, provider="stars", product_code=product.code,
        amount=price, coins_granted=product.coins, gems_granted=product.gems,
        status="pending", payload=payload,
    ))
    await session.flush()

    from app.bot.instance import get_bot
    try:
        link = await get_bot().create_invoice_link(
            title=product.label,
            description=f"{product.coins:,} coins"
            + (f" + {product.gems} gems" if product.gems else ""),
            payload=payload,
            currency="XTR",
            prices=[LabeledPrice(label=product.label, amount=price)],
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("invoice creation failed")
        raise HTTPException(502, f"Could not create invoice: {e}") from e

    return {"invoice_link": link, "payload": payload}


# ---- TON -------------------------------------------------------------------
@router.post("/ton/intent")
async def ton_intent(
    body: BuyStarsRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    product = await _product(session, body.product_code, "ton")
    if not settings.TON_WALLET_ADDRESS:
        raise HTTPException(400, "TON payments are not configured on this server")

    comment = f"pcm-{user.id}-{secrets.token_hex(6)}"
    session.add(Purchase(
        user_id=user.id, provider="ton", product_code=product.code,
        amount=product.price, coins_granted=product.coins,
        gems_granted=product.gems, status="pending", payload=comment,
    ))
    await session.flush()
    return {
        "wallet": settings.TON_WALLET_ADDRESS,
        "amount_nano": product.price,
        "amount_ton": round(product.price / 1e9, 4),
        "comment": comment,
        "payload": comment,
    }


@router.post("/ton/verify")
async def ton_verify(
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    payload = body.get("payload")
    purchase = (await session.execute(
        select(Purchase).where(
            Purchase.payload == payload, Purchase.user_id == user.id,
            Purchase.provider == "ton",
        )
    )).scalar_one_or_none()
    if not purchase:
        raise HTTPException(404, "Purchase intent not found")
    if purchase.status == "paid":
        return {"status": "paid", "coins": user.coins, "gems": user.gems}

    ok = await _check_ton_payment(settings.TON_WALLET_ADDRESS, payload, purchase.amount)
    if not ok:
        return {"status": "pending", "message": "Transaction not found yet"}

    purchase.status = "paid"
    user.ton_spent_nano += purchase.amount
    if purchase.coins_granted:
        await credit(session, user, purchase.coins_granted, "purchase",
                     ref=f"ton:{purchase.product_code}")
    if purchase.gems_granted:
        await credit(session, user, purchase.gems_granted, "purchase",
                     currency="gems", ref=f"ton:{purchase.product_code}")
    return {"status": "paid", "coins": user.coins, "gems": user.gems}


async def _check_ton_payment(wallet: str, comment: str, min_nano: int) -> bool:
    if not wallet:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://toncenter.com/api/v3/transactions",
                params={"account": wallet, "limit": 30},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:  # noqa: BLE001
        logger.warning("toncenter lookup failed")
        return False
    for tx in data.get("transactions", []):
        in_msg = tx.get("in_msg") or {}
        body_comment = (in_msg.get("message_content") or {}).get("decoded", {}).get("comment")
        value = int(in_msg.get("value") or 0)
        if body_comment == comment and value >= min_nano:
            return True
    return False


# ---- Loot boxes ------------------------------------------------------------
@router.get("/boxes")
async def boxes(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rows = (await session.execute(select(Box).where(Box.is_active.is_(True)))).scalars().all()
    per_box = await _opens_today_by_box(session, user.id)

    boxes = []
    for b in rows:
        limit = _limit_of(b)
        used = per_box.get(b.id, 0)
        boxes.append({
            "code": b.code, "name": b.name, "tier": b.tier, "icon": b.icon,
            "description": b.description, "price_coins": b.price_coins,
            "price_gems": b.price_gems, "rewards": b.rewards,
            "daily_limit": limit or None,
            "opened_today": used,
            "remaining_today": max(0, limit - used) if limit else None,
            "locked": bool(limit and used >= limit),
        })
    return {"boxes": boxes}


def _limit_of(box: Box) -> int:
    """Per-box limit, falling back to the global default when unset."""
    return int(box.daily_limit or settings.BOX_DAILY_LIMIT or 0)


async def _opens_today_by_box(session: AsyncSession, user_id: int) -> dict[int, int]:
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = await session.execute(
        select(UserBox.box_id, func.count(UserBox.id))
        .where(UserBox.user_id == user_id, UserBox.created_at >= since)
        .group_by(UserBox.box_id)
    )
    return {bid: int(n) for bid, n in rows.all()}


async def _opens_today(session: AsyncSession, user_id: int, box_id: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    return int((await session.execute(
        select(func.count(UserBox.id)).where(
            UserBox.user_id == user_id,
            UserBox.box_id == box_id,
            UserBox.created_at >= since,
        )
    )).scalar_one())


@router.get("/boxes/history")
async def box_history(
    limit: int = 30,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(UserBox, Box).join(Box, Box.id == UserBox.box_id)
        .where(UserBox.user_id == user.id)
        .order_by(UserBox.id.desc()).limit(min(limit, 100))
    )).all()
    return [{
        "box_name": b.name, "icon": b.icon, "tier": b.tier,
        "reward": ub.reward,
        "at": ub.created_at.isoformat() if ub.created_at else None,
    } for ub, b in rows]


@router.post("/boxes/open")
async def open_box(
    body: OpenBoxRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    box = (await session.execute(
        select(Box).where(Box.code == body.box_code, Box.is_active.is_(True))
    )).scalar_one_or_none()
    if not box:
        raise HTTPException(404, "Box not found")

    # daily limit — per box, not across all boxes
    limit = _limit_of(box)
    if limit and await _opens_today(session, user.id, box.id) >= limit:
        raise HTTPException(
            429,
            f"You've opened {limit} {box.name} today. Come back tomorrow!",
        )

    price = box.price_gems if body.pay_with == "gems" else box.price_coins
    currency = "gems" if body.pay_with == "gems" else "coins"
    if price <= 0:
        raise HTTPException(400, "This box cannot be bought with that currency")
    try:
        await debit(session, user, price, "box_open", currency=currency, ref=box.code)
    except InsufficientFunds as e:
        raise HTTPException(400, str(e)) from e

    reward = _roll_reward(box.rewards or [], user)
    if reward["type"] == "coins":
        await credit(session, user, reward["amount"], "box_open", ref=box.code)
    elif reward["type"] == "gems":
        await credit(session, user, reward["amount"], "box_open", currency="gems", ref=box.code)
    elif reward["type"] == "avatar":
        key = "a:" + reward["value"]
        if key not in (user.owned_cosmetics or []):
            user.owned_cosmetics = [*(user.owned_cosmetics or []), key]
        user.avatar = reward["value"]

    session.add(UserBox(
        user_id=user.id, box_id=box.id, source="shop", opened=True, reward=reward,
    ))
    return {
        "reward": reward, "coins": user.coins, "gems": user.gems,
        "box": {"name": box.name, "icon": box.icon, "tier": box.tier},
    }


def _roll_reward(rewards: list[dict], user: User) -> dict:
    """Roll a reward, never awarding an avatar the player already owns.

    Avatar entries the player owns are removed from the pool; their weight is
    absorbed by the remaining rewards (so you get coins/gems instead of a
    duplicate). If the pool empties, fall back to the best coin reward.
    """
    pool = [
        r for r in rewards
        if not (r.get("type") == "avatar" and C.owns(user, "avatar", r.get("value", "")))
    ]
    if not pool:
        pool = [r for r in rewards if r.get("type") in ("coins", "gems")] or rewards
    total = sum(max(0, r.get("weight", 1)) for r in pool) or 1
    pick = secrets.randbelow(total)
    upto = 0
    for r in pool:
        upto += max(0, r.get("weight", 1))
        if pick < upto:
            return r
    return pool[-1]
