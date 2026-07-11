"""Friends: requests, list, search, presence, match history, friends board."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.leveling import degree_for_level
from app.database import get_session
from app.models import Friendship, PlayerHand, User
from app.services import friends as F

router = APIRouter(prefix="/api", tags=["friends"])


class FriendAction(BaseModel):
    user_id: int


def user_card(u: User) -> dict:
    _, label = degree_for_level(u.level)
    win_rate = round(u.hands_won / u.hands_played * 100, 1) if u.hands_played else 0.0
    return {
        "id": u.id,
        "display_name": u.display_name,
        "username": u.username,
        "avatar": u.avatar,
        "level": u.level,
        "degree": u.degree,
        "degree_label": label,
        "online": F.is_online(u),
        "hands_won": u.hands_won,
        "hands_played": u.hands_played,
        "total_won": u.total_won,
        "win_rate": win_rate,
    }


async def _history(session: AsyncSession, user_id: int, limit: int) -> list[dict]:
    rows = (await session.execute(
        select(PlayerHand).where(PlayerHand.user_id == user_id)
        .order_by(PlayerHand.id.desc()).limit(limit)
    )).scalars().all()
    return [{
        "room_code": h.room_code, "hand_no": h.hand_no, "net": h.net,
        "won": h.won, "hand_name": h.hand_name, "pot": h.pot,
        "at": h.created_at.isoformat() if h.created_at else None,
    } for h in rows]


@router.get("/friends")
async def my_friends(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    friends = await F.list_friends(session, user.id)
    friends.sort(key=lambda u: (not F.is_online(u), u.display_name.lower()))
    incoming = await F.incoming_requests(session, user.id)
    return {
        "friends": [user_card(u) for u in friends],
        "incoming": [user_card(u) for u in incoming],
        "online_count": sum(1 for u in friends if F.is_online(u)),
    }


@router.get("/friends/search")
async def search(
    q: str = Query(..., min_length=2),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    results = await F.search_users(session, user, q)
    return [{**user_card(u), "relation": rel} for u, rel in results]


@router.post("/friends/request")
async def request_friend(
    body: FriendAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await F.send_request(session, user, body.user_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/friends/accept")
async def accept_friend(
    body: FriendAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await F.accept_request(session, user, body.user_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/friends/remove")
async def remove_friend(
    body: FriendAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await F.remove_friend(session, user, body.user_id)


@router.get("/friends/leaderboard")
async def friends_leaderboard(
    metric: str = Query("total_won", pattern="^(total_won|level|hands_won|biggest_pot|coins)$"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    friends = await F.list_friends(session, user.id)
    everyone = [user, *friends]
    everyone.sort(key=lambda u: getattr(u, metric), reverse=True)
    return [{
        "rank": i + 1, "id": u.id, "display_name": u.display_name,
        "avatar": u.avatar, "level": u.level, "degree": u.degree,
        "online": F.is_online(u), "value": getattr(u, metric),
        "is_me": u.id == user.id,
    } for i, u in enumerate(everyone)]


@router.get("/me/history")
async def my_history(
    limit: int = Query(30, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await _history(session, user.id, limit)


@router.get("/users/{user_id}")
async def public_profile(
    user_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    target = await session.get(User, user_id)
    if target is None or target.is_bot:
        raise HTTPException(404, "User not found")
    return {
        **user_card(target),
        "biggest_pot": target.biggest_pot,
        "best_win_streak": target.best_win_streak,
        "games_played": target.games_played,
        "relation": await F.relation(session, user.id, user_id),
        "history": await _history(session, user_id, 15),
    }
