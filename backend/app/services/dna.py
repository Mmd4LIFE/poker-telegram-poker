"""Poker DNA — seven axes derived from how a player actually plays.

Two rules keep this honest:

1. The radar reflects *behaviour*, never configuration. A bot configured "aggressive"
   that folds all day shows up as passive, because that's the truth.

2. Poker stats are mostly noise early on: VPIP needs ~100 hands to mean anything,
   showdown stats need many more. So every axis is SHRUNK toward a neutral prior by
   its own sample size (empirical Bayes). With few hands the radar sits near the
   middle and says so; with many, the player's real character emerges. Without this
   the chart would swing wildly on a 20-hand sample and look broken.
"""
from __future__ import annotations

from dataclasses import dataclass, fields
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # the ORM row satisfies this shape; we only ever touch attributes
    from app.models import PlayerStats

# A radar is only shown once the player has enough hands for it to mean something.
MIN_HANDS = 100

# How many hands after a big loss count as "tilt window".
TILT_WINDOW = 8
# A loss counts as bruising if it costs this much of the stack you started with.
TILT_LOSS_FRACTION = 0.35

AXES = [
    {"key": "aggression", "label": "Aggression", "blurb": "Bets and raises rather than calling"},
    {"key": "discipline", "label": "Discipline", "blurb": "Folds weak hands instead of chasing"},
    {"key": "deception", "label": "Deception", "blurb": "Bluffs, traps and check-raises"},
    {"key": "reading", "label": "Hand Reading", "blurb": "Only shows down when ahead"},
    {"key": "position", "label": "Position", "blurb": "Opens up on the button, tightens up early"},
    {"key": "composure", "label": "Composure", "blurb": "Play doesn't change after a bad beat"},
    {"key": "adaptation", "label": "Adaptation", "blurb": "Responds to pressure instead of ignoring it"},
]


@dataclass
class _Zero:
    """A statless player. Keeps this module free of the ORM, so the formulas can be
    exercised (and self-play simulated) without a database."""

    hands: int = 0
    vpip_opps: int = 0
    vpip: int = 0
    pfr_opps: int = 0
    pfr: int = 0
    agg_actions: int = 0
    calls: int = 0
    folds: int = 0
    checks: int = 0
    cbet_opps: int = 0
    cbets: int = 0
    saw_flop: int = 0
    showdowns: int = 0
    showdowns_won: int = 0
    aggressor_hands: int = 0
    won_without_showdown: int = 0
    check_raises: int = 0
    agg_postflop: int = 0
    bluffs: int = 0
    late_opps: int = 0
    late_vpip: int = 0
    early_opps: int = 0
    early_vpip: int = 0
    tilt_actions: int = 0
    tilt_agg_actions: int = 0
    tilt_window: int = 0
    faced_actions: int = 0
    faced_agg: int = 0
    unopened_actions: int = 0
    unopened_agg: int = 0
    net_won: int = 0


def blank() -> _Zero:
    return _Zero()


def _shrink(made: int, opps: int, prior: float, weight: float) -> float:
    """Observed rate pulled toward `prior`, by a sample worth `weight` observations."""
    return (made + prior * weight) / (opps + weight) if (opps + weight) else prior


def _scale(x: float, lo: float, hi: float) -> float:
    """Map a poker rate onto 0..100 using its realistic range, not 0..1."""
    if hi <= lo:
        return 50.0
    return max(0.0, min(100.0, (x - lo) / (hi - lo) * 100.0))


def compute(st: PlayerStats | None) -> dict:
    """The seven axes, each 0-100, plus the raw stats behind them."""
    s = st or _Zero()

    # --- Aggression: postflop aggression factor, plus preflop raise rate.
    af_raw = _shrink(s.agg_actions, s.calls, prior=1.0, weight=20)
    pfr = _shrink(s.pfr, s.pfr_opps, prior=0.18, weight=40)
    aggression = 0.6 * _scale(af_raw, 0.3, 3.0) + 0.4 * _scale(pfr, 0.05, 0.40)

    # --- Discipline: tight players enter few pots and fold when beaten. VPIP is
    #     inverted — a 70% VPIP is not discipline, it's a leak.
    vpip = _shrink(s.vpip, s.vpip_opps, prior=0.30, weight=40)
    fold_rate = _shrink(s.folds, s.folds + s.calls + s.agg_actions, prior=0.4, weight=20)
    discipline = 0.65 * (100 - _scale(vpip, 0.12, 0.65)) + 0.35 * _scale(fold_rate, 0.2, 0.65)

    # --- Deception: how often they fire with NOTHING. The first version of this
    #     measured "won without showdown", which turned out to measure fold equity,
    #     not bluffing: the feared rock scored highest and the transparent maniac —
    #     who bluffs constantly but always gets called — scored lowest. Betting air
    #     is the bluff; getting away with it is a different (and enviable) skill.
    bluff = _shrink(s.bluffs, s.agg_postflop, prior=0.22, weight=25)
    cr = _shrink(s.check_raises, max(1, s.saw_flop), prior=0.06, weight=40)
    deception = 0.75 * _scale(bluff, 0.02, 0.55) + 0.25 * _scale(cr, 0.0, 0.12)

    # --- Hand Reading: a good reader only pays off when ahead, so their showdown
    #     win rate is high AND they don't reach showdown indiscriminately.
    wsd = _shrink(s.showdowns_won, s.showdowns, prior=0.45, weight=25)
    wtsd = _shrink(s.showdowns, max(1, s.saw_flop), prior=0.30, weight=30)
    reading = 0.75 * _scale(wsd, 0.30, 0.70) + 0.25 * (100 - _scale(wtsd, 0.15, 0.60))

    # --- Position: the gap between how wide they play late vs early.
    late = _shrink(s.late_vpip, s.late_opps, prior=0.32, weight=25)
    early = _shrink(s.early_vpip, s.early_opps, prior=0.24, weight=25)
    position = _scale(late - early, -0.05, 0.30)

    # --- Composure: aggression inside the tilt window vs their own baseline. Steady
    #     = 100. Spewing OR freezing after a beat both cost you — it's the *change*
    #     that signals tilt, in either direction.
    base_agg = _shrink(
        s.agg_actions, s.agg_actions + s.calls + s.checks + s.folds, prior=0.25, weight=30
    )
    tilt_agg = _shrink(s.tilt_agg_actions, s.tilt_actions, prior=base_agg, weight=25)
    composure = 100 - _scale(abs(tilt_agg - base_agg), 0.0, 0.30)

    # --- Adaptation: does their aggression actually respond to being pressured?
    #     A player whose aggression is identical whether the pot is raised or folded
    #     to them isn't reading the table at all.
    faced = _shrink(s.faced_agg, s.faced_actions, prior=0.20, weight=25)
    unopened = _shrink(s.unopened_agg, s.unopened_actions, prior=0.30, weight=25)
    adaptation = _scale(abs(unopened - faced), 0.0, 0.35)

    # Every axis is finally regressed toward neutral by how much evidence actually
    # backs IT — not by total hands. Showdown stats are rare, so Hand Reading stays
    # cautious long after Aggression has firmed up. With zero data the radar is a
    # perfect neutral heptagon, which is the honest picture of knowing nothing.
    EV = 40.0
    evidence = {
        "aggression": s.agg_actions + s.calls + s.pfr_opps,
        "discipline": s.vpip_opps,
        "deception": s.agg_postflop,
        "reading": s.showdowns,
        "position": s.late_opps + s.early_opps,
        "composure": s.tilt_actions,
        "adaptation": s.faced_actions + s.unopened_actions,
    }
    raw_scores = {
        "aggression": aggression,
        "discipline": discipline,
        "deception": deception,
        "reading": reading,
        "position": position,
        "composure": composure,
        "adaptation": adaptation,
    }
    scores = {
        k: 50.0 + (v - 50.0) * (evidence[k] / (evidence[k] + EV))
        for k, v in raw_scores.items()
    }
    return {
        "hands": s.hands,
        "ready": s.hands >= MIN_HANDS,
        "hands_needed": max(0, MIN_HANDS - s.hands),
        "min_hands": MIN_HANDS,
        # confidence rises with sample size — the UI dims a thin radar rather than
        # pretending a 30-hand read is gospel
        "confidence": round(min(1.0, s.hands / (MIN_HANDS * 3)), 2),
        "axes": AXES,
        "scores": {k: round(v, 1) for k, v in scores.items()},
        "evidence": evidence,
        "raw": {
            "vpip": round(100 * vpip, 1),
            "pfr": round(100 * pfr, 1),
            "af": round(af_raw, 2),
            "wsd": round(100 * wsd, 1),
            "wtsd": round(100 * wtsd, 1),
            "cbet": round(
                100 * _shrink(s.cbets, s.cbet_opps, prior=0.5, weight=20), 1
            ),
            "bluff": round(100 * bluff, 1),
            "net_won": s.net_won,
        },
    }


def style_of(scores: dict) -> str:
    """A short human label — the two dominant traits, in poker's own vocabulary."""
    tight = scores["discipline"] >= 55
    aggro = scores["aggression"] >= 55
    if tight and aggro:
        return "Tight-Aggressive"
    if tight:
        return "Tight-Passive"
    if aggro:
        return "Loose-Aggressive"
    return "Loose-Passive"


# --------------------------------------------------------------------------- ingest


def ingest_hand(
    st,  # PlayerStats row, or anything with the same counters
    user_id: int,
    hand_log: list[dict],
    preflop_aggressor: int | None,
    saw_flop: bool,
    went_to_showdown: bool,
    won_showdown: bool,
    won_amount: int,
    committed: int,
    start_stack: int,
) -> None:
    """Fold one finished hand into a player's counters. Pure integer arithmetic —
    this runs on the game loop, so it must stay cheap."""
    mine = [a for a in hand_log if a["user_id"] == user_id]
    if not mine:
        return

    st.hands += 1
    st.net_won += won_amount - committed

    in_tilt = st.tilt_window > 0
    if in_tilt:
        st.tilt_window -= 1

    preflop = [a for a in mine if a["street"] == "preflop"]
    postflop = [a for a in mine if a["street"] != "preflop"]

    # --- preflop: the first voluntary decision is the one that counts
    if preflop:
        first = preflop[0]
        voluntary = first["pos"] != "blind"
        entered = any(a["action"] in ("call", "raise", "all-in") for a in preflop)
        raised = any(a["action"] in ("raise", "all-in") for a in preflop)
        if voluntary:
            st.vpip_opps += 1
            st.pfr_opps += 1
            if entered:
                st.vpip += 1
            if raised:
                st.pfr += 1
            if first["pos"] == "late":
                st.late_opps += 1
                if entered:
                    st.late_vpip += 1
            elif first["pos"] == "early":
                st.early_opps += 1
                if entered:
                    st.early_vpip += 1

    # --- postflop action mix
    for a in postflop:
        act = a["action"]
        if act in ("raise", "all-in"):
            st.agg_actions += 1
            st.agg_postflop += 1
            if a.get("made") == 0:      # high card — pure air
                st.bluffs += 1
        elif act == "call":
            st.calls += 1
        elif act == "fold":
            st.folds += 1
        elif act == "check":
            st.checks += 1

    # --- every action feeds Composure and Adaptation
    for a in mine:
        aggressive = a["action"] in ("raise", "all-in")
        if in_tilt:
            st.tilt_actions += 1
            if aggressive:
                st.tilt_agg_actions += 1
        if a["faced_raise"]:
            st.faced_actions += 1
            if aggressive:
                st.faced_agg += 1
        else:
            st.unopened_actions += 1
            if aggressive:
                st.unopened_agg += 1

    # --- check-raise: checked, then raised, on the same street
    by_street: dict[str, list[str]] = {}
    for a in postflop:
        by_street.setdefault(a["street"], []).append(a["action"])
    for acts in by_street.values():
        if "check" in acts and any(x in ("raise", "all-in") for x in acts):
            if acts.index("check") < max(
                i for i, x in enumerate(acts) if x in ("raise", "all-in")
            ):
                st.check_raises += 1
                break

    # --- continuation bet: raised preflop, then first to bet the flop
    if preflop_aggressor == user_id:
        flop = [a for a in mine if a["street"] == "flop"]
        if flop:
            st.cbet_opps += 1
            if flop[0]["action"] in ("raise", "all-in"):
                st.cbets += 1

    if saw_flop:
        st.saw_flop += 1
    if went_to_showdown:
        st.showdowns += 1
        if won_showdown:
            st.showdowns_won += 1

    # --- Deception: was the aggressor and took it down with no showdown
    was_aggressor = any(a["action"] in ("raise", "all-in") for a in mine)
    if was_aggressor:
        st.aggressor_hands += 1
        if won_amount > 0 and not went_to_showdown:
            st.won_without_showdown += 1

    # --- open a tilt window after a bruising loss
    lost = committed - won_amount
    if start_stack > 0 and lost >= start_stack * TILT_LOSS_FRACTION:
        st.tilt_window = TILT_WINDOW
