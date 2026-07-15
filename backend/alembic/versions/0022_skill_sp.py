"""cumulative skill points (XP-style skill level)

Revision ID: 0022_skill_sp
Revises: 0021_decision_quality
"""
from alembic import op

revision = "0022_skill_sp"
down_revision = "0021_decision_quality"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS skill_sp BIGINT DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE player_stats DROP COLUMN IF EXISTS skill_sp")
