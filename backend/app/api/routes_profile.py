"""Profile, wallet, daily reward and leaderboard."""
from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import Transaction, User
from app.schemas import UserProfile
from app.services import daily as D
from app.services.users import claim_daily  # noqa: F401

router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/me", response_model=UserProfile)
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy import func, or_
    from app.models import Friendship
    count = (await session.execute(
        select(func.count(Friendship.id)).where(
            Friendship.status == "accepted",
            or_(Friendship.user_id == user.id, Friendship.friend_id == user.id),
        )
    )).scalar_one()
    profile = UserProfile.from_user(user)
    profile.friend_count = int(count)
    return profile


@router.get("/daily")
async def daily_status(
    user: User = Depends(get_current_user),
):
    """The 7-day ladder plus whether today's rung is still on the table."""
    return D.status(user)


@router.post("/daily")
async def daily(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await D.claim(session, user)
    result["balance"] = user.coins
    return result


class TzIn(BaseModel):
    offset_min: int


@router.post("/me/tz")
async def set_tz(
    body: TzIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """The Mini App reports the device's UTC offset so 21:00 means 21:00 for them."""
    user.tz_offset_min = max(-840, min(840, int(body.offset_min)))
    await session.commit()
    return {"tz_offset_min": user.tz_offset_min}


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


# --- in-app notifications ---------------------------------------------------


@router.get("/notifications")
async def notifications(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from app.models import Notification

    rows = list(
        (
            await session.scalars(
                select(Notification)
                .where(Notification.user_id == user.id)
                .order_by(Notification.id.desc())
                .limit(50)
            )
        ).all()
    )
    return {
        "unread": sum(1 for n in rows if n.read_at is None),
        "items": [
            {
                "id": n.id,
                "kind": n.kind,
                "title": n.title,
                "body": n.body,
                "meta": n.meta or {},
                "read": n.read_at is not None,
                "at": n.created_at,
            }
            for n in rows
        ],
    }


@router.post("/notifications/read")
async def read_notifications(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Opening the bell marks everything read."""
    from datetime import datetime, timezone

    from sqlalchemy import update

    from app.models import Notification

    await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await session.commit()
    return {"unread": 0}


# --- Poker DNA --------------------------------------------------------------


@router.get("/dna")
async def my_dna(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Your own radar. Self-view only, deliberately: showing an OPPONENT's radar
    would be a poker HUD and hand an edge to whoever bothered to look."""
    from app.models import PlayerStats
    from app.services import dna as DNA

    st = await session.get(PlayerStats, user.id)
    d = DNA.compute(st)
    d["style"] = DNA.style_of(d["scores"]) if d["ready"] else None
    return d
