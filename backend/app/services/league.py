"""League engine: cohorts, LP, Sit & Go results, promotion, rewards.

Three decisions worth knowing about, because they're what make this affordable and
fair rather than just plausible:

1. ONE CLOCK. The league day is a single timezone for everybody. Ranking a cohort
   over "their own midnight" would give members different day lengths.

2. ONLY GAMES A HUMAN IS IN GET DEALT. Bot-vs-bot tournaments are *sampled* from the
   players' strengths (Plackett-Luce) rather than played hand by hand. Nobody would
   ever watch those hands, and 24 bots x N cohorts x 10 games of Monte-Carlo poker
   would melt a 1GB box. The result is statistically the same.

3. BOTS DON'T TAKE PRIZES. They hold ranks, they promote, they demote — they're what
   keeps a 24-seat cohort alive with three humans in it — but rewards are paid to the
   top HUMANS. A bot has no use for a card skin.
"""
from __future__ import annotations

import math
import random
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AppSetting,
    Cohort,
    CohortMember,
    LeagueGame,
    LeagueSeason,
    Notification,
    PlayerStats,
    User,
)
from app.services.economy import credit

SETTINGS_KEY = "league"

DEFAULTS: dict = {
    "enabled": True,
    "unlock_level": 10,
    "timezone": "Asia/Tehran",
    "ranked_games_per_day": 10,
    "table_size": 6,
    "start_stack": 5000,
    "bot_fill": True,
    # place -> LP. Roughly zero-sum, so grinding can't lift you: only playing better can.
    "lp": [25, 15, 8, -6, -18, -24],
    "tiers": [
        {"key": "bronze", "name": "Bronze", "capacity": 24, "promote": 8, "demote": 0},
        {"key": "silver", "name": "Silver", "capacity": 16, "promote": 5, "demote": 5},
        {"key": "gold", "name": "Gold", "capacity": 12, "promote": 4, "demote": 4},
        {"key": "diamond", "name": "Diamond", "capacity": 8, "promote": 0, "demote": 3},
    ],
    # daily payouts to the top HUMANS of each cohort, by rank band
    "rewards": [
        {"upto": 1, "coins": 25000, "gems": 5, "shards": 5},
        {"upto": 3, "coins": 12000, "gems": 2, "shards": 3},
        {"upto": 8, "coins": 5000, "gems": 0, "shards": 1},
    ],
    # shards needed to mint one exclusive league skin
    "shards_per_skin": 25,
}

TIER_KEYS = [t["key"] for t in DEFAULTS["tiers"]]


# --------------------------------------------------------------------- config


async def get_config(session: AsyncSession) -> dict:
    row = await session.get(AppSetting, SETTINGS_KEY)
    cfg = dict(DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    return cfg


async def set_config(session: AsyncSession, patch: dict) -> dict:
    row = await session.get(AppSetting, SETTINGS_KEY)
    cfg = dict(DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    cfg.update({k: v for k, v in patch.items() if v is not None})
    if row:
        row.value = cfg
    else:
        session.add(AppSetting(key=SETTINGS_KEY, value=cfg))
    return cfg


def tier_of(cfg: dict, key: str) -> dict:
    for t in cfg["tiers"]:
        if t["key"] == key:
            return t
    return cfg["tiers"][0]


def tier_index(cfg: dict, key: str) -> int:
    keys = [t["key"] for t in cfg["tiers"]]
    return keys.index(key) if key in keys else 0


def league_now(cfg: dict) -> datetime:
    try:
        return datetime.now(ZoneInfo(cfg.get("timezone") or "UTC"))
    except Exception:  # noqa: BLE001 — bad tz string shouldn't take the league down
        return datetime.now(timezone.utc)


def league_day(cfg: dict) -> date:
    return league_now(cfg).date()


def seconds_to_close(cfg: dict) -> int:
    now = league_now(cfg)
    tomorrow = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return max(0, int((tomorrow - now).total_seconds()))


# ------------------------------------------------------------------- strength


def rating_of(user: User, st: PlayerStats | None) -> float:
    """A single number for how strong a player is, used only to SAMPLE the outcome of
    games nobody watches. Bots lean on their configured skill; humans on results."""
    if user.is_bot:
        base = 1000 + 700 * float(user.bot_skill or 0.5)
    else:
        base = 1200.0
    if st and st.hands and st.hands >= 30:
        # win rate above/below the 1/6 a six-handed table gives you by chance
        wr = st.hands_won / st.hands
        base += (wr - 1 / 6) * 1200
    return max(400.0, base)


def sample_finish_order(ratings: list[float], rng: random.Random) -> list[int]:
    """Plackett-Luce: draw the winner with probability proportional to strength,
    remove them, repeat. Gives a realistic finishing order from ratings — and costs
    a few microseconds instead of a full Monte-Carlo tournament."""
    idx = list(range(len(ratings)))
    # Divisor tuned by simulation: at 250 a strong player won 44% of six-handed
    # tables, which is not poker — it's a coronation. At 500 a shark wins ~30% and a
    # fish ~7% against a 16.7% random baseline, which is about right for 6-max SNG.
    weights = [math.exp(r / 500.0) for r in ratings]
    order: list[int] = []
    while idx:
        total = sum(weights[i] for i in idx)
        pick = rng.random() * total
        acc = 0.0
        chosen = idx[-1]
        for i in idx:
            acc += weights[i]
            if pick <= acc:
                chosen = i
                break
        order.append(chosen)
        idx.remove(chosen)
    return order  # first entry = 1st place


# ------------------------------------------------------------------- seasons


async def ensure_season(session: AsyncSession) -> LeagueSeason | None:
    """Make sure today's season exists and everyone eligible is in a cohort."""
    cfg = await get_config(session)
    if not cfg.get("enabled"):
        return None

    day = league_day(cfg)
    season = await session.scalar(
        select(LeagueSeason).where(LeagueSeason.day == day)
    )
    if season is None:
        season = LeagueSeason(day=day, status="open")
        session.add(season)
        await session.flush()
        await _populate(session, season, cfg)
    return season


async def _populate(session: AsyncSession, season: LeagueSeason, cfg: dict) -> None:
    """Sort every eligible player into a cohort of their tier, then top the cohorts
    up with bots so a 24-seat Bronze isn't three humans staring at 21 empty chairs."""
    unlock = int(cfg.get("unlock_level", 10))

    humans = list(
        (
            await session.scalars(
                select(User).where(
                    User.is_bot.is_(False),
                    User.is_banned.is_(False),
                    User.level >= unlock,
                )
            )
        ).all()
    )
    bots = list(
        (await session.scalars(select(User).where(User.is_bot.is_(True)))).all()
    )

    by_tier: dict[str, list[User]] = {t["key"]: [] for t in cfg["tiers"]}
    for u in humans:
        key = u.league_tier if u.league_tier in by_tier else cfg["tiers"][0]["key"]
        by_tier[key].append(u)

    bots_by_tier: dict[str, list[User]] = {t["key"]: [] for t in cfg["tiers"]}
    for b in bots:
        key = b.league_tier if b.league_tier in bots_by_tier else cfg["tiers"][0]["key"]
        bots_by_tier[key].append(b)

    # A bot may only sit in ONE cohort per season. The spare pool is rebuilt for every
    # tier, so without this a bot got drafted into Bronze AND Silver AND Gold at once,
    # was processed several times at close, and appeared to leap two tiers in a day.
    used: set[int] = set()

    for t in cfg["tiers"]:
        key, cap = t["key"], int(t["capacity"])
        members = by_tier[key]
        pool = [b for b in bots_by_tier[key] if b.id not in used]
        # Spare bots from any tier, so a cohort can always be filled. Sorted WEAKEST
        # first and drawn from the front: tiers are populated bronze-upward, so the
        # fish sink to Bronze and the sharks are what's left by the time we reach
        # Diamond. That's the whole point of tiering — a beginner meets beginners.
        spare = sorted(
            (
                b
                for k, v in bots_by_tier.items()
                if k != key
                for b in v
                if b.id not in used
            ),
            key=lambda b: float(b.bot_skill or 0.5),
        )

        size = int(cfg.get("table_size", 6))
        n_cohorts = max(1, math.ceil(len(members) / cap)) if members else 1

        for i in range(n_cohorts):
            chunk = members[i * cap : (i + 1) * cap]

            fill: list[User] = []
            if cfg.get("bot_fill"):
                need = cap - len(chunk)
                while pool and len(fill) < need:
                    b = pool.pop()
                    if b.id not in used:
                        fill.append(b)
                while spare and len(fill) < need:
                    b = spare.pop(0)  # weakest first
                    if b.id not in used:
                        fill.append(b)

            # A cohort that can't even field one table is worse than no cohort: a
            # human promoted into it would have nobody to play. Skip it — the tier
            # comes to life once enough bots have climbed into it.
            if len(chunk) + len(fill) < size:
                for b in fill:
                    pool.append(b)  # give them back
                continue

            cohort = Cohort(season_id=season.id, tier=key, idx=i, capacity=cap)
            session.add(cohort)
            await session.flush()

            for u in chunk:
                session.add(
                    CohortMember(cohort_id=cohort.id, user_id=u.id, is_bot=False)
                )
                u.league_tier = key
                used.add(u.id)

            for b in fill:
                session.add(
                    CohortMember(cohort_id=cohort.id, user_id=b.id, is_bot=True)
                )
                # A member's tier MUST match the cohort they actually play in. Spare
                # bots get drafted upward to fill cohorts; if their league_tier stayed
                # "bronze" they'd appear to leap two tiers on promotion, and demotions
                # would silently resolve to no change at all.
                b.league_tier = key
                used.add(b.id)


# --------------------------------------------------------------------- result


async def award_place(
    session: AsyncSession,
    cohort_id: int,
    user_id: int,
    place: int,
    cfg: dict,
) -> dict | None:
    """Book one player's finish the moment it's decided — on bust or on forfeit.

    A tournament place is locked when you're eliminated: if N players remain when you
    go out, you finished N+1, and nothing later can change that. So there's no reason
    to defer LP to the end of the game.
    """
    m = await session.get(CohortMember, {"cohort_id": cohort_id, "user_id": user_id})
    if m is None:
        return None
    lp_table = cfg["lp"]
    lp = lp_table[place - 1] if place - 1 < len(lp_table) else lp_table[-1]
    cap = int(cfg["ranked_games_per_day"])

    m.games = (m.games or 0) + 1
    if place == 1:
        m.wins = (m.wins or 0) + 1
    counted = (m.ranked_games or 0) < cap
    if counted:
        m.ranked_games = (m.ranked_games or 0) + 1
        m.lp = (m.lp or 0) + lp

    u = await session.get(User, user_id)
    if u and not u.is_bot:
        session.add(
            Notification(
                user_id=user_id,
                kind="league",
                title=f"Finished {place}{_ord(place)}",
                body=(f"{'+' if lp >= 0 else ''}{lp} LP." if counted else "Doesn't count today (daily cap reached)."),
                meta={"place": place, "lp": lp if counted else 0},
            )
        )
    return {"place": place, "lp": lp if counted else 0, "counted": counted}


def _ord(n: int) -> str:
    return {1: "st", 2: "nd", 3: "rd"}.get(n if n < 20 else n % 10, "th")


async def record_result(
    session: AsyncSession,
    cohort_id: int,
    placements: list[tuple[int, bool]],  # [(user_id, is_bot)] in finishing order
    cfg: dict,
    room_code: str | None = None,
    simulated: bool = False,
) -> list[dict]:
    """Apply one Sit & Go to the standings. LP only counts while the player is inside
    their daily ranked-game cap — after that they can keep playing, it just doesn't
    move the ladder."""
    lp_table = cfg["lp"]
    cap = int(cfg["ranked_games_per_day"])
    out = []

    for place, (uid, is_bot) in enumerate(placements, start=1):
        m = await session.get(CohortMember, {"cohort_id": cohort_id, "user_id": uid})
        if m is None:
            continue
        lp = lp_table[place - 1] if place - 1 < len(lp_table) else lp_table[-1]
        m.games = (m.games or 0) + 1
        if place == 1:
            m.wins = (m.wins or 0) + 1

        counted = (m.ranked_games or 0) < cap
        if counted:
            m.ranked_games = (m.ranked_games or 0) + 1
            m.lp = (m.lp or 0) + lp
        out.append(
            {"user_id": uid, "place": place, "lp": lp if counted else 0, "is_bot": is_bot}
        )

    session.add(
        LeagueGame(
            cohort_id=cohort_id,
            room_code=room_code,
            simulated=simulated,
            results=out,
        )
    )
    return out


async def simulate_bot_games(session: AsyncSession, cfg: dict, rounds: int = 1) -> int:
    """Play out the games nobody watches — cheaply. Picks bots that still have ranked
    games left, samples a finishing order from their strengths, and books the LP."""
    if not cfg.get("enabled") or not cfg.get("bot_fill"):
        return 0
    season = await session.scalar(
        select(LeagueSeason).where(
            LeagueSeason.day == league_day(cfg), LeagueSeason.status == "open"
        )
    )
    if not season:
        return 0

    rng = random.Random()
    cap = int(cfg["ranked_games_per_day"])
    size = int(cfg["table_size"])
    played = 0

    cohorts = list(
        (
            await session.scalars(select(Cohort).where(Cohort.season_id == season.id))
        ).all()
    )
    for cohort in cohorts:
        for _ in range(rounds):
            bots = list(
                (
                    await session.scalars(
                        select(CohortMember).where(
                            CohortMember.cohort_id == cohort.id,
                            CohortMember.is_bot.is_(True),
                            CohortMember.ranked_games < cap,
                        )
                    )
                ).all()
            )
            if len(bots) < size:
                break
            table = rng.sample(bots, size)

            users = {}
            for m in table:
                u = await session.get(User, m.user_id)
                st = await session.get(PlayerStats, m.user_id)
                users[m.user_id] = rating_of(u, st) if u else 1000.0

            ids = [m.user_id for m in table]
            ratings = [users[i] for i in ids]
            order = sample_finish_order(ratings, rng)
            placements = [(ids[i], True) for i in order]
            await record_result(
                session, cohort.id, placements, cfg, simulated=True
            )
            played += 1
    return played


# ---------------------------------------------------------------------- close


async def close_season(session: AsyncSession, season: LeagueSeason, cfg: dict) -> dict:
    """Rank every cohort, promote/demote, and pay the top humans."""
    summary = {"cohorts": 0, "promoted": 0, "demoted": 0, "rewarded": 0}
    cohorts = list(
        (
            await session.scalars(select(Cohort).where(Cohort.season_id == season.id))
        ).all()
    )

    for cohort in cohorts:
        t = tier_of(cfg, cohort.tier)
        ti = tier_index(cfg, cohort.tier)
        members = list(
            (
                await session.scalars(
                    select(CohortMember).where(CohortMember.cohort_id == cohort.id)
                )
            ).all()
        )
        # LP first; a tie is broken by who needed fewer games to get there.
        members.sort(key=lambda m: (-(m.lp or 0), m.ranked_games or 0))

        promote_n = int(t.get("promote", 0))
        demote_n = int(t.get("demote", 0))
        n = len(members)

        human_rank = 0
        for i, m in enumerate(members):
            m.rank = i + 1
            user = await session.get(User, m.user_id)
            if not user:
                continue

            # Someone who never played doesn't hold a slot — otherwise cohorts
            # silently fill with ghosts who ride the ladder by doing nothing.
            played = (m.games or 0) > 0

            if i < promote_n and played:
                m.outcome = "promoted"
                new_i = min(ti + 1, len(cfg["tiers"]) - 1)
                user.league_tier = cfg["tiers"][new_i]["key"]
                summary["promoted"] += 1
            elif demote_n and i >= n - demote_n:
                m.outcome = "demoted"
                new_i = max(ti - 1, 0)
                user.league_tier = cfg["tiers"][new_i]["key"]
                summary["demoted"] += 1
            else:
                m.outcome = "held"

            # --- rewards: humans only. A bot has no use for a card skin, and if bots
            #     could take prize slots the humans would get nothing.
            if not m.is_bot and played:
                human_rank += 1
                band = next(
                    (r for r in cfg["rewards"] if human_rank <= int(r["upto"])), None
                )
                if band:
                    if band.get("coins"):
                        await credit(
                            session, user, int(band["coins"]), "league_reward",
                            meta={"tier": cohort.tier, "rank": m.rank},
                        )
                    if band.get("gems"):
                        await credit(
                            session, user, int(band["gems"]), "league_reward",
                            currency="gems", meta={"tier": cohort.tier},
                        )
                    if band.get("shards"):
                        user.league_shards = (user.league_shards or 0) + int(
                            band["shards"]
                        )
                    summary["rewarded"] += 1

                    verb = {
                        "promoted": "Promoted!",
                        "demoted": "Demoted.",
                        "held": "Season over.",
                    }[m.outcome]
                    bits = [f"{band['coins']:,} coins"] if band.get("coins") else []
                    if band.get("gems"):
                        bits.append(f"{band['gems']} gems")
                    if band.get("shards"):
                        bits.append(f"{band['shards']} shards")
                    session.add(
                        Notification(
                            user_id=user.id,
                            kind="league",
                            title=f"{verb} {t['name']} #{m.rank}",
                            body=("You earned " + " · ".join(bits) + ".")
                            if bits
                            else "",
                            meta={"tier": cohort.tier, "rank": m.rank},
                        )
                    )
        summary["cohorts"] += 1

    season.status = "closed"
    season.closed_at = datetime.now(timezone.utc)
    return summary


async def roll_over(session: AsyncSession) -> dict | None:
    """Close any open season whose day has passed, then open today's."""
    cfg = await get_config(session)
    if not cfg.get("enabled"):
        return None
    today = league_day(cfg)
    stale = list(
        (
            await session.scalars(
                select(LeagueSeason).where(
                    LeagueSeason.status == "open", LeagueSeason.day < today
                )
            )
        ).all()
    )
    result = None
    for st in stale:
        result = await close_season(session, st, cfg)
    await ensure_season(session)
    if stale:
        # a new league day -> refresh the skill-grade cutoffs from the latest
        # distribution, so grades track the population without an admin pressing a button
        try:
            from app.services import dq as DQ
            await DQ.recompute_grades(session)
        except Exception:
            pass
        # ...and snapshot the day that just ended for the analytics trends
        try:
            from datetime import timedelta
            from app.services import analytics as A
            await A.snapshot_daily(session)  # defaults to yesterday (a complete day)
            await A.snapshot_daily(session, A.datetime.now(A.timezone.utc).date())  # today so far
        except Exception:
            pass
    return result


# ----------------------------------------------------------------- scheduler


async def league_loop() -> None:
    """Rolls the day over, and keeps the bots' ladder moving.

    Bot games are spread across the day rather than all fired at 00:01 — a cohort
    where every bot's LP teleports at dawn and then freezes reads as fake.
    """
    import asyncio
    import logging

    from app.database import SessionLocal

    log = logging.getLogger("poker.league")
    await asyncio.sleep(10)  # let the app finish booting

    while True:
        try:
            async with SessionLocal() as session:
                cfg = await get_config(session)
                if cfg.get("enabled"):
                    summary = await roll_over(session)
                    if summary:
                        log.info("league rolled over: %s", summary)
                    # a trickle of bot results, so their standings creep up all day
                    n = await simulate_bot_games(session, cfg, rounds=1)
                    if n:
                        log.debug("simulated %d bot sit&gos", n)
                await session.commit()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("league loop error")
        await asyncio.sleep(180)
