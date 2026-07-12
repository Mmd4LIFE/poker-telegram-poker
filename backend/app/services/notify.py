"""Bot-initiated messages: the nightly daily-reward reminder, and admin broadcasts.

Reminder policy (deliberately quiet — a game that nags gets muted):
  * Streak alive but unclaimed today  -> "keep your streak" at 21:00 local.
  * Streak just broke                 -> "it's fine, start again", at most TWICE,
                                         then silence until they come back.
Claiming resets the churn counter, so a returning player is eligible again later.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import AppSetting, Broadcast, Segment, User
from app.services import daily as D
from app.services import segments as S

logger = logging.getLogger("poker.notify")

SETTINGS_KEY = "daily_reminder"
DEFAULTS = {
    "enabled": True,
    "hour": 21,  # local hour, 0-23
    "keep_text": (
        "🔥 Your <b>{streak}-day streak</b> is still alive.\n"
        "Claim today's reward before midnight — day {next_day} pays "
        "<b>{next_coins}</b> coins."
    ),
    "miss_text": (
        "No worries — streaks break. 🙂\n"
        "Start a fresh one today and day 7 pays <b>gems</b>."
    ),
}


async def get_config(session) -> dict:
    row = await session.get(AppSetting, SETTINGS_KEY)
    cfg = dict(DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    return cfg


async def set_config(session, patch: dict) -> dict:
    row = await session.get(AppSetting, SETTINGS_KEY)
    cfg = dict(DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    cfg.update({k: v for k, v in patch.items() if v is not None})
    cfg["hour"] = max(0, min(23, int(cfg["hour"])))
    if row:
        row.value = cfg
    else:
        session.add(AppSetting(key=SETTINGS_KEY, value=cfg))
    return cfg


class _Safe(dict):
    """Unknown placeholder -> leave it visible rather than blowing up the send."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def vars_for(user: User) -> dict:
    """Every substitution, available in reminders AND broadcasts alike.

    One variable set for both, deliberately: the admin edits reminder text and
    broadcast text in identical-looking boxes, so a placeholder that works in one
    must work in the other.
    """
    nxt = D.reward_for(user.daily_streak + 1)  # the rung a claim right now would pay
    return {
        "name": user.display_name,
        "level": user.level,
        "coins": f"{user.coins:,}",
        "gems": user.gems,
        "streak": user.daily_streak,
        "next_day": nxt["day"],
        "next_coins": f"{nxt['coins']:,}",
        "next_gems": nxt["gems"],
    }


# Advertised to the admin UI so it can list what you can type.
VARIABLES = [
    "name",
    "level",
    "coins",
    "gems",
    "streak",
    "next_day",
    "next_coins",
    "next_gems",
]
KEEP_VARIABLES = VARIABLES


def render(text: str, data: dict) -> str:
    """Substitute {placeholders}. A typo in an admin-authored template must never
    take the nightly sweep down, so anything unexpected falls back to raw text."""
    try:
        return str(text).format_map(_Safe(data))
    except Exception:  # noqa: BLE001 — stray brace, bad format spec, etc.
        logger.warning("template render failed, sending raw")
        return str(text)


async def _send(tg_id: int, text: str) -> bool:
    from app.bot.instance import get_bot

    try:
        await get_bot().send_message(tg_id, text)
        return True
    except Exception as e:  # blocked the bot, deactivated, etc.
        logger.debug("send to %s failed: %s", tg_id, e)
        return False


# --- nightly reminder -------------------------------------------------------


async def _due(user: User, cfg: dict) -> str | None:
    """Which message (if any) this user should get right now. None = stay quiet."""
    ln = D.local_now(user)
    if ln.hour != int(cfg["hour"]):
        return None

    today = ln.date()
    if D.local_date(user, user.last_reminder_at) == today:
        return None  # already nudged today
    if D.claimed_today(user):
        return None  # nothing to remind about

    last = D.local_date(user, user.last_daily_at)
    if last == today - timedelta(days=1) and user.daily_streak > 0:
        return "keep"
    # streak is broken (or never started) — only the first two nights
    if (user.miss_notices or 0) < 2:
        return "miss"
    return None


def _render(kind: str, user: User, cfg: dict) -> str:
    data = vars_for(user)
    return render(cfg["keep_text"] if kind == "keep" else cfg["miss_text"], data)


async def run_reminders_once() -> int:
    """One sweep. Called every few minutes; each user can only fire once a day."""
    sent = 0
    async with SessionLocal() as session:
        cfg = await get_config(session)
        if not cfg.get("enabled"):
            return 0
        users = list(
            (
                await session.scalars(
                    select(User).where(
                        User.telegram_id.is_not(None),
                        User.is_bot.is_(False),
                        User.is_banned.is_(False),
                    )
                )
            ).all()
        )
        for u in users:
            kind = await _due(u, cfg)
            if not kind:
                continue
            ok = await _send(u.telegram_id, _render(kind, u, cfg))
            u.last_reminder_at = datetime.now(timezone.utc)
            if kind == "miss":
                u.miss_notices = (u.miss_notices or 0) + 1
            sent += int(ok)
            await asyncio.sleep(0.05)  # stay well under Telegram's rate limit
        await session.commit()
    if sent:
        logger.info("daily reminders sent: %d", sent)
    return sent


async def reminder_loop() -> None:
    # Every 5 min: the hour check is exact, and last_reminder_at makes it idempotent.
    while True:
        try:
            await run_reminders_once()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("reminder sweep failed")
        await asyncio.sleep(300)


# --- broadcasts -------------------------------------------------------------


async def run_broadcast(broadcast_id: int) -> None:
    """Send one broadcast in the background, updating progress as it goes."""
    async with SessionLocal() as session:
        b = await session.get(Broadcast, broadcast_id)
        if not b or b.status != "queued":
            return
        seg = await session.get(Segment, b.segment_id) if b.segment_id else None
        users = await S.recipient_users(session, seg)  # recomputes the segment
        # Snapshot what templates need now: the session closes before we send.
        targets = [(u.telegram_id, vars_for(u)) for u in users if u.telegram_id]
        b.status = "sending"
        b.total = len(targets)
        await session.commit()
        text = b.text

    sent = failed = 0
    for i, (tg_id, data) in enumerate(targets, 1):
        if await _send(tg_id, render(text, data)):
            sent += 1
        else:
            failed += 1
        await asyncio.sleep(0.05)  # ~20/s, Telegram's documented ceiling
        if i % 25 == 0:
            async with SessionLocal() as session:
                b = await session.get(Broadcast, broadcast_id)
                if b:
                    b.sent, b.failed = sent, failed
                    await session.commit()

    async with SessionLocal() as session:
        b = await session.get(Broadcast, broadcast_id)
        if b:
            b.sent, b.failed = sent, failed
            b.status = "done"
            b.finished_at = datetime.now(timezone.utc)
            await session.commit()
    logger.info("broadcast %d done: %d sent, %d failed", broadcast_id, sent, failed)
