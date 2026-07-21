"""users.onboarding — progressive onboarding state + grandfather existing players

Adds a JSONB `onboarding` column and backfills existing users so they are NOT retroactively
spotlighted: every feature whose gate level they already meet is marked as an already-seen
reveal. New reveals only fire for gates a player crosses AFTER this ships.

Revision ID: 0031_user_onboarding
Revises: 0030_fact_league
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0031_user_onboarding"
down_revision = "0030_fact_league"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("onboarding", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    # Grandfather: mark reveals at/below each user's level as already seen so nobody who has
    # been playing for weeks suddenly gets a wave of "new feature!" spotlights. The gate
    # levels here MUST mirror services/onboarding.FEATURE_GATES.
    op.execute(
        """
        UPDATE users u SET onboarding = jsonb_build_object(
            'intro_done', true,
            'seen_reveals', COALESCE((
                SELECT jsonb_agg(g.key)
                FROM (VALUES
                    ('create_room', 2), ('customize', 2),
                    ('friends', 3), ('shop', 3), ('quests', 3),
                    ('cards', 4), ('leaderboard', 4),
                    ('league', 5),
                    ('clubs', 7)
                ) AS g(key, lvl)
                WHERE u.level >= g.lvl
            ), '[]'::jsonb)
        )
        """
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding")
