"""Daily reward: a visible 7-day ladder on a local-calendar-day streak.

Streaks are counted in the *user's* local day, not in rolling hours. "Did I claim
today?" then has one obvious answer, which is what the reminder at 21:00 local and
the roadmap in the UI both depend on.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.economy import credit

# Day 7 pays gems — the reason to keep the streak alive.
LADDER: list[dict] = [
    {"day": 1, "coins": 1_000, "gems": 0},
    {"day": 2, "coins": 2_000, "gems": 0},
    {"day": 3, "coins": 3_500, "gems": 0},
    {"day": 4, "coins": 5_000, "gems": 0},
    {"day": 5, "coins": 8_000, "gems": 0},
    {"day": 6, "coins": 12_000, "gems": 0},
    {"day": 7, "coins": 20_000, "gems": 5},
]
CYCLE = len(LADDER)


def tz(user: User) -> timezone:
    return timezone(timedelta(minutes=int(user.tz_offset_min or 0)))


def local_now(user: User) -> datetime:
    return datetime.now(timezone.utc).astimezone(tz(user))


def local_date(user: User, at: datetime | None) -> date | None:
    if at is None:
        return None
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.astimezone(tz(user)).date()


def reward_for(streak: int) -> dict:
    """Streak 1..7 -> rung 1..7; streak 8 starts the ladder again at rung 1."""
    idx = (max(1, streak) - 1) % CYCLE
    return LADDER[idx]


def next_streak(user: User) -> int:
    """What the streak becomes if the user claims right now."""
    today = local_now(user).date()
    last = local_date(user, user.last_daily_at)
    if last == today - timedelta(days=1):
        return user.daily_streak + 1
    if last == today:
        return user.daily_streak  # already claimed
    return 1  # first claim, or the streak lapsed


def claimed_today(user: User) -> bool:
    return local_date(user, user.last_daily_at) == local_now(user).date()


def status(user: User) -> dict:
    """Everything the UI needs to render the ladder in one glance."""
    done = claimed_today(user)
    streak = user.daily_streak if done else next_streak(user)
    cur = reward_for(streak)
    ln = local_now(user)
    tomorrow = (ln + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return {
        "claimed_today": done,
        "streak": user.daily_streak,
        # the rung being claimed today (or the one just claimed)
        "day": cur["day"],
        "cycle": (max(1, streak) - 1) // CYCLE + 1,
        "reward": {"coins": cur["coins"], "gems": cur["gems"]},
        "ladder": LADDER,
        "resets_at": tomorrow.astimezone(timezone.utc).isoformat(),
    }


async def claim(session: AsyncSession, user: User) -> dict:
    if claimed_today(user):
        return {"claimed": False, **status(user)}

    user.daily_streak = next_streak(user)
    rung = reward_for(user.daily_streak)
    user.last_daily_at = datetime.now(timezone.utc)
    user.miss_notices = 0  # they're back — re-arm the churn reminders

    await credit(
        session, user, rung["coins"], "daily", meta={"streak": user.daily_streak}
    )
    if rung["gems"]:
        await credit(
            session,
            user,
            rung["gems"],
            "daily",
            currency="gems",
            meta={"streak": user.daily_streak},
        )
    return {
        "claimed": True,
        "reward": rung["coins"],
        "gems": rung["gems"],
        **status(user),
    }
