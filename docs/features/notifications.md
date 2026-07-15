# Notifications

Two channels: **in-app bell** and **bot DMs**.

## In-app — `models/marketing.Notification`, `notifications.tsx`
- One row per user per event. Trade sales notify **both** sides (seller learns they sold
  while away; buyer gets a receipt). League finishes notify the player.
- The bell shows an **unread dot** (a dot, not a count — "something new" is the signal).
  Opening marks all read; rows keep a gold dot for the ones that were new.
- Trade notifications are **tappable** → the full trade receipt sheet.
- Polls every 45s; fails silent (a badge never breaks a screen).
- A **red dot on the Shop tab** when the daily reward is unclaimed (checked on app open).

## Bot DMs — `services/notify.py`
- **Nightly daily-reward reminder** at 21:00 in the user's OWN timezone (the Mini App
  reports the device offset): "keep your streak" if alive-but-unclaimed, "it's ok to
  miss" at most twice after a break, then silence. Never a daily nag.
- **Reachability**: a bot cannot DM a user who never pressed Start. `users.bot_started`
  gates it (set on /start, cleared on a failed send). Invite links use `?start=` (not
  `?startapp=`) so invitees land in the bot chat; the in-app **NotifyGate** card pays a
  bonus to convert Mini-App-only users.
- **Template variables** (`{name} {coins} {streak} {next_coins} …`) shared by reminders
  AND broadcasts, rendered fault-tolerantly (a typo shows the placeholder, never crashes
  the sweep).
