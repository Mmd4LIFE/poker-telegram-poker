"""Fulfilment of completed payments (Stars)."""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Purchase, User
from app.services.economy import credit

logger = logging.getLogger("poker.payments")


async def fulfill_stars_payment(
    session: AsyncSession, payload: str, charge_id: str, stars_amount: int
) -> Purchase | None:
    purchase = (await session.execute(
        select(Purchase).where(Purchase.payload == payload)
    )).scalar_one_or_none()
    if purchase is None:
        logger.warning("No purchase for payload %s", payload)
        return None
    if purchase.status == "paid":
        return purchase

    user = await session.get(User, purchase.user_id)
    if user is None:
        return None

    purchase.status = "paid"
    purchase.provider_charge_id = charge_id
    user.stars_spent += stars_amount
    if purchase.coins_granted:
        await credit(session, user, purchase.coins_granted, "purchase",
                     ref=f"stars:{purchase.product_code}")
    if purchase.gems_granted:
        await credit(session, user, purchase.gems_granted, "purchase",
                     currency="gems", ref=f"stars:{purchase.product_code}")
    logger.info("Fulfilled stars purchase %s for user %s", purchase.id, user.id)
    return purchase
