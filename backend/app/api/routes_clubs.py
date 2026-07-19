"""Clubs (clans): create, join, browse, roster, roles, chat, leaderboard."""
from __future__ import annotations

import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timezone

from app.api.deps import get_current_user
from app.core.leveling import club_level_progress
from app.database import get_session
from app.models import (
    ClubPointEvent,
    Room,
    Club,
    ClubJoinRequest,
    ClubMember,
    ClubMessage,
    User,
)
from app.schemas import CreateClubRequest, JoinClubRequest
from app.services.cosmetics import effective_avatar_color
from app.services.friends import is_online

router = APIRouter(prefix="/api/clubs", tags=["clubs"])

SAFE = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")
ROLE_RANK = {"owner": 3, "officer": 2, "member": 1}
ROLE_LABEL = {"owner": "Owner", "officer": "Manager", "member": "Member"}

# Clubs are for established players — same gate as the league unlock.
CLUB_MIN_LEVEL = 10

# member ranks by lifetime CP contributed (status only; small perks later)
_MEMBER_RANKS = [(10000, "Ace"), (2500, "Veteran"), (500, "Regular"), (0, "Rookie")]


def member_rank(contributed: int) -> str:
    for floor, name in _MEMBER_RANKS:
        if (contributed or 0) >= floor:
            return name
    return "Rookie"


def _iso_now() -> tuple[int, int]:
    y, w, _ = datetime.now(timezone.utc).isocalendar()
    return y, w


async def _system_msg(session: AsyncSession, club_id: int, actor_id: int, text: str) -> None:
    # anchored to the actor (valid FK), but `system` marks it as a club event line so the
    # UI renders it as an announcement, not a chat bubble.
    session.add(ClubMessage(club_id=club_id, user_id=actor_id, text=text[:300], system=True))


def _can_manage(role: str | None) -> bool:
    return role in ("owner", "officer")


class MemberAction(BaseModel):
    user_id: int


class ChatMessage(BaseModel):
    text: str


class ClubUpdate(BaseModel):
    name: str | None = None
    tag: str | None = None
    description: str | None = None
    is_public: bool | None = None


async def _gen_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(SAFE) for _ in range(6))
        if not (await session.execute(select(Club.id).where(Club.code == code))).scalar_one_or_none():
            return code
    raise RuntimeError("no code")


async def _membership(session: AsyncSession, user_id: int) -> ClubMember | None:
    return (await session.execute(
        select(ClubMember).where(ClubMember.user_id == user_id)
    )).scalar_one_or_none()


async def _member_count(session: AsyncSession, club_id: int) -> int:
    return (await session.execute(
        select(func.count(ClubMember.id)).where(ClubMember.club_id == club_id)
    )).scalar_one()


async def _full(session: AsyncSession, club: Club, viewer_id: int) -> dict:
    members = (await session.execute(
        select(ClubMember, User).join(User, User.id == ClubMember.user_id)
        .where(ClubMember.club_id == club.id)
    )).all()
    my_role = next((m.role for m, u in members if u.id == viewer_id), None)
    prog = club_level_progress(club.xp)

    # this week's CP per member (the weekly club leaderboard)
    y, w = _iso_now()
    weekly_rows = (await session.execute(
        select(ClubPointEvent.user_id, func.coalesce(func.sum(ClubPointEvent.cp), 0))
        .where(ClubPointEvent.club_id == club.id,
               ClubPointEvent.iso_year == y, ClubPointEvent.iso_week == w)
        .group_by(ClubPointEvent.user_id)
    )).all()
    weekly = {uid: int(cp or 0) for uid, cp in weekly_rows}

    pending = 0
    if _can_manage(my_role):
        pending = int(await session.scalar(
            select(func.count()).select_from(ClubJoinRequest)
            .where(ClubJoinRequest.club_id == club.id)
        ) or 0)

    # leaderboard order: this week's CP, then lifetime contribution
    mem_out = [{
        "id": u.id, "display_name": u.display_name, "avatar": u.avatar,
        "avatar_color": effective_avatar_color(u), "name_color": u.name_color or "",
        "role": m.role, "role_label": ROLE_LABEL.get(m.role, "Member"),
        "level": u.level, "contributed": m.contributed or 0,
        "rank": member_rank(m.contributed), "weekly_cp": weekly.get(u.id, 0),
        "online": is_online(u),
    } for m, u in members]
    mem_out.sort(key=lambda x: (-x["weekly_cp"], -x["contributed"]))
    for i, x in enumerate(mem_out):
        x["place"] = i + 1

    return {
        "code": club.code, "name": club.name, "tag": club.tag,
        "emblem": club.emblem, "description": club.description,
        "xp": club.xp, "total_won": club.total_won, "bank_coins": club.bank_coins,
        "is_public": club.is_public, "max_members": club.max_members,
        "member_count": len(members), "my_role": my_role,
        "my_role_label": ROLE_LABEL.get(my_role, None),
        "level": prog["level"], "level_progress": prog["progress"],
        "next_level_xp": prog["next_level_xp"],
        "weekly_cp_total": sum(weekly.values()),
        "pending_requests": pending,
        "members": mem_out,
    }


# ---- create / join / leave -------------------------------------------------
@router.post("")
async def create_club(
    body: CreateClubRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if user.level < CLUB_MIN_LEVEL:
        raise HTTPException(403, f"Reach level {CLUB_MIN_LEVEL} to start a club")
    if await _membership(session, user.id):
        raise HTTPException(400, "Leave your current club first")
    code = await _gen_code(session)
    club = Club(
        code=code, name=body.name, tag=body.tag, emblem=body.emblem,
        description=body.description, owner_id=user.id,
        is_public=getattr(body, "is_public", True),
    )
    session.add(club)
    await session.flush()
    session.add(ClubMember(club_id=club.id, user_id=user.id, role="owner"))
    return {"code": code}


@router.post("/join")
async def join_club(
    body: JoinClubRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if user.level < CLUB_MIN_LEVEL:
        raise HTTPException(403, f"Reach level {CLUB_MIN_LEVEL} to join a club")
    if await _membership(session, user.id):
        raise HTTPException(400, "Leave your current club first")
    club = (await session.execute(
        select(Club).where(Club.code == body.code.upper())
    )).scalar_one_or_none()
    if not club:
        raise HTTPException(404, "Club not found")
    if await _member_count(session, club.id) >= club.max_members:
        raise HTTPException(400, "Club is full")
    # private clubs are request-to-join; a manager approves
    if not club.is_public:
        exists = await session.scalar(
            select(ClubJoinRequest).where(
                ClubJoinRequest.club_id == club.id, ClubJoinRequest.user_id == user.id
            )
        )
        if not exists:
            session.add(ClubJoinRequest(club_id=club.id, user_id=user.id))
        return {"code": club.code, "requested": True}
    session.add(ClubMember(club_id=club.id, user_id=user.id, role="member"))
    await _system_msg(session, club.id, user.id, f"{user.display_name} joined the club")
    return {"code": club.code}


@router.get("/requests")
async def list_requests(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Pending join requests for the viewer's club (managers/owner only)."""
    me = await _require_membership(session, user)
    if not _can_manage(me.role):
        return {"requests": []}
    rows = (await session.execute(
        select(ClubJoinRequest, User).join(User, User.id == ClubJoinRequest.user_id)
        .where(ClubJoinRequest.club_id == me.club_id)
        .order_by(ClubJoinRequest.created_at)
    )).all()
    return {"requests": [{
        "user_id": u.id, "display_name": u.display_name, "avatar": u.avatar,
        "avatar_color": effective_avatar_color(u), "name_color": u.name_color or "",
        "level": u.level,
    } for r, u in rows]}


@router.post("/requests/approve")
async def approve_request(
    body: MemberAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    if not _can_manage(me.role):
        raise HTTPException(403, "Only a manager can approve")
    req = await session.scalar(
        select(ClubJoinRequest).where(
            ClubJoinRequest.club_id == me.club_id, ClubJoinRequest.user_id == body.user_id
        )
    )
    if not req:
        raise HTTPException(404, "No such request")
    # the applicant may have joined another club since; and don't double-add
    already = await _membership(session, body.user_id)
    if already is None:
        if await _member_count(session, me.club_id) >= (await session.get(Club, me.club_id)).max_members:
            raise HTTPException(400, "Club is full")
        session.add(ClubMember(club_id=me.club_id, user_id=body.user_id, role="member"))
        applicant = await session.get(User, body.user_id)
        await _system_msg(session, me.club_id, body.user_id,
                          f"{applicant.display_name if applicant else 'A player'} joined the club")
    await session.delete(req)
    return {"ok": True}


@router.post("/requests/reject")
async def reject_request(
    body: MemberAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    if not _can_manage(me.role):
        raise HTTPException(403, "Only a manager can decline")
    req = await session.scalar(
        select(ClubJoinRequest).where(
            ClubJoinRequest.club_id == me.club_id, ClubJoinRequest.user_id == body.user_id
        )
    )
    if req:
        await session.delete(req)
    return {"ok": True}


@router.get("/games")
async def club_games(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Open club cash tables for the viewer's club."""
    me = await _require_membership(session, user)
    from app.models import RoomPlayer
    rows = (await session.execute(
        select(Room).where(
            Room.club_id == me.club_id, Room.status != "finished", Room.mode == "cash"
        ).order_by(Room.last_active_at.desc().nullslast()).limit(20)
    )).scalars().all()
    result = []
    for r in rows:
        n = int(await session.scalar(
            select(func.count()).select_from(RoomPlayer).where(RoomPlayer.room_id == r.id)
        ) or 0)
        result.append({
            "code": r.code, "name": r.name, "players": n, "max_players": r.max_players,
            "small_blind": r.small_blind, "big_blind": r.big_blind,
        })
    return {"games": result}


@router.post("/leave")
async def leave_club(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a club")
    # if the owner leaves, hand ownership to the highest-ranked remaining member
    if m.role == "owner":
        others = (await session.execute(
            select(ClubMember).where(
                ClubMember.club_id == m.club_id, ClubMember.user_id != user.id
            )
        )).scalars().all()
        if others:
            others.sort(key=lambda x: -ROLE_RANK.get(x.role, 0))
            others[0].role = "owner"
            club = await session.get(Club, m.club_id)
            if club:
                club.owner_id = others[0].user_id
        else:
            club = await session.get(Club, m.club_id)
            if club:
                await session.delete(club)  # last member -> disband
    await session.delete(m)
    return {"ok": True}


@router.patch("")
async def edit_club(
    body: ClubUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Club leader can edit name/tag/description and public/private.

    is_public only controls whether the club is joinable from Browse — every
    club still appears in the club rankings.
    """
    m = await _membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a club")
    if m.role != "owner":
        raise HTTPException(403, "Only the club leader can edit")
    club = await session.get(Club, m.club_id)
    if not club:
        raise HTTPException(404, "Club not found")
    if body.name is not None and body.name.strip():
        club.name = body.name.strip()[:48]
    if body.tag is not None:
        club.tag = body.tag.strip().upper()[:8]
    if body.description is not None:
        club.description = body.description.strip()[:256]
    if body.is_public is not None:
        club.is_public = body.is_public
    await session.flush()
    return await _full(session, club, user.id)


# ---- browse / leaderboard --------------------------------------------------
@router.get("/browse")
async def browse(
    q: str = Query("", max_length=32),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cnt = (
        select(ClubMember.club_id, func.count(ClubMember.id).label("c"))
        .group_by(ClubMember.club_id).subquery()
    )
    stmt = (
        select(Club, func.coalesce(cnt.c.c, 0).label("members"))
        .outerjoin(cnt, cnt.c.club_id == Club.id)
        .where(Club.is_public.is_(True))
    )
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Club.name).like(like) | func.lower(Club.tag).like(like)
            | func.lower(Club.code).like(like)
        )
    stmt = stmt.order_by(Club.xp.desc()).limit(40)
    rows = (await session.execute(stmt)).all()
    return [{
        "code": s.code, "name": s.name, "tag": s.tag, "emblem": s.emblem,
        "level": club_level_progress(s.xp)["level"], "members": int(m),
        "max_members": s.max_members, "total_won": s.total_won,
    } for s, m in rows]


@router.get("/leaderboard")
async def leaderboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cnt = (
        select(ClubMember.club_id, func.count(ClubMember.id).label("c"))
        .group_by(ClubMember.club_id).subquery()
    )
    rows = (await session.execute(
        select(Club, func.coalesce(cnt.c.c, 0))
        .outerjoin(cnt, cnt.c.club_id == Club.id)
        .order_by(Club.xp.desc()).limit(50)
    )).all()
    return [{
        "rank": i + 1, "code": s.code, "name": s.name, "tag": s.tag,
        "emblem": s.emblem, "level": club_level_progress(s.xp)["level"],
        "members": int(m), "xp": s.xp, "total_won": s.total_won,
    } for i, (s, m) in enumerate(rows)]


# ---- roster / roles --------------------------------------------------------
async def _require_membership(session, user) -> ClubMember:
    m = await _membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a club")
    return m


@router.post("/members/promote")
async def promote(
    body: MemberAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    if me.role != "owner":
        raise HTTPException(403, "Only the leader can promote")
    tgt = (await session.execute(select(ClubMember).where(
        ClubMember.club_id == me.club_id, ClubMember.user_id == body.user_id
    ))).scalar_one_or_none()
    if not tgt or tgt.role == "owner":
        raise HTTPException(400, "Cannot promote")
    tgt.role = "officer"
    return {"ok": True}


@router.post("/members/demote")
async def demote(
    body: MemberAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    if me.role != "owner":
        raise HTTPException(403, "Only the leader can demote")
    tgt = (await session.execute(select(ClubMember).where(
        ClubMember.club_id == me.club_id, ClubMember.user_id == body.user_id
    ))).scalar_one_or_none()
    if not tgt or tgt.role != "officer":
        raise HTTPException(400, "Cannot demote")
    tgt.role = "member"
    return {"ok": True}


@router.post("/members/kick")
async def kick(
    body: MemberAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    if me.role not in ("owner", "officer"):
        raise HTTPException(403, "No permission")
    tgt = (await session.execute(select(ClubMember).where(
        ClubMember.club_id == me.club_id, ClubMember.user_id == body.user_id
    ))).scalar_one_or_none()
    if not tgt or tgt.user_id == user.id:
        raise HTTPException(400, "Cannot kick")
    if ROLE_RANK.get(tgt.role, 0) >= ROLE_RANK.get(me.role, 0):
        raise HTTPException(403, "Cannot kick this member")
    await session.delete(tgt)
    return {"ok": True}


# ---- chat ------------------------------------------------------------------
@router.get("/messages")
async def list_messages(
    after: int = Query(0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    rows = (await session.execute(
        select(ClubMessage, User).join(User, User.id == ClubMessage.user_id)
        .where(ClubMessage.club_id == me.club_id, ClubMessage.id > after)
        .order_by(ClubMessage.id.desc()).limit(60)
    )).all()
    rows = list(reversed(rows))
    return [{
        "id": msg.id, "user_id": u.id, "name": u.display_name,
        "avatar": u.avatar, "avatar_color": effective_avatar_color(u),
        "name_color": u.name_color or "", "text": msg.text,
        "at": msg.created_at.isoformat() if msg.created_at else None,
    } for msg, u in rows]


@router.post("/messages")
async def post_message(
    body: ChatMessage,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    me = await _require_membership(session, user)
    text = body.text.strip()[:300]
    if not text:
        raise HTTPException(400, "Empty message")
    msg = ClubMessage(club_id=me.club_id, user_id=user.id, text=text)
    session.add(msg)
    await session.flush()
    return {"id": msg.id}


# ---- my club / view -------------------------------------------------------
@router.get("/me")
async def my_club(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _membership(session, user.id)
    if not m:
        return None
    club = await session.get(Club, m.club_id)
    return await _full(session, club, user.id)


@router.get("/{code}")
async def get_club(
    code: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    club = (await session.execute(
        select(Club).where(Club.code == code.upper())
    )).scalar_one_or_none()
    if not club:
        raise HTTPException(404, "Club not found")
    return await _full(session, club, user.id)
