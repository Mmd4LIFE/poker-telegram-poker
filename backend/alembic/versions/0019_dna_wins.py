"""player_stats.hands_won

Revision ID: 0019_dna_wins
Revises: 0018_poker_dna
"""
from alembic import op

revision = "0019_dna_wins"
down_revision = "0018_poker_dna"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS hands_won INTEGER DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE player_stats DROP COLUMN IF EXISTS hands_won")
