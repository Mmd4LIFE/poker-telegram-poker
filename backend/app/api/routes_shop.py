"""Shop: Telegram Stars invoices, TON top-ups, loot boxes."""
from __future__ import annotations

import logging
import secrets

import httpx
from aiogram.types import LabeledPrice
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_session
from app.models import Box, Purchase, User
from app.schemas import BuyStarsRequest, OpenBoxRequest
from app.services.catalog import (
    STAR_PRODUCTS,
    TON_PRODUCTS,
    star_catalog,
    ton_catalog,
)
from app.services.economy import InsufficientFunds, credit, debit

router = APIRouter(prefix="/api/shop", tags=["shop"])
logger = logging.getLogger("poker.shop")


@router.get("/catalog")
async def catalog(user: User = Depends(get_current_user)):
    return {
        "stars": star_catalog(),
        "ton": ton_catalog(),
        "ton_wallet": settings.TON_WALLET_ADDRESS,
    }


# ---- Telegram Stars --------------------------------------------------------
@router.post("/stars/invoice")
async def stars_invoice(
    body: BuyStarsRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    product = STAR_PRODUCTS.get(body.product_code)
    if not product:
        raise HTTPException(404, "Unknown product")

    payload = f"stars_{user.id}_{secrets.token_hex(8)}"
    purchase = Purchase(
        user_id=user.id, provider="stars", product_code=body.product_code,
        amount=product["stars"], coins_granted=product["coins"],
        gems_granted=product["gems"], status="pending", payload=payload,
    )
    session.add(purchase)
    await session.flush()

    from app.bot.instance import get_bot
    try:
        link = await get_bot().create_invoice_link(
            title=product["label"],
            description=f"{product['coins']:,} coins"
            + (f" + {product['gems']} gems" if product["gems"] else ""),
            payload=payload,
            currency="XTR",
            prices=[LabeledPrice(label=product["label"], amount=product["stars"])],
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
    product = TON_PRODUCTS.get(body.product_code)
    if not product:
        raise HTTPException(404, "Unknown product")
    if not settings.TON_WALLET_ADDRESS:
        raise HTTPException(400, "TON payments are not configured on this server")

    comment = f"pcm-{user.id}-{secrets.token_hex(6)}"
    purchase = Purchase(
        user_id=user.id, provider="ton", product_code=body.product_code,
        amount=product["ton_nano"], coins_granted=product["coins"],
        gems_granted=product["gems"], status="pending", payload=comment,
    )
    session.add(purchase)
    await session.flush()
    return {
        "wallet": settings.TON_WALLET_ADDRESS,
        "amount_nano": product["ton_nano"],
        "amount_ton": product["ton_nano"] / 1e9,
        "comment": comment,
        "payload": comment,
    }


@router.post("/ton/verify")
async def ton_verify(
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Best-effort verification of an incoming TON transfer via toncenter."""
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
    user.stars_spent += 0
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
    url = "https://toncenter.com/api/v3/transactions"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={"account": wallet, "limit": 30})
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
async def boxes(session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    rows = (await session.execute(select(Box).where(Box.is_active.is_(True)))).scalars().all()
    return [{
        "code": b.code, "name": b.name, "tier": b.tier, "icon": b.icon,
        "description": b.description, "price_coins": b.price_coins,
        "price_gems": b.price_gems, "rewards": b.rewards,
    } for b in rows]


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

    price = box.price_gems if body.pay_with == "gems" else box.price_coins
    currency = "gems" if body.pay_with == "gems" else "coins"
    if price <= 0 and currency == "gems":
        raise HTTPException(400, "This box cannot be bought with gems")
    try:
        await debit(session, user, price, "box_open", currency=currency, ref=box.code)
    except InsufficientFunds as e:
        raise HTTPException(400, str(e)) from e

    reward = _roll_reward(box.rewards)
    if reward["type"] == "coins":
        await credit(session, user, reward["amount"], "box_open", ref=box.code)
    elif reward["type"] == "gems":
        await credit(session, user, reward["amount"], "box_open", currency="gems", ref=box.code)
    elif reward["type"] == "avatar":
        # permanently unlock the avatar so it can be re-equipped for free
        key = "a:" + reward["value"]
        if key not in (user.owned_cosmetics or []):
            user.owned_cosmetics = [*(user.owned_cosmetics or []), key]
        user.avatar = reward["value"]
    return {"reward": reward, "coins": user.coins, "gems": user.gems}


def _roll_reward(rewards: list[dict]) -> dict:
    total = sum(r.get("weight", 1) for r in rewards) or 1
    pick = secrets.randbelow(total)
    upto = 0
    for r in rewards:
        upto += r.get("weight", 1)
        if pick < upto:
            return r
    return rewards[-1]
