"""XP/level progression, achievements and challenge tracking."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.leveling import degree_for_level, level_for_xp
from app.models import (
    Achievement,
    Challenge,
    User,
    UserAchievement,
    UserChallenge,
)
from app.services.economy import credit


def daily_key(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d")


def weekly_key(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    iso = now.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


async def add_xp(session: AsyncSession, user: User, amount: int) -> dict:
    if amount <= 0:
        return {"leveled_up": False, "level": user.level, "reward": 0}
    before = user.level
    user.xp += amount
    user.level = level_for_xp(user.xp)
    user.degree = degree_for_level(user.level)[0]
    reward = 0
    if user.level > before:
        for lvl in range(before + 1, user.level + 1):
            reward += 500 * lvl
        await credit(
            session, user, reward, "achievement",
            ref="level_up", meta={"level": user.level},
        )
    return {"leveled_up": user.level > before, "level": user.level, "reward": reward}


async def sync_achievements(session: AsyncSession, user: User) -> list[dict]:
    """Update achievement progress from user stats; grant completed ones."""
    achievements = (await session.execute(select(Achievement))).scalars().all()
    existing = {
        ua.achievement_id: ua
        for ua in (
            await session.execute(
                select(UserAchievement).where(UserAchievement.user_id == user.id)
            )
        ).scalars().all()
    }
    newly: list[dict] = []
    for ach in achievements:
        ua = existing.get(ach.id)
        if ua is None:
            ua = UserAchievement(user_id=user.id, achievement_id=ach.id)
            session.add(ua)
        if ua.completed:
            continue
        value = getattr(user, ach.metric, 0) or 0
        ua.progress = int(value)
        if ua.progress >= ach.target:
            ua.completed = True
            ua.claimed = True
            ua.completed_at = datetime.now(timezone.utc)
            if ach.reward_coins:
                await credit(session, user, ach.reward_coins, "achievement", ref=ach.code)
            if ach.reward_gems:
                await credit(session, user, ach.reward_gems, "achievement",
                             currency="gems", ref=ach.code)
            if ach.reward_xp:
                await add_xp(session, user, ach.reward_xp)
            newly.append({
                "code": ach.code, "title": ach.title, "icon": ach.icon,
                "reward_coins": ach.reward_coins, "reward_gems": ach.reward_gems,
            })
    return newly


async def bump_challenges(
    session: AsyncSession, user: User, metric: str, amount: int
) -> list[dict]:
    """Increment progress on active challenges tracking `metric`."""
    if amount <= 0:
        return []
    challenges = (
        await session.execute(
            select(Challenge).where(
                Challenge.metric == metric, Challenge.is_active.is_(True)
            )
        )
    ).scalars().all()
    completed: list[dict] = []
    for ch in challenges:
        pkey = daily_key() if ch.period == "daily" else weekly_key()
        uc = (
            await session.execute(
                select(UserChallenge).where(
                    UserChallenge.user_id == user.id,
                    UserChallenge.challenge_id == ch.id,
                    UserChallenge.period_key == pkey,
                )
            )
        ).scalar_one_or_none()
        if uc is None:
            uc = UserChallenge(
                user_id=user.id, challenge_id=ch.id, period_key=pkey, progress=0
            )
            session.add(uc)
        if uc.completed:
            continue
        uc.progress += amount
        if uc.progress >= ch.target:
            uc.completed = True
            uc.claimed = True
            if ch.reward_coins:
                await credit(session, user, ch.reward_coins, "challenge", ref=ch.code)
            if ch.reward_gems:
                await credit(session, user, ch.reward_gems, "challenge",
                             currency="gems", ref=ch.code)
            if ch.reward_xp:
                await add_xp(session, user, ch.reward_xp)
            completed.append({
                "code": ch.code, "title": ch.title, "icon": ch.icon,
                "reward_coins": ch.reward_coins,
            })
    return completed


async def record_hand(
    session: AsyncSession,
    user: User,
    *,
    won: bool,
    showdown_win: bool,
    net: int,
    pot: int,
) -> dict:
    """Update lifetime stats + XP + achievements/challenges after a hand."""
    from app.core.leveling import (
        XP_PER_HAND,
        XP_PER_HAND_WON,
        XP_PER_SHOWDOWN_WIN,
    )

    user.hands_played += 1
    xp = XP_PER_HAND
    if won:
        user.hands_won += 1
        user.win_streak += 1
        user.best_win_streak = max(user.best_win_streak, user.win_streak)
        xp += XP_PER_HAND_WON
    else:
        user.win_streak = 0
    if showdown_win:
        xp += XP_PER_SHOWDOWN_WIN
    if net > 0:
        user.total_won += net
    user.biggest_pot = max(user.biggest_pot, pot)

    level_info = await add_xp(session, user, xp)
    await bump_challenges(session, user, "hands_played", 1)
    if won:
        await bump_challenges(session, user, "hands_won", 1)
    if net > 0:
        await bump_challenges(session, user, "coins_won", net)
    achievements = await sync_achievements(session, user)
    return {"level": level_info, "achievements": achievements}
