"""User lookup / creation and daily rewards."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User
from app.services.economy import credit


async def ensure_referral_code(session: AsyncSession, user: User) -> str:
    if user.referral_code:
        return user.referral_code
    for _ in range(10):
        code = secrets.token_hex(5)
        exists = (await session.execute(
            select(User.id).where(User.referral_code == code)
        )).scalar_one_or_none()
        if not exists:
            user.referral_code = code
            return code
    user.referral_code = secrets.token_hex(8)
    return user.referral_code


async def get_by_telegram_id(session: AsyncSession, telegram_id: int) -> User | None:
    return (
        await session.execute(select(User).where(User.telegram_id == telegram_id))
    ).scalar_one_or_none()


async def get_or_create_from_telegram(
    session: AsyncSession, tg: dict, referral: str | None = None
) -> tuple[User, bool]:
    """tg is the Telegram user dict from initData / bot update.

    `referral` is an optional start param (e.g. 'ref_123') used to attribute a
    new signup to an inviter.
    """
    user = await get_by_telegram_id(session, int(tg["id"]))
    created = False
    if user is None:
        user = User(
            telegram_id=int(tg["id"]),
            username=tg.get("username"),
            first_name=tg.get("first_name") or "Player",
            last_name=tg.get("last_name"),
            language_code=tg.get("language_code"),
            photo_url=tg.get("photo_url"),
            coins=0,
        )
        session.add(user)
        await session.flush()
        await ensure_referral_code(session, user)
        await credit(session, user, settings.SIGNUP_BONUS_COINS, "signup_bonus")
        created = True
        # attribute referral (best-effort; never blocks signup)
        try:
            from app.services.referrals import apply_referral, resolve_referrer
            referrer = await resolve_referrer(session, referral)
            if referrer:
                await apply_referral(session, user, referrer.id)
        except Exception:  # noqa: BLE001
            import logging
            logging.getLogger("poker.referrals").exception("referral apply failed")
    else:
        # keep profile fresh
        user.username = tg.get("username") or user.username
        user.first_name = tg.get("first_name") or user.first_name
        user.last_name = tg.get("last_name") or user.last_name
        if tg.get("photo_url"):
            user.photo_url = tg["photo_url"]
    user.last_seen_at = datetime.now(timezone.utc)
    return user, created


async def claim_daily(session: AsyncSession, user: User) -> dict:
    now = datetime.now(timezone.utc)
    last = user.last_daily_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if last and (now - last) < timedelta(hours=20):
        nxt = last + timedelta(hours=20)
        return {"claimed": False, "next_at": nxt.isoformat(), "streak": user.daily_streak}
    # streak continues if within 48h, else resets
    if last and (now - last) <= timedelta(hours=48):
        user.daily_streak += 1
    else:
        user.daily_streak = 1
    reward = settings.DAILY_REWARD_COINS * min(user.daily_streak, 7)
    user.last_daily_at = now
    await credit(session, user, reward, "daily", meta={"streak": user.daily_streak})
    return {"claimed": True, "reward": reward, "streak": user.daily_streak}
