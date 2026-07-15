# The Daily League

A **cohort ladder** (Duolingo-shaped): everyone past the unlock level is dropped into a
group at midnight, plays Sit & Go tournaments all day, and the top slice promotes / the
bottom demotes at close. Code: `services/league.py`, `api/routes_league.py`, tournament
mechanics in `game/runtime.py`.

## Shape

| Tier | Cohort size | Promote | Demote |
|---|---|---|---|
| Bronze | 24 | top 8 | — |
| Silver | 16 | top 5 | bottom 5 |
| Gold | 12 | top 4 | bottom 4 |
| Diamond | 8 | — | bottom 3 |

Multiple cohorts per tier once the population outgrows one. Config (all admin-tunable)
lives in `AppSetting["league"]`, defaults in `league.DEFAULTS`.

## Four decisions that make it work

1. **One clock.** The league day runs on a single timezone (`Asia/Tehran` default), not
   each player's own — otherwise cohort members would get different day lengths and the
   ranking would be a lie.
2. **Ranked games capped (10/day).** LP is near **zero-sum** per table
   (`lp = [25,15,8,-6,-18,-24]`), so grinding can't lift you — only playing better can.
   Verified: LP sums to ~0 over 20k simulated tables.
3. **Only games a human is in get dealt.** Bot-vs-bot Sit & Gos are **sampled** from
   player strength via Plackett-Luce (`sample_finish_order`), not played hand by hand —
   nobody would watch them, and 24 bots × N cohorts × 10 MC tournaments would melt the
   box. The strength divisor is tuned so a shark wins ~30% and a fish ~7% (16.7% random
   baseline).
4. **Bots don't take prizes.** They hold ranks, promote and demote — that's what keeps a
   24-seat cohort alive with three humans in it — but rewards go to the top **humans**.

## Sit & Go mechanics (`runtime.py`)

- Fixed 5,000 stacks, **turbo blind escalation** (a no-rebuy tournament with static
  blinds can never end), **no rebuys**, play to the death.
- Bust-outs recorded worst-first into finishing places.
- **LP is awarded the instant you're eliminated** — your place is locked the moment you
  bust (if N remain, you're N+1). Not deferred to game end.
- **Leaving forfeits** at your current standing, LP booked immediately — the anti-coast
  rule (a folding abandoned seat could otherwise ladder up). Confirmed with a dialog
  showing the exact stakes.
- Tournament chips are **not money**: `unseat_player`/rebuy refuse SNG rooms, so busting
  can never mint coins.

## Rewards & the market loop

Daily payouts (coins + gems + **League Shards**) to the top humans. Shards — not a skin
per day — mint the exclusive **Champion** card skin (`shards_per_skin`, mythic, capped
at 50/card, unbuyable). This closes a loop: **play → earn shards → mint a scarce skin →
the market prices it → its trade fee burns coins.**

## Integrity: no chosen seating

League tables are `is_private`, random-seated, and un-shareable (the invite button is
hidden on SNG tables). Choosing who you sit with is the collusion vector, so it's
closed by construction.

## Admin
`Admin → League`: cohort standings (bots labelled by personality/skill), **Close day
now**, **Sim N rounds**, and the config knobs. Bot league roadmaps are in each bot's
detail sheet.
