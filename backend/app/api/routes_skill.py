"""Player-facing skill rating, derived from Decision Quality.

Distinct from XP level (how MUCH you play) — this is how WELL you play, luck-free.
Gated to the league unlock level: below it there aren't enough serious hands, and it
keeps the feature tied to the players it's meant for.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import PlayerStats, User
from app.services import dq as DQ
from app.services import league as L
from app.services.cosmetics import effective_avatar_color

router = APIRouter(prefix="/api/skill", tags=["skill"])


@router.get("")
async def my_skill(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cfg = await L.get_config(session)
    unlock = int(cfg.get("unlock_level", 10))
    if user.level < unlock:
        return {"locked": True, "unlock_level": unlock, "level": user.level}

    st = await session.get(PlayerStats, user.id)
    d = DQ.compute(st)
    grade = DQ.grade_of(d["dq"]) if d["ready"] else None
    return {
        "locked": False,
        "ready": d["ready"],
        "decisions": d["decisions"],
        "min_decisions": DQ.MIN_DECISIONS,
        "dq": d["dq"],
        "blunder_rate": d["blunder_rate"],
        "grade": grade,
        "experimental": True,
    }


@router.get("/leaderboard")
async def leaderboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Level-10+ players ranked by DQ. A skill rating, not a hand-level HUD — like an
    Elo board, so showing it is fine."""
    cfg = await L.get_config(session)
    unlock = int(cfg.get("unlock_level", 10))

    rows = list(
        (
            await session.execute(
                select(User, PlayerStats)
                .join(PlayerStats, PlayerStats.user_id == User.id)
                .where(
                    User.is_bot.is_(False),
                    User.level >= unlock,
                    PlayerStats.dq_decisions >= DQ.MIN_DECISIONS,
                )
            )
        ).all()
    )
    board = []
    for u, st in rows:
        d = DQ.compute(st)
        if d["dq"] is None:
            continue
        g = DQ.grade_of(d["dq"])
        board.append(
            {
                "user_id": u.id,
                "name": u.display_name,
                "avatar": u.avatar,
                "avatar_color": effective_avatar_color(u),
                "name_color": u.name_color or "",
                "dq": d["dq"],
                "grade": g["name"],
                "grade_color": g["color"],
                "level": g["level"],
                "is_me": u.id == user.id,
            }
        )
    board.sort(key=lambda r: -r["dq"])
    for i, r in enumerate(board):
        r["rank"] = i + 1
    return {"board": board[:50], "unlock_level": unlock}
