"""Helpers for populating tables with AI bot players."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User

# Pools for naming freshly-generated bots when the seeded roster is all busy.
_ADJ = [
    "Swift", "Lucky", "Sly", "Bold", "Quiet", "Iron", "Neon", "Wild", "Cosmic",
    "Turbo", "Shadow", "Frost", "Blaze", "Zen", "Rogue", "Vivid", "Nova", "Echo",
]
_NAME = [
    "Ravi", "Mika", "Leo", "Aria", "Kai", "Noor", "Enzo", "Lila", "Omar", "Yara",
    "Dex", "Ines", "Tariq", "Pia", "Milo", "Zara", "Finn", "Ada", "Rex", "Juno",
]
_PERSONALITIES = ["tight", "balanced", "aggressive", "loose", "rock", "maniac"]


async def pick_bots(
    session: AsyncSession, exclude_ids: set[int], count: int
) -> list[User]:
    """Return up to `count` random bot users not in `exclude_ids`.

    `exclude_ids` MUST include every bot currently seated at ANY table — a bot seated
    at two tables at once plays two hands with one brain and one bankroll, which is the
    double-seating bug. The caller passes the GLOBAL busy set, not just this table's.
    """
    if count <= 0:
        return []
    stmt = (
        select(User)
        .where(User.is_bot.is_(True), User.is_banned.is_(False))
        .where(~User.id.in_(exclude_ids or {-1}))
        .order_by(func.random())
        .limit(count)
    )
    return list((await session.execute(stmt)).scalars().all())


async def generate_bot(session: AsyncSession, seed: int) -> User:
    """Mint a brand-new bot. Used when every existing bot is already busy, so a table
    can always be filled rather than starved. `seed` varies the name/traits per call."""
    adj = _ADJ[seed % len(_ADJ)]
    nm = _NAME[(seed // len(_ADJ)) % len(_NAME)]
    base = f"{adj} {nm}"
    name = base
    bump = 0
    while await session.scalar(
        select(User.id).where(User.is_bot.is_(True), User.first_name == name)
    ):
        bump += 1
        name = f"{base} {bump}"
    personality = _PERSONALITIES[seed % len(_PERSONALITIES)]
    skill = round(0.4 + (seed % 6) * 0.1, 2)  # spread 0.4–0.9
    bot = User(
        telegram_id=None, first_name=name, username=None, avatar="bot",
        is_bot=True, bot_auto=True, bot_personality=personality, bot_skill=skill,
        coins=100_000_000, level=max(1, int(skill * 40)), xp=int(skill * 40) * 500,
    )
    session.add(bot)
    await session.flush()
    return bot
