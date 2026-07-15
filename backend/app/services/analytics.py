"""Derived analytics: daily snapshots + dashboard aggregators.

All READ-only against the operational tables; the only thing it writes is the
append-only `fact_daily` snapshot. Flows (coins in/out, trades, hands) are
reconstructable historically from the event tables, so backfill is accurate.
Circulation is point-in-time, so it's only meaningful from the day snapshots begin.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FactDaily,
    Hand,
    LeagueGame,
    MarketListing,
    PlayerHand,
    Transaction,
    User,
    UserBox,
)


def _window(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


async def snapshot_daily(session: AsyncSession, day: date | None = None) -> FactDaily:
    """Compute (or recompute) one day's fact row. Idempotent per day."""
    if day is None:
        day = (datetime.now(timezone.utc) - timedelta(days=1)).date()
    lo, hi = _window(day)
    today = datetime.now(timezone.utc).date()
    is_current_or_future = day >= today

    async def _c(q) -> int:
        return int(await session.scalar(q) or 0)

    # population
    new_users = await _c(
        select(func.count()).select_from(User).where(
            User.is_bot.is_(False), User.created_at >= lo, User.created_at < hi
        )
    )
    users_total = await _c(
        select(func.count()).select_from(User).where(
            User.is_bot.is_(False), User.created_at < hi
        )
    )
    dau = await _c(
        select(func.count(func.distinct(PlayerHand.user_id)))
        .select_from(PlayerHand)
        .join(User, User.id == PlayerHand.user_id)
        .where(User.is_bot.is_(False), PlayerHand.created_at >= lo, PlayerHand.created_at < hi)
    )
    # bot_started is current state, not historical — only meaningful "as of now"
    reachable = await _c(
        select(func.count()).select_from(User).where(
            User.is_bot.is_(False), User.bot_started.is_(True)
        )
    ) if is_current_or_future else 0

    # economy flows — amounts are signed, so sum by sign per currency
    async def _flow(currency: str, positive: bool) -> int:
        cond = Transaction.amount > 0 if positive else Transaction.amount < 0
        v = await session.scalar(
            select(func.coalesce(func.sum(func.abs(Transaction.amount)), 0)).where(
                Transaction.currency == currency,
                Transaction.created_at >= lo,
                Transaction.created_at < hi,
                cond,
            )
        )
        return int(v or 0)

    coins_in, coins_out = await _flow("coins", True), await _flow("coins", False)
    gems_in, gems_out = await _flow("gems", True), await _flow("gems", False)

    # circulation — point in time, only for the current snapshot
    if is_current_or_future:
        coins_circ = await _c(
            select(func.coalesce(func.sum(User.coins), 0)).where(User.is_bot.is_(False))
        )
        gems_circ = await _c(
            select(func.coalesce(func.sum(User.gems), 0)).where(User.is_bot.is_(False))
        )
    else:
        coins_circ = gems_circ = 0

    # market
    trades = await _c(
        select(func.count()).select_from(MarketListing).where(
            MarketListing.status == "sold",
            MarketListing.closed_at >= lo,
            MarketListing.closed_at < hi,
        )
    )

    async def _fee(currency: str) -> int:
        v = await session.scalar(
            select(func.coalesce(func.sum(MarketListing.fee), 0)).where(
                MarketListing.status == "sold",
                MarketListing.currency == currency,
                MarketListing.closed_at >= lo,
                MarketListing.closed_at < hi,
            )
        )
        return int(v or 0)

    fee_coins, fee_gems = await _fee("coins"), await _fee("gems")

    # engagement
    hands = await _c(
        select(func.count()).select_from(Hand).where(
            Hand.created_at >= lo, Hand.created_at < hi
        )
    )
    lg = await _c(
        select(func.count()).select_from(LeagueGame).where(
            LeagueGame.created_at >= lo, LeagueGame.created_at < hi
        )
    )
    boxes = await _c(
        select(func.count()).select_from(UserBox).where(
            UserBox.created_at >= lo, UserBox.created_at < hi
        )
    )

    row = await session.get(FactDaily, day)
    if row is None:
        row = FactDaily(day=day)
        session.add(row)
    row.new_users, row.users_total, row.dau, row.reachable = (
        new_users, users_total, dau, reachable
    )
    row.coins_circulation, row.gems_circulation = coins_circ, gems_circ
    row.coins_in, row.coins_out, row.gems_in, row.gems_out = (
        coins_in, coins_out, gems_in, gems_out
    )
    row.trades, row.fee_coins_burned, row.fee_gems_burned = trades, fee_coins, fee_gems
    row.hands_played, row.league_games, row.box_opens = hands, lg, boxes
    return row


async def backfill(session: AsyncSession, days: int = 30) -> int:
    """Snapshot the last `days` days (flows are accurate historically)."""
    today = datetime.now(timezone.utc).date()
    n = 0
    for i in range(days, -1, -1):
        await snapshot_daily(session, today - timedelta(days=i))
        n += 1
    return n


# --------------------------------------------------------------------- dashboards


async def _series(session: AsyncSession, days: int) -> list[FactDaily]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    rows = await session.scalars(
        select(FactDaily).where(FactDaily.day >= since).order_by(FactDaily.day)
    )
    return list(rows.all())


async def economy_dashboard(session: AsyncSession, days: int = 30) -> dict:
    rows = await _series(session, days)
    latest = rows[-1] if rows else None
    # faucets vs sinks by transaction kind over the window (live, so it's exact)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    lo = datetime.combine(since, time.min, tzinfo=timezone.utc)
    kinds = await session.execute(
        select(
            Transaction.kind,
            func.sum(func.abs(Transaction.amount)).filter(Transaction.amount > 0),
            func.sum(func.abs(Transaction.amount)).filter(Transaction.amount < 0),
        )
        .where(Transaction.currency == "coins", Transaction.created_at >= lo)
        .group_by(Transaction.kind)
    )
    by_kind = [
        {"kind": k, "in": int(i or 0), "out": int(o or 0)}
        for k, i, o in kinds.all()
    ]
    by_kind.sort(key=lambda x: -(x["in"] + x["out"]))
    return {
        "days": [
            {
                "day": str(r.day),
                "coins_circulation": r.coins_circulation,
                "gems_circulation": r.gems_circulation,
                "coins_in": r.coins_in,
                "coins_out": r.coins_out,
                "net": r.coins_in - r.coins_out,
                "fee_coins_burned": r.fee_coins_burned,
                "trades": r.trades,
            }
            for r in rows
        ],
        "latest": {
            "coins_circulation": latest.coins_circulation if latest else 0,
            "gems_circulation": latest.gems_circulation if latest else 0,
        },
        "by_kind": by_kind[:12],
    }


async def engagement_dashboard(session: AsyncSession, days: int = 30) -> dict:
    rows = await _series(session, days)
    latest = rows[-1] if rows else None
    return {
        "days": [
            {
                "day": str(r.day),
                "dau": r.dau,
                "new_users": r.new_users,
                "users_total": r.users_total,
                "hands_played": r.hands_played,
                "league_games": r.league_games,
            }
            for r in rows
        ],
        "latest": {
            "users_total": latest.users_total if latest else 0,
            "reachable": latest.reachable if latest else 0,
            "dau": latest.dau if latest else 0,
        },
    }
