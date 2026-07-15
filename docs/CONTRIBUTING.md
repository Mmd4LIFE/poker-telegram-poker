# Contributing / Working in this repo

## Golden rules
1. **`poker/` stays pure** — no I/O. It's the testable core.
2. **All money through `services/economy`** — never mutate `coins`/`gems` directly.
3. **Migrations idempotent**, chained linearly, backfills in `upgrade()`.
4. **Coins and gems never mix** in one figure.
5. **Tournament chips are not money.** SNG rooms refuse cash-out/rebuy.
6. **Watch RAM** — 1 GB box shared with other services.

## Adding a feature
- Model → migration → service (logic) → router (API) → screen (UI). Keep the pure math in
  `poker/` or a `services/*` pure function so it can be tested headlessly.
- Runtime-tunable config → `AppSetting`, not a new column.
- Update the relevant `docs/features/*.md` and add a `CHANGELOG.md` entry.

## Testing
The engine, AI, DQ model, and league math are validated by **headless simulation** (run
the pure functions over thousands of hands and assert properties — no DB needed). Prefer
this to mocking. The DQ metric self-validates in prod (`/admin/dq` Spearman ρ).

## Deploy
See [operations/deployment.md](operations/deployment.md). Frontend is a static export;
use `deploy/deploy-web.sh` (atomic), never `rm -rf webout`.
