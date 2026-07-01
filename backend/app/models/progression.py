"""Progression: achievements and time-boxed challenges."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class Achievement(Base, TimestampMixin):
    """A one-off achievement definition."""

    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(256), default="")
    icon: Mapped[str] = mapped_column(String(16), default="🏆")
    category: Mapped[str] = mapped_column(String(24), default="general")
    # metric tracked, e.g. hands_won, biggest_pot, level, games_played
    metric: Mapped[str] = mapped_column(String(32), default="hands_won")
    target: Mapped[int] = mapped_column(BigInteger, default=1)
    reward_coins: Mapped[int] = mapped_column(BigInteger, default=0)
    reward_gems: Mapped[int] = mapped_column(Integer, default=0)
    reward_xp: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE")
    )
    progress: Mapped[int] = mapped_column(BigInteger, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Challenge(Base, TimestampMixin):
    """A recurring daily/weekly challenge definition."""

    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(256), default="")
    icon: Mapped[str] = mapped_column(String(16), default="🎯")
    # daily | weekly
    period: Mapped[str] = mapped_column(String(8), default="daily")
    metric: Mapped[str] = mapped_column(String(32), default="hands_played")
    target: Mapped[int] = mapped_column(BigInteger, default=5)
    reward_coins: Mapped[int] = mapped_column(BigInteger, default=0)
    reward_gems: Mapped[int] = mapped_column(Integer, default=0)
    reward_xp: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserChallenge(Base):
    __tablename__ = "user_challenges"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "challenge_id", "period_key", name="uq_user_challenge_period"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    challenge_id: Mapped[int] = mapped_column(
        ForeignKey("challenges.id", ondelete="CASCADE")
    )
    # date bucket, e.g. 2026-07-01 (daily) or 2026-W27 (weekly)
    period_key: Mapped[str] = mapped_column(String(16), index=True)
    progress: Mapped[int] = mapped_column(BigInteger, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
