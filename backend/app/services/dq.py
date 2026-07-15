"""Decision-Quality aggregation + the validation machine.

DQ per player = Σ(score×weight) / Σ(weight) over their scored actions. The validation
machine answers the only question that matters for a heuristic metric: does it RANK
players by skill? It checks whether bot DQ correlates with the bots' configured skill
(the labelled ground truth) and with their win rate. If it does, the metric is sound;
if it doesn't, the model needs retuning.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PlayerStats, User

MIN_DECISIONS = 50  # below this a DQ figure is noise

# --- cumulative Skill Level (XP-style) ---------------------------------------
# Deliberately Clash-Royale-shaped: levels 1-7 come quickly, 8-10 slow down, 11-12
# are a grind, 13-15 are a long haul. The CUMULATIVE skill points needed to REACH
# each level. Distinct from the percentile GRADE: grade = where you rank now (relative,
# can move down); level = how far you've progressed (absolute, never drops).
LEVEL_THRESHOLDS = [
    0,       # 1
    100,     # 2
    250,     # 3
    500,     # 4
    900,     # 5
    1500,    # 6
    2400,    # 7   <- levels 1-7: easy
    4200,    # 8
    7000,    # 9
    11500,   # 10  <- 8-10: harder
    19000,   # 11
    31000,   # 12  <- 11-12: very hard
    52000,   # 13
    86000,   # 14
    140000,  # 15  <- 13-15: a long haul
]
MAX_LEVEL = len(LEVEL_THRESHOLDS)

# colour tiers, so the badge reads at a glance
LEVEL_TIERS = [
    {"upto": 7, "color": "#cd7f32", "tier": "Bronze"},
    {"upto": 10, "color": "#c0c0c0", "tier": "Silver"},
    {"upto": 12, "color": "#f5c518", "tier": "Gold"},
    {"upto": 15, "color": "#ff6bd6", "tier": "Legend"},
]


def _level_color(level: int) -> tuple[str, str]:
    for t in LEVEL_TIERS:
        if level <= t["upto"]:
            return t["color"], t["tier"]
    return LEVEL_TIERS[-1]["color"], LEVEL_TIERS[-1]["tier"]


def level_of(sp: int) -> dict:
    sp = max(0, int(sp or 0))
    level = 1
    for i, th in enumerate(LEVEL_THRESHOLDS):
        if sp >= th:
            level = i + 1
    floor = LEVEL_THRESHOLDS[level - 1]
    nxt = LEVEL_THRESHOLDS[level] if level < MAX_LEVEL else None
    prog = 1.0 if nxt is None else max(0.0, min(1.0, (sp - floor) / (nxt - floor)))
    color, tier = _level_color(level)
    return {
        "level": level,
        "sp": sp,
        "max_level": MAX_LEVEL,
        "floor": floor,
        "next_at": nxt,
        "progress": round(prog, 3),
        "color": color,
        "tier": tier,
    }

# Grades are RELATIVE, not absolute. The DQ metric is compressed at the top (most
# poker decisions are easy, so competent play scores 85-92) — so a fixed "Master = 85"
# makes everyone a Master. Instead each grade is a PERCENTILE band of the live
# population: Master is always the top slice, by construction, whatever the scale does.
# The band widths are admin-tunable.
GRADES_KEY = "dq_grades"

DEFAULT_BANDS = [
    {"level": 6, "name": "Master", "pct": 95, "color": "#ff6bd6"},
    {"level": 5, "name": "Expert", "pct": 80, "color": "#a06bff"},
    {"level": 4, "name": "Sharp", "pct": 55, "color": "#f5c518"},
    {"level": 3, "name": "Steady", "pct": 30, "color": "#4ade80"},
    {"level": 2, "name": "Amateur", "pct": 10, "color": "#7cc4ff"},
    {"level": 1, "name": "Rookie", "pct": 0, "color": "#9aa4b2"},
]


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    if pct <= 0:
        return sorted_vals[0]
    if pct >= 100:
        return sorted_vals[-1]
    k = (len(sorted_vals) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def thresholds_from(dqs: list[float], bands: list[dict]) -> list[dict]:
    """Turn the population's DQ values into a concrete cutoff per grade band."""
    vals = sorted(v for v in dqs if v is not None)
    out = []
    for b in bands:
        out.append({**b, "min": round(_percentile(vals, b["pct"]), 1)})
    # bands come high->low; make cutoffs monotonic just in case of ties
    return out


async def get_grades(session) -> list[dict]:
    """Current grade cutoffs — stored (admin-recomputed) or derived live as a fallback."""
    from app.models import AppSetting

    row = await session.get(AppSetting, GRADES_KEY)
    if row and isinstance(row.value, dict) and row.value.get("grades"):
        return row.value["grades"]
    dqs = await _population_dqs(session)
    return thresholds_from(dqs, DEFAULT_BANDS)


async def recompute_grades(session, bands: list[dict] | None = None) -> dict:
    """Recompute cutoffs from the live distribution and persist them."""
    from datetime import datetime, timezone

    from app.models import AppSetting

    b = bands or DEFAULT_BANDS
    dqs = await _population_dqs(session)
    grades = thresholds_from(dqs, b)
    payload = {
        "grades": grades,
        "bands": b,
        "sample": len(dqs),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    row = await session.get(AppSetting, GRADES_KEY)
    if row:
        row.value = payload
    else:
        session.add(AppSetting(key=GRADES_KEY, value=payload))
    return payload


def grade_of(dq: float | None, grades: list[dict]) -> dict:
    """Grade a DQ against dynamic (percentile) cutoffs. `grades` high->low."""
    ordered = sorted(grades, key=lambda g: g["level"])  # low -> high
    g = ordered[0]
    for cand in ordered:
        if dq is not None and dq >= cand["min"]:
            g = cand
    nxt = next((x for x in ordered if x["level"] == g["level"] + 1), None)
    prog = 0.0
    if nxt and dq is not None:
        span = nxt["min"] - g["min"]
        prog = max(0.0, min(1.0, (dq - g["min"]) / span)) if span else 1.0
    return {
        "level": g["level"], "name": g["name"], "color": g["color"], "min": g["min"],
        "next": nxt["name"] if nxt else None,
        "next_at": nxt["min"] if nxt else None,
        "progress": round(prog, 2),
    }


def compute(st: PlayerStats | None) -> dict:
    s = st or PlayerStats()
    n = int(s.dq_decisions or 0)
    w = float(s.dq_weight or 0.0)
    dq = round(float(s.dq_weighted or 0.0) / w, 1) if w else None
    return {
        "decisions": n,
        "ready": n >= MIN_DECISIONS,
        "dq": dq,
        "blunders": int(s.dq_blunders or 0),
        "blunder_rate": round(100 * (s.dq_blunders or 0) / n, 1) if n else 0.0,
        "worst": list(s.dq_worst or []),
        "skill_sp": int(s.skill_sp or 0),
    }


def _spearman(pairs: list[tuple[float, float]]) -> float | None:
    """Rank correlation. Robust to the EV model's absolute scale being arbitrary —
    all we care about is whether the ORDER matches."""
    n = len(pairs)
    if n < 4:
        return None

    def ranks(vals: list[float]) -> list[float]:
        order = sorted(range(n), key=lambda i: vals[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx = ranks([p[0] for p in pairs])
    ry = ranks([p[1] for p in pairs])
    d2 = sum((rx[i] - ry[i]) ** 2 for i in range(n))
    return round(1 - 6 * d2 / (n * (n * n - 1)), 3)


async def _population_dqs(session: AsyncSession, include_humans: bool = True) -> list[float]:
    """DQ of every rated player (bots + humans) for percentile grading and histograms."""
    q = select(PlayerStats, User).join(User, User.id == PlayerStats.user_id).where(
        PlayerStats.dq_decisions >= MIN_DECISIONS
    )
    if not include_humans:
        q = q.where(User.is_bot.is_(True))
    out = []
    for st, _u in (await session.execute(q)).all():
        d = compute(st)
        if d["dq"] is not None:
            out.append(d["dq"])
    return out


async def distribution(session: AsyncSession) -> dict:
    """Histogram + percentiles of DQ across the rated population — so the admin can SEE
    the compression and decide whether to retune the grade bands or the EV model."""
    dqs = sorted(await _population_dqs(session))
    n = len(dqs)
    if not n:
        return {"n": 0, "bins": [], "pcts": {}}
    lo, hi = dqs[0], dqs[-1]
    # 10 bins across the observed range (min span so it never collapses)
    span = max(1.0, hi - lo)
    nb = 10
    bins = [{"lo": round(lo + span * i / nb, 1),
             "hi": round(lo + span * (i + 1) / nb, 1), "n": 0} for i in range(nb)]
    for v in dqs:
        idx = min(nb - 1, int((v - lo) / span * nb))
        bins[idx]["n"] += 1
    pcts = {p: round(_percentile(dqs, p), 1) for p in (1, 10, 25, 50, 75, 90, 99)}
    return {
        "n": n, "min": round(lo, 1), "max": round(hi, 1),
        "mean": round(sum(dqs) / n, 1), "bins": bins, "pcts": pcts,
    }


async def validate(session: AsyncSession) -> dict:
    """Does DQ measure skill? Correlate bot DQ with configured skill and win rate."""
    bots = list(
        (await session.scalars(select(User).where(User.is_bot.is_(True)))).all()
    )
    ids = [b.id for b in bots]
    stats = {}
    if ids:
        rows = await session.scalars(
            select(PlayerStats).where(PlayerStats.user_id.in_(ids))
        )
        stats = {s.user_id: s for s in rows.all()}

    rows_out = []
    dq_vs_skill = []
    dq_vs_wr = []
    for b in bots:
        d = compute(stats.get(b.id))
        if not d["ready"] or d["dq"] is None:
            continue
        st = stats.get(b.id)
        wr = (
            (st.hands_won / st.hands) if st and st.hands else None
        )
        rows_out.append(
            {
                "id": b.id,
                "name": b.display_name,
                "skill": round(b.bot_skill or 0, 2),
                "dq": d["dq"],
                "blunder_rate": d["blunder_rate"],
                "decisions": d["decisions"],
                "win_rate": round(100 * wr, 1) if wr is not None else None,
            }
        )
        dq_vs_skill.append((float(b.bot_skill or 0), d["dq"]))
        if wr is not None:
            dq_vs_wr.append((wr, d["dq"]))

    rho_skill = _spearman(dq_vs_skill)
    rho_wr = _spearman(dq_vs_wr)
    verdict = (
        "valid"
        if (rho_skill is not None and rho_skill >= 0.5)
        else ("weak" if rho_skill is not None and rho_skill >= 0.2 else "invalid")
        if rho_skill is not None
        else "insufficient-data"
    )
    rows_out.sort(key=lambda r: -r["dq"])
    return {
        "bots": rows_out,
        "sample": len(dq_vs_skill),
        "min_decisions": MIN_DECISIONS,
        "rho_dq_vs_skill": rho_skill,
        "rho_dq_vs_winrate": rho_wr,
        "verdict": verdict,
    }
