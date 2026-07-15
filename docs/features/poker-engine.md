# The Poker Engine (`poker/`)

A **pure** No-Limit Hold'em implementation — no I/O, no framework, unit-testable and
headlessly simulatable. This purity is why the AI, DQ model, league math, and blind
rules can all be validated offline.

## Files
- **cards.py** — a card is a 2-char string (`Kh`); CSPRNG deck (`make_deck`, `shuffle`).
- **evaluator.py** — 7-card hand evaluator → `(score_tuple, best_five, category_name)`.
- **holdem.py** — `HoldemGame` state machine: seats, blinds, streets, betting, side pots,
  showdown. Per-hand `hand_log` (position, faced-a-raise, and the hand actually held on
  aggressive actions) powers telemetry. `public_state(viewer_id)` serialises per-viewer
  (hole cards hidden unless it's you or showdown).
- **ai.py**, **ranges.py**, **scoring.py** — see [bots](bots-and-ai.md) and
  [decision-quality](decision-quality.md).

## Integrity highlights
- **Post-to-enter blind**: a player joining a running game owes a live big blind on their
  first hand (top-up, not addition — an SB-seated newcomer pays to reach the BB, not on
  top). Without it, whether a newcomer paid was luck of the button.
- Side-pot accounting via per-seat `committed`.
- 300-game simulations verified zero chip leaks.
