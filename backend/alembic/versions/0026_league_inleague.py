"""cohort_members: per-day shard prize + in-league skill telemetry

All additive, default 0. A new league day makes new CohortMember rows, so these reset
per day automatically while past rows keep their values (history preserved).

Revision ID: 0026_league_inleague
Revises: 0025_bot_auto
"""
from alembic import op
import sqlalchemy as sa

revision = "0026_league_inleague"
down_revision = "0025_bot_auto"
branch_labels = None
depends_on = None

_COLS = {
    "shards_awarded": sa.Integer,
    "il_dq_n": sa.Integer,
    "il_dq_w": sa.Float,
    "il_dq_wt": sa.Float,
    "il_hands": sa.Integer,
    "il_fold": sa.Integer,
    "il_call": sa.Integer,
    "il_raise": sa.Integer,
    "il_check": sa.Integer,
    "il_net": sa.BigInteger,
}


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("cohort_members")}
    for name, type_ in _COLS.items():
        if name not in have:
            op.add_column(
                "cohort_members",
                sa.Column(name, type_, server_default="0", nullable=False),
            )


def downgrade() -> None:
    for name in _COLS:
        op.drop_column("cohort_members", name)
