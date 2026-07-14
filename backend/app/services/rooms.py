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


async def find_random_open_room(
    session: AsyncSession, exclude_user_id: int | None = None
) -> Room | None:
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
    )
    if exclude_user_id is not None:
        seated_in = (
            select(RoomPlayer.room_id).where(RoomPlayer.user_id == exclude_user_id)
        )
        stmt = stmt.where(Room.id.not_in(seated_in))
    stmt = stmt.order_by(func.coalesce(subq.c.cnt, 0).desc(), func.random()).limit(1)
    return (await session.execute(stmt)).scalars().first()


async def find_open_rooms(
    session: AsyncSession, exclude_user_id: int | None = None, limit: int = 8
) -> list[Room]:
    """Candidate public, non-full rooms (fullest first) for quick matchmaking."""
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
    )
    if exclude_user_id is not None:
        seated_in = (
            select(RoomPlayer.room_id).where(RoomPlayer.user_id == exclude_user_id)
        )
        stmt = stmt.where(Room.id.not_in(seated_in))
    stmt = stmt.order_by(func.coalesce(subq.c.cnt, 0).desc(), func.random()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


async def get_user_membership(
    session: AsyncSession, user_id: int
) -> tuple[RoomPlayer, Room] | None:
    """The CASH table the user is currently seated at, if any.

    Deliberately ignores tournaments. A Sit & Go seat can never be cashed out, so its
    RoomPlayer row lives forever — and this function is what Quick Play and the lobby's
    "resume" card use to decide where you already are. Counting a league seat here sent
    Quick Play straight back into a dead league table, over and over.
    """
    row = (await session.execute(
        select(RoomPlayer, Room)
        .join(Room, Room.id == RoomPlayer.room_id)
        .where(
            RoomPlayer.user_id == user_id,
            Room.mode != "sng",
            Room.status != "finished",
        )
        .limit(1)
    )).first()
    return (row[0], row[1]) if row else None
