"""Economy: transaction ledger, loot boxes, purchases (Stars / TON)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class Transaction(Base):
    """Immutable ledger row for every currency movement."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # coins | gems
    currency: Mapped[str] = mapped_column(String(8), default="coins")
    amount: Mapped[int] = mapped_column(BigInteger)  # signed
    balance_after: Mapped[int] = mapped_column(BigInteger, default=0)
    # signup_bonus, daily, buy_in, cash_out, win, rake, purchase, box_open,
    # achievement, challenge, gift, admin
    kind: Mapped[str] = mapped_column(String(32), index=True)
    ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Box(Base, TimestampMixin):
    """Loot box definition with a weighted reward table."""

    __tablename__ = "boxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(256), default="")
    # common | rare | epic | legendary
    tier: Mapped[str] = mapped_column(String(16), default="common")
    icon: Mapped[str] = mapped_column(String(16), default="📦")
    price_coins: Mapped[int] = mapped_column(BigInteger, default=0)
    price_gems: Mapped[int] = mapped_column(Integer, default=0)
    # opens allowed per user per 24h for THIS box. 0 = unlimited.
    daily_limit: Mapped[int] = mapped_column(Integer, default=0)
    # [{weight, type: coins|gems|avatar, amount|value, label}]
    rewards: Mapped[list] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserBox(Base):
    """A box owned by a user (from rewards) awaiting opening."""

    __tablename__ = "user_boxes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    box_id: Mapped[int] = mapped_column(ForeignKey("boxes.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(32), default="reward")
    opened: Mapped[bool] = mapped_column(Boolean, default=False)
    reward: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Product(Base, TimestampMixin):
    """A purchasable pack (Telegram Stars or TON). Admin-editable."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    # stars | ton
    kind: Mapped[str] = mapped_column(String(8), index=True)
    label: Mapped[str] = mapped_column(String(64))
    # Stars: XTR count. TON: nanoTON.
    base_price: Mapped[int] = mapped_column(BigInteger, default=0)
    coins: Mapped[int] = mapped_column(BigInteger, default=0)
    gems: Mapped[int] = mapped_column(Integer, default=0)
    # 0..90 percent off
    discount_pct: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    @property
    def price(self) -> int:
        p = int(round(self.base_price * (100 - max(0, min(90, self.discount_pct))) / 100))
        return max(1, p)


class Purchase(Base, TimestampMixin):
    """A real-money purchase via Telegram Stars or TON."""

    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # stars | ton
    provider: Mapped[str] = mapped_column(String(8))
    product_code: Mapped[str] = mapped_column(String(48))
    # amount paid in provider units (Stars count, or nanoTON)
    amount: Mapped[int] = mapped_column(BigInteger)
    coins_granted: Mapped[int] = mapped_column(BigInteger, default=0)
    gems_granted: Mapped[int] = mapped_column(Integer, default=0)
    # pending | paid | failed | refunded
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    payload: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_charge_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
