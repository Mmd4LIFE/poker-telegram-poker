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
    grades = await DQ.get_grades(session)
    grade = DQ.grade_of(d["dq"], grades) if d["ready"] else None
    return {
        "locked": False,
        "ready": d["ready"],
        "decisions": d["decisions"],
        "min_decisions": DQ.MIN_DECISIONS,
        "dq": d["dq"],
        "blunder_rate": d["blunder_rate"],
        "grade": grade,                       # relative percentile skill
        "skill_level": DQ.level_of(d["skill_sp"]),  # cumulative, XP-style
        "roadmap": DQ.roadmap(d["skill_sp"]),       # full 15-level SP ladder
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

    # everyone past unlock with any skill points — the cumulative ladder doesn't need
    # the 50-decision gate the percentile grade does (it just grows from zero)
    rows = list(
        (
            await session.execute(
                select(User, PlayerStats)
                .join(PlayerStats, PlayerStats.user_id == User.id)
                .where(
                    User.is_bot.is_(False),
                    User.level >= unlock,
                    PlayerStats.skill_sp > 0,
                )
            )
        ).all()
    )
    grades = await DQ.get_grades(session)
    board = []
    for u, st in rows:
        d = DQ.compute(st)
        lvl = DQ.level_of(d["skill_sp"])
        g = DQ.grade_of(d["dq"], grades) if d["ready"] and d["dq"] is not None else None
        board.append(
            {
                "user_id": u.id,
                "name": u.display_name,
                "avatar": u.avatar,
                "avatar_color": effective_avatar_color(u),
                "name_color": u.name_color or "",
                "skill_sp": d["skill_sp"],
                "skill_level": lvl["level"],
                "level_color": lvl["color"],
                "dq": d["dq"],
                "grade": g["name"] if g else None,
                "grade_color": g["color"] if g else None,
                "is_me": u.id == user.id,
            }
        )
    # ORDER BY cumulative skill points
    board.sort(key=lambda r: -r["skill_sp"])
    for i, r in enumerate(board):
        r["rank"] = i + 1
    return {"board": board[:50], "unlock_level": unlock}
