"""decision-quality scoring columns on player_stats

Revision ID: 0021_decision_quality
Revises: 0020_league
"""
from alembic import op

revision = "0021_decision_quality"
down_revision = "0020_league"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dq_decisions INTEGER DEFAULT 0")
    op.execute("ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dq_weight DOUBLE PRECISION DEFAULT 0")
    op.execute("ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dq_weighted DOUBLE PRECISION DEFAULT 0")
    op.execute("ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dq_blunders INTEGER DEFAULT 0")
    op.execute("ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dq_worst JSONB DEFAULT '[]'::jsonb")


def downgrade() -> None:
    for c in ("dq_decisions", "dq_weight", "dq_weighted", "dq_blunders", "dq_worst"):
        op.execute(f"ALTER TABLE player_stats DROP COLUMN IF EXISTS {c}")
