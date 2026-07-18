# PRD — Poker Clubs ("Squads" → "Clubs")

**Status:** Draft v1 · **Owner:** @mmdsvm · **Feature area:** Social / Retention / Economy
**Supersedes:** the current lightweight "Squads" feature.

---

## 1. TL;DR

Turn the shallow "Squad" (a group with a name, a chat, and a shared coin bank) into a
**Poker Club** — a persistent, competitive home for a group of players, modelled on the
real-world poker-club format that ClubGG / PokerBros / home games made huge.

A Club is where a player goes from **zero to hero**: join a club → play club games with
people you know → climb the club's own leaderboard → earn a role and perks → eventually
found and grow your own club → win Club Wars. It gives every player a *team to belong to*,
a *reason to come back daily*, and a *ladder that isn't just the global one*.

This document names the feature, defines the member journey, and lays out a **phased**
build (P1 ships on top of what already exists; P4–P5 are the ambitious end-state).

---

## 2. The naming decision

**Recommendation: rename "Squad" → "Club" (a "Poker Club").**

| Candidate | Association | Fit for a poker game |
|---|---|---|
| **Club** ✅ | Real poker-club apps (ClubGG, PokerBros), card rooms, "home game club" | **Native to poker.** A club *owner* running games for *members* with a shared leaderboard and bankroll is an established, beloved format. Instantly legible. |
| Clan | Clash of Clans/Royale, shooters | Strong for "wars/levels/perks" but generic and off-theme for cards. |
| Squad (current) | PUBG/Fortnite | Casual, but it's a *lobby party* word, not a *persistent institution* word. |
| House | "The House" (casino) | Thematic but implies the operator/dealer, which is confusing. |
| Crew / Syndicate | Heist vibe | Fun flavour, weak for a leaderboard-driven ladder. |

"Club" wins because the whole zero-to-hero loop below is **exactly how real poker clubs
work**, so the mechanics feel authentic rather than bolted-on, and the language ("Club
owner", "club game", "club leaderboard", "membership") needs no explanation.

Player-facing term: **Club**. Owner role: **Host** (poker-room language) or keep **Owner**.
Members are **members**; senior members are **Managers** (poker-club language) instead of
"officers". Emblem + tag stay.

> Migration is a rename only — the `squads` tables and code map 1:1 to Clubs. No data loss.

---

## 3. Why build this (the case)

- **Retention.** Solo players churn; players with a *team* and a *daily club obligation*
  don't. Clubs create a social contract ("my club is counting on my games today").
- **Second ladder.** The global league is one ladder; a club leaderboard gives the 95% of
  players who'll never top the global board a **winnable** ranking among peers.
- **Acquisition.** Club owners are unpaid growth agents — they recruit to fill their club
  and win wars. Every club is a referral engine with a scoreboard.
- **Monetization.** Club bank, dues, cosmetic club emblems/skins, Club Pass, and
  club-hosted games (rake share) are all natural, non-pay-to-win revenue.

**North-star metric:** % of DAU who are in a club **and** played ≥1 club game that day.

---

## 4. Current state (what already exists)

Ship P1 on this foundation — most primitives are already here:

- `Squad` — code, name, tag, emblem, description, owner, `xp`, `total_won`,
  `bank_coins`, `max_members` (20), `is_public`.
- `SquadMember` — role (owner/officer/member), `contributed`, joined_at. **One club per
  user** (unique constraint).
- `SquadMessage` — club chat.
- Routes — create / join / leave / edit / browse / leaderboard / promote / demote / kick /
  chat / me / get-by-code. Private squad tables can already be hosted (`Room.squad_id`).

**Gaps:** the bank does nothing; XP/`total_won` aren't earned or spent; there's no club
game format, no club-scoped leaderboard *season*, no progression, no club-vs-club, no
perks, no anti-collusion. "Creating" a club works; "using" one is empty. This PRD fills
the "using" half.

---

## 5. The zero-to-hero journey

The design goal: every player has an obvious *next step* in club life, from their first
session to running a top club.

| Stage | Player is… | What they do | What pulls them forward |
|---|---|---|---|
| **0 · Curious** | club-less | Sees "Clubs" tab, browses public clubs, reads a club card (members online, win-rate, emblem) | "Join a club → +welcome bonus, instant teammates" |
| **1 · Rookie member** | new member | Plays **club games**, chats, sees their name on the **club leaderboard** | Weekly club leaderboard reset = a fresh shot every week |
| **2 · Contributor** | active member | Earns **Club Points (CP)** for the club by playing well; climbs member ranks | Member ranks unlock chat perks, a member badge, a share of club rewards |
| **3 · Manager** | promoted | Hosts club games, approves join requests, curates roster | Status + a cut of hosting rewards |
| **4 · Founder** | owns a club | Founds a club (costs coins/gems), sets identity, recruits, sets dues | The club **levels up**, unlocking perks & bigger wars |
| **5 · Hero** | top-club owner | Wins **Club Wars**, tops the **Clubs leaderboard**, earns an exclusive club skin | Seasonal glory, a permanent banner, prestige |

Every stage has a **visible meter** (member rank progress, club level progress, war
standing) so the "what's next" is never ambiguous.

---

## 6. Feature set — phased

### Phase 1 — Foundations & identity (mostly exists; polish + rename)
- Rename Squad → **Club** across UI/API (keep tables; alias routes for a release).
- Club profile: emblem, tag, name, description, **member list with online dots**,
  founded date, member count / cap.
- Roles: **Owner → Manager → Member** with the existing promote/demote/kick.
- Club chat (exists) + **system messages** ("X joined", "won 1.2M in a club game").
- Join flows: **public** (instant), **request-to-join** (Manager approves), **invite link**
  (deep link `sq-`/`cl-`).
- **Acceptance:** a player can find, join, identify, and chat in a club; owners manage roster.

### Phase 2 — Club games & the club leaderboard (the core loop)
- **Club game:** a table tagged to a club (`Room.squad_id` exists). Any member can spin one
  up (cash or a club Sit & Go); it shows in a **Club Lobby** so members join each other.
- **Club Points (CP):** a *club-scoped* score earned in club games. Crucially, CP must
  **not** reward the fold-to-survive hack (see the league Skill Score work) — CP =
  f(finish, hands won, decision quality), not survival alone. Reuse
  `services/league_score.py` thinking.
- **Weekly Club Leaderboard:** members ranked by CP earned this week; resets weekly. Top
  members earn coins/shards + a **Member of the Week** badge.
- **Club total:** the sum of members' CP feeds the **club's** standing on the global Clubs
  board (Phase 4 wars build on this).
- **Acceptance:** a member can play a club game, earn CP, and see themselves move on a
  weekly club board that resets.

### Phase 3 — Club progression & perks
- **Club Level & Club XP:** the club earns XP from members' club games and war results.
  Levels unlock: higher member cap, more concurrent club games, a **club emblem frame**,
  chat cosmetics, an extra Manager slot, a bigger bank cap.
- **Member ranks** within a club (Rookie → Regular → Veteran → Ace), from lifetime CP
  contributed; purely status + small perks. Never pay-to-win.
- **Club perks (level-gated):** e.g., +X% daily-reward for active members, a club daily
  chest split among members who played, a club-only card back.
- **Acceptance:** playing club games visibly levels the club and the member; perks turn on.

### Phase 4 — Club vs Club (Wars & the Clubs ladder)
- **Club War:** a scheduled window (e.g., weekend) where two matched clubs compete on
  **total CP earned by their members** during the window. Winner takes a trophy, XP, and a
  reward pool; both get participation CP. Matchmaking by club level/rating (Elo-style).
- **Clubs Leaderboard (seasonal):** clubs ranked by war record + season CP; top clubs earn
  an exclusive seasonal **club skin/emblem** and a permanent "Season N champion" banner.
- **War room UI:** live head-to-head bar, who's contributing, time left — the same
  "legible ladder" treatment the daily league got.
- **Acceptance:** two clubs can be matched, compete over a window, and one wins with
  rewards; a seasonal clubs ladder exists.

### Phase 5 — Club economy (bank, dues, store, hosting)
- **Club Bank** (`bank_coins` exists): members/officers can deposit; owner spends it on
  **club perks, war buy-ins, and member payouts**. Full audit log (who deposited/spent).
- **Dues (optional, owner-set):** a small weekly CP or coin contribution to stay "active";
  inactive members auto-drop to keep clubs competitive.
- **Club store:** spend club bank on cosmetic emblems, frames, a custom card back, extra
  Manager slots, a war re-match.
- **Hosting rewards / rake-share (careful, later):** a club owner hosting popular club
  games earns a small **cosmetic-currency** cut — *never* a coin cut that could incentivise
  predatory or rigged games. Keep it cosmetic/prestige to avoid regulatory + fairness
  issues.
- **Acceptance:** the bank has real sinks/sources with an audit trail; nothing is
  pay-to-win or cashable to real money.

---

## 7. Fair play — the poker-specific risk (do not skip)

Grouping friends at private tables invites **collusion** (soft-play, chip-dumping,
information sharing). A club feature that ignores this will be gamed. Requirements:

- **CP integrity:** CP from **club games among the same handful of members** is weighted
  down or capped; CP is fully earned only across a *diverse* opponent pool or in
  matchmade/war games. Chip-dumping patterns (consistent one-way transfers on all-ins)
  flag the pair.
- **No coin faucet from club games.** Club games use the same economy as normal cash games;
  a club must never be a way to mint coins by playing yourself. (We already close the
  tournament-chip minting hole — apply the same rigor.)
- **Anti chip-dump heuristics** surfaced in the **admin bot/fraud monitor**: pairs with
  abnormal net transfer, hands where a big stack folds the nuts to a clubmate, etc.
- **War games are matchmade** (not self-selected opponents), so the competitive ladder is
  collusion-resistant by construction.

This is a first-class feature requirement, not an afterthought — it's the difference
between a healthy club ecosystem and an exploit farm.

---

## 8. Data model changes (incremental, additive)

Rename is logical only; new fields/tables per phase:

- **P2:** `club_points` ledger (`ClubPointEvent`: club_id, user_id, cp, source, week, ts) —
  append-only, so weekly boards and audits are exact (mirrors `fact_daily` philosophy).
  `Room.squad_id` already links club games.
- **P3:** `Squad.level` (derive from `xp`), `SquadMember.cp_lifetime`, perk flags in a
  JSONB `perks` column on `Squad`.
- **P4:** `ClubWar` (a, b, starts_at, ends_at, a_cp, b_cp, status, winner), `club_rating`
  (Elo) on `Squad`, seasonal `ClubSeason` snapshot.
- **P5:** `ClubBankEntry` (club_id, user_id, delta, kind, ts) audit log; `Squad.dues_*`.

All migrations additive + idempotent, per project convention. No destructive change to the
existing `squads` tables.

---

## 9. Success metrics

- **Adoption:** % DAU in a club; % DAU who played a club game (north star).
- **Retention:** D7/D30 retention of club members vs non-members (expect a clear lift).
- **Engagement:** club games / member / week; chat messages / active club.
- **Health:** war participation rate; median club size; % clubs that survive 4 weeks.
- **Integrity:** flagged chip-dump pairs / week (want ≈0 after weighting).
- **Economy:** club-bank turnover; club-store cosmetic spend (never pay-to-win).

---

## 10. Rollout plan

| Milestone | Scope | Bar to ship |
|---|---|---|
| **M1** | Rename to Clubs + P1 polish + request-to-join | No data loss; owners manage roster; deep-link join works |
| **M2** | P2: club games + CP + weekly club leaderboard | A member earns CP in a club game and moves on a weekly board |
| **M3** | P3: club level/XP + member ranks + first perks | Club visibly levels; ≥1 meaningful, non-P2W perk |
| **M4** | P4: Club Wars + seasonal Clubs ladder | Two clubs complete a matchmade war with rewards |
| **M5** | P5: bank sinks/sources + club store + dues | Auditable bank; cosmetic store; inactive-drop |

Ship M1–M2 first and measure the north star before investing in M4–M5.

---

## 11. Open questions

1. **Naming sign-off:** Club (recommended) vs keep Squad vs Clan? Owner = "Host" or "Owner"?
2. **One club per player** (current constraint) — keep it (stronger identity) or allow a
   primary + guest clubs? Recommend: keep one, it drives loyalty.
3. **CP formula v1** — start from the league Skill Score, or a simpler finish-weighted score?
4. **War cadence** — weekend-only, or continuous laddered matches?
5. **Hosting rewards** — cosmetic-only (recommended) now, revisit revenue-share never/later.
6. Should club games count toward the **global league** too, or be a separate track? Recommend
   separate, to keep collusion out of the global ladder.

---

*Appendix — reuse from existing systems:* the daily-league rollover/season machinery, the
percentile-grade + Skill-Score scoring, the `fact_daily`-style append-only ledgers, the
admin monitors, and the deep-link invite flow all transfer directly to Clubs. This keeps
the build cost of M1–M2 low.
