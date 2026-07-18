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
