"""Audience segments and bot broadcasts.

Segment membership is materialised into `segment_users` rather than recomputed on
every read: the rules can involve joins over skins, listings and squads, which is
far too expensive to run on a page load. Membership is refreshed on demand (admin
presses Calculate) and always immediately before a broadcast goes out.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    # See services/segments.py for the supported keys.
    rules: Mapped[dict] = mapped_column(JSONB, default=dict)
    user_count: Mapped[int] = mapped_column(Integer, default=0)
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SegmentUser(Base):
    __tablename__ = "segment_users"

    segment_id: Mapped[int] = mapped_column(
        ForeignKey("segments.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id", ondelete="SET NULL"), nullable=True
    )
    segment_name: Mapped[str] = mapped_column(String(64), default="Everyone")

    status: Mapped[str] = mapped_column(String(12), default="queued", index=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    sent: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Notification(Base):
    """In-app notification. One row per user per event (both sides of a trade)."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(24), index=True)  # trade_sold|trade_bought
    title: Mapped[str] = mapped_column(String(128))
    body: Mapped[str] = mapped_column(String(256), default="")
    # enough to render the card art and deep-link into the trade
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)

    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
