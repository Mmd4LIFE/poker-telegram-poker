"""League: standings, and sitting down to a Sit & Go."""
from __future__ import annotations

import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.game.manager import manager
from app.models import Cohort, CohortMember, LeagueSeason, Room, RoomPlayer, User
from app.services import league as L
from app.services.cosmetics import effective_avatar_color
from app.services.rooms import generate_room_code

router = APIRouter(prefix="/api/league", tags=["league"])


async def _my_cohort(session: AsyncSession, user: User, cfg: dict):
    season = await L.ensure_season(session)
    if not season:
        return None, None
    row = await session.execute(
        select(Cohort, CohortMember)
        .join(CohortMember, CohortMember.cohort_id == Cohort.id)
        .where(Cohort.season_id == season.id, CohortMember.user_id == user.id)
    )
    got = row.first()
    if not got:
        return season, None
    return season, got


@router.get("")
async def standings(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cfg = await L.get_config(session)
    unlock = int(cfg.get("unlock_level", 10))

    if not cfg.get("enabled"):
        return {"enabled": False}
    if user.level < unlock:
        return {
            "enabled": True,
            "locked": True,
            "unlock_level": unlock,
            "level": user.level,
        }

    season, got = await _my_cohort(session, user, cfg)
    await session.commit()
    if not got:
        # they just crossed the unlock level — they'll be seated at the next rollover
        return {
            "enabled": True,
            "locked": False,
            "pending": True,
            "unlock_level": unlock,
            "seconds_to_close": L.seconds_to_close(cfg),
        }

    cohort, me = got
    tier = L.tier_of(cfg, cohort.tier)

    members = list(
        (
            await session.scalars(
                select(CohortMember).where(CohortMember.cohort_id == cohort.id)
            )
        ).all()
    )
    members.sort(key=lambda m: (-(m.lp or 0), m.ranked_games or 0))

    users = {}
    ids = [m.user_id for m in members]
    if ids:
        rows = await session.scalars(select(User).where(User.id.in_(ids)))
        users = {u.id: u for u in rows.all()}

    n = len(members)
    promote_n = int(tier.get("promote", 0))
    demote_n = int(tier.get("demote", 0))

    rows_out = []
    for i, m in enumerate(members):
        u = users.get(m.user_id)
        if not u:
            continue
        zone = (
            "promote"
            if i < promote_n
            else ("demote" if demote_n and i >= n - demote_n else "hold")
        )
        rows_out.append(
            {
                "rank": i + 1,
                # Bots are indistinguishable on purpose — they are what keeps a
                # 24-seat cohort alive when three humans showed up.
                "user_id": u.id,
                "name": u.display_name,
                "avatar": u.avatar,
                "avatar_color": effective_avatar_color(u),
                "name_color": u.name_color or "",
                "lp": m.lp or 0,
                "games": m.ranked_games or 0,
                "wins": m.wins or 0,
                "zone": zone,
                "is_me": u.id == user.id,
            }
        )

    cap = int(cfg["ranked_games_per_day"])
    return {
        "enabled": True,
        "locked": False,
        "tier": cohort.tier,
        "tier_name": tier["name"],
        "cohort": cohort.idx + 1,
        "capacity": cohort.capacity,
        "promote": promote_n,
        "demote": demote_n,
        "seconds_to_close": L.seconds_to_close(cfg),
        "my_rank": next((r["rank"] for r in rows_out if r["is_me"]), None),
        "my_lp": me.lp or 0,
        "games_played": me.ranked_games or 0,
        "games_cap": cap,
        "games_left": max(0, cap - (me.ranked_games or 0)),
        "shards": user.league_shards or 0,
        "shards_per_skin": int(cfg.get("shards_per_skin", 25)),
        "rewards": cfg.get("rewards", []),
        "standings": rows_out,
        "tiers": [
            {"key": t["key"], "name": t["name"]} for t in cfg["tiers"]
        ],
    }


@router.post("/play")
async def play(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Sit down to a Sit & Go against five others from your cohort.

    With a small population the other five are usually bots — which is the point of
    them. They're drawn from the same cohort, so you're playing the ladder you can
    actually see.
    """
    cfg = await L.get_config(session)
    if not cfg.get("enabled"):
        raise HTTPException(400, "The league is closed")
    if user.level < int(cfg.get("unlock_level", 10)):
        raise HTTPException(403, f"Unlocks at level {cfg['unlock_level']}")

    season, got = await _my_cohort(session, user, cfg)
    if not got:
        await session.commit()
        raise HTTPException(400, "You'll join a cohort at the next rollover")
    cohort, me = got

    size = int(cfg["table_size"])
    stack = int(cfg["start_stack"])

    # opponents: cohort members who still have games left. Prefer bots — a human is
    # not obliged to be online just because you clicked Play.
    pool = list(
        (
            await session.scalars(
                select(CohortMember).where(
                    CohortMember.cohort_id == cohort.id,
                    CohortMember.user_id != user.id,
                    CohortMember.is_bot.is_(True),
                )
            )
        ).all()
    )
    if len(pool) < size - 1:
        raise HTTPException(400, "Not enough opponents in your cohort right now")
    picked = random.sample(pool, size - 1)

    code = await generate_room_code(session)
    room = Room(
        code=code,
        name=f"{L.tier_of(cfg, cohort.tier)['name']} Sit & Go",
        host_id=user.id,
        allow_bots=True,
        is_private=True,          # never listed: league tables are not joinable
        mode="sng",
        cohort_id=cohort.id,
        max_players=size,
        small_blind=25,
        big_blind=50,
        min_buy_in=stack,
        max_buy_in=stack,
    )
    session.add(room)
    await session.flush()

    seats = [user.id] + [m.user_id for m in picked]
    for i, uid in enumerate(seats):
        session.add(
            RoomPlayer(room_id=room.id, user_id=uid, seat=i, stack=stack, status="seated")
        )
    await session.commit()

    rt = await manager.get_runtime(session, room)
    rt.start()
    return {"code": code, "size": size, "stack": stack}


@router.get("/history")
async def history(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Every league day you've finished, newest first."""
    cfg = await L.get_config(session)
    rows = (
        await session.execute(
            select(LeagueSeason, Cohort, CohortMember)
            .join(Cohort, Cohort.season_id == LeagueSeason.id)
            .join(CohortMember, CohortMember.cohort_id == Cohort.id)
            .where(
                CohortMember.user_id == user.id,
                LeagueSeason.status == "closed",
            )
            .order_by(LeagueSeason.day.desc())
            .limit(30)
        )
    ).all()

    out = []
    for season, cohort, m in rows:
        size = int(
            await session.scalar(
                select(func.count()).where(CohortMember.cohort_id == cohort.id)
            )
            or 0
        )
        out.append(
            {
                "day": str(season.day),
                "tier": cohort.tier,
                "tier_name": L.tier_of(cfg, cohort.tier)["name"],
                "rank": m.rank,
                "size": size,
                "lp": m.lp or 0,
                "games": m.ranked_games or 0,
                "wins": m.wins or 0,
                "outcome": m.outcome or "held",
            }
        )

    order = [t["key"] for t in cfg["tiers"]]
    best = None
    for h in out:
        if best is None or order.index(h["tier"]) > order.index(best):
            best = h["tier"]

    return {
        "days": out,
        "played": len(out),
        "promotions": sum(1 for h in out if h["outcome"] == "promoted"),
        "wins": sum(h["wins"] for h in out),
        "best_tier": best,
        "best_tier_name": L.tier_of(cfg, best)["name"] if best else None,
    }
