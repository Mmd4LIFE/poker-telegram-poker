"""Referral program: link parsing, reward payout and milestone bonuses."""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Friendship, User
from app.services.economy import credit

logger = logging.getLogger("poker.referrals")

# referral_count reached -> (bonus_coins, bonus_gems, label)
MILESTONES: dict[int, tuple[int, int, str]] = {
    3:  (10_000,   0,   "3 friends"),
    5:  (25_000,   10,  "5 friends"),
    10: (75_000,   25,  "10 friends"),
    25: (250_000,  100, "25 friends"),
    50: (750_000,  250, "50 friends"),
    100:(2_000_000,600, "100 friends"),
}


def extract_ref(param: str | None) -> tuple[str, str | int] | None:
    """Parse a start param into a referral pointer.

    Supports:
      ref-<code>              -> referral only
      sq-<squad>-<code>       -> squad invite + referral
      rm-<room>-<code>        -> room invite + referral
      ref_<id> / <id>         -> legacy numeric referral
    Returns ("code", <code>) | ("id", <int>) | None.
    """
    if not param:
        return None
    param = param.strip()
    parts = param.split("-")
    head = parts[0]
    if head == "ref" and len(parts) >= 2 and parts[1]:
        return ("code", parts[1])
    if head in ("sq", "rm"):
        if len(parts) >= 3 and parts[2]:
            return ("code", parts[2])
        return None
    if param.startswith("ref_") and param[4:].isdigit():
        return ("id", int(param[4:]))
    if param.isdigit():
        return ("id", int(param))
    return None


async def resolve_referrer(session: AsyncSession, param: str | None):
    from app.models import User as _User  # local to avoid cycle at import time
    r = extract_ref(param)
    if not r:
        return None
    kind, val = r
    if kind == "id":
        return await session.get(_User, int(val))
    return (await session.execute(
        select(_User).where(_User.referral_code == str(val))
    )).scalar_one_or_none()


async def apply_referral(
    session: AsyncSession, new_user: User, referrer_id: int | None
) -> None:
    """Credit both parties when a brand-new user joins via a referral link.

    Must be called right after the referee is created. Idempotent-ish:
    guarded by new_user.referred_by being unset.
    """
    if referrer_id is None or new_user.referred_by is not None:
        return
    if referrer_id == new_user.id:
        return  # no self-referral

    referrer = await session.get(User, referrer_id)
    if referrer is None or referrer.is_bot or referrer.is_banned:
        return

    # link them
    new_user.referred_by = referrer.id

    # auto-friend the referrer and the new user (accepted)
    from datetime import datetime, timezone
    exists = (await session.execute(
        select(Friendship).where(
            Friendship.user_id == referrer.id, Friendship.friend_id == new_user.id
        )
    )).scalar_one_or_none()
    if exists is None:
        session.add(Friendship(
            user_id=referrer.id, friend_id=new_user.id,
            status="accepted", responded_at=datetime.now(timezone.utc),
        ))

    # reward the new friend
    if settings.REFERRAL_FRIEND_REWARD:
        await credit(
            session, new_user, settings.REFERRAL_FRIEND_REWARD, "referral",
            ref=f"joined_via:{referrer.id}",
        )

    # reward + count the inviter
    referrer.referral_count += 1
    reward = settings.REFERRAL_REFERRER_REWARD
    if reward:
        referrer.referral_earned += reward
        await credit(
            session, referrer, reward, "referral",
            ref=f"invited:{new_user.id}",
            meta={"friend": new_user.display_name},
        )

    # milestone bonus
    ms = MILESTONES.get(referrer.referral_count)
    if ms:
        coins, gems, label = ms
        if coins:
            referrer.referral_earned += coins
            await credit(session, referrer, coins, "referral_milestone",
                         ref=label, meta={"milestone": label})
        if gems:
            await credit(session, referrer, gems, "referral_milestone",
                         currency="gems", ref=label, meta={"milestone": label})

    logger.info("Referral: user %s invited by %s", new_user.id, referrer.id)


def next_milestone(count: int) -> dict | None:
    for threshold in sorted(MILESTONES):
        if count < threshold:
            coins, gems, label = MILESTONES[threshold]
            return {"at": threshold, "coins": coins, "gems": gems,
                    "remaining": threshold - count}
    return None
