"""Derived analytics — a daily snapshot fact table.

NOT operational: the app never reads this on a request. It's an append-only rollup
written once a day by the janitor, so trends can be charted without recomputing over
the whole event log every time. The operational tables are the source of truth and are
never touched by this.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FactDaily(Base):
    """One row per calendar day (UTC). Idempotent: recomputing a day overwrites it."""

    __tablename__ = "fact_daily"

    day: Mapped[date] = mapped_column(Date, primary_key=True)

    # population
    users_total: Mapped[int] = mapped_column(Integer, default=0)      # humans, cumulative
    new_users: Mapped[int] = mapped_column(Integer, default=0)        # joined this day
    dau: Mapped[int] = mapped_column(Integer, default=0)              # active this day
    reachable: Mapped[int] = mapped_column(Integer, default=0)        # bot_started humans

    # economy — circulation is a point-in-time snapshot; flows are for the day
    coins_circulation: Mapped[int] = mapped_column(BigInteger, default=0)
    gems_circulation: Mapped[int] = mapped_column(BigInteger, default=0)
    coins_in: Mapped[int] = mapped_column(BigInteger, default=0)      # credited (faucet)
    coins_out: Mapped[int] = mapped_column(BigInteger, default=0)     # debited (sink)
    gems_in: Mapped[int] = mapped_column(BigInteger, default=0)
    gems_out: Mapped[int] = mapped_column(BigInteger, default=0)

    # market
    trades: Mapped[int] = mapped_column(Integer, default=0)
    fee_coins_burned: Mapped[int] = mapped_column(BigInteger, default=0)
    fee_gems_burned: Mapped[int] = mapped_column(BigInteger, default=0)

    # engagement
    hands_played: Mapped[int] = mapped_column(Integer, default=0)
    league_games: Mapped[int] = mapped_column(Integer, default=0)
    box_opens: Mapped[int] = mapped_column(Integer, default=0)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
