# Poker CM — Documentation

**Poker CM** is a production No-Limit Texas Hold'em game that lives inside Telegram: a
Python/FastAPI backend, a Postgres database, and a Next.js Mini App, all behind a
Cloudflare Tunnel. It has real-money-adjacent economy mechanics (Telegram Stars, TON),
a card-skin collectibles market, AI opponents with measurable playing styles, a daily
competitive league, and an EV-based skill-rating system.

This folder is the source of truth for **how the system works and why it's built the
way it is.** If you're picking this project up, read [architecture/overview.md](architecture/overview.md)
first, then the feature docs for whatever you're touching.

> The single most important design principle in this codebase: **money is real, so the
> integrity rules are not negotiable.** Tournament chips are never coins, market fees
> are burned not banked, minted supply is finite, and every balance change goes through
> one ledger. When a change touches the economy, re-read [features/economy.md](features/economy.md).

---

## Map

### Architecture
- [architecture/overview.md](architecture/overview.md) — the whole system on one page
- [architecture/data-model.md](architecture/data-model.md) — the tables and how they relate
- [architecture/game-runtime.md](architecture/game-runtime.md) — how a hand is actually dealt

### Features (what the product does)
- [features/rooms-and-tables.md](features/rooms-and-tables.md) — cash tables, seating, quick play
- [features/poker-engine.md](features/poker-engine.md) — the pure Hold'em engine + evaluator
- [features/bots-and-ai.md](features/bots-and-ai.md) — opponents, range-based equity, personalities
- [features/poker-dna.md](features/poker-dna.md) — the 7-axis behavioural radar
- [features/decision-quality.md](features/decision-quality.md) — EV-based scoring, skill grade & level
- [features/league.md](features/league.md) — the daily cohort league (Sit & Go ladder)
- [features/cards-and-market.md](features/cards-and-market.md) — card skins, minting, the player market
- [features/economy.md](features/economy.md) — coins, gems, the ledger, sinks & faucets
- [features/squads.md](features/squads.md) — clans
- [features/notifications.md](features/notifications.md) — in-app bell + bot DMs
- [features/marketing.md](features/marketing.md) — audience segments & broadcasts
- [features/daily-and-referrals.md](features/daily-and-referrals.md) — daily reward ladder, invites
- [features/admin.md](features/admin.md) — the admin panel surface

### Product / PRDs (where a feature is going)
- [prd/clubs.md](prd/clubs.md) — Squads → **Clubs**: the zero-to-hero plan (club games,
  club leaderboard, progression, Club Wars, club economy, anti-collusion)

### Backend
- [backend/api-reference.md](backend/api-reference.md) — every REST route
- [backend/models.md](backend/models.md) — ORM models, one line each
- [backend/migrations.md](backend/migrations.md) — the Alembic chain and its rules

### Frontend
- [frontend/overview.md](frontend/overview.md) — Next.js structure, screens, state

### Operations
- [operations/deployment.md](operations/deployment.md) — how a change reaches the server
- [operations/environment.md](operations/environment.md) — env vars & secrets
- [operations/runbook.md](operations/runbook.md) — common incidents & fixes

---

## Conventions used throughout these docs

- **"Runtime"** = the per-room async game loop (`app/game/runtime.py`), one task per live table.
- **"DQ"** = Decision Quality, the EV-based per-action score.
- **"SP"** = Skill Points, the cumulative XP-style skill total.
- **"LP"** = League Points, awarded by finishing place in a Sit & Go.
- Money is always **coins** (soft) or **gems** (premium). Never mix them in one figure.

