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
