# Audience Segments & Broadcasts

Admin-driven messaging. Code: `services/segments.py`, `services/notify.run_broadcast`,
`models/marketing.py`, Admin → Reach.

## Segments
A rules object ANDed into a query over users: level/coins/gems/skins/referral ranges,
in-squad, selling-on-market, owns-a-specific-card/design, activity recency. Membership is
**materialised** into `segment_users` (not computed live — the rules join over skins,
listings, squads). Recomputed on demand (**Calculate**) and **always at send time**, so a
broadcast never targets a stale audience. A live **count preview** before saving.

## Broadcasts
Send to everyone or a segment; runs in the background at ~20/s with sent/failed progress.
Only ever targets `bot_started` (reachable) users, so failure counts stay honest.
Template variables are per-recipient. See [notifications.md](notifications.md).
