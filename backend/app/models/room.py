"""Room (table), seated players and persisted hand history."""
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Room(Base, TimestampMixin):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Short human-shareable code used for "join by code"
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), default="Poker Table")

    host_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    squad_id: Mapped[int | None] = mapped_column(
        ForeignKey("squads.id", ondelete="SET NULL"), nullable=True
    )

    # waiting | playing | finished
    status: Mapped[str] = mapped_column(String(16), default="waiting", index=True)
    game_type: Mapped[str] = mapped_column(String(24), default="holdem")

    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    is_ranked: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_bots: Mapped[bool] = mapped_column(Boolean, default=True)

    max_players: Mapped[int] = mapped_column(Integer, default=6)
    small_blind: Mapped[int] = mapped_column(BigInteger, default=50)
    big_blind: Mapped[int] = mapped_column(BigInteger, default=100)
    min_buy_in: Mapped[int] = mapped_column(BigInteger, default=2000)
    max_buy_in: Mapped[int] = mapped_column(BigInteger, default=20000)

    hand_no: Mapped[int] = mapped_column(Integer, default=0)
    # bumped on create / seat / hand end — used to auto-close idle tables
    # A bot-only table kept alive for self-play. It's a real, joinable room: humans
    # see it in Open Tables, which is why self-play doubles as lobby liveliness.
    is_bot_table: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    last_active_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=True
    )

    players: Mapped[list["RoomPlayer"]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class RoomPlayer(Base, TimestampMixin):
    __tablename__ = "room_players"
    __table_args__ = (
        UniqueConstraint("room_id", "seat", name="uq_room_seat"),
        UniqueConstraint("room_id", "user_id", name="uq_room_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    seat: Mapped[int] = mapped_column(Integer)
    # chips currently at the table (buy-in stack)
    stack: Mapped[int] = mapped_column(BigInteger, default=0)
    # seated | sitting_out | left
    status: Mapped[str] = mapped_column(String(16), default="seated")
    is_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    room: Mapped["Room"] = relationship(back_populates="players")


class Hand(Base, TimestampMixin):
    """Persisted result of a completed hand (for history / stats / anti-cheat)."""

    __tablename__ = "hands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), index=True
    )
    hand_no: Mapped[int] = mapped_column(Integer)
    pot: Mapped[int] = mapped_column(BigInteger, default=0)
    board: Mapped[list] = mapped_column(JSONB, default=list)
    # [{user_id, cards, hand_name, net, won}]
    results: Mapped[list] = mapped_column(JSONB, default=list)
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
