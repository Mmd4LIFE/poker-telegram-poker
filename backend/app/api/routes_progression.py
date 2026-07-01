"""Achievements and challenges read endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import (
    Achievement,
    Challenge,
    User,
    UserAchievement,
    UserChallenge,
)
from app.services.progression import daily_key, sync_achievements, weekly_key

router = APIRouter(prefix="/api", tags=["progression"])


@router.get("/achievements")
async def achievements(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # refresh progress against current stats
    await sync_achievements(session, user)
    defs = (await session.execute(
        select(Achievement).order_by(Achievement.sort_order, Achievement.id)
    )).scalars().all()
    progress = {
        ua.achievement_id: ua for ua in (await session.execute(
            select(UserAchievement).where(UserAchievement.user_id == user.id)
        )).scalars().all()
    }
    out = []
    for a in defs:
        ua = progress.get(a.id)
        cur = getattr(user, a.metric, 0) or 0
        out.append({
            "code": a.code, "title": a.title, "description": a.description,
            "icon": a.icon, "category": a.category, "target": a.target,
            "progress": min(int(cur), a.target),
            "completed": bool(ua and ua.completed),
            "reward_coins": a.reward_coins, "reward_gems": a.reward_gems,
            "reward_xp": a.reward_xp,
        })
    return out


@router.get("/challenges")
async def challenges(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    defs = (await session.execute(
        select(Challenge).where(Challenge.is_active.is_(True))
    )).scalars().all()
    rows = (await session.execute(
        select(UserChallenge).where(UserChallenge.user_id == user.id)
    )).scalars().all()
    by_key = {(uc.challenge_id, uc.period_key): uc for uc in rows}
    out = []
    for c in defs:
        pkey = daily_key() if c.period == "daily" else weekly_key()
        uc = by_key.get((c.id, pkey))
        out.append({
            "code": c.code, "title": c.title, "description": c.description,
            "icon": c.icon, "period": c.period, "target": c.target,
            "progress": min(uc.progress, c.target) if uc else 0,
            "completed": bool(uc and uc.completed),
            "reward_coins": c.reward_coins, "reward_gems": c.reward_gems,
            "reward_xp": c.reward_xp,
        })
    return out
