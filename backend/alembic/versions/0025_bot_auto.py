"""users.bot_auto — mark bots minted on demand vs the seeded roster

Additive, default false.

Revision ID: 0025_bot_auto
Revises: 0024_analytics_revenue
"""
from alembic import op
import sqlalchemy as sa

revision = "0025_bot_auto"
down_revision = "0024_analytics_revenue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    if "bot_auto" not in have:
        op.add_column(
            "users",
            sa.Column("bot_auto", sa.Boolean, server_default=sa.false(), nullable=False),
        )


def downgrade() -> None:
    op.drop_column("users", "bot_auto")
