"""Squads — create, join, leave, view."""
from __future__ import annotations

import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import Squad, SquadMember, User
from app.schemas import CreateSquadRequest, JoinSquadRequest

router = APIRouter(prefix="/api/squads", tags=["squads"])

SAFE = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")


async def _gen_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(SAFE) for _ in range(6))
        if not (await session.execute(select(Squad.id).where(Squad.code == code))).scalar_one_or_none():
            return code
    raise RuntimeError("no code")


async def _my_membership(session: AsyncSession, user_id: int) -> SquadMember | None:
    return (await session.execute(
        select(SquadMember).where(SquadMember.user_id == user_id)
    )).scalar_one_or_none()


def _squad_dict(squad: Squad, members: list[tuple[SquadMember, User]]) -> dict:
    return {
        "code": squad.code, "name": squad.name, "tag": squad.tag,
        "emblem": squad.emblem, "description": squad.description,
        "xp": squad.xp, "bank_coins": squad.bank_coins,
        "members": [{
            "display_name": u.display_name, "avatar": u.avatar,
            "role": m.role, "level": u.level, "contributed": m.contributed,
        } for m, u in members],
    }


@router.post("")
async def create_squad(
    body: CreateSquadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if await _my_membership(session, user.id):
        raise HTTPException(400, "Leave your current squad first")
    code = await _gen_code(session)
    squad = Squad(
        code=code, name=body.name, tag=body.tag, emblem=body.emblem,
        description=body.description, owner_id=user.id,
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
    if await _my_membership(session, user.id):
        raise HTTPException(400, "Leave your current squad first")
    squad = (await session.execute(
        select(Squad).where(Squad.code == body.code.upper())
    )).scalar_one_or_none()
    if not squad:
        raise HTTPException(404, "Squad not found")
    count = (await session.execute(
        select(func.count(SquadMember.id)).where(SquadMember.squad_id == squad.id)
    )).scalar_one()
    if count >= squad.max_members:
        raise HTTPException(400, "Squad is full")
    session.add(SquadMember(squad_id=squad.id, user_id=user.id, role="member"))
    return {"code": squad.code}


@router.post("/leave")
async def leave_squad(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _my_membership(session, user.id)
    if not m:
        raise HTTPException(400, "Not in a squad")
    await session.delete(m)
    return {"ok": True}


@router.get("/me")
async def my_squad(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _my_membership(session, user.id)
    if not m:
        return None
    squad = await session.get(Squad, m.squad_id)
    members = (await session.execute(
        select(SquadMember, User).join(User, User.id == SquadMember.user_id)
        .where(SquadMember.squad_id == squad.id)
    )).all()
    return _squad_dict(squad, members)


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
    members = (await session.execute(
        select(SquadMember, User).join(User, User.id == SquadMember.user_id)
        .where(SquadMember.squad_id == squad.id)
    )).all()
    return _squad_dict(squad, members)
