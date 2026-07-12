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
    ("Ivan the Rock", "skull", "rock", 0.80),
    ("Steady Sofia", "turtle", "tight", 0.85),
    ("Professor Chen", "brain", "balanced", 0.92),
    ("Sniper Yuki", "target", "tight", 0.88),
    ("Wall Street Wes", "diamond", "balanced", 0.90),
    ("Calm Kenji", "smile", "tight", 0.83),
    ("Sharp Nadia", "swords", "aggressive", 0.87),
    ("Cold Viktor", "snail", "balanced", 0.86),
    ("Ace Amara", "star", "aggressive", 0.84),
    ("Diamond Dana", "gem", "balanced", 0.89),
    ("Lucky Luca", "club", "loose", 0.55),
    ("Casino Carla", "dice", "loose", 0.50),
    ("Bluffy Bob", "ghost", "aggressive", 0.60),
    ("Wild Wanda", "flame", "maniac", 0.45),
    ("Reckless Rex", "flame", "maniac", 0.35),
    ("Gambler Gus", "dice", "loose", 0.40),
    ("Newbie Nino", "bird", "loose", 0.20),
    ("Tilted Tom", "bug", "maniac", 0.25),
    ("Calling Kate", "cat", "loose", 0.30),
    ("Splashy Sam", "fish", "maniac", 0.28),
    ("Fishy Fred", "fish", "loose", 0.18),
    ("Rookie Rita", "rabbit", "balanced", 0.35),
    ("Hasty Hugo", "zap", "aggressive", 0.42),
    ("Drunk Dmitri", "squirrel", "maniac", 0.22),
    ("Patient Pia", "anchor", "rock", 0.70),
    ("Silent Suki", "smile", "tight", 0.78),
    ("Boss Bruno", "crown", "aggressive", 0.82),
    ("Queen Bea", "crown", "balanced", 0.80),
    ("Maverick Max", "rocket", "aggressive", 0.75),
    ("Zen Zoe", "dog", "tight", 0.72),
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

# Reward tables are balanced to a house edge (EV ~75-85% of price).
# 1 gem is valued at ~2,500 coins (see services/economy_balance.GEM_COIN_VALUE).
BOXES = [
    ("box_common", "Common Chest", "A little something.", "common", "📦", 20000, 0, [
        {"weight": 40, "type": "coins", "amount": 10000, "label": "10K coins"},
        {"weight": 32, "type": "coins", "amount": 16000, "label": "16K coins"},
        {"weight": 20, "type": "coins", "amount": 24000, "label": "24K coins"},
        {"weight": 6, "type": "coins", "amount": 40000, "label": "40K coins"},
        {"weight": 2, "type": "gems", "amount": 4, "label": "4 gems"},
    ]),
    ("box_rare", "Rare Chest", "Better odds, bigger loot.", "rare", "🎁", 75000, 30, [
        {"weight": 40, "type": "coins", "amount": 45000, "label": "45K coins"},
        {"weight": 30, "type": "coins", "amount": 65000, "label": "65K coins"},
        {"weight": 18, "type": "coins", "amount": 95000, "label": "95K coins"},
        {"weight": 8, "type": "gems", "amount": 12, "label": "12 gems"},
        {"weight": 3, "type": "coins", "amount": 160000, "label": "160K coins"},
        {"weight": 1, "type": "avatar", "value": "skull", "label": "Skull avatar"},
    ]),
    ("box_epic", "Epic Vault", "Serious rewards for high rollers.", "epic", "🧰", 250000, 100, [
        {"weight": 38, "type": "coins", "amount": 140000, "label": "140K coins"},
        {"weight": 30, "type": "coins", "amount": 210000, "label": "210K coins"},
        {"weight": 20, "type": "coins", "amount": 300000, "label": "300K coins"},
        {"weight": 8, "type": "gems", "amount": 40, "label": "40 gems"},
        {"weight": 3, "type": "coins", "amount": 550000, "label": "550K coins"},
        {"weight": 1, "type": "avatar", "value": "crown", "label": "Crown avatar"},
    ]),
    ("box_legendary", "Legendary Case", "The ultimate prize.", "legendary", "🏆", 0, 150, [
        {"weight": 34, "type": "coins", "amount": 250000, "label": "250K coins"},
        {"weight": 28, "type": "gems", "amount": 50, "label": "50 gems"},
        {"weight": 22, "type": "coins", "amount": 450000, "label": "450K coins"},
        {"weight": 10, "type": "gems", "amount": 100, "label": "100 gems"},
        {"weight": 5, "type": "coins", "amount": 900000, "label": "900K coins"},
        {"weight": 1, "type": "avatar", "value": "diamond", "label": "Diamond avatar"},
    ]),
]

# code, kind, label, base_price (stars XTR / nanoTON), coins, gems, sort
PRODUCTS = [
    ("starter_1", "stars", "Lucky Starter", 1, 2_500, 0, 0),
    ("coins_small", "stars", "Stack of Chips", 50, 50_000, 0, 1),
    ("coins_medium", "stars", "Chip Case", 150, 180_000, 5, 2),
    ("coins_large", "stars", "Chip Vault", 500, 700_000, 25, 3),
    ("coins_whale", "stars", "High Roller", 1500, 2_500_000, 100, 4),
    ("gems_pack", "stars", "Gem Pouch", 250, 0, 100, 5),
    ("vip_month", "stars", "VIP Month", 400, 250_000, 50, 6),
    ("ton_starter", "ton", "TON Starter", 500_000_000, 200_000, 20, 10),
    ("ton_pro", "ton", "TON Pro", 2_000_000_000, 1_000_000, 120, 11),
    ("ton_elite", "ton", "TON Elite", 5_000_000_000, 3_000_000, 400, 12),
]


async def seed_bots(session) -> None:
    existing = {
        u.first_name: u for u in (await session.execute(
            select(User).where(User.is_bot.is_(True))
        )).scalars().all()
    }
    for name, avatar, personality, skill in BOTS:
        bot = existing.get(name)
        if bot:
            bot.avatar = avatar  # keep icon avatars in sync
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


async def _upsert_product(session, row) -> None:
    from app.models import Product
    obj = (await session.execute(
        select(Product).where(Product.code == row[0])
    )).scalar_one_or_none()
    if obj:
        # never clobber admin-tuned price/discount/active — only refresh statics
        obj.label = row[2]
        obj.coins = row[4]
        obj.gems = row[5]
        obj.sort_order = row[6]
        if not obj.base_price:
            obj.base_price = row[3]
        return
    session.add(Product(
        code=row[0], kind=row[1], label=row[2], base_price=row[3],
        coins=row[4], gems=row[5], sort_order=row[6], is_active=True,
    ))


async def main() -> None:
    async with SessionLocal() as session:
        await seed_bots(session)
        for row in PRODUCTS:
            await _upsert_product(session, row)
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
