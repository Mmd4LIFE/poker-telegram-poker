# ♠️ Poker CM — Telegram Poker Game

A production-grade **No-Limit Texas Hold'em** game for Telegram: a FastAPI backend,
a real-time WebSocket game engine, AI bot opponents, a full economy (coins, gems,
Telegram Stars & TON purchases, loot boxes), progression (levels, degrees,
achievements, challenges), squads, and a polished **Telegram Mini App**.

Everything runs with a single command:

```bash
cp .env.example .env      # then edit values
docker compose up -d
```

---

## ✨ Features

| Area | What you get |
|------|--------------|
| **Gameplay** | Real-time multiplayer No-Limit Hold'em, correct side-pots, all-in run-outs, blinds, dealer button, turn timers with auto check/fold |
| **Rooms** | Create private/public rooms, **join by 6-char code**, **Quick Play** (join random / auto-create), **Squad** tables for friends |
| **AI Bots** | 30 seeded bots with distinct **personalities** (rock, tight, balanced, loose, aggressive, maniac) and **skill** (good bots fold/value-bet correctly; bad bots spew & call too much). Tables auto-fill with bots so you never wait |
| **Economy** | Soft currency (coins) + premium (gems), full transaction ledger, buy-in / cash-out / rebuy, **Telegram Stars** & **TON** top-ups, weighted-loot **boxes** |
| **Progression** | XP, levels (smooth curve), **degrees** (Rookie → Legend), 16 **achievements**, daily/weekly **challenges**, daily-reward streaks |
| **Social** | Squads (clans) with codes & emblems, global **leaderboards** (winnings / level / wins) |
| **Platform** | FastAPI, async SQLAlchemy 2.0, Postgres, **Alembic** migrations, Redis, aiogram bot (polling or webhook), Nginx serving the Mini App + proxying API/WS |

---

## 🏗 Architecture

```
                         ┌──────────────┐
        Telegram  ◄──────┤   aiogram    │  (runs inside the FastAPI process)
                         │   bot        │
                         └──────┬───────┘
 Browser / Mini App             │
   │  HTTPS + WSS               ▼
   ▼                     ┌──────────────┐     ┌────────────┐
┌─────────┐   /api  /ws  │   FastAPI    │────►│  Postgres  │
│  nginx  ├────────────► │   + Game     │     └────────────┘
│ (static │             │   Runtime    │     ┌────────────┐
│ + proxy)│             │   loop/room  │────►│   Redis    │
└─────────┘             └──────────────┘     └────────────┘
```

- **Poker engine** (`app/poker/`) is pure, framework-agnostic and unit-tested
  (deck, 7-card evaluator, Hold'em state machine, Monte-Carlo bot AI).
- **Game runtime** (`app/game/`) runs one async loop per table: deals hands,
  drives turns, runs bot decisions, broadcasts per-viewer state over WebSocket,
  and persists results.
- **Services** (`app/services/`) own the ledger, progression, users and rooms.
- **API** (`app/api/`) is thin: auth, profile, rooms, shop, quests, squads, ws.

Services in `docker-compose.yml`: **db**, **redis**, **backend** (API+bot),
**nginx** (Mini App + reverse proxy on port `8080`).

---

## 🚀 Setup

### 1. Configure

```bash
cp .env.example .env
```

Key variables (see `.env.example` for all):

- `BOT_TOKEN` — already set to your bot token.
- `PUBLIC_URL` / `WEBAPP_URL` — the **HTTPS** URL where the Mini App is reachable.
- `BOT_MODE` — `polling` (default, no HTTPS needed for the bot) or `webhook`.
- `TON_WALLET_ADDRESS` — set to enable TON top-ups.

### 2. Run

```bash
docker compose up -d
```

On boot the backend waits for Postgres, runs `alembic upgrade head`, seeds bots /
achievements / challenges / boxes, then starts the API + bot.

The Mini App is served at `http://SERVER:8080/`.

### 3. Wire up Telegram

Telegram Mini Apps **must be served over HTTPS**. Put a TLS reverse proxy
(Caddy / Traefik / Cloudflare Tunnel / nginx-with-certs) in front of port `8080`,
then in **@BotFather**:

1. `/setdomain` (or Bot Settings → Menu Button) → set your HTTPS domain.
2. Set the **Menu Button** to your `WEBAPP_URL` so users get a "Play" button.
3. Send `/start` to the bot — it replies with a **Play Poker** WebApp button.

For **webhook mode**, set `BOT_MODE=webhook` and `PUBLIC_URL=https://your-domain`;
the webhook is registered automatically at `/webhook/<WEBHOOK_SECRET>`.

---

## 🃏 Card emoji

The Mini App renders cards with crisp CSS (no external assets). Telegram chat
messages use unicode fallbacks (`A♠`). To use the custom **`pcmcards`** emoji set
(<https://t.me/addemoji/pcmcards>) inside bot chat messages, fill in the custom
emoji **document IDs** in `backend/app/poker/emoji.py` — they are premium custom
emoji and must be referenced by id via message entities.

---

## 🎮 How to play

1. Open the app from the bot → **Quick Play** to sit instantly (bots fill the table),
   **Create Room** to host, or **Join by Code** to play with friends.
2. Act with **Fold / Check / Call / Raise** (slider + Min/½-Pot/Pot/All-in quick bets).
3. Win chips, level up, complete challenges, open boxes, climb the leaderboard.

---

## 🧪 Development

```bash
# Backend unit tests (pure engine, no services needed)
cd backend
python -m app.seed            # (needs DB) seed baseline data
alembic revision --autogenerate -m "change"   # new migration after model edits
```

Local Mini App testing without Telegram: the frontend falls back to a **dev login**
(`POST /api/auth/dev`, disabled when `ENV=production`) so you can open
`http://localhost:8080` directly in a browser.

---

## 📁 Layout

```
backend/
  app/
    poker/       cards, evaluator, holdem engine, bot AI
    game/        connection hub, room runtime loop, manager, bot filling
    models/      users, rooms, economy, progression, squads
    services/    economy ledger, progression, users, rooms, catalog, payments
    api/         auth, profile, rooms, shop, progression, squads, websocket
    bot/         aiogram handlers, runner, instance
    core/        security (Telegram initData + JWT), leveling
    main.py      FastAPI app + lifespan + webhook
    seed.py      idempotent baseline data
  alembic/       migrations
miniapp/         Mini App (HTML/CSS/vanilla JS SPA)
nginx/           static + reverse proxy config
docker-compose.yml
```

---

## 🔐 Notes on money & fair play

- Every balance change is written to an immutable `transactions` ledger.
- Hole cards are only ever sent to their owner; opponents receive card backs
  until showdown. Card dealing uses `secrets` (CSPRNG).
- Completed hands are persisted to the `hands` table for history & audit.
- Telegram Stars payments are verified via `pre_checkout_query` +
  `successful_payment`; TON via on-chain lookup of the tagged comment.
```
