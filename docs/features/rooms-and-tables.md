# Rooms & Tables

Cash tables. Code: `api/routes_rooms.py`, `game/manager.py`, `game/runtime.py`,
`models/room.py`.

## Lifecycle
- **Create** (`POST /rooms`) — blinds, buy-in range, privacy, bots; capped at
  `MAX_ACTIVE_ROOMS_PER_USER` (3) per host.
- **Quick Play** — resumes your live cash seat if any (tournaments/finished rooms are
  ignored, so it never drops you into a dead league table), else joins a between-hands
  table, else spins up a fresh one.
- **Take Seat** — a spectator buys in. Self-healing: if a `RoomPlayer` row exists but the
  live runtime never got the seat (a bot table that was already running), it re-attaches
  instead of erroring "already seated".
- **Open Tables** — a collapsible lobby list with All / Mine / Friends / Other filters.
  Host can close their table (cashes everyone out).
- **Janitor** — reaps idle seats (grace period, refund), closes rooms idle > 1h (unless
  someone's watching), resumes unfinished tournaments, keeps bot tables filled.

## `mode`
`cash` (default) or `sng` (league Sit & Go — fixed stacks, rising blinds, no rebuy, no
cash-out). A `cohort_id` ties an SNG room to its league cohort. See [league.md](league.md).
