"""An experimental league skill score — NOT yet used to rank or reward anyone.

Why it exists: today the league ranks purely on League Points, which come from where
you FINISH a Sit & Go. In a turbo tournament you can finish well by simply folding every
hand and letting the aggressive players bust each other out — survival, not skill. That
is a real, demonstrated hack.

This score is the first draft of a metric that a fold-to-survive line cannot game. It
combines four things, none of which folding earns you:

  • Decision Quality (DQ) — every action graded by expected value, luck-free. Folding a
    hand you should play is a −EV blunder, so a pure folder's DQ is low.
  • Engagement — how often you VOLUNTARILY put money in (VPIP). Peaks around a healthy
    ~30% and tapers for maniacs; a nit who folds everything scores near zero.
  • Aggression — betting and raising vs merely calling (the aggression factor). A folder
    never raises, so this is ~0 for them.
  • Chip performance — chips actually won per hand. Surviving without winning pots earns
    little; taking chips off people earns a lot.

It is computed from a player's overall play (the cumulative DNA counters), shown beside
LP in the league so we can watch how it behaves, and deliberately has NO effect on
standings, promotion, relegation or rewards yet. A later version, once validated, will.
"""
from __future__ import annotations

from math import exp

from app.services import dq as DQ

# weights — deliberately DQ-heavy, since it's the most direct skill signal
W_DQ, W_ENG, W_AGG, W_CHIP = 0.40, 0.20, 0.20, 0.20
CHIP_SCALE = 400.0  # chips/hand that maps to a clearly-good chip score


def _engagement(vpip: float) -> float:
    """0 at never-voluntarily-play, ~100 around a healthy 30% VPIP, gently tapering for
    hyper-loose maniacs (but never back to zero — they're at least playing)."""
    if vpip <= 0.30:
        return max(0.0, vpip / 0.30) * 100.0
    return max(40.0, 100.0 - (vpip - 0.30) * 100.0)


# In-league needs far fewer decisions than the lifetime metric to be meaningful — a
# league day is a handful of Sit & Gos, not a career.
IL_MIN_DECISIONS = 12


def inleague_score(m) -> dict:
    """DQ + skill score computed from a single CohortMember's IN-LEAGUE telemetry (this
    day only). Resets every day because each day is a new CohortMember row. Returns
    {dq, score} — both None until enough in-league decisions exist, so a fresh league in
    which you've played nothing shows nothing (not your lifetime number)."""
    dq_w = float(getattr(m, "il_dq_w", 0.0) or 0.0)
    dq_wt = float(getattr(m, "il_dq_wt", 0.0) or 0.0)
    dq_n = int(getattr(m, "il_dq_n", 0) or 0)
    fold = int(getattr(m, "il_fold", 0) or 0)
    call = int(getattr(m, "il_call", 0) or 0)
    rai = int(getattr(m, "il_raise", 0) or 0)
    chk = int(getattr(m, "il_check", 0) or 0)
    hands = int(getattr(m, "il_hands", 0) or 0)
    net = int(getattr(m, "il_net", 0) or 0)

    ready = dq_n >= IL_MIN_DECISIONS
    if not ready:
        return {"dq": None, "score": None, "ready": False}

    dq = round(dq_wt / dq_w, 1) if dq_w else None
    total = fold + call + rai + chk
    vpip = (call + rai) / total if total else 0.0        # voluntary participation
    af = rai / call if call else (2.0 if rai else 0.0)    # aggression factor
    dq_c = dq if dq is not None else 50.0
    eng_c = _engagement(vpip)
    agg_c = min(100.0, af / 2.0 * 100.0)
    npr = net / hands if hands else 0.0
    chip_c = 100.0 / (1.0 + exp(-npr / CHIP_SCALE))
    score = W_DQ * dq_c + W_ENG * eng_c + W_AGG * agg_c + W_CHIP * chip_c
    return {"dq": dq, "score": round(score, 1), "ready": True}


# --- virtualised score for simulated bots ----------------------------------
# Bots that fill a cohort are placed by SIMULATION (a finishing order sampled from their
# strength) — no hand is dealt, so there is no in-league telemetry to score. Rather than
# leave their DQ/Skill blank (or, worse, fake random per-hand rows), we VIRTUALISE the
# score: derive it deterministically from what the bot actually is (its configured skill
# and personality) and how it actually finished (its real LP standing). Same four
# components and 0–100 scale as a real player, so it is directly comparable — and stable:
# the same bot with the same standing always yields the same number.

# Per-personality table play style → (characteristic VPIP, aggression factor).
_BOT_PROFILE: dict[str, tuple[float, float]] = {
    "rock":       (0.12, 1.1),
    "tight":      (0.20, 1.8),
    "balanced":   (0.28, 2.4),
    "loose":      (0.42, 1.6),
    "aggressive": (0.32, 3.6),
    "maniac":     (0.55, 4.8),
}
# Small DQ tilt: chronic over-folding (rock) and over-playing (maniac) are −EV habits the
# skill metric is designed to punish, so they shade decision quality down a touch.
_DQ_TILT: dict[str, float] = {
    "rock": -6, "tight": -1, "balanced": 2, "loose": -3, "aggressive": 1, "maniac": -7,
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def virtual_inleague_score(bot_skill: float | None, bot_personality: str | None,
                           lp: int, ranked_games: int, cfg: dict) -> dict:
    """DQ + Skill for a simulated bot, derived (not sampled) from its identity + standing.

    • DQ        ← the bot's configured skill (a strong bot decides better), tilted by the
                  −EV habits of its personality.
    • Engagement/Aggression ← that personality's characteristic VPIP and aggression factor.
    • Chip performance ← its ACTUAL average LP per ranked game, so a bot climbing the
                  ladder shows a better score than one sinking — the number tracks reality.
    """
    skill = _clamp(float(bot_skill if bot_skill is not None else 0.5), 0.0, 1.0)
    pers = bot_personality if bot_personality in _BOT_PROFILE else "balanced"
    vpip, af = _BOT_PROFILE[pers]

    dq = _clamp(40.0 + 45.0 * skill + _DQ_TILT.get(pers, 0.0), 15.0, 95.0)
    eng_c = _engagement(vpip)
    agg_c = min(100.0, af / 2.0 * 100.0)

    lp_tab = cfg.get("lp") or [0]
    lp_top = max(1.0, float(max(lp_tab)))
    avg_lp = (lp or 0) / max(1, ranked_games or 0)
    chip_c = 100.0 / (1.0 + exp(-avg_lp / (lp_top * 0.5)))   # 50 at par, →100 dominating

    score = W_DQ * dq + W_ENG * eng_c + W_AGG * agg_c + W_CHIP * chip_c
    return {"dq": round(dq, 1), "score": round(score, 1), "ready": True, "virtual": True}


def league_skill_score(st) -> dict:
    """Return the experimental score (0–100) and its components for one player's
    PlayerStats. Safe on None / empty stats (returns a neutral-ish low score)."""
    d = DQ.compute(st)
    vpip_opps = int(getattr(st, "vpip_opps", 0) or 0)
    pfr_opps = int(getattr(st, "pfr_opps", 0) or 0)
    calls = int(getattr(st, "calls", 0) or 0)
    agg = int(getattr(st, "agg_actions", 0) or 0)
    hands = int(getattr(st, "hands", 0) or 0)
    net = int(getattr(st, "net_won", 0) or 0)

    vpip = (int(getattr(st, "vpip", 0) or 0) / vpip_opps) if vpip_opps else 0.0
    af = agg / calls if calls else (2.0 if agg else 0.0)

    dq_c = d["dq"] if d["dq"] is not None else 50.0          # decision quality
    eng_c = _engagement(vpip)                                 # engagement
    agg_c = min(100.0, af / 2.0 * 100.0)                      # aggression
    npr = net / hands if hands else 0.0
    chip_c = 100.0 / (1.0 + exp(-npr / CHIP_SCALE))           # chip performance (sigmoid)

    score = W_DQ * dq_c + W_ENG * eng_c + W_AGG * agg_c + W_CHIP * chip_c
    # not enough decisions yet → the score isn't trustworthy; flag it, don't hide it
    ready = d["decisions"] >= DQ.MIN_DECISIONS
    return {
        "score": round(score, 1),
        "ready": ready,
        "components": {
            "dq": round(dq_c, 1),
            "engagement": round(eng_c, 1),
            "aggression": round(agg_c, 1),
            "chips": round(chip_c, 1),
        },
        "vpip": round(vpip * 100, 1),
        "af": round(af, 2),
    }
