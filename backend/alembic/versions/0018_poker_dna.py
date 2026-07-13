"""player_stats (Poker DNA) + bot self-play tables

Revision ID: 0018_poker_dna
Revises: 0017_box_daily_limit
"""
from alembic import op
import sqlalchemy as sa

revision = "0018_poker_dna"
down_revision = "0017_box_daily_limit"
branch_labels = None
depends_on = None

COUNTERS = [
    "hands", "vpip_opps", "vpip", "pfr_opps", "pfr",
    "agg_actions", "calls", "folds", "checks",
    "cbet_opps", "cbets",
    "saw_flop", "showdowns", "showdowns_won",
    "aggressor_hands", "won_without_showdown", "check_raises",
    "agg_postflop", "bluffs",
    "late_opps", "late_vpip", "early_opps", "early_vpip",
    "tilt_actions", "tilt_agg_actions", "tilt_window",
    "faced_actions", "faced_agg", "unopened_actions", "unopened_agg",
]


def upgrade() -> None:
    op.execute(
        "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_bot_table BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rooms_is_bot_table ON rooms (is_bot_table)"
    )

    if "player_stats" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "player_stats",
            sa.Column(
                "user_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            *[sa.Column(c, sa.Integer, server_default="0") for c in COUNTERS],
            sa.Column("net_won", sa.BigInteger, server_default="0"),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )


def downgrade() -> None:
    op.drop_table("player_stats")
    op.execute("DROP INDEX IF EXISTS ix_rooms_is_bot_table")
    op.execute("ALTER TABLE rooms DROP COLUMN IF EXISTS is_bot_table")
