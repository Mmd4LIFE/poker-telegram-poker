"""Room lifecycle: create / list / join / leave / rebuy / snapshot."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_session
from app.game.manager import manager
from app.models import Room, RoomPlayer, Squad, User
from app.schemas import (
    CreateRoomRequest,
    JoinRoomRequest,
    RebuyRequest,
    RoomSummary,
)
from app.poker.holdem import Street
from app.services.friends import list_friends
from app.services.rooms import (
    find_open_rooms,
    find_random_open_room,
    generate_room_code,
    get_room_by_code,
    get_user_membership,
    player_count,
)

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


async def _summary(
    session: AsyncSession,
    room: Room,
    viewer: User | None = None,
    friend_ids: set[int] | None = None,
    host: User | None = None,
) -> RoomSummary:
    if host is None and room.host_id:
        host = await session.get(User, room.host_id)
    return RoomSummary(
        code=room.code, name=room.name, status=room.status,
        players=await player_count(session, room.id), max_players=room.max_players,
        small_blind=room.small_blind, big_blind=room.big_blind,
        min_buy_in=room.min_buy_in, max_buy_in=room.max_buy_in,
        is_private=room.is_private, allow_bots=room.allow_bots,
        host_id=room.host_id,
        host_name=host.display_name if host else None,
        is_mine=bool(viewer and room.host_id == viewer.id),
        host_is_friend=bool(
            friend_ids and room.host_id and room.host_id in friend_ids
        ),
        mode=getattr(room, "mode", "cash") or "cash",
        league_tier=await _tier_of_room(session, room),
        lp_table=await _lp_table(session, room),
    )


async def _tier_of_room(session: AsyncSession, room: Room) -> str | None:
    """A league table dresses itself in its tier's colours, so you can never be
    confused about whether the hand you're playing counts."""
    cid = getattr(room, "cohort_id", None)
    if not cid:
        return None
    from app.models import Cohort

    c = await session.get(Cohort, cid)
    return c.tier if c else None


async def _lp_table(session: AsyncSession, room: Room) -> list[int] | None:
    """LP by finishing place, so the table can project 'if I finish here, +N LP'."""
    if getattr(room, "mode", "cash") != "sng":
        return None
    from app.services import league as L

    cfg = await L.get_config(session)
    return list(cfg.get("lp", []))


def _touch(room: Room) -> None:
    room.last_active_at = datetime.now(timezone.utc)


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

    # limit how many tables one player may host at once
    if settings.MAX_ACTIVE_ROOMS_PER_USER:
        hosted = int((await session.execute(
            select(func.count(Room.id)).where(
                Room.host_id == user.id, Room.status != "finished"
            )
        )).scalar_one())
        if hosted >= settings.MAX_ACTIVE_ROOMS_PER_USER:
            raise HTTPException(
                400,
                f"You already host {hosted} tables "
                f"(max {settings.MAX_ACTIVE_ROOMS_PER_USER}). Close one first.",
            )

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
        .order_by(Room.last_active_at.desc().nullslast()).limit(50)
    )).scalars().all()
    friends = await list_friends(session, user.id)
    friend_ids = {f.id for f in friends}
    return [await _summary(session, r, user, friend_ids) for r in rooms]


@router.delete("/{code}")
async def close_room(
    code: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """The host can close their table: everyone is cashed out and it's removed."""
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.host_id != user.id:
        raise HTTPException(403, "Only the table host can close it")
    await manager.close_room(session, room)
    return {"ok": True}


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


@router.get("/state/current")
async def current_room(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """The table the player is currently seated at (for a Resume button)."""
    membership = await get_user_membership(session, user.id)
    if not membership:
        return None
    rp, room = membership
    return {**(await _summary(session, room)).model_dump(), "stack": rp.stack}


@router.post("/join/random", response_model=RoomSummary)
async def join_random(
    body: JoinRoomRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # already seated somewhere? resume that table instead of erroring
    membership = await get_user_membership(session, user.id)
    if membership:
        return await _summary(session, membership[1])

    # Prefer a table that is BETWEEN hands so the player is dealt in immediately
    # (joining mid-hand means sitting out until the next deal — bad first
    # impression for Quick Play). Otherwise spin up a fresh table: bots fill it
    # and a hand starts right away.
    room = None
    for candidate in await find_open_rooms(session, exclude_user_id=user.id):
        rt = manager.get_live(candidate.id)
        if rt is None or rt.game.street == Street.IDLE:
            room = candidate
            break

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
    # if already seated: resume the same table, or switch from another one
    membership = await get_user_membership(session, user.id)
    if membership:
        rp, cur_room = membership
        if cur_room.id == room.id:
            return await _summary(session, room)  # resume — no re-buy
        # seated elsewhere → leave that table first (chips refunded)
        try:
            await manager.unseat_player(session, cur_room, user)
        except ValueError:
            pass
    try:
        await manager.seat_player(session, room, user, buy_in)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    _touch(room)
    await session.flush()
    return await _summary(session, room, user)


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


@router.get("/{code}/scoreboard")
async def room_scoreboard(
    code: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Live table scoreboard — every seated player's hands / fold / call / raise counts
    and their table Decision-Quality, ordered by DQ. The in-game 'who's actually playing
    well' board (like a match scoreboard)."""
    room = await get_room_by_code(session, code)
    if not room:
        raise HTTPException(404, "Room not found")
    rt = manager.get_live(room.id)
    if rt is None:
        return {"rows": [], "code": code}
    return {"rows": await rt.scoreboard(session), "code": code}
