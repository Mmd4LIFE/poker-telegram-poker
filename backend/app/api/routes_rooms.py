"""Room lifecycle: create / list / join / leave / rebuy / snapshot."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.game.manager import manager
from app.models import Room, RoomPlayer, Squad, User
from app.schemas import (
    CreateRoomRequest,
    JoinRoomRequest,
    RebuyRequest,
    RoomSummary,
)
from app.services.rooms import (
    find_random_open_room,
    generate_room_code,
    get_room_by_code,
    player_count,
)

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


async def _summary(session: AsyncSession, room: Room) -> RoomSummary:
    return RoomSummary(
        code=room.code, name=room.name, status=room.status,
        players=await player_count(session, room.id), max_players=room.max_players,
        small_blind=room.small_blind, big_blind=room.big_blind,
        min_buy_in=room.min_buy_in, max_buy_in=room.max_buy_in,
        is_private=room.is_private, allow_bots=room.allow_bots,
    )


@router.post("", response_model=RoomSummary)
async def create_room(
    body: CreateRoomRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.big_blind <= body.small_blind:
        raise HTTPException(400, "Big blind must exceed small blind")
    if body.max_buy_in < body.min_buy_in:
        raise HTTPException(400, "max_buy_in must be >= min_buy_in")

    squad_id = None
    if body.squad_code:
        squad = (await session.execute(
            select(Squad).where(Squad.code == body.squad_code.upper())
        )).scalar_one_or_none()
        if squad:
            squad_id = squad.id

    code = await generate_room_code(session)
    room = Room(
        code=code, name=body.name, host_id=user.id, squad_id=squad_id,
        is_private=body.is_private, allow_bots=body.allow_bots,
        max_players=body.max_players, small_blind=body.small_blind,
        big_blind=body.big_blind, min_buy_in=body.min_buy_in,
        max_buy_in=body.max_buy_in,
    )
    session.add(room)
    await session.flush()
    return await _summary(session, room)


@router.get("", response_model=list[RoomSummary])
async def list_rooms(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rooms = (await session.execute(
        select(Room).where(Room.is_private.is_(False), Room.status != "finished")
        .order_by(Room.created_at.desc()).limit(50)
    )).scalars().all()
    return [await _summary(session, r) for r in rooms]


@router.get("/{code}", response_model=RoomSummary)
async def get_room(
    code: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    return await _summary(session, room)


@router.post("/join/random", response_model=RoomSummary)
async def join_random(
    body: JoinRoomRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await find_random_open_room(session)
    if room is None:
        code = await generate_room_code(session)
        room = Room(code=code, name="Quick Table", host_id=user.id, allow_bots=True)
        session.add(room)
        await session.flush()
    return await _join(session, room, user, body.buy_in)


@router.post("/{code}/join", response_model=RoomSummary)
async def join_room(
    code: str,
    body: JoinRoomRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    return await _join(session, room, user, body.buy_in)


async def _join(session: AsyncSession, room: Room, user: User, buy_in: int | None) -> RoomSummary:
    buy_in = buy_in or room.min_buy_in
    try:
        await manager.seat_player(session, room, user, buy_in)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await session.flush()
    return await _summary(session, room)


@router.post("/{code}/leave")
async def leave_room(
    code: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    try:
        result = await manager.unseat_player(session, room, user)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return result


@router.post("/{code}/rebuy")
async def rebuy(
    code: str,
    body: RebuyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    try:
        return await manager.rebuy(session, room, user, body.amount)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/{code}/state")
async def room_state(
    code: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    rt = manager.get_live(room.id)
    if rt is None:
        rt = await manager.get_runtime(session, room)
    return rt._render(user.id)
