# Migrations

Alembic, in `backend/alembic/versions/`. Applied on deploy with `alembic upgrade head`.

## The chain (0001 → 0022)
initial → referrals → social → cosmetics → icon avatars → referral code → per-avatar
colors → clan → economy → room activity → card skins → app settings → segments/reminders
→ bot_started → skin uid → notifications → box daily limit → poker DNA → dna wins → league
→ decision quality → skill_sp.

## Rules
1. **Idempotent always.** Use `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
   and inspector table-existence checks. `0001` uses `create_all()`, so later migrations
   must tolerate columns/tables already existing on a fresh DB.
2. One migration per schema change; `down_revision` chains linearly.
3. Backfills go in the `upgrade()` (e.g. `0015` backfills skin uids, `0014` marks
   existing users reachable).
4. Test on the server with `alembic upgrade head` right after deploy; it's in the deploy
   flow.
