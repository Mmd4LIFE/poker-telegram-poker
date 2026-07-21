# Changelog

All notable changes to **Poker CM** are documented here, newest first. These are the
player-facing notes shown in-app under **Me → What's New**.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-07-21 — Poker CM 1.0 🎉

The 1.0 milestone — the game grows up, and new players get a proper welcome.

### Added
- **A guided first run.** New players now start with just **Quick Play** and unlock the
  rest of the app as they level up — **Create Room** at level 2, the **Shop**, **Friends**
  and **Quests** soon after, **Cards** and the **Leaderboard** a little further, the
  **League** and **Clubs** later still. You're never dropped into everything at once.
- **Every locked feature shows the level it opens at**, so you always know what's next — and
  when you reach it, the unlock is announced right on your level-up.

### Changed
- The home screen leads with Quick Play; the rest of the app reveals itself, step by step,
  as you play and climb.

## [0.10.0] — 2026-07-20 — Clubs

### Added
- **Clubs** — a competitive home to play with a crew. Play **club games** (cash tables run
  by your club), earn **Club Points** for playing *well* (skill-based, so you can't farm
  them by folding), and climb a **weekly club leaderboard** that resets each week. Clubs
  **level up**, members earn **ranks** (Rookie → Ace), private clubs are **request-to-join**,
  and joins and activity post to your club chat. *(Squads became Clubs.)*

## [0.9.0] — 2026-07-18 — League insight

### Added
- **League now shows Decision Quality and a Skill Score** beside your League Points — a read
  on how *well* you play, not just where you finish, so folding every hand to survive no
  longer looks like skill. Shown for information; the ladder still ranks on League Points.

### Changed
- **League DQ and Skill Score are now per-day** — computed from the games you play *that
  day* and reset every league, so a fresh league starts clean. Past days keep their scores.
- **League Shards got a real home**: a shards panel with your balance, your progress to the
  next **Champion** skin, and a **Redeem** flow to mint one onto any card — plus a per-day
  shard log in your league history. The Champion skin is now also in the **Shop**, priced in
  shards.
- League standings always show the **DQ** and **S** columns (a dash until you've played a
  league game that day), so you can always see where they'll appear.

### Security
- Your Telegram ID is never shown to anyone, and your **@username is visible only to your
  friends** — to everyone else you're just your display name.

## [0.8.0] — 2026-07-16 — Showdown & table polish

### Added
- **A proper showdown reveal** — the end-of-hand popup shows the board and every player who
  reached showdown with their actual cards, hand, and winnings, so you can see *why* a hand
  was won, not just a name flashing by.
- **A table scoreboard** — hands, folds, calls, raises and a Decision-Quality score per
  player, ranked by who's playing best.
- **Skill level roadmap** — the Skill screen shows the full ladder with the points needed
  for every level and how far you are from the next.

### Changed
- **Table controls** (invite, emote, scoreboard, hand rankings) tuck into a single menu
  button, so the top bar stays clean and your chip count never runs off screen.
- **New community cards land with a beat** — after the action that closes a betting round,
  the table pauses briefly so you actually see the flop/turn/river appear instead of it
  blinking past as the next player acts.

### Fixed
- **Busted with no coins to rebuy** no longer strands you — you get a clear message with
  Leave and Get coins buttons instead of a rebuy button that only errors.
- **Tapping a room invite is reliable** — a concurrent join no longer errors on a seat
  clash, the buy-in isn't charged for a failed seat, and the app retries a transient miss so
  invited friends land in the room.
- **Quick Play could bounce you with "No free seat"** even when a table showed open seats —
  tables now give up a seat so you can always sit, and you're never charged for a seat you
  didn't get.

## [0.7.0] — 2026-07-15 — Skill & Decision Quality

### Added
- **Decision Quality (DQ)** — every action you take is graded from 0 to 100 on how good the
  decision was, not on whether it happened to win. Play well and get unlucky, and your DQ
  still reflects the good play.
- **Skill Grade** — a rank based on where you stand against everyone currently playing
  (Rookie → Master), so it always means something.
- **Skill Level** — a steady climb of 15 levels that come quickly at first and become a real
  grind near the top, and never drops. Find it in **Ranks → Skill**, with its own
  leaderboard.

### Changed
- Skill grades now come from how you compare to the live player base, so the ranks stay
  meaningful instead of everyone drifting to "Master".

## [0.6.0] — 2026-07-14 — The Daily League

### Added
- **Daily league**: Bronze → Diamond tiers with daily Sit & Go tournaments, and promotion or
  relegation every midnight. Earn League Points by how well you place.
- Tables always fill out so you're never left waiting for players.
- **League Shards** → the exclusive, limited-supply **Champion** card skin.
- A live League Points projection at the table, a league history sheet, and an in-progress
  league card on the home page.

### Fixed
- League Points are awarded the moment you're knocked out — your place is locked in on the
  spot.
- Leaving a league game now locks in your current standing (with a confirmation), so you
  can't fold your way to a better finish by quitting.
- Quick Play no longer re-opens a finished league table.

### Security
- Tournament chips can never be turned into coins, closing a coin-minting exploit.

## [0.5.0] — 2026-07-13 — Smarter opponents

### Added
- **Poker DNA**: a 7-trait playing-style radar (Aggression, Discipline, Deception, Hand
  Reading, Position, Composure, Adaptation) built from your real hands, for every player.
- Self-playing tables so the lobby always has action.

### Changed
- Opponents now put you on a **range of hands** instead of guessing randomly — so they no
  longer chase every raise.

### Fixed
- Joining a table mid-game posts a blind to sit down, so seating is fair no matter where the
  dealer button is.

## [0.4.0] — 2026-07-12 — Card market & growth

### Added
- **Card skins**: all 52 cards can be individually skinned, each minted with its own serial
  number and priced by rank and suit.
- A **player-to-player market** with floor prices and a unique id on every copy.
- In-app **notifications** with an unread bell, and a nightly daily-reward reminder.

### Fixed
- Invite links now open the bot chat directly, so invited friends can receive reminders and
  updates.

## [0.3.0] — 2026-07-11 — Economy & polish

### Added
- **Telegram Stars** and **TON** purchases, coin and gem packs, and loot boxes with per-box
  daily limits.
- Profile customization: buyable name colors and per-avatar colors.
- A 7-day **daily reward** ladder.

### Changed
- Home page restructured to Quick Play · Create Room · Squad, with a collapsible Open Tables
  list.

## [0.2.0] — 2026-07-10 — Squads & social

### Added
- **Squads** (clans) with roles, chat, browse, and a leaderboard. *(Squads later became
  Clubs in 0.10.0.)*
- Friends: search, requests, private messaging, and auto-friending from invites.

## [0.1.0] — 2026-07-09 — First playable

### Added
- The core game: real-time No-Limit Hold'em tables with AI opponents that each have their
  own personality and skill.
- A Telegram Mini App with the poker table, rooms, and player profiles.

[1.0.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v1.0.0
[0.10.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.10.0
[0.9.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.9.0
[0.8.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.8.0
[0.7.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.7.0
[0.6.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.6.0
[0.5.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.5.0
[0.4.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.4.0
[0.3.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.3.0
[0.2.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.2.0
[0.1.0]: https://github.com/Mmd4LIFE/poker-telegram-poker/releases/tag/v0.1.0
