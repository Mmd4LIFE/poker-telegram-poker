# Changelog

All notable changes to **Poker CM** are documented here.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Player-facing highlights are also shown in-app under **Me → What's New**. This file is
the fuller, technical record.

## [Unreleased]

### Added
- Project documentation under [`/docs`](docs/README.md) — architecture, every feature,
  API reference, and operations runbook.
- **Admin analytics dashboards** — five derived dashboards on the analytics layer:
  **Revenue** (Stars/TON gross, paying users, conversion, ARPPU, top packs),
  **Poker** (hands/day, showdown rate, pot distribution, population VPIP/PFR/AF and
  playing styles), **Bots** (roster, DQ-by-skill-band with a Spearman skill↔DQ check,
  league fill), **League** (tier distribution human vs bot, participation,
  promotions/relegations), and **Behaviour** (weekly retention triangle, feature-adoption
  funnel, engagement-depth buckets). Daily real-money revenue is now snapshotted into
  `fact_daily`.

### Changed
- Admin panel: the tab bar and the Dashboards sub-nav scroll horizontally without a
  visible scrollbar.

## [0.9.0] — 2026-07-15 — Skill & Decision Quality

### Added
- **Decision Quality (DQ)** scoring: every action is graded 0–100 by expected value, not
  by whether it won. Pure EV model in `poker/scoring.py`, validated against the bot
  skill ladder.
- **Skill Grade** — a percentile-based rank of the live population (Rookie → Master), so
  grades stay meaningful however the metric's scale moves.
- **Skill Level** — a cumulative, XP-style progression (15 levels, Clash-Royale curve:
  1–7 quick, 13–15 a long haul) that never drops. Shown in **Ranks → Skill** with a
  leaderboard ordered by cumulative Skill Points.
- Admin **DQ validation machine**: Spearman correlation of bot DQ vs configured skill, a
  DQ distribution histogram, and one-click grade-cutoff recompute.

### Changed
- Skill grades moved from fixed absolute thresholds (which made everyone a "Master") to
  **percentile bands** recomputed from the live distribution.

## [0.8.0] — 2026-07-14 — The Daily League

### Added
- **Daily cohort league**: Bronze → Diamond tiers, daily Sit & Go tournaments, promotion
  and relegation at midnight. League Points by finishing place.
- Bot-filled cohorts so a table is never empty; bot-vs-bot games are sampled, not dealt.
- **League Shards** → the exclusive, supply-capped **Champion** card skin.
- Live **LP projection** at the table, a **league history** sheet, and an in-progress
  league card on the home page.

### Fixed
- LP is awarded the instant you're eliminated (your place is locked on bust), not at
  game end.
- Leaving a league game now forfeits at your current standing with a confirmation — you
  can no longer coast to a better finish by folding.
- Quick Play no longer re-opens a finished league table.

### Security
- Tournament chips can never be cashed out as coins (leave / rebuy / janitor all refuse
  Sit & Go rooms), closing a coin-minting exploit.

## [0.7.0] — 2026-07-13 — Bots that measurably play

### Added
- **Poker DNA**: a 7-axis behavioural radar (Aggression, Discipline, Deception, Hand
  Reading, Position, Composure, Adaptation) computed from real hands, for every player
  and bot.
- Admin **bot monitor**: per-bot radar, KPIs with formulas, and bot creation/deletion.
- Self-play bot tables that keep the lobby alive.

### Changed
- The AI now reads opponents onto a **range** instead of assuming random cards — it no
  longer overcalls raises. Range-reading is gated on bot skill.

### Fixed
- Newcomers joining a running table post a live big blind to enter, so seating is fair
  regardless of the button.

## [0.6.0] — 2026-07-12 — Card market & growth

### Added
- **Card skins**: 52 individually skinnable cards, minted with serial numbers, priced by
  rank and suit.
- A **player-to-player market** with floor prices, a 5% burned fee, and a public item id
  per copy.
- Audience **segments & broadcasts**, a nightly **daily-reward reminder**, and in-app
  **notifications** with an unread bell.

### Fixed
- Invite links land users in the bot chat (`?start=`), so referrals become reachable by
  reminders and broadcasts.

## [0.5.0] — 2026-07-11 — Economy & polish

### Added
- Telegram **Stars** and **TON** purchases, DB-driven coin/gem packs, loot boxes with an
  RTP monitor and per-box daily limits.
- Profile customization: buyable name colors and per-avatar colors.
- A 7-day **daily reward** ladder.

### Changed
- Home page restructured to Quick Play · Create Room · Squad, with a collapsible Open
  Tables list.

## [0.4.0] — 2026-07-10 — Squads & social

### Added
- **Squads** (clans) with roles, chat, browse, and a leaderboard.
- Friends: search, requests, private messaging, referral auto-friending.

## [0.1.0] — 2026-07-09 — First playable

### Added
- The core game: a pure No-Limit Hold'em engine, per-room async runtime, WebSocket
  tables, and AI opponents with personalities and skill.
- Next.js Mini App with Telegram auth, the poker table, rooms, and profiles.
- FastAPI + Postgres + Alembic + Docker Compose, behind a Cloudflare Tunnel.

[Unreleased]: https://github.com/Mmd4LIFE/poker-telegram-poker/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.9.0
[0.8.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.8.0
[0.7.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.7.0
[0.6.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.6.0
[0.5.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.5.0
[0.4.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.4.0
[0.1.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.1.0
