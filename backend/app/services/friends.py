"""Friend graph operations: requests, acceptance, search, presence."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Friendship, User

ONLINE_WINDOW = timedelta(seconds=180)


def is_online(user: User) -> bool:
    ls = user.last_seen_at
    if ls is None:
        return False
    if ls.tzinfo is None:
        ls = ls.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ls) <= ONLINE_WINDOW


async def _pair(session: AsyncSession, a: int, b: int) -> Friendship | None:
    return (await session.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.user_id == a, Friendship.friend_id == b),
                and_(Friendship.user_id == b, Friendship.friend_id == a),
            )
        )
    )).scalars().first()


async def relation(session: AsyncSession, me: int, other: int) -> str:
    """Return 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'none'."""
    fr = await _pair(session, me, other)
    if fr is None:
        return "none"
    if fr.status == "accepted":
        return "friends"
    if fr.status == "blocked":
        return "blocked"
    if fr.status == "pending":
        return "outgoing" if fr.user_id == me else "incoming"
    return "none"


async def send_request(session: AsyncSession, me: User, target_id: int) -> dict:
    if target_id == me.id:
        raise ValueError("You can't add yourself")
    target = await session.get(User, target_id)
    if target is None or target.is_bot:
        raise ValueError("User not found")

    existing = await _pair(session, me.id, target_id)
    if existing:
        if existing.status == "accepted":
            return {"status": "friends"}
        if existing.status == "blocked":
            raise ValueError("Unavailable")
        # pending — if the other side already requested me, accept it
        if existing.friend_id == me.id:
            existing.status = "accepted"
            existing.responded_at = datetime.now(timezone.utc)
            return {"status": "friends"}
        return {"status": "outgoing"}

    session.add(Friendship(user_id=me.id, friend_id=target_id, status="pending"))
    return {"status": "outgoing"}


async def accept_request(session: AsyncSession, me: User, requester_id: int) -> dict:
    fr = (await session.execute(
        select(Friendship).where(
            Friendship.user_id == requester_id,
            Friendship.friend_id == me.id,
            Friendship.status == "pending",
        )
    )).scalar_one_or_none()
    if fr is None:
        raise ValueError("No pending request")
    fr.status = "accepted"
    fr.responded_at = datetime.now(timezone.utc)
    return {"status": "friends"}


async def remove_friend(session: AsyncSession, me: User, other_id: int) -> dict:
    fr = await _pair(session, me.id, other_id)
    if fr:
        await session.delete(fr)
    return {"status": "none"}


async def list_friends(session: AsyncSession, me_id: int) -> list[User]:
    rows = (await session.execute(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.user_id == me_id, Friendship.friend_id == me_id),
        )
    )).scalars().all()
    ids = [fr.friend_id if fr.user_id == me_id else fr.user_id for fr in rows]
    if not ids:
        return []
    return list((await session.execute(
        select(User).where(User.id.in_(ids))
    )).scalars().all())


async def incoming_requests(session: AsyncSession, me_id: int) -> list[User]:
    rows = (await session.execute(
        select(User).join(Friendship, Friendship.user_id == User.id).where(
            Friendship.friend_id == me_id, Friendship.status == "pending"
        )
    )).scalars().all()
    return list(rows)


async def search_users(
    session: AsyncSession, me: User, q: str, limit: int = 20
) -> list[tuple[User, str]]:
    q = q.strip().lstrip("@")
    if len(q) < 2:
        return []
    users = (await session.execute(
        select(User).where(
            User.is_bot.is_(False),
            User.id != me.id,
            func.lower(User.username).like(f"%{q.lower()}%"),
        ).limit(limit)
    )).scalars().all()
    out: list[tuple[User, str]] = []
    for u in users:
        out.append((u, await relation(session, me.id, u.id)))
    return out
