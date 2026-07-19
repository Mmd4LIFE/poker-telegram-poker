# Changelog

All notable changes to **Poker CM** are documented here.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Dated releases below are the player-facing notes, also shown in-app under
**Me → What's New**. Work-in-progress lives under **[Unreleased]** and is not shown to
players.

## [Unreleased]

### Added
- Project documentation under [`/docs`](docs/README.md) — architecture, every feature,
  API reference, and operations runbook. *(internal)*
- Admin analytics dashboards — Revenue, Players, Poker, Bots, League and Behaviour
  views for a live read on the game's health. *(internal, admin-only)*

### Changed
- Admin panel: horizontal tab bars scroll cleanly without a visible scrollbar.
  *(internal, admin-only)*

### Added
- **Skill level roadmap** — the Skill screen now shows the full 15-level ladder with the
  exact skill points needed for every level and how far you are from the next.
- **Table scoreboard** — a scoreboard at every table (hands, folds, calls, raises and a
  Decision-Quality score per player, ranked by who's playing best).

### Changed
- Self-play tables now idle quietly when nobody is watching instead of running at full
  speed, freeing up the server. *(internal)*
- Admin: full league history — browse every past day, each league's final standings, and
  the games played. *(internal, admin-only)*
- Table controls (invite, emote, scoreboard, hand rankings) are tucked into a single
  menu button, so the top bar stays clean and your chip count never runs off screen.

### Fixed
- **Hand results are now a proper showdown card reveal** — the end-of-hand popup shows
  the board and every player who reached showdown with their actual cards, hand, and
  winnings, so you can see *why* a hand was won, not just a name flashing by.
- **New community cards now land with a beat** — after the action that closes a betting
  round, the table pauses briefly so you can see the flop/turn/river appear instead of it
  blinking past as the next player acts.
- **Busted with no coins to rebuy** no longer strands you at the table — you get a clear
  message with Leave and Get coins buttons instead of a rebuy button that only errors.
- **Tapping a room invite is reliable** — a concurrent join no longer 500s on a seat
  clash (it takes the next seat), the buy-in isn't charged for a failed seat, and the
  app retries a transient miss so invited friends land in the room.
- **Quick Play could bounce you with "No free seat"** even when a table showed open
  seats — bot tables now give up a bot's seat so a human can always sit, and you're
  never charged a buy-in for a seat you didn't get.
- **A bot could be seated at two tables at once** — bot selection now excludes every bot
  already playing anywhere, and mints a fresh bot if the whole roster is busy, so no bot
  ever plays two hands with one brain. *(internal)*

### Added
- **League now shows Decision Quality and an experimental Skill Score** beside each
  player's League Points. These measure how *well* you play (not just how you place), so
  folding every hand to survive no longer looks like skill. Shown for information only —
  the ladder still ranks on League Points for now.
- Admin: a live bot-pool monitor (total / busy / free / auto-generated, per-table
  occupancy, and a double-seating health check). *(internal, admin-only)*

### Changed
- **League DQ & Skill Score are now per-league**, computed from the games you play *that
  day* and reset every league — a fresh league starts blank instead of showing your
  lifetime numbers. Past days keep their scores. Still shown for info, not used to rank.
- **League Shards** got a real home: a shards panel in the league with your balance,
  progress to the next Champion skin, and a **Redeem** flow to mint one onto any card —
  plus a per-day shard log in your league history.

### Security
- A player's Telegram ID is never exposed to anyone, and a player's @username is now
  visible only to their friends — to everyone else you're just your display name.

## [0.9.0] — 2026-07-15 — Skill & Decision Quality

### Added
- **Decision Quality (DQ)** — every action you take is graded from 0 to 100 on how good
  the decision was, not on whether it happened to win. Play well and get unlucky, and
  your DQ still reflects the good play.
- **Skill Grade** — a rank based on where you stand against everyone currently playing
  (Rookie → Master), so it always means something.
- **Skill Level** — a steady climb of 15 levels that come quickly at first and become a
  real grind near the top, and never drops. Find it in **Ranks → Skill**, with its own
  leaderboard.

### Changed
- Skill grades now come from how you compare to the live player base, so the ranks stay
  meaningful instead of everyone drifting to "Master".

## [0.8.0] — 2026-07-14 — The Daily League

### Added
- **Daily league**: Bronze → Diamond tiers with daily Sit & Go tournaments, and
  promotion or relegation every midnight. Earn League Points by how well you place.
- Tables always fill out so you're never left waiting for players.
- **League Shards** → the exclusive, limited-supply **Champion** card skin.
- A live League Points projection at the table, a league history sheet, and an
  in-progress league card on the home page.

### Fixed
- League Points are awarded the moment you're knocked out — your place is locked in on
  the spot.
- Leaving a league game now locks in your current standing (with a confirmation), so you
  can't fold your way to a better finish by quitting.
- Quick Play no longer re-opens a finished league table.

### Security
- Tournament chips can never be turned into coins, closing a coin-minting exploit.

## [0.7.0] — 2026-07-13 — Smarter opponents

### Added
- **Poker DNA**: a 7-trait playing-style radar (Aggression, Discipline, Deception, Hand
  Reading, Position, Composure, Adaptation) built from your real hands, for every player
  and bot.
- Self-playing bot tables so the lobby always has action.

### Changed
- Opponents now put you on a **range of hands** instead of guessing randomly — so they no
  longer chase every raise.

### Fixed
- Joining a table mid-game posts a blind to sit down, so seating is fair no matter where
  the dealer button is.

## [0.6.0] — 2026-07-12 — Card market & growth

### Added
- **Card skins**: all 52 cards can be individually skinned, each minted with its own
  serial number and priced by rank and suit.
- A **player-to-player market** with floor prices and a unique id on every copy.
- In-app **notifications** with an unread bell, and a nightly daily-reward reminder.

### Fixed
- Invite links now open the bot chat directly, so invited friends can receive reminders
  and updates.

## [0.5.0] — 2026-07-11 — Economy & polish

### Added
- **Telegram Stars** and **TON** purchases, coin and gem packs, and loot boxes with
  per-box daily limits.
- Profile customization: buyable name colors and per-avatar colors.
- A 7-day **daily reward** ladder.

### Changed
- Home page restructured to Quick Play · Create Room · Squad, with a collapsible Open
  Tables list.

## [0.4.0] — 2026-07-10 — Squads & social

### Added
- **Squads** (clans) with roles, chat, browse, and a leaderboard.
- Friends: search, requests, private messaging, and auto-friending from invites.

## [0.1.0] — 2026-07-09 — First playable

### Added
- The core game: real-time No-Limit Hold'em tables with AI opponents that each have their
  own personality and skill.
- A Telegram Mini App with the poker table, rooms, and player profiles.

[Unreleased]: https://github.com/Mmd4LIFE/poker-telegram-poker/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.9.0
[0.8.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.8.0
[0.7.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.7.0
[0.6.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.6.0
[0.5.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.5.0
[0.4.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.4.0
[0.1.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.1.0
