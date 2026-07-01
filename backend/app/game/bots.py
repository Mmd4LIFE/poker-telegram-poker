"""Helpers for populating tables with AI bot players."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def pick_bots(
    session: AsyncSession, exclude_ids: set[int], count: int
) -> list[User]:
    """Return up to `count` random bot users not already seated."""
    if count <= 0:
        return []
    stmt = (
        select(User)
        .where(User.is_bot.is_(True), User.is_banned.is_(False))
        .where(~User.id.in_(exclude_ids or {-1}))
        .order_by(func.random())
        .limit(count)
    )
    return list((await session.execute(stmt)).scalars().all())
