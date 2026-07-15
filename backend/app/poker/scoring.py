"""Decision-Quality (DQ) scoring — grade a poker action by its EV, not its outcome.

The one idea: a good decision can lose and a bad decision can win. We grade the
*choice*, against the best option available in that exact spot, using a cheap
one-street EV model. It is deliberately a heuristic — a true solver is impossible
per-action on this hardware — so its job is not to be perfect but to RANK players
correctly, which the validation machine checks against the known-strength bot ladder.

Everything here is a pure function of (equity, pot, to_call, stack, action, size).
No I/O, no ORM — so the EV math can be tested on its own.
"""
from __future__ import annotations

# --- tunable model constants (surfaced to admin so the model can be retuned) ---
DEFAULTS = {
    # fold equity of a pot-sized bet, heads-up. Scaled down by size and opponents.
    "base_fold_equity": 0.42,
    # the canonical raise size (fraction of pot) used to price the *aggressive*
    # alternative when deciding the best action
    "canon_raise_frac": 0.66,
    # EV loss (as a fraction of the pot) that maps to DQ = 0. Smaller = harsher.
    "blunder_pot_frac": 0.60,
    # a decision scoring at or below this is labelled a blunder
    "blunder_score": 40.0,
    # choosing a LESSER +EV line (calling the nuts instead of raising) is "missed
    # value", not a blunder — its EV shortfall is penalised only this fraction as hard
    # as an actually-losing line (spewing chips, folding a winner)
    "value_softness": 0.30,
    # per-decision weight is min(pot, cap × big_blind) — bounds a monster pot so it
    # can't dominate a player's whole average
    "weight_cap_bb": 120.0,
}

LABELS = ("blunder", "loose", "fine", "optimal")


def _fold_equity(bet: float, pot: float, n_opp: int, cfg: dict) -> float:
    """Rough chance everyone folds to a bet of `bet` into `pot` against n_opp players."""
    if pot <= 0 or bet <= 0:
        return 0.0
    frac = bet / pot
    fe = cfg["base_fold_equity"] * min(1.5, frac) / max(1, n_opp)
    return max(0.0, min(0.85, fe))


def _passive_ev(equity: float, pot: float, to_call: float, stack: float) -> float:
    """EV of check (to_call 0) or call. One-street: win pot+call with prob=equity."""
    if to_call <= 0:
        return equity * pot
    call = min(to_call, stack)
    return equity * (pot + call) - call


def _aggressive_ev(
    equity: float, pot: float, to_call: float, raise_extra: float, n_opp: int, cfg: dict
) -> float:
    """EV of betting/raising `raise_extra` chips on top of any call.

    Either everyone folds (win the current pot), or we get called and play the pot
    heads-up-ish with our equity. A blunt but directionally-sound one-street model.
    """
    invest = to_call + raise_extra
    fe = _fold_equity(invest, pot + to_call, n_opp, cfg)
    ev_fold_out = pot  # they fold, we take what's there
    called_pot = pot + 2 * invest
    ev_called = equity * called_pot - invest
    return fe * ev_fold_out + (1 - fe) * ev_called


def score_action(
    *,
    equity: float,
    pot: int,
    to_call: int,
    stack: int,
    big_blind: int,
    n_opp: int,
    action: str,
    raise_to: int = 0,
    current_bet: int = 0,
    cfg: dict | None = None,
) -> dict:
    """Grade one action. Returns dq (0-100), label, ev_loss, weight, and the EVs.

    `action` in fold|check|call|raise|all-in. `raise_to` is the total this player is
    at after a raise (so the extra chips = raise_to - current_bet ... - already in).
    """
    c = {**DEFAULTS, **(cfg or {})}
    pot = max(0, int(pot))
    to_call = max(0, int(to_call))
    stack = max(0, int(stack))
    n_opp = max(1, int(n_opp))
    eq = max(0.0, min(1.0, float(equity)))

    # EV of each strategic option, in chips
    fold_ev = 0.0
    passive_ev = _passive_ev(eq, pot, to_call, stack)
    canon_extra = max(big_blind, c["canon_raise_frac"] * (pot + to_call))
    canon_extra = min(canon_extra, max(0, stack - to_call))
    aggressive_ev = (
        _aggressive_ev(eq, pot, to_call, canon_extra, n_opp, c)
        if stack > to_call
        else -1e9
    )

    best_ev = max(fold_ev, passive_ev, aggressive_ev)

    # EV of what they actually did
    act = action.lower()
    if act == "fold":
        chosen_ev = fold_ev
    elif act in ("check", "call"):
        chosen_ev = passive_ev
    else:  # raise / bet / all-in
        extra = max(0, int(raise_to) - int(current_bet))
        chosen_ev = _aggressive_ev(eq, pot, to_call, extra, n_opp, c)

    # normalise the loss by the pot — a mistake is judged by the SHARE of the pot
    # thrown away, not raw chips
    denom = max(pot + to_call, big_blind, 1)
    shortfall = max(0.0, best_ev - chosen_ev)
    # Missed value vs a real mistake. If the line you chose is itself +EV, you didn't
    # blunder — you just left some value; penalise that softly. Choosing a LOSING line
    # when a non-losing one existed is the actual error and takes the full hit.
    if chosen_ev >= 0:
        shortfall *= c["value_softness"]
    ev_loss_frac = shortfall / denom
    dq = 100.0 * (1.0 - min(1.0, ev_loss_frac / c["blunder_pot_frac"]))

    if dq >= 85:
        label = "optimal"
    elif dq >= 65:
        label = "fine"
    elif dq > c["blunder_score"]:
        label = "loose"
    else:
        label = "blunder"

    # weight: pot at stake, capped so one huge pot can't dominate the average
    weight = min(float(denom), c["weight_cap_bb"] * max(1, big_blind))

    # Skill points: cumulative, XP-style. Only ABOVE-mediocre decisions earn, scaled by
    # how good AND how big the pot — so grinding tiny pots or playing badly barely moves
    # it, while strong play in real pots accrues. A blunder earns nothing (but never
    # subtracts — it's cumulative).
    quality = max(0.0, min(1.0, (dq - 40.0) / 60.0))
    pot_bb = min(denom / max(1, big_blind), 25.0)
    sp = round(quality ** 1.3 * pot_bb, 2)

    return {
        "dq": round(dq, 1),
        "label": label,
        "sp": sp,
        "ev_loss_frac": round(ev_loss_frac, 3),
        "weight": round(weight, 1),
        "best": round(best_ev, 1),
        "chosen": round(chosen_ev, 1),
        "evs": {
            "fold": round(fold_ev, 1),
            "passive": round(passive_ev, 1),
            "aggressive": round(aggressive_ev, 1),
        },
    }
