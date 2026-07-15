# Decision Quality (DQ), Skill Grade & Skill Level

Grades **how well you play, not whether you won.** A good decision that loses scores
high; a lucky bad one scores low. This is the luck-free skill layer.

Code: `backend/app/poker/scoring.py` (pure math), `backend/app/services/dq.py`
(aggregation + validation), captured in `game/runtime.py`, surfaced by
`api/routes_skill.py` and the admin `/api/admin/dq`.

## Scoring one action — `poker/scoring.py::score_action`

Pure function of `(equity, pot, to_call, stack, big_blind, n_opp, action, size)`. It:

1. Estimates the **EV of each option** with a one-street model:
   - call/check: `equity·(pot+call) − call`
   - fold: `0`
   - bet/raise: `foldEquity·pot + (1−foldEquity)·[equity·(pot+2·size) − size]`
2. `DQ = 100·(1 − EV_loss/pot / K)`, where `EV_loss = best_EV − chosen_EV`,
   normalised by the pot (a mistake is judged by the *share of the pot* thrown away).
3. **Missed value ≠ mistake**: if the chosen line is itself +EV (e.g. calling the nuts
   instead of raising), its shortfall is penalised only `value_softness` (0.3) as hard
   as a genuinely losing line (spewing, folding a winner).
4. Emits a **label** (optimal / fine / loose / blunder), a **weight** (pot at stake,
   capped at `weight_cap_bb·bb` so one monster pot can't swamp an average), and **SP**.

All constants live in `scoring.DEFAULTS` and are surfaced to admin so the model can be
retuned. The model is a **heuristic** — a true solver is impossible per-action on 1 GB —
so its job is to *rank* players correctly, which the validation machine checks.

## Two player-facing ratings (deliberately different)

| | Skill **Grade** | Skill **Level** |
|---|---|---|
| Kind | percentile of the live population | cumulative Skill Points (XP-style) |
| Answers | where do I rank *now*? | how far have I *progressed*? |
| Moves | up **and down** | **never drops** |
| Storage | computed from `player_stats.dq_*` | `player_stats.skill_sp` |

### Grade — relative, percentile-based
The DQ metric is compressed at the top (most poker decisions are easy), so **absolute**
thresholds made everyone a "Master". Grades are therefore **percentile bands** of the
live population (`dq.DEFAULT_BANDS`): Master = top ~5%, down to Rookie. Cutoffs are
computed from the distribution, stored in `AppSetting["dq_grades"]`, recomputed on each
league rollover and via admin **Recompute**. "Master is the top slice" holds by
construction.

### Level — cumulative, Clash-Royale curve
Every decision earns `sp = quality^1.3 · min(pot_bb, 25)`, where `quality` only rises
above mediocre play (a blunder earns 0, but never subtracts). Levels 1–15 with an
escalating threshold table (`dq.LEVEL_THRESHOLDS`): 1–7 quick, 8–10 slower, 11–12 a
grind, 13–15 a long haul. Tiered colours Bronze/Silver/Gold/Legend.

## The validation machine — `dq.validate`

The only question for a heuristic metric: **does it rank players by skill?** It computes
the **Spearman rank-correlation** of each bot's DQ against its *configured skill* (the
labelled ground truth) and its win rate. ρ ≥ 0.5 → the metric measures skill; near 0 →
retune. Admin sees a verdict (`valid`/`weak`/`invalid`), the ρ values, a **DQ histogram
+ percentiles**, and the current grade cutoffs.

## Capture & cost

Scored in `runtime._score_decision` at each action using **true hand-vs-range equity**
(80-sample MC) — the answer key that a fish's own misjudged equity is graded against.
Buffered per hand, flushed to `player_stats` at settle (folded players included). Cheap
enough for the self-play tables; humans act rarely.

## Where it shows
- **Ranks → Skill** (level 10+, else a lock): Level badge, Grade, SP, leaderboard
  **ordered by cumulative SP**.
- **Admin → Bots**: per-bot DQ, blunder rate, worst decisions, the validation banner.

## Roadmap
Phase 2 (done): player-facing grade + level. Phase 3 (planned): a **skill tournament**
ranked by average DQ over a fixed number of hands — the best decision-maker wins, not
the luckiest.
