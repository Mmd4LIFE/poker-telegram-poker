"""Profile cosmetics endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import User
from app.services import cosmetics as C

router = APIRouter(prefix="/api/cosmetics", tags=["cosmetics"])


class CosmeticAction(BaseModel):
    kind: str  # avatar | color
    code: str


@router.get("")
async def get_catalog(user: User = Depends(get_current_user)):
    return C.catalog(user)


@router.post("/buy")
async def buy(
    body: CosmeticAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.kind not in ("avatar", "color", "avatar_color"):
        raise HTTPException(400, "bad kind")
    try:
        await C.buy(session, user, body.kind, body.code)
        # auto-equip on purchase
        await C.equip(session, user, body.kind, body.code)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"coins": user.coins, "gems": user.gems, "avatar": user.avatar, "name_color": user.name_color, "avatar_color": C.effective_avatar_color(user)}


@router.post("/equip")
async def equip(
    body: CosmeticAction,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.kind not in ("avatar", "color", "avatar_color"):
        raise HTTPException(400, "bad kind")
    try:
        await C.equip(session, user, body.kind, body.code)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"avatar": user.avatar, "name_color": user.name_color, "avatar_color": C.effective_avatar_color(user)}
