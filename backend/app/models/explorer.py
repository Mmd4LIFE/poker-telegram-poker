"""Saved data-explorer questions ("cards"), Metabase-style.

A card is either a visual-builder query (table + filters + summarise) or a native
read-only SQL query. Admin-only; this is a reporting tool over the live DB.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExplorerCard(Base):
    __tablename__ = "explorer_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(400), default="")
    # builder | native
    kind: Mapped[str] = mapped_column(String(12), default="builder", index=True)
    # builder spec: {table, filters, aggregations, group_by, sort, dir, limit}
    spec: Mapped[dict] = mapped_column(JSONB, default=dict)
    # native SQL (read-only SELECT), when kind == "native"
    sql: Mapped[str | None] = mapped_column(Text, nullable=True)
    # {type: table|bar|line, x, y}
    viz: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
