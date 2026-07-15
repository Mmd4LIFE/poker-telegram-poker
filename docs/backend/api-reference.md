# API Reference

All under `/api`, JWT via `Authorization: Bearer` (except `/auth/*` and `/health`).
Routers in `backend/app/api/routes_*.py`. This is the surface, grouped by router.

## auth
- `POST /auth/telegram` — validate initData → `{token, user}`. `POST /auth/dev` — local.

## profile (`routes_profile`)
- `GET /me`, `GET /wallet/history`, `GET /leaderboard`
- `GET /daily` (ladder status), `POST /daily` (claim), `POST /me/tz`
- `GET /dna` (self radar) · `GET /notifications`, `POST /notifications/read`

## rooms
- `GET /rooms`, `POST /rooms`, `GET /rooms/{code}`, `DELETE /rooms/{code}`
- `POST /rooms/{code}/join|leave|rebuy`, `POST /rooms/join/random`
- `GET /rooms/state/current`

## league
- `GET /league` (standings), `POST /league/play`, `POST /league/forfeit`
- `GET /league/active`, `GET /league/history`

## skill
- `GET /skill` (grade + level), `GET /skill/leaderboard`

## cards & market
- `GET /cards/designs|collection|shop|purchases`, `POST /cards/buy|equip|redeem-shards`
- `GET /market`, `/market/groups`, `/market/stats`, `/market/mine`, `/market/trades/{id}`
- `POST /market/list|cancel|buy`

## shop / economy
- `GET /shop/catalog|boxes|boxes/history`, `POST /shop/stars/invoice`, `/shop/ton/intent|verify`,
  `/shop/boxes/open`

## social
- `GET/POST /friends*`, `GET/POST /squads*`, `GET /referral`

## admin (require_admin)
- `/admin/stats|boxes|products|cards|market|segments|broadcast|broadcasts|reminder`
- `/admin/bots`, `/admin/bots/{id}`, `POST /admin/bots`, `DELETE /admin/bots/{id}`
- `/admin/dq`, `POST /admin/dq/recompute`, `/admin/league`, `POST /admin/league/close|simulate`

## websocket
- `/ws/rooms/{code}` — table state, events, emotes, `sng_over`, `placed`.

> For exact request/response shapes, read the router — they're small and each endpoint's
> docstring states intent.
