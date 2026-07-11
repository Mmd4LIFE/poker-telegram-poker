"""User model — represents both human players and AI bots."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Telegram id (null for AI bots)
    telegram_id: Mapped[int | None] = mapped_column(
        BigInteger, unique=True, index=True, nullable=True
    )

    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(128), default="Player")
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Cosmetic avatar (icon code, e.g. "crown")
    avatar: Mapped[str] = mapped_column(String(32), default="user")
    # Equipped username color: "" (classic) or a CSS color string
    name_color: Mapped[str] = mapped_column(String(24), default="")
    # Deprecated single field (kept for migration compatibility)
    avatar_color: Mapped[str] = mapped_column(String(24), default="")
    # Per-avatar equipped colors, e.g. {"skull": "#2ecc71", "crown": "#f5c518"}
    avatar_colors: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Owned cosmetics, e.g. ["a:crown", "c:#f5c518", "ac:#3fa9ff"] (colors owned globally)
    owned_cosmetics: Mapped[list] = mapped_column(JSONB, default=list)

    # Opaque referral code used in invite links (instead of the numeric id)
    referral_code: Mapped[str | None] = mapped_column(
        String(16), unique=True, index=True, nullable=True
    )

    # AI bot fields
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # personality: tight / loose / aggressive / balanced / maniac / rock
    bot_personality: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 0.0 (weak / "bad bot") .. 1.0 (strong / "good bot")
    bot_skill: Mapped[float] = mapped_column(Float, default=0.5)

    # Economy
    coins: Mapped[int] = mapped_column(BigInteger, default=0)  # soft currency
    gems: Mapped[int] = mapped_column(BigInteger, default=0)   # premium currency
    stars_spent: Mapped[int] = mapped_column(Integer, default=0)
    ton_spent_nano: Mapped[int] = mapped_column(BigInteger, default=0)

    # Progression
    level: Mapped[int] = mapped_column(Integer, default=1)
    xp: Mapped[int] = mapped_column(BigInteger, default=0)
    # degree/rank tier code, e.g. rookie, shark, legend
    degree: Mapped[str] = mapped_column(String(24), default="rookie")

    # Lifetime stats
    hands_played: Mapped[int] = mapped_column(Integer, default=0)
    hands_won: Mapped[int] = mapped_column(Integer, default=0)
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    biggest_pot: Mapped[int] = mapped_column(BigInteger, default=0)
    total_won: Mapped[int] = mapped_column(BigInteger, default=0)
    win_streak: Mapped[int] = mapped_column(Integer, default=0)
    best_win_streak: Mapped[int] = mapped_column(Integer, default=0)

    # Referrals
    referred_by: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, index=True
    )
    referral_count: Mapped[int] = mapped_column(Integer, default=0)
    referral_earned: Mapped[int] = mapped_column(BigInteger, default=0)

    # Engagement
    daily_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_daily_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)

    @property
    def display_name(self) -> str:
        name = (self.first_name or "").strip()
        if self.last_name:
            name = f"{name} {self.last_name}".strip()
        if name:
            return name
        if self.username:
            return self.username
        return "Player"

    @property
    def handle(self) -> str | None:
        return f"@{self.username}" if self.username else None
