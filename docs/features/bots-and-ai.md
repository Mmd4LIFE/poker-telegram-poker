# Bots & AI

Opponents that fill tables and populate the league. Code: `poker/ai.py` (decisions),
`poker/ranges.py` (hand ranges), `game/bots.py` (selection), configured per-bot on the
`User` row (`is_bot`, `bot_personality`, `bot_skill`).

## Deciding — `ai.decide`

Monte-Carlo equity + heuristic. Key properties:

- **Range-based equity.** Opponents are sampled from the range implied by what they
  actually did this hand (raised → top 15%, called → ~45%, passive → ~85%), via
  `ranges.range_of` + rejection sampling. Dealing them *random* cards (the old bug) made
  every bot overestimate its equity against a raise and call too much.
- **Skill gates range-reading.** A low-skill bot blends opponents back toward "any two
  cards" — a fish still imagines random cards, which is exactly what makes it a fish.
- **Personalities** (`PERSONALITIES`): rock, tight, balanced, loose, aggressive, maniac —
  each an (aggression, looseness, bluff) triple biasing the decision.
- **Skill** scales Monte-Carlo samples and adds perceived-equity noise for weak bots.
- The MC uses a seeded `random.Random`, **not** the CSPRNG — a bot's imagination can't
  be exploited, and it's the CPU self-play burns. (The *real* deck stays CSPRNG.)

## Strength for league sampling — `services/league.rating_of`

A single number per player (bots lean on configured skill, humans on win rate), fed to
Plackett-Luce to sample the result of bot-only Sit & Gos cheaply.

## Monitoring
Every bot accrues [Poker DNA](poker-dna.md) and [Decision Quality](decision-quality.md)
from real self-play, so the admin sees measured style + skill, not just the configured
numbers. Admins can **create/delete bots** (name, personality, skill) in Admin → Bots.

## Self-play tables
`GameManager._ensure_bot_tables` keeps `BOT_TABLES` (2) bot-only rooms alive. They're
ordinary joinable rooms, so self-play doubles as a lobby that's never empty. The cap is
the RAM budget.
