"""Card skins: designs (families), minted instances (with serials), and the market.

A *design* is a look (e.g. "neon"). A *skin* is one minted instance of that design
applied to one of the 52 cards (e.g. neon Kh #7/800) and is owned by exactly one
user. Supply is finite: once a design's mint for a card is exhausted, the only way
to get one is to buy it from another player on the market.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CardDesign(Base):
    """A skin family. Prices/mint are per-card and scale with card rank."""

    __tablename__ = "card_designs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    rarity: Mapped[str] = mapped_column(String(16), default="common", index=True)

    # Base price = the price of a deuce. Multiplied by the rank curve (A is ~4.5x).
    base_price_coins: Mapped[int] = mapped_column(BigInteger, default=0)
    base_price_gems: Mapped[int] = mapped_column(Integer, default=0)
    # Copies of EACH card that will ever exist. 0 disables shop sales entirely.
    mint_per_card: Mapped[int] = mapped_column(Integer, default=1000)

    # CSS the client renders the card with: bg / fg / red / border / glow / foil.
    palette: Mapped[dict] = mapped_column(JSONB, default=dict)

    tradable: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CardSkin(Base):
    """One minted, owned instance: (design, card, serial)."""

    __tablename__ = "card_skins"
    __table_args__ = (
        UniqueConstraint("design_code", "card", "serial", name="uq_skin_serial"),
        Index("ix_skin_owner_card", "owner_id", "card"),
        Index("ix_skin_design_card", "design_code", "card"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    design_code: Mapped[str] = mapped_column(String(32), index=True)
    card: Mapped[str] = mapped_column(String(2), index=True)  # "Kh"
    serial: Mapped[int] = mapped_column(Integer)              # 1..mint_per_card

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # True while an active market listing holds it (can't equip or re-list).
    on_market: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    source: Mapped[str] = mapped_column(String(16), default="shop")  # shop|market|box|gift
    minted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MarketListing(Base):
    """A player-to-player sale. Sold rows double as the price history."""

    __tablename__ = "market_listings"
    __table_args__ = (
        Index("ix_listing_browse", "status", "design_code", "card"),
        Index("ix_listing_price", "status", "currency", "price"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    skin_id: Mapped[int] = mapped_column(
        ForeignKey("card_skins.id", ondelete="CASCADE"), index=True
    )
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    buyer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # denormalised so browsing/floor queries never need a join
    design_code: Mapped[str] = mapped_column(String(32), index=True)
    card: Mapped[str] = mapped_column(String(2), index=True)
    serial: Mapped[int] = mapped_column(Integer, default=0)

    price: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(8), default="coins")  # coins|gems
    fee: Mapped[int] = mapped_column(BigInteger, default=0)            # burned on sale

    status: Mapped[str] = mapped_column(String(12), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
