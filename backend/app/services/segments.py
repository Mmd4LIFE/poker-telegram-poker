"""Turn a segment rules object into a query over users.

Rules are ANDed together. Every key is optional; an empty rules object means
"everyone who can receive a message". Supported keys:

  level_min / level_max          int
  coins_min / coins_max          int
  gems_min  / gems_max           int
  in_club                       bool  (true = in one, false = not in one)
  has_listings                   bool  (true = has something on the market)
  owns_card                      str   ("As" — owns any skin of that card)
  owns_design                    str   ("royal" — owns any skin of that design)
  skins_min                      int   (collection size)
  inactive_days                  int   (last seen more than N days ago)
  active_days                    int   (last seen within N days)
  referred_min                   int
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CardSkin,
    MarketListing,
    Segment,
    SegmentUser,
    ClubMember,
    User,
)

# Advertised to the admin UI so it can render a form instead of raw JSON.
FIELDS: list[dict] = [
    {"key": "level_min", "label": "Level ≥", "type": "int"},
    {"key": "level_max", "label": "Level ≤", "type": "int"},
    {"key": "coins_min", "label": "Coins ≥", "type": "int"},
    {"key": "coins_max", "label": "Coins ≤", "type": "int"},
    {"key": "gems_min", "label": "Gems ≥", "type": "int"},
    {"key": "gems_max", "label": "Gems ≤", "type": "int"},
    {"key": "skins_min", "label": "Card skins ≥", "type": "int"},
    {"key": "referred_min", "label": "Referrals ≥", "type": "int"},
    {"key": "inactive_days", "label": "Not seen for N days", "type": "int"},
    {"key": "active_days", "label": "Seen within N days", "type": "int"},
    {"key": "in_club", "label": "In a club", "type": "bool"},
    {"key": "has_listings", "label": "Selling on market", "type": "bool"},
    {"key": "owns_card", "label": "Owns card (e.g. As)", "type": "card"},
    {"key": "owns_design", "label": "Owns design", "type": "design"},
]


def base_query():
    """Everyone the bot can actually DM.

    bot_started is the gate: Telegram silently rejects messages to users who never
    pressed Start, so including them would just inflate the failure count.
    """
    return select(User.id).where(
        User.telegram_id.is_not(None),
        User.is_bot.is_(False),
        User.is_banned.is_(False),
        User.bot_started.is_(True),
    )


def build_query(rules: dict | None):
    q = base_query()
    r = rules or {}

    def num(key):
        v = r.get(key)
        return int(v) if v not in (None, "") else None

    if (v := num("level_min")) is not None:
        q = q.where(User.level >= v)
    if (v := num("level_max")) is not None:
        q = q.where(User.level <= v)
    if (v := num("coins_min")) is not None:
        q = q.where(User.coins >= v)
    if (v := num("coins_max")) is not None:
        q = q.where(User.coins <= v)
    if (v := num("gems_min")) is not None:
        q = q.where(User.gems >= v)
    if (v := num("gems_max")) is not None:
        q = q.where(User.gems <= v)
    if (v := num("referred_min")) is not None:
        q = q.where(User.referral_count >= v)

    if (v := num("inactive_days")) is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=v)
        q = q.where(User.last_seen_at < cutoff)
    if (v := num("active_days")) is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=v)
        q = q.where(User.last_seen_at >= cutoff)

    if (v := r.get("in_club")) is not None:
        member = select(ClubMember.user_id).where(ClubMember.user_id == User.id)
        q = q.where(member.exists() if v else ~member.exists())

    if (v := r.get("has_listings")) is not None:
        listed = select(MarketListing.id).where(
            MarketListing.seller_id == User.id, MarketListing.status == "active"
        )
        q = q.where(listed.exists() if v else ~listed.exists())

    if card := r.get("owns_card"):
        owns = select(CardSkin.id).where(
            CardSkin.owner_id == User.id, CardSkin.card == card
        )
        q = q.where(owns.exists())

    if design := r.get("owns_design"):
        owns = select(CardSkin.id).where(
            CardSkin.owner_id == User.id, CardSkin.design_code == design
        )
        q = q.where(owns.exists())

    if (v := num("skins_min")) is not None:
        cnt = (
            select(func.count())
            .select_from(CardSkin)
            .where(CardSkin.owner_id == User.id)
            .scalar_subquery()
        )
        q = q.where(cnt >= v)

    return q


async def preview_count(session: AsyncSession, rules: dict | None) -> int:
    q = build_query(rules)
    return int(
        await session.scalar(select(func.count()).select_from(q.subquery())) or 0
    )


async def compute(session: AsyncSession, seg: Segment) -> int:
    """Materialise membership. Called on demand and before every broadcast."""
    ids = list((await session.scalars(build_query(seg.rules))).all())
    await session.execute(delete(SegmentUser).where(SegmentUser.segment_id == seg.id))
    if ids:
        await session.execute(
            insert(SegmentUser),
            [{"segment_id": seg.id, "user_id": uid} for uid in ids],
        )
    seg.user_count = len(ids)
    seg.computed_at = datetime.now(timezone.utc)
    return len(ids)


async def recipient_users(session: AsyncSession, seg: Segment | None) -> list[User]:
    """Users to send to. Recomputes the segment first so the audience is never stale.

    Returns full User rows (not just ids) because broadcast templates substitute
    {name}, {coins}, {level}… per recipient.
    """
    if seg is None:
        rows = await session.scalars(
            select(User).where(
                User.telegram_id.is_not(None),
                User.is_bot.is_(False),
                User.is_banned.is_(False),
                User.bot_started.is_(True),
            )
        )
        return list(rows.all())

    await compute(session, seg)
    rows = await session.scalars(
        select(User)
        .join(SegmentUser, SegmentUser.user_id == User.id)
        .where(SegmentUser.segment_id == seg.id, User.telegram_id.is_not(None))
    )
    return list(rows.all())
