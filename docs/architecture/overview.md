# Architecture Overview

## The stack

| Layer | Tech | Notes |
|---|---|---|
| Backend | Python 3.12, FastAPI, async SQLAlchemy 2.0 | one process serves REST + WebSocket + the Telegram bot |
| DB | PostgreSQL | Alembic migrations, all idempotent |
| Bot | aiogram (long-polling) | runs in-process with FastAPI via the lifespan |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui | **static export**, served by nginx at `/` |
| Ingress | nginx → Cloudflare Tunnel | domain `poker.mammad.site`, `no-store` on HTML |
| Host | single 1 GB VPS | shared with other production bots — **RAM is the constraint** |

The frontend is a **static export** with zero runtime — nginx serves the built files
directly, so the Mini App costs no extra RAM. Everything dynamic goes through
`/api/*` to the FastAPI backend on the same origin.

## The one process

`app/main.py` boots a single FastAPI app whose `lifespan`:
1. starts the aiogram bot (long-polling, in-process),
2. starts the **seat janitor** (`GameManager.start_janitor`) — reaps idle seats, closes
   idle rooms, keeps self-play bot tables alive, resumes unfinished tournaments,
3. starts the **daily-reminder loop** (bot DMs at 21:00 local),
4. starts the **league loop** (daily rollover + trickle of simulated bot games).

Everything shares one event loop. There is no separate worker; the 1 GB budget doesn't
allow one, and the design leans on that (see [game-runtime.md](game-runtime.md)).

## Request lifecycle

```
Telegram Mini App  ──HTTPS──►  Cloudflare Tunnel  ──►  nginx  ──┬──► static files (the app)
                                                                └──► /api/* → FastAPI
Live table          ──WebSocket (/ws/rooms/{code})──────────────────► ConnectionHub → runtime
```

- **Auth**: the Mini App sends Telegram `initData`; the backend HMAC-validates it and
  issues a JWT (`/api/auth/telegram`). Every `/api/*` call carries `Authorization: Bearer`.
- **State**: table state is pushed over the WebSocket; everything else is REST.

## Directory shape

```
backend/app/
  api/         FastAPI routers (one per feature: routes_rooms, routes_league, …)
  bot/         aiogram handlers, the bot singleton, the runner
  game/        the live layer: manager.py (orchestrator) + runtime.py (per-table loop)
  poker/       the PURE engine — no I/O: cards, evaluator, holdem, ai, ranges, scoring
  models/      SQLAlchemy ORM
  services/    business logic: economy, cards, league, dna, dq, notify, segments, …
  schemas.py   Pydantic response models
  config.py    settings (env-backed)
  main.py      the app + lifespan

web/
  app/         Next.js App Router entry (page.tsx wraps the providers)
  components/  screens/ (one per tab/page) + shared UI + table/
  lib/         api client, stores (React context), telegram bridge, poker.ts (TS evaluator)
```

## Two rules that shape everything

1. **The `poker/` package is pure.** No database, no network, no framework. It can be
   unit-tested and simulated headlessly (that's how the AI, DQ model, and league math
   are all validated). If you're adding I/O, it belongs in `game/` or `services/`, not
   `poker/`.

2. **RAM is the ceiling.** Bot-vs-bot league games are *sampled*, not dealt
   (Plackett-Luce). The frontend is static. The AI's Monte-Carlo uses a cheap RNG.
   Every "why is it done this cheap way" answer is: the box has 1 GB and runs other
   services too.
