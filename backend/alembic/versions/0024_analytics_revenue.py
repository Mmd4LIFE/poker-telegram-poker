"""analytics: real-money revenue columns on fact_daily

Additive only — four columns with a 0 default, so existing rows are untouched and the
next backfill fills them accurately from the (immutable) purchases ledger.

Revision ID: 0024_analytics_revenue
Revises: 0023_analytics
"""
from alembic import op
import sqlalchemy as sa

revision = "0024_analytics_revenue"
down_revision = "0023_analytics"
branch_labels = None
depends_on = None

_COLS = {
    "stars_revenue": sa.BigInteger,
    "ton_revenue_nano": sa.BigInteger,
    "purchases_paid": sa.Integer,
    "active_payers": sa.Integer,
}


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("fact_daily")}
    for name, type_ in _COLS.items():
        if name not in have:
            op.add_column("fact_daily", sa.Column(name, type_, server_default="0"))


def downgrade() -> None:
    for name in _COLS:
        op.drop_column("fact_daily", name)
