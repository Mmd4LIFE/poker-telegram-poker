"""Social graph: friendships and per-player match history."""
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


class Friendship(Base, TimestampMixin):
    """Directed row: user_id requested friend_id. Accepted = mutual friends."""

    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    friend_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # pending | accepted | blocked
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PlayerHand(Base):
    """One row per human player per completed hand — powers match history."""

    __tablename__ = "player_hands"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    room_id: Mapped[int] = mapped_column(Integer, index=True)
    room_code: Mapped[str] = mapped_column(String(12), default="")
    hand_no: Mapped[int] = mapped_column(Integer, default=0)
    net: Mapped[int] = mapped_column(BigInteger, default=0)   # signed chip change
    won: Mapped[bool] = mapped_column(Boolean, default=False)
    showdown: Mapped[bool] = mapped_column(Boolean, default=False)
    hand_name: Mapped[str] = mapped_column(String(32), default="")
    pot: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
