"""Referral program endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.bot.instance import get_bot_username
from app.config import settings
from app.database import get_session
from app.models import User
from app.services.referrals import MILESTONES, next_milestone
from app.services.cosmetics import effective_avatar_color as _eac

router = APIRouter(prefix="/api/referral", tags=["referral"])


@router.get("")
async def my_referral(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from app.services.users import ensure_referral_code
    username = get_bot_username()
    code = await ensure_referral_code(session, user)
    deep = f"ref-{code}"
    link = f"https://t.me/{username}?startapp={deep}" if username else None

    # recent invited friends
    friends = (await session.execute(
        select(User).where(User.referred_by == user.id)
        .order_by(User.created_at.desc()).limit(20)
    )).scalars().all()

    return {
        "link": link,
        "bot_username": username,
        "code": deep,
        "referral_count": user.referral_count,
        "referral_earned": user.referral_earned,
        "reward_per_friend": settings.REFERRAL_REFERRER_REWARD,
        "friend_bonus": settings.REFERRAL_FRIEND_REWARD,
        "next_milestone": next_milestone(user.referral_count),
        "milestones": [
            {"at": k, "coins": v[0], "gems": v[1]}
            for k, v in sorted(MILESTONES.items())
        ],
        "friends": [
            {
                "id": f.id, "name": f.display_name, "avatar": f.avatar,
                "avatar_color": _eac(f), "name_color": f.name_color or "",
                "level": f.level,
            }
            for f in friends
        ],
    }
