"""Profile, wallet, daily reward and leaderboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import Transaction, User
from app.schemas import UserProfile
from app.services.users import claim_daily

router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/me", response_model=UserProfile)
async def me(user: User = Depends(get_current_user)):
    return UserProfile.from_user(user)


@router.post("/daily")
async def daily(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await claim_daily(session, user)
    result["balance"] = user.coins
    return result


@router.get("/wallet/history")
async def wallet_history(
    limit: int = Query(30, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.id.desc())
        .limit(limit)
    )).scalars().all()
    return [{
        "id": t.id, "currency": t.currency, "amount": t.amount,
        "balance_after": t.balance_after, "kind": t.kind,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    } for t in rows]


@router.get("/leaderboard")
async def leaderboard(
    metric: str = Query("total_won", pattern="^(total_won|level|hands_won|biggest_pot|coins)$"),
    limit: int = Query(50, le=100),
    session: AsyncSession = Depends(get_session),
):
    col = getattr(User, metric)
    rows = (await session.execute(
        select(User).where(User.is_bot.is_(False)).order_by(col.desc()).limit(limit)
    )).scalars().all()
    from app.services.cosmetics import effective_avatar_color
    return [{
        "rank": i + 1,
        "id": u.id,
        "display_name": u.display_name,
        "avatar": u.avatar,
        "avatar_color": effective_avatar_color(u),
        "name_color": u.name_color or "",
        "level": u.level,
        "degree": u.degree,
        "value": getattr(u, metric),
    } for i, u in enumerate(rows)]
