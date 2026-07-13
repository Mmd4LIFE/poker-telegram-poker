"""Daily cohort league.

Shape: everyone past the unlock level is dropped into a cohort of their tier at
midnight (in ONE league timezone — not each player's own, or members would get
different day lengths and the ranking would be a lie). They play Sit & Go
tournaments all day; the top slice promotes and the bottom slice demotes at close.

Bots hold real ranks and really move between tiers — they're what keeps a cohort
of 24 alive when only three humans showed up. They never take a reward slot,
though: prizes go to the top *humans*.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

TIERS = ["bronze", "silver", "gold", "diamond"]


class LeagueSeason(Base):
    """One league day."""

    __tablename__ = "league_seasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(12), default="open", index=True)
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Cohort(Base):
    """One group of players racing each other for a day. Several per tier once the
    population outgrows a single one."""

    __tablename__ = "cohorts"
    __table_args__ = (UniqueConstraint("season_id", "tier", "idx", name="uq_cohort"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_id: Mapped[int] = mapped_column(
        ForeignKey("league_seasons.id", ondelete="CASCADE"), index=True
    )
    tier: Mapped[str] = mapped_column(String(12), index=True)
    idx: Mapped[int] = mapped_column(Integer, default=0)
    capacity: Mapped[int] = mapped_column(Integer, default=24)


class CohortMember(Base):
    __tablename__ = "cohort_members"

    cohort_id: Mapped[int] = mapped_column(
        ForeignKey("cohorts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    lp: Mapped[int] = mapped_column(Integer, default=0)
    # Only the first N games of the day count. Without a cap, the ladder measures
    # endurance rather than skill: 40 mediocre games beat 6 good ones.
    ranked_games: Mapped[int] = mapped_column(Integer, default=0)
    games: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)

    # filled in at close
    rank: Mapped[int] = mapped_column(Integer, default=0)
    outcome: Mapped[str] = mapped_column(String(12), default="")  # promoted|demoted|held
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class LeagueGame(Base):
    """One Sit & Go. `simulated` games were never dealt — no human was in them, so
    the result was sampled from the players' strengths instead of burning CPU on
    hands nobody would ever see."""

    __tablename__ = "league_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cohort_id: Mapped[int] = mapped_column(
        ForeignKey("cohorts.id", ondelete="CASCADE"), index=True
    )
    room_code: Mapped[str | None] = mapped_column(String(12), nullable=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # [{user_id, place, lp, is_bot}]
    results: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
