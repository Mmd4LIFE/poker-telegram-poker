"""Poker DNA: raw behavioural counters, one row per player.

Counters, not derived percentages — percentages are computed on read. That keeps
the write path on the hot game loop to a single UPDATE of integers, and lets the
formulas change later without a backfill.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlayerStats(Base):
    __tablename__ = "player_stats"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    hands: Mapped[int] = mapped_column(Integer, default=0)
    # bots never went through record_hand(), so User.hands_won was always 0 for them
    hands_won: Mapped[int] = mapped_column(Integer, default=0)

    # --- preflop
    vpip_opps: Mapped[int] = mapped_column(Integer, default=0)
    vpip: Mapped[int] = mapped_column(Integer, default=0)       # voluntarily paid
    pfr_opps: Mapped[int] = mapped_column(Integer, default=0)
    pfr: Mapped[int] = mapped_column(Integer, default=0)        # raised preflop

    # --- postflop aggression (AF = (bets+raises) / calls)
    agg_actions: Mapped[int] = mapped_column(Integer, default=0)  # bets + raises
    calls: Mapped[int] = mapped_column(Integer, default=0)
    folds: Mapped[int] = mapped_column(Integer, default=0)
    checks: Mapped[int] = mapped_column(Integer, default=0)

    # --- continuation betting (Pressure)
    cbet_opps: Mapped[int] = mapped_column(Integer, default=0)
    cbets: Mapped[int] = mapped_column(Integer, default=0)

    # --- showdown (Hand Reading)
    saw_flop: Mapped[int] = mapped_column(Integer, default=0)
    showdowns: Mapped[int] = mapped_column(Integer, default=0)
    showdowns_won: Mapped[int] = mapped_column(Integer, default=0)

    # --- Deception: took the pot down without ever showing a hand, as the aggressor
    aggressor_hands: Mapped[int] = mapped_column(Integer, default=0)
    won_without_showdown: Mapped[int] = mapped_column(Integer, default=0)
    check_raises: Mapped[int] = mapped_column(Integer, default=0)
    agg_postflop: Mapped[int] = mapped_column(Integer, default=0)
    bluffs: Mapped[int] = mapped_column(Integer, default=0)

    # --- Position: do they open up on the button?
    late_opps: Mapped[int] = mapped_column(Integer, default=0)
    late_vpip: Mapped[int] = mapped_column(Integer, default=0)
    early_opps: Mapped[int] = mapped_column(Integer, default=0)
    early_vpip: Mapped[int] = mapped_column(Integer, default=0)

    # --- Composure: how they play in the hands right after a bruising loss
    tilt_actions: Mapped[int] = mapped_column(Integer, default=0)
    tilt_agg_actions: Mapped[int] = mapped_column(Integer, default=0)
    # hands still inside the post-loss window (counts down)
    tilt_window: Mapped[int] = mapped_column(Integer, default=0)

    # --- Adaptation: does their aggression respond to pressure?
    faced_actions: Mapped[int] = mapped_column(Integer, default=0)
    faced_agg: Mapped[int] = mapped_column(Integer, default=0)
    unopened_actions: Mapped[int] = mapped_column(Integer, default=0)
    unopened_agg: Mapped[int] = mapped_column(Integer, default=0)

    net_won: Mapped[int] = mapped_column(BigInteger, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
