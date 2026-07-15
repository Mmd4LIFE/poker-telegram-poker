# Runbook — common incidents

## "This page couldn't load" (Telegram blank error)
Usually a stale webview cached across a deploy. Check the server is healthy
(`/api/health` = 200, chunks resolve, nginx has no 404s on `_next`). If healthy: it's the
client — reload, or fully close & reopen the Mini App. If a real crash, the in-app
ErrorBoundary now shows the error text instead.

## Backend 502 right after deploy
The backend is mid-restart. Wait ~20s and re-check `/api/health`.

## A tournament is stuck (no LP awarded)
Tournaments must play to the end to book results. The janitor's `_resume_tournaments`
restarts any unfinished SNG. If seats leaked, check `room_players` for finished SNG rooms
(they should be cleared on finish).

## Bot tables multiplying / not dealing
`_ensure_bot_tables` counts `status != 'finished'` (rooms are created `waiting`, not
`open`). Self-play tables run unwatched (`bots_only`), so they must NOT be paused by the
no-viewers check.

## RAM pressure
`docker stats`. The usual culprits: too many `BOT_TABLES`, or a heavy sim run. Bot-vs-bot
league games are sampled, not dealt — keep it that way.

## Deploy helper scripts
`srun.py` (paramiko exec) and `supload.py` (SFTP) live in the session scratchpad and are
recreated as needed; they are not committed.
