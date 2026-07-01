"""Idempotent baseline data: AI bots, achievements, challenges, loot boxes.

Run with:  python -m app.seed
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Achievement, Box, Challenge, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("poker.seed")


# name, avatar, personality, skill (0=bad .. 1=good)
BOTS = [
    ("Ivan the Rock", "🗿", "rock", 0.80),
    ("Steady Sofia", "🧊", "tight", 0.85),
    ("Professor Chen", "🎓", "balanced", 0.92),
    ("Sniper Yuki", "🎯", "tight", 0.88),
    ("Wall Street Wes", "💼", "balanced", 0.90),
    ("Calm Kenji", "🧘", "tight", 0.83),
    ("Sharp Nadia", "🦈", "aggressive", 0.87),
    ("Cold Viktor", "❄️", "balanced", 0.86),
    ("Ace Amara", "🅰️", "aggressive", 0.84),
    ("Diamond Dana", "💎", "balanced", 0.89),
    ("Lucky Luca", "🍀", "loose", 0.55),
    ("Casino Carla", "🎰", "loose", 0.50),
    ("Bluffy Bob", "🎭", "aggressive", 0.60),
    ("Wild Wanda", "🌪️", "maniac", 0.45),
    ("Reckless Rex", "🔥", "maniac", 0.35),
    ("Gambler Gus", "🎲", "loose", 0.40),
    ("Newbie Nino", "🐣", "loose", 0.20),
    ("Tilted Tom", "😤", "maniac", 0.25),
    ("Calling Kate", "📞", "loose", 0.30),
    ("Splashy Sam", "💦", "maniac", 0.28),
    ("Fishy Fred", "🐟", "loose", 0.18),
    ("Rookie Rita", "🌸", "balanced", 0.35),
    ("Hasty Hugo", "⚡", "aggressive", 0.42),
    ("Drunk Dmitri", "🍺", "maniac", 0.22),
    ("Patient Pia", "🕰️", "rock", 0.70),
    ("Silent Suki", "🤫", "tight", 0.78),
    ("Boss Bruno", "👔", "aggressive", 0.82),
    ("Queen Bea", "👸", "balanced", 0.80),
    ("Maverick Max", "🕶️", "aggressive", 0.75),
    ("Zen Zoe", "☯️", "tight", 0.72),
]

ACHIEVEMENTS = [
    # code, title, desc, icon, category, metric, target, coins, gems, xp
    ("first_hand", "First Hand", "Play your very first hand", "🃏", "beginner", "hands_played", 1, 1000, 0, 50),
    ("hands_10", "Getting Started", "Play 10 hands", "🎴", "grind", "hands_played", 10, 2000, 0, 100),
    ("hands_100", "Regular", "Play 100 hands", "🎴", "grind", "hands_played", 100, 10000, 2, 300),
    ("hands_1000", "Grinder", "Play 1,000 hands", "⚙️", "grind", "hands_played", 1000, 50000, 10, 1000),
    ("win_1", "First Blood", "Win your first hand", "🩸", "wins", "hands_won", 1, 1500, 0, 75),
    ("win_50", "Winner", "Win 50 hands", "🏅", "wins", "hands_won", 50, 15000, 5, 500),
    ("win_500", "Champion", "Win 500 hands", "🏆", "wins", "hands_won", 500, 80000, 25, 2000),
    ("streak_5", "On Fire", "Win 5 hands in a row", "🔥", "skill", "best_win_streak", 5, 10000, 3, 400),
    ("streak_10", "Unstoppable", "Win 10 hands in a row", "💥", "skill", "best_win_streak", 10, 40000, 15, 1200),
    ("pot_50k", "Big Pot", "Win a pot of 50,000+", "💰", "high_roller", "biggest_pot", 50000, 20000, 5, 600),
    ("pot_500k", "Monster Pot", "Win a pot of 500,000+", "🐋", "high_roller", "biggest_pot", 500000, 100000, 40, 2500),
    ("level_10", "Rising Star", "Reach level 10", "⭐", "progress", "level", 10, 25000, 10, 0),
    ("level_25", "Veteran", "Reach level 25", "🌟", "progress", "level", 25, 75000, 30, 0),
    ("level_50", "Legend", "Reach level 50", "👑", "progress", "level", 50, 250000, 100, 0),
    ("games_20", "Table Regular", "Sit at 20 tables", "🪑", "social", "games_played", 20, 12000, 3, 400),
    ("won_1m", "Millionaire", "Win 1,000,000 chips total", "🤑", "high_roller", "total_won", 1000000, 100000, 50, 3000),
]

CHALLENGES = [
    # code, title, desc, icon, period, metric, target, coins, gems, xp
    ("daily_play_10", "Daily Grind", "Play 10 hands today", "🎯", "daily", "hands_played", 10, 3000, 0, 150),
    ("daily_win_3", "Daily Winner", "Win 3 hands today", "🏅", "daily", "hands_won", 3, 4000, 1, 200),
    ("daily_earn_20k", "Daily Earner", "Win 20,000 chips today", "💵", "daily", "coins_won", 20000, 5000, 2, 250),
    ("weekly_play_100", "Weekly Warrior", "Play 100 hands this week", "⚔️", "weekly", "hands_played", 100, 25000, 5, 800),
    ("weekly_win_30", "Weekly Shark", "Win 30 hands this week", "🦈", "weekly", "hands_won", 30, 35000, 10, 1000),
    ("weekly_earn_200k", "Weekly Tycoon", "Win 200,000 chips this week", "🏦", "weekly", "coins_won", 200000, 60000, 20, 1500),
]

BOXES = [
    ("box_common", "Common Chest", "A little something.", "common", "📦", 20000, 0, [
        {"weight": 50, "type": "coins", "amount": 10000, "label": "10K coins"},
        {"weight": 30, "type": "coins", "amount": 25000, "label": "25K coins"},
        {"weight": 15, "type": "coins", "amount": 50000, "label": "50K coins"},
        {"weight": 5, "type": "gems", "amount": 5, "label": "5 gems"},
    ]),
    ("box_rare", "Rare Chest", "Better odds, bigger loot.", "rare", "🎁", 75000, 10, [
        {"weight": 40, "type": "coins", "amount": 50000, "label": "50K coins"},
        {"weight": 30, "type": "coins", "amount": 120000, "label": "120K coins"},
        {"weight": 20, "type": "gems", "amount": 15, "label": "15 gems"},
        {"weight": 8, "type": "coins", "amount": 300000, "label": "300K coins"},
        {"weight": 2, "type": "avatar", "value": "🦈", "label": "Shark avatar"},
    ]),
    ("box_epic", "Epic Vault", "Serious rewards for high rollers.", "epic", "🧰", 250000, 40, [
        {"weight": 35, "type": "coins", "amount": 200000, "label": "200K coins"},
        {"weight": 30, "type": "coins", "amount": 500000, "label": "500K coins"},
        {"weight": 20, "type": "gems", "amount": 60, "label": "60 gems"},
        {"weight": 10, "type": "coins", "amount": 1200000, "label": "1.2M coins"},
        {"weight": 5, "type": "avatar", "value": "👑", "label": "Crown avatar"},
    ]),
    ("box_legendary", "Legendary Case", "The ultimate prize.", "legendary", "🏆", 0, 150, [
        {"weight": 40, "type": "coins", "amount": 1000000, "label": "1M coins"},
        {"weight": 30, "type": "gems", "amount": 150, "label": "150 gems"},
        {"weight": 20, "type": "coins", "amount": 3000000, "label": "3M coins"},
        {"weight": 8, "type": "avatar", "value": "🐋", "label": "Whale avatar"},
        {"weight": 2, "type": "avatar", "value": "💎", "label": "Diamond avatar"},
    ]),
]


async def seed_bots(session) -> None:
    existing = (await session.execute(
        select(func.count(User.id)).where(User.is_bot.is_(True))
    )).scalar_one()
    if existing >= len(BOTS):
        logger.info("Bots already seeded (%s)", existing)
        return
    have = {
        u.first_name for u in (await session.execute(
            select(User).where(User.is_bot.is_(True))
        )).scalars().all()
    }
    for name, avatar, personality, skill in BOTS:
        if name in have:
            continue
        session.add(User(
            telegram_id=None, first_name=name,
            username=None, avatar=avatar, is_bot=True,
            bot_personality=personality, bot_skill=skill,
            coins=100_000_000, level=max(1, int(skill * 40)),
            xp=int(skill * 40) * 500,
        ))
    logger.info("Seeded bots")


async def _upsert_achievement(session, row) -> None:
    code = row[0]
    obj = (await session.execute(
        select(Achievement).where(Achievement.code == code)
    )).scalar_one_or_none()
    fields = dict(
        code=row[0], title=row[1], description=row[2], icon=row[3],
        category=row[4], metric=row[5], target=row[6],
        reward_coins=row[7], reward_gems=row[8], reward_xp=row[9],
    )
    if obj:
        for k, v in fields.items():
            setattr(obj, k, v)
    else:
        session.add(Achievement(**fields))


async def _upsert_challenge(session, row) -> None:
    obj = (await session.execute(
        select(Challenge).where(Challenge.code == row[0])
    )).scalar_one_or_none()
    fields = dict(
        code=row[0], title=row[1], description=row[2], icon=row[3],
        period=row[4], metric=row[5], target=row[6],
        reward_coins=row[7], reward_gems=row[8], reward_xp=row[9], is_active=True,
    )
    if obj:
        for k, v in fields.items():
            setattr(obj, k, v)
    else:
        session.add(Challenge(**fields))


async def _upsert_box(session, row) -> None:
    obj = (await session.execute(
        select(Box).where(Box.code == row[0])
    )).scalar_one_or_none()
    fields = dict(
        code=row[0], name=row[1], description=row[2], tier=row[3], icon=row[4],
        price_coins=row[5], price_gems=row[6], rewards=row[7], is_active=True,
    )
    if obj:
        for k, v in fields.items():
            setattr(obj, k, v)
    else:
        session.add(Box(**fields))


async def main() -> None:
    async with SessionLocal() as session:
        await seed_bots(session)
        for row in ACHIEVEMENTS:
            await _upsert_achievement(session, row)
        for row in CHALLENGES:
            await _upsert_challenge(session, row)
        for row in BOXES:
            await _upsert_box(session, row)
        await session.commit()
    logger.info("Seeding complete ✔")


if __name__ == "__main__":
    asyncio.run(main())
