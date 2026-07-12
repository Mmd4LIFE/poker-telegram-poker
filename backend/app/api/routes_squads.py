"""Squads (clans): create, join, browse, roster, roles, chat, leaderboard."""
from __future__ import annotations

import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.leveling import squad_level_progress
from app.database import get_session
from app.models import Squad, SquadMember, SquadMessage, User
from app.schemas import CreateSquadRequest, JoinSquadRequest
from app.services.cosmetics import effective_avatar_color
from app.services.friends import is_online

router = APIRouter(prefix="/api/squads", tags=["squads"])

SAFE = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")
ROLE_RANK = {"owner": 3, "officer": 2, "member": 1}


class MemberAction(BaseModel):
    user_id: int


class ChatMessage(BaseModel):
    text: str


class SquadUpdate(BaseModel):
    name: str | None = None
    tag: str | None = None
    description: str | None = None
    is_public: bool | None = None


async def _gen_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(SAFE) for _ in range(6))
        if not (await session.execute(select(Squad.id).where(Squad.code == code))).scalar_one_or_none():
            return code
    raise RuntimeError("no code")


async def _membership(session: AsyncSession, user_id: int) -> SquadMember | None:
    return (await session.execute(
        select(SquadMember).where(SquadMember.user_id == user_id)
    )).scalar_one_or_none()


async def _member_count(session: AsyncSession, squad_id: int) -> int:
    return (await session.execute(
        select(func.count(SquadMember.id)).where(SquadMember.squad_id == squad_id)
    )).scalar_one()


async def _full(session: AsyncSession, squad: Squad, viewer_id: int) -> dict:
    members = (await session.execute(
        select(SquadMember, User).join(User, User.id == SquadMember.user_id)
        .where(SquadMember.squad_id == squad.id)
    )).all()
    members.sort(key=lambda mu: (-ROLE_RANK.get(mu[0].role, 0), -mu[0].contributed))
    my_role = next((m.role for m, u in members if u.id == viewer_id), None)
    prog = squad_level_progress(squad.xp)
    return {
        "code": squad.code, "name": squad.name, "tag": squad.tag,
        "emblem": squad.emblem, "description": squad.description,
        "xp": squad.xp, "total_won": squad.total_won, "bank_coins": squad.bank_coins,
        "is_public": squad.is_public, "max_members": squad.max_members,
        "member_count": len(members), "my_role": my_role,
        "level": prog["level"], "level_progress": prog["progress"],
        "next_level_xp": prog["next_level_xp"],
        "members": [{
            "id": u.id, "display_name": u.display_name, "avatar": u.avatar,
            "avatar_color": effective_avatar_color(u), "name_color": u.name_color or "",
            "role": m.role, "level": u.level, "contributed": m.contributed,
            "online": is_online(u),
        } for m, u in members],
    }


# ---- create / join / leave -------------------------------------------------
@router.post("")
async def create_squad(
    body: CreateSquadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if await _membership(session, user.id):
        raise HTTPException(400, "Leave your current squad first")
    code = await _gen_code(session)
    squad = Squad(
        code=code, name=body.name, tag=body.tag, emblem=body.emblem,
        description=body.description, owner_id=user.id,
        is_public=getattr(body, "is_public", True),
    )
    session.add(squad)
    await session.flush()
    session.add(SquadMember(squad_id=squad.id, user_id=user.id, role="owner"))
    return {"code": code}


@router.post("/join")
async def join_squad(
    body: JoinSquadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if await _membership(session, user.id):
        raise HTTPException(400, "Leave your current squad first")
    squad = (await session.execute(
        select(Squad).where(Squad.code == body.code.upper())
    )).scalar_one_or_none()
    if not squad:
        raise HTTPException(404, "Squad not found")
    if await _member_count(session, squad.id) >= squad.max_members:
        raise HTTPException(400, "Squad is full")
    session.add(SquadMember(squad_id=squad.id, user_id=user.id, role="member"))
    return {"code": squad.code}


@router.post("/leave")
async def leave_squad(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a squad")
    # if the owner leaves, hand ownership to the highest-ranked remaining member
    if m.role == "owner":
        others = (await session.execute(
            select(SquadMember).where(
                SquadMember.squad_id == m.squad_id, SquadMember.user_id != user.id
            )
        )).scalars().all()
        if others:
            others.sort(key=lambda x: -ROLE_RANK.get(x.role, 0))
            others[0].role = "owner"
            squad = await session.get(Squad, m.squad_id)
            if squad:
                squad.owner_id = others[0].user_id
        else:
            squad = await session.get(Squad, m.squad_id)
            if squad:
                await session.delete(squad)  # last member -> disband
    await session.delete(m)
    return {"ok": True}


@router.patch("")
async def edit_squad(
    body: SquadUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Squad leader can edit name/tag/description and public/private.

    is_public only controls whether the squad is joinable from Browse — every
    squad still appears in the squad rankings.
    """
    m = await _membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a squad")
    if m.role != "owner":
        raise HTTPException(403, "Only the squad leader can edit")
    squad = await session.get(Squad, m.squad_id)
    if not squad:
        raise HTTPException(404, "Squad not found")
    if body.name is not None and body.name.strip():
        squad.name = body.name.strip()[:48]
    if body.tag is not None:
        squad.tag = body.tag.strip().upper()[:8]
    if body.description is not None:
        squad.description = body.description.strip()[:256]
    if body.is_public is not None:
        squad.is_public = body.is_public
    await session.flush()
    return await _full(session, squad, user.id)


# ---- browse / leaderboard --------------------------------------------------
@router.get("/browse")
async def browse(
    q: str = Query("", max_length=32),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cnt = (
        select(SquadMember.squad_id, func.count(SquadMember.id).label("c"))
        .group_by(SquadMember.squad_id).subquery()
    )
    stmt = (
        select(Squad, func.coalesce(cnt.c.c, 0).label("members"))
        .outerjoin(cnt, cnt.c.squad_id == Squad.id)
        .where(Squad.is_public.is_(True))
    )
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Squad.name).like(like) | func.lower(Squad.tag).like(like)
            | func.lower(Squad.code).like(like)
        )
    stmt = stmt.order_by(Squad.xp.desc()).limit(40)
    rows = (await session.execute(stmt)).all()
    return [{
        "code": s.code, "name": s.name, "tag": s.tag, "emblem": s.emblem,
        "level": squad_level_progress(s.xp)["level"], "members": int(m),
        "max_members": s.max_members, "total_won": s.total_won,
    } for s, m in rows]


@router.get("/leaderboard")
async def leaderboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cnt = (
        select(SquadMember.squad_id, func.count(SquadMember.id).label("c"))
        .group_by(SquadMember.squad_id).subquery()
    )
    rows = (await session.execute(
        select(Squad, func.coalesce(cnt.c.c, 0))
        .outerjoin(cnt, cnt.c.squad_id == Squad.id)
        .order_by(Squad.xp.desc()).limit(50)
    )).all()
    return [{
        "rank": i + 1, "code": s.code, "name": s.name, "tag": s.tag,
        "emblem": s.emblem, "level": squad_level_progress(s.xp)["level"],
        "members": int(m), "xp": s.xp, "total_won": s.total_won,
    } for i, (s, m) in enumerate(rows)]


# ---- roster / roles --------------------------------------------------------
async def _require_membership(session, user) -> SquadMember:
    m = await _membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a squad")
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
    tgt = (await session.execute(select(SquadMember).where(
        SquadMember.squad_id == me.squad_id, SquadMember.user_id == body.user_id
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
    tgt = (await session.execute(select(SquadMember).where(
        SquadMember.squad_id == me.squad_id, SquadMember.user_id == body.user_id
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
    tgt = (await session.execute(select(SquadMember).where(
        SquadMember.squad_id == me.squad_id, SquadMember.user_id == body.user_id
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
        select(SquadMessage, User).join(User, User.id == SquadMessage.user_id)
        .where(SquadMessage.squad_id == me.squad_id, SquadMessage.id > after)
        .order_by(SquadMessage.id.desc()).limit(60)
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
    msg = SquadMessage(squad_id=me.squad_id, user_id=user.id, text=text)
    session.add(msg)
    await session.flush()
    return {"id": msg.id}


# ---- my squad / view -------------------------------------------------------
@router.get("/me")
async def my_squad(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _membership(session, user.id)
    if not m:
        return None
    squad = await session.get(Squad, m.squad_id)
    return await _full(session, squad, user.id)


@router.get("/{code}")
async def get_squad(
    code: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    squad = (await session.execute(
        select(Squad).where(Squad.code == code.upper())
    )).scalar_one_or_none()
    if not squad:
        raise HTTPException(404, "Squad not found")
    return await _full(session, squad, user.id)
