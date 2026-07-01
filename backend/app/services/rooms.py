"""Room creation and lookup helpers."""
from __future__ import annotations

import secrets
import string

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Room, RoomPlayer

ALPHABET = string.ascii_uppercase + string.digits
AMBIGUOUS = set("O0I1")
SAFE = "".join(c for c in ALPHABET if c not in AMBIGUOUS)


def _gen_code(n: int = 6) -> str:
    return "".join(secrets.choice(SAFE) for _ in range(n))


async def generate_room_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = _gen_code()
        exists = (await session.execute(
            select(Room.id).where(Room.code == code)
        )).scalar_one_or_none()
        if not exists:
            return code
    raise RuntimeError("Could not generate unique room code")


async def get_room_by_code(session: AsyncSession, code: str) -> Room | None:
    return (await session.execute(
        select(Room).where(Room.code == code.upper())
    )).scalar_one_or_none()


async def player_count(session: AsyncSession, room_id: int) -> int:
    return (await session.execute(
        select(func.count(RoomPlayer.id)).where(RoomPlayer.room_id == room_id)
    )).scalar_one()


async def find_random_open_room(session: AsyncSession) -> Room | None:
    """A public, non-full room with the most players (to fill tables faster)."""
    subq = (
        select(RoomPlayer.room_id, func.count(RoomPlayer.id).label("cnt"))
        .group_by(RoomPlayer.room_id)
        .subquery()
    )
    stmt = (
        select(Room)
        .outerjoin(subq, subq.c.room_id == Room.id)
        .where(Room.is_private.is_(False), Room.status != "finished")
        .where(func.coalesce(subq.c.cnt, 0) < Room.max_players)
        .order_by(func.coalesce(subq.c.cnt, 0).desc(), func.random())
        .limit(1)
    )
    return (await session.execute(stmt)).scalars().first()
