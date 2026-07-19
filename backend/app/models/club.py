"""Clubs — friend clans (PUBG-style) that can host private tables together."""
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Club(Base, TimestampMixin):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(48))
    tag: Mapped[str] = mapped_column(String(8), default="")
    emblem: Mapped[str] = mapped_column(String(16), default="♠️")
    description: Mapped[str] = mapped_column(String(256), default="")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    xp: Mapped[int] = mapped_column(BigInteger, default=0)
    total_won: Mapped[int] = mapped_column(BigInteger, default=0)
    bank_coins: Mapped[int] = mapped_column(BigInteger, default=0)
    max_members: Mapped[int] = mapped_column(Integer, default=20)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    members: Mapped[list["ClubMember"]] = relationship(
        back_populates="club", cascade="all, delete-orphan"
    )


class ClubMessage(Base):
    __tablename__ = "club_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(300))
    # a system line ("X joined", "Y won 1.2M") rather than a member's chat
    system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class ClubPointEvent(Base):
    """Append-only Club Points ledger. One row per player per hand that earned CP in a
    club game. Weekly leaderboards sum by (club, user, iso_year, iso_week); the club's
    and member's lifetime totals live on Club.xp / ClubMember.contributed."""

    __tablename__ = "club_point_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    cp: Mapped[int] = mapped_column(Integer, default=0)
    iso_year: Mapped[int] = mapped_column(Integer, index=True)
    iso_week: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ClubJoinRequest(Base):
    """A pending request to join a private club, awaiting an owner/manager decision."""

    __tablename__ = "club_join_requests"
    __table_args__ = (
        UniqueConstraint("club_id", "user_id", name="uq_join_request"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ClubMember(Base):
    __tablename__ = "club_members"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_club_member_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # owner | officer | member
    role: Mapped[str] = mapped_column(String(12), default="member")
    contributed: Mapped[int] = mapped_column(BigInteger, default=0)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    club: Mapped["Club"] = relationship(back_populates="members")
