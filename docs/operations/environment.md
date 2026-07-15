# Environment & Secrets

`backend/app/config.py` (`Settings`, env-backed). Key vars:

| Var | Purpose |
|---|---|
| `BOT_TOKEN` | Telegram bot token (@pok_ergame_bot) |
| `WEBAPP_URL` / `PUBLIC_URL` | `https://poker.mammad.site` |
| `DATABASE_URL` | Postgres DSN |
| `JWT_SECRET` | signs the app JWT |
| `TON_WALLET_ADDRESS` | on-chain TON payments |
| `ADMIN_IDS` | Telegram ids with admin (592354162) |

Tunable-at-runtime knobs live in the `AppSetting` table (market fee, DQ grades, league
config, daily reminder), NOT env — change them in the admin panel without a deploy.

Gameplay/economy defaults (blinds, buy-in caps, `MARKET_FEE_PCT`, `BOT_TABLES`,
`BOT_START_BONUS`, reward amounts, league defaults) are constants in `config.py` /
service `DEFAULTS`.
