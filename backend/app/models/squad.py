"""Squads — friend clans (PUBG-style) that can host private tables together."""
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


class Squad(Base, TimestampMixin):
    __tablename__ = "squads"

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

    members: Mapped[list["SquadMember"]] = relationship(
        back_populates="squad", cascade="all, delete-orphan"
    )


class SquadMessage(Base):
    __tablename__ = "squad_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    squad_id: Mapped[int] = mapped_column(
        ForeignKey("squads.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class SquadMember(Base):
    __tablename__ = "squad_members"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_squad_member_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    squad_id: Mapped[int] = mapped_column(
        ForeignKey("squads.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # owner | officer | member
    role: Mapped[str] = mapped_column(String(12), default="member")
    contributed: Mapped[int] = mapped_column(BigInteger, default=0)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    squad: Mapped["Squad"] = relationship(back_populates="members")
