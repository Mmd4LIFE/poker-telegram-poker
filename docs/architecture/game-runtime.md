# The Game Runtime

The live layer that turns the pure engine into a playable, networked table.

## `game/manager.py` — GameManager (singleton)
Owns all live `RoomRuntime`s, the connection hub, and the **janitor loop** (every
`JANITOR_INTERVAL_SECONDS`, each chore isolated so one failure can't starve the rest):
`_reap_idle_seats`, `_close_idle_rooms`, `_ensure_bot_tables`, `_resume_tournaments`.
Also: `seat_player` (self-healing re-attach), `unseat_player` (refuses SNG — no cashing
out tournament chips), `forfeit_league`, `close_room`.

## `game/runtime.py` — RoomRuntime (one asyncio task per table)
The `_run` → `_tick` loop:
1. Pause if no viewers **and** not a self-play/SNG table.
2. On IDLE: for SNG, reap busted (award their place immediately) → check over → escalate
   blinds; for cash, fill bots. Then `start_hand`.
3. `_play_until_idle`: for each seat, bots decide via `ai.decide`; humans get a WebSocket
   turn with a timeout (auto check/fold). **Every action is DQ-scored** in `_apply`.
4. `_settle_hand`: persist the hand, DNA telemetry, DQ flush, stacks, league results.

## Why bot-vs-bot league games aren't dealt here
24 bots × N cohorts × 10 Monte-Carlo tournaments per day would exceed the 1 GB box.
Those are **sampled** in `services/league.simulate_bot_games` instead. A runtime task is
only spent on a table a human can actually watch.
