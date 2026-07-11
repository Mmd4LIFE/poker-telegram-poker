"""Admin dashboard: revenue and purchase analytics.

NOTE: The Stars themselves live in your bot's Telegram balance (withdraw via
Fragment). This endpoint reports the *sales records* our app stored.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_session
from app.models import Purchase, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
        "total_users": total_users,
        "paying_users": paying_users,
        "stars_revenue": stars_revenue,          # total Stars earned
        "stars_orders": stars_orders,
        "ton_revenue_ton": round(ton_revenue_nano / 1e9, 4),
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
