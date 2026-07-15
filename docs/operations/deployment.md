# Deployment

Single VPS `root@104.194.144.46`, project at `~/mk-projects/poker`, Docker Compose
(Postgres + backend + nginx), fronted by a Cloudflare Tunnel to `poker.mammad.site`.

## Flow
1. **Frontend**: `cd web && npm run build` → static export in `web/out/`.
2. `tar czf /tmp/webout.tgz -C out .`, upload, on server `./deploy/deploy-web.sh`.
3. **Backend** (only if changed): `docker compose up -d --build backend`, then
   `docker compose exec -T backend alembic upgrade head`.
4. Verify: `curl -s -o /dev/null -w '%{http_code}' https://poker.mammad.site/api/health`.

## `deploy/deploy-web.sh` — why it's atomic
It does NOT `rm -rf webout/*`. That would (a) leave the site empty for ~1s, and (b)
delete the content-hashed chunks an already-open Mini App still references, stranding it
on "This page couldn't load". Instead it overlays the new build, swaps entry files via
atomic rename, and only retires files that are both absent from the new build **and**
older than a 7-day grace period.

## Constraints
- **1 GB RAM**, shared with other bots. Watch `free -m` and `docker stats` after any
  change that adds background work (bot tables, loops).
- The DB is shared infra — migrations must be safe and idempotent.
