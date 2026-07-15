"""Derived analytics: daily snapshots + dashboard aggregators.

All READ-only against the operational tables; the only thing it writes is the
append-only `fact_daily` snapshot. Flows (coins in/out, trades, hands) are
reconstructable historically from the event tables, so backfill is accurate.
Circulation is point-in-time, so it's only meaningful from the day snapshots begin.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CohortMember,
    FactDaily,
    Hand,
    LeagueGame,
    LeagueSeason,
    MarketListing,
    PlayerHand,
    PlayerStats,
    Purchase,
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

    # real-money revenue — from the immutable purchases ledger, so backfill is exact
    async def _rev(provider: str) -> int:
        v = await session.scalar(
            select(func.coalesce(func.sum(Purchase.amount), 0)).where(
                Purchase.status == "paid",
                Purchase.provider == provider,
                Purchase.created_at >= lo,
                Purchase.created_at < hi,
            )
        )
        return int(v or 0)

    stars_rev, ton_rev = await _rev("stars"), await _rev("ton")
    purchases_paid = await _c(
        select(func.count()).select_from(Purchase).where(
            Purchase.status == "paid", Purchase.created_at >= lo, Purchase.created_at < hi
        )
    )
    active_payers = await _c(
        select(func.count(func.distinct(Purchase.user_id))).where(
            Purchase.status == "paid", Purchase.created_at >= lo, Purchase.created_at < hi
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
    row.stars_revenue, row.ton_revenue_nano = stars_rev, ton_rev
    row.purchases_paid, row.active_payers = purchases_paid, active_payers
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


# --------------------------------------------------------------- more dashboards


def _pct(n: int, d: int) -> float:
    return round(100.0 * n / d, 1) if d else 0.0


def _spearman(xs: list[float], ys: list[float]) -> float | None:
    """Rank correlation. None if too few points to be meaningful."""
    n = len(xs)
    if n < 4:
        return None

    def _ranks(v: list[float]) -> list[float]:
        order = sorted(range(n), key=lambda i: v[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1  # 1-based average rank for ties
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx, ry = _ranks(xs), _ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    den = (
        sum((rx[i] - mx) ** 2 for i in range(n))
        * sum((ry[i] - my) ** 2 for i in range(n))
    ) ** 0.5
    return round(num / den, 3) if den else None


async def revenue_dashboard(session: AsyncSession, days: int = 30) -> dict:
    """Real-money monetization from the purchases ledger."""
    rows = await _series(session, days)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    lo = datetime.combine(since, time.min, tzinfo=timezone.utc)

    async def _c(q) -> int:
        return int(await session.scalar(q) or 0)

    humans = await _c(
        select(func.count()).select_from(User).where(User.is_bot.is_(False))
    )
    payers = await _c(
        select(func.count(func.distinct(Purchase.user_id))).where(
            Purchase.status == "paid"
        )
    )
    stars_all = await _c(
        select(func.coalesce(func.sum(Purchase.amount), 0)).where(
            Purchase.status == "paid", Purchase.provider == "stars"
        )
    )
    ton_all = await _c(
        select(func.coalesce(func.sum(Purchase.amount), 0)).where(
            Purchase.status == "paid", Purchase.provider == "ton"
        )
    )

    # top packs by revenue in the window
    prod = await session.execute(
        select(
            Purchase.product_code,
            Purchase.provider,
            func.sum(Purchase.amount),
            func.count(),
        )
        .where(Purchase.status == "paid", Purchase.created_at >= lo)
        .group_by(Purchase.product_code, Purchase.provider)
    )
    by_product = sorted(
        (
            {
                "code": code,
                "provider": prov,
                "revenue": int(rev or 0),
                "count": int(cnt or 0),
            }
            for code, prov, rev, cnt in prod.all()
        ),
        key=lambda x: -x["revenue"],
    )[:10]

    return {
        "days": [
            {
                "day": str(r.day),
                "stars_revenue": r.stars_revenue,
                "ton": round((r.ton_revenue_nano or 0) / 1e9, 3),
                "purchases_paid": r.purchases_paid,
                "active_payers": r.active_payers,
            }
            for r in rows
        ],
        "latest": {
            "stars_all": stars_all,
            "ton_all": round(ton_all / 1e9, 3),
            "payers": payers,
            "conversion": _pct(payers, humans),
            "arppu_stars": round(stars_all / payers, 1) if payers else 0,
        },
        "by_product": by_product,
    }


async def poker_dashboard(session: AsyncSession, days: int = 30) -> dict:
    """Game health: volume, showdowns, pot sizes, and how the population plays."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    lo = datetime.combine(since, time.min, tzinfo=timezone.utc)
    day_col = func.date_trunc("day", PlayerHand.created_at)

    daily = await session.execute(
        select(
            day_col.label("d"),
            func.count(),
            func.sum(func.cast(PlayerHand.showdown, Integer)),
            func.avg(PlayerHand.pot),
        )
        .where(PlayerHand.created_at >= lo)
        .group_by(day_col)
        .order_by(day_col)
    )
    series = [
        {
            "day": str(d.date()),
            "hands": int(c or 0),
            "showdowns": int(sd or 0),
            "showdown_rate": _pct(int(sd or 0), int(c or 0)),
            "avg_pot": int(avg or 0),
        }
        for d, c, sd, avg in daily.all()
    ]

    async def _c(q) -> int:
        return int(await session.scalar(q) or 0)

    total_hands = await _c(
        select(func.count()).select_from(PlayerHand).where(PlayerHand.created_at >= lo)
    )
    total_sd = await _c(
        select(func.count()).select_from(PlayerHand).where(
            PlayerHand.created_at >= lo, PlayerHand.showdown.is_(True)
        )
    )
    biggest = await _c(
        select(func.coalesce(func.max(PlayerHand.pot), 0)).where(
            PlayerHand.created_at >= lo
        )
    )
    avg_pot = await _c(
        select(func.coalesce(func.avg(PlayerHand.pot), 0)).where(
            PlayerHand.created_at >= lo
        )
    )

    # pot-size distribution (whole window)
    buckets = [
        ("< 1k", 0, 1_000),
        ("1k–5k", 1_000, 5_000),
        ("5k–20k", 5_000, 20_000),
        ("20k–100k", 20_000, 100_000),
        ("100k+", 100_000, None),
    ]
    pot_dist = []
    for label, lo_b, hi_b in buckets:
        cond = [PlayerHand.created_at >= lo, PlayerHand.pot >= lo_b]
        if hi_b is not None:
            cond.append(PlayerHand.pot < hi_b)
        pot_dist.append(
            {"label": label, "count": await _c(
                select(func.count()).select_from(PlayerHand).where(*cond)
            )}
        )

    # playing-style: aggregate the raw DNA counters for active humans
    stats = await session.execute(
        select(PlayerStats)
        .join(User, User.id == PlayerStats.user_id)
        .where(User.is_bot.is_(False), PlayerStats.hands >= 20)
    )
    styles = {"TAG": 0, "LAG": 0, "Rock": 0, "Station": 0}
    tot_vpip_o = tot_vpip = tot_pfr_o = tot_pfr = tot_agg = tot_calls = 0
    for (ps,) in stats.all():
        tot_vpip_o += ps.vpip_opps
        tot_vpip += ps.vpip
        tot_pfr_o += ps.pfr_opps
        tot_pfr += ps.pfr
        tot_agg += ps.agg_actions
        tot_calls += ps.calls
        vpip = ps.vpip / ps.vpip_opps if ps.vpip_opps else 0
        af = ps.agg_actions / ps.calls if ps.calls else (2 if ps.agg_actions else 0)
        loose = vpip >= 0.28
        aggr = af >= 1.5
        styles[
            "LAG" if (loose and aggr) else
            "Station" if loose else
            "TAG" if aggr else "Rock"
        ] += 1

    return {
        "days": series,
        "latest": {
            "hands": total_hands,
            "showdown_rate": _pct(total_sd, total_hands),
            "avg_pot": avg_pot,
            "biggest_pot": biggest,
        },
        "pot_dist": pot_dist,
        "population": {
            "vpip": _pct(tot_vpip, tot_vpip_o),
            "pfr": _pct(tot_pfr, tot_pfr_o),
            "af": round(tot_agg / tot_calls, 2) if tot_calls else 0,
            "styles": [{"label": k, "count": v} for k, v in styles.items()],
        },
    }


async def bots_dashboard(session: AsyncSession) -> dict:
    """Bot roster, whether skill actually tracks decision quality, and league fill."""
    async def _c(q) -> int:
        return int(await session.scalar(q) or 0)

    n_bots = await _c(
        select(func.count()).select_from(User).where(User.is_bot.is_(True))
    )
    n_humans = await _c(
        select(func.count()).select_from(User).where(User.is_bot.is_(False))
    )

    pers = await session.execute(
        select(User.bot_personality, func.count())
        .where(User.is_bot.is_(True))
        .group_by(User.bot_personality)
    )
    by_personality = [
        {"label": p or "—", "count": int(c or 0)} for p, c in pers.all()
    ]

    # per-bot decision quality vs configured skill
    rows = await session.execute(
        select(User.bot_skill, PlayerStats.dq_weighted, PlayerStats.dq_weight)
        .join(PlayerStats, PlayerStats.user_id == User.id)
        .where(User.is_bot.is_(True), PlayerStats.dq_weight > 0)
    )
    skills, dqs = [], []
    bands = {"0.0–0.3": [], "0.3–0.5": [], "0.5–0.7": [], "0.7–1.0": []}
    for sk, w, wt in rows.all():
        dq = (w or 0) / wt if wt else 0
        skills.append(float(sk))
        dqs.append(dq)
        b = (
            "0.0–0.3" if sk < 0.3 else
            "0.3–0.5" if sk < 0.5 else
            "0.5–0.7" if sk < 0.7 else "0.7–1.0"
        )
        bands[b].append(dq)
    dq_by_band = [
        {"label": k, "dq": round(sum(v) / len(v), 1) if v else 0, "n": len(v)}
        for k, v in bands.items()
    ]

    # league fill: how much of the ladder is carried by bots / simulation
    lo30 = datetime.now(timezone.utc) - timedelta(days=30)
    sim = await _c(
        select(func.count()).select_from(LeagueGame).where(
            LeagueGame.created_at >= lo30, LeagueGame.simulated.is_(True)
        )
    )
    real = await _c(
        select(func.count()).select_from(LeagueGame).where(
            LeagueGame.created_at >= lo30, LeagueGame.simulated.is_(False)
        )
    )
    bot_coins = await _c(
        select(func.coalesce(func.sum(User.coins), 0)).where(User.is_bot.is_(True))
    )

    return {
        "totals": {"bots": n_bots, "humans": n_humans, "bot_coins": bot_coins},
        "by_personality": sorted(by_personality, key=lambda x: -x["count"]),
        "dq_by_band": dq_by_band,
        "dq_skill_corr": _spearman(skills, dqs),
        "corr_n": len(skills),
        "league_fill": {"simulated": sim, "real": real},
    }


async def league_dashboard(session: AsyncSession) -> dict:
    """Tier shape, daily participation, and the last promotion/relegation wave."""
    from app.models import Cohort  # local import: avoids widening the module header

    async def _c(q) -> int:
        return int(await session.scalar(q) or 0)

    tiers = await session.execute(
        select(User.league_tier, User.is_bot, func.count())
        .group_by(User.league_tier, User.is_bot)
    )
    tier_map: dict[str, dict] = {}
    for tier, is_bot, c in tiers.all():
        d = tier_map.setdefault(tier, {"tier": tier, "humans": 0, "bots": 0})
        d["bots" if is_bot else "humans"] += int(c or 0)
    order = {"bronze": 0, "silver": 1, "gold": 2, "diamond": 3}
    tier_dist = sorted(tier_map.values(), key=lambda x: order.get(x["tier"], 9))

    # participation per recent season (distinct human members)
    seasons = await session.execute(
        select(
            LeagueSeason.day,
            func.count(func.distinct(CohortMember.user_id)),
        )
        .join(Cohort, Cohort.season_id == LeagueSeason.id)
        .join(CohortMember, CohortMember.cohort_id == Cohort.id)
        .where(CohortMember.is_bot.is_(False))
        .group_by(LeagueSeason.day)
        .order_by(LeagueSeason.day.desc())
        .limit(21)
    )
    participation = [
        {"day": str(day), "humans": int(c or 0)} for day, c in seasons.all()
    ][::-1]

    # outcomes of the most recent closed season (humans only)
    last_closed = await session.scalar(
        select(LeagueSeason.id)
        .where(LeagueSeason.status == "closed")
        .order_by(LeagueSeason.day.desc())
        .limit(1)
    )
    outcomes = {"promoted": 0, "held": 0, "demoted": 0}
    if last_closed:
        oc = await session.execute(
            select(CohortMember.outcome, func.count())
            .join(Cohort, Cohort.id == CohortMember.cohort_id)
            .where(
                Cohort.season_id == last_closed,
                CohortMember.is_bot.is_(False),
            )
            .group_by(CohortMember.outcome)
        )
        for outcome, c in oc.all():
            if outcome in outcomes:
                outcomes[outcome] = int(c or 0)

    return {
        "tier_dist": tier_dist,
        "participation": participation,
        "outcomes": outcomes,
    }


async def behaviour_dashboard(session: AsyncSession) -> dict:
    """User behaviour: retention triangle, feature adoption, engagement depth."""
    async def _c(q) -> int:
        return int(await session.scalar(q) or 0)

    humans = await _c(
        select(func.count()).select_from(User).where(User.is_bot.is_(False))
    )

    # --- weekly retention triangle (last 8 signup cohorts) ---
    since = datetime.now(timezone.utc) - timedelta(weeks=8)
    c_week = func.date_trunc("week", User.created_at)
    sizes = await session.execute(
        select(c_week.label("w"), func.count())
        .where(User.is_bot.is_(False), User.created_at >= since)
        .group_by(c_week)
    )
    size_map = {w: int(c or 0) for w, c in sizes.all()}

    a_week = func.date_trunc("week", PlayerHand.created_at)
    act = await session.execute(
        select(c_week.label("cw"), a_week.label("aw"), func.count(func.distinct(User.id)))
        .join(PlayerHand, PlayerHand.user_id == User.id)
        .where(User.is_bot.is_(False), User.created_at >= since)
        .group_by(c_week, a_week)
    )
    act_map: dict[tuple, int] = {}
    for cw, aw, c in act.all():
        off = (aw.date() - cw.date()).days // 7
        if off >= 0:
            act_map[(cw, off)] = int(c or 0)

    retention = []
    for cw in sorted(size_map, reverse=True):
        size = size_map[cw]
        cells = []
        for off in range(0, 5):
            r = act_map.get((cw, off), 0)
            cells.append({"pct": _pct(r, size), "n": r})
        retention.append({"cohort": str(cw.date()), "size": size, "cells": cells})

    # --- feature adoption (all-time, share of humans) ---
    played = await _c(
        select(func.count()).select_from(User).where(
            User.is_bot.is_(False), User.hands_played > 0
        )
    )
    league_users = await _c(
        select(func.count(func.distinct(CohortMember.user_id))).where(
            CohortMember.is_bot.is_(False)
        )
    )
    box_users = await _c(
        select(func.count(func.distinct(UserBox.user_id))).where(UserBox.opened.is_(True))
    )
    sellers = set(
        (await session.scalars(
            select(MarketListing.seller_id).where(MarketListing.status == "sold")
        )).all()
    )
    buyers = set(
        (await session.scalars(
            select(MarketListing.buyer_id).where(MarketListing.status == "sold")
        )).all()
    )
    traders = len((sellers | buyers) - {None})
    referred = await _c(
        select(func.count()).select_from(User).where(
            User.is_bot.is_(False), User.referred_by.isnot(None)
        )
    )
    adoption = [
        {"label": "Played a hand", "n": played, "pct": _pct(played, humans)},
        {"label": "Joined a league", "n": league_users, "pct": _pct(league_users, humans)},
        {"label": "Traded a card", "n": traders, "pct": _pct(traders, humans)},
        {"label": "Opened a box", "n": box_users, "pct": _pct(box_users, humans)},
        {"label": "Came via referral", "n": referred, "pct": _pct(referred, humans)},
    ]

    # --- engagement depth (hands played buckets) ---
    depth_defs = [
        ("0", 0, 1),
        ("1–10", 1, 11),
        ("11–50", 11, 51),
        ("51–200", 51, 201),
        ("200+", 201, None),
    ]
    depth = []
    for label, lo_b, hi_b in depth_defs:
        cond = [User.is_bot.is_(False), User.hands_played >= lo_b]
        if hi_b is not None:
            cond.append(User.hands_played < hi_b)
        depth.append({"label": label, "count": await _c(
            select(func.count()).select_from(User).where(*cond)
        )})

    return {
        "humans": humans,
        "retention": retention,
        "adoption": adoption,
        "depth": depth,
    }
