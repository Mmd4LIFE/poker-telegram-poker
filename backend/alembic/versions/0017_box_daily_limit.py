"""per-box daily open limit

Revision ID: 0017_box_daily_limit
Revises: 0016_notifications
"""
from alembic import op

revision = "0017_box_daily_limit"
down_revision = "0016_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0 = fall back to the global BOX_DAILY_LIMIT setting.
    op.execute("ALTER TABLE boxes ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE boxes DROP COLUMN IF EXISTS daily_limit")
