# Squads (clans)

Clash-of-Clans-style clans. Code: `api/routes_squads.py`, `models/squad.py`,
`squad.tsx`.

- **Squad**: name, tag, description, public/private, XP/level, total won.
- **Roles**: owner / officer / member; promote, demote, kick, owner handoff on leave.
- **Chat**: `SquadMessage` polling feed.
- **Browse / Create / Join** when squadless; **Leaderboard** shows all squads (public flag
  only affects joining, not visibility).
- Shared squad links carry a referral for non-customers.
