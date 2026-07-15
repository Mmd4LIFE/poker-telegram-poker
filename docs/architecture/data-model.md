# Data Model

ORM in `backend/app/models/`. All migrations are idempotent (`ADD COLUMN IF NOT EXISTS`,
table-existence checks) — a fresh DB and an upgraded one converge.

## Core
- **user.py** — `User`: identity, avatar/cosmetics, coins/gems, XP level, stats,
  referral, daily streak + timezone, `bot_started`, `league_tier`, `league_shards`,
  bot fields (`is_bot`, `bot_personality`, `bot_skill`).
- **room.py** — `Room` (+ `mode`, `cohort_id`, `is_bot_table`, `last_active_at`),
  `RoomPlayer`, `Hand`.
- **economy.py** — `Transaction` (the ledger), `Product`, `Box`, `UserBox`, `Purchase`.

## Feature tables
- **cards.py** — `CardDesign`, `CardSkin` (`uid` + `serial`), `MarketListing`,
  `AppSetting` (runtime-tunable JSON knobs: market fee, dq grades, league config,
  daily reminder).
- **league.py** — `LeagueSeason`, `Cohort`, `CohortMember`, `LeagueGame`.
- **dna.py** — `PlayerStats`: DNA behavioural counters + DQ (`dq_*`, `skill_sp`).
- **marketing.py** — `Segment`, `SegmentUser`, `Broadcast`, `Notification`.
- **social.py** — `Friendship`, `PlayerHand`. **squad.py** — `Squad`, `SquadMember`,
  `SquadMessage`. **progression.py** — achievements & challenges.

## AppSetting — the tunable knobs
A key→JSON table for things admins change without a deploy: `market_fee_pct`,
`dq_grades`, `league`, `daily_reminder`. Prefer this over new columns for config.
