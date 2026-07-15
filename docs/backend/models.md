# Models (one line each)

See [../architecture/data-model.md](../architecture/data-model.md) for grouping. Import
graph is flat: everything is imported in `models/__init__.py` so Alembic autogenerate and
`Base.metadata` see all tables.

| Model | File | Purpose |
|---|---|---|
| User | user.py | identity, money, level, bot fields, league tier/shards |
| Room / RoomPlayer / Hand | room.py | tables, seats, hand history |
| Transaction | economy.py | the immutable money ledger |
| Product / Box / UserBox / Purchase | economy.py | shop packs, loot boxes, purchases |
| CardDesign / CardSkin / MarketListing | cards.py | skins, minted instances, market |
| AppSetting | cards.py | runtime-tunable JSON knobs |
| LeagueSeason / Cohort / CohortMember / LeagueGame | league.py | the daily league |
| PlayerStats | dna.py | DNA counters + DQ + skill_sp |
| Segment / SegmentUser / Broadcast / Notification | marketing.py | messaging |
| Friendship / PlayerHand | social.py | friends, per-hand history |
| Squad / SquadMember / SquadMessage | squad.py | clans |
| Achievement / Challenge (+ User*) | progression.py | goals |
