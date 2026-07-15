# Daily Reward & Referrals

## Daily reward — `services/daily.py`
A visible **7-day ladder** on a **local-calendar-day** streak (not rolling hours, so
"did I claim today" has one obvious answer). Day 7 pays gems. The UI shows the whole
roadmap: banked rungs ticked, today highlighted, the gem day visible ahead. A red dot on
the Shop tab flags an unclaimed reward. Claiming re-arms the churn reminders.

## Referrals — `api/routes_referral.py`, bot handlers
- Each user has a `referral_code`; invite links are `https://t.me/{bot}?start=ref-{code}`
  (`?start=`, so the invitee becomes reachable — see [notifications](notifications.md)).
- Inviter and invitee both get coins; referred users are auto-added as friends.
- The bot's **Invite friends** button posts your link with a Share action.
