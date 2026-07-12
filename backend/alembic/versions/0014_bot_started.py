"""bot_started: can the bot actually DM this user?

A user who only ever opened the Mini App (e.g. through an invite deep link) has no
conversation with the bot, and Telegram refuses to deliver to them. Existing users
are assumed reachable — a failed send flips the flag back off, so it self-corrects.

Revision ID: 0014_bot_started
Revises: 0013_segments_reminders
"""
from alembic import op

revision = "0014_bot_started"
down_revision = "0013_segments_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_started BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_bot_started ON users (bot_started)"
    )
    # Optimistic backfill: anyone who already exists most likely arrived via /start.
    # The first failed send will clear the flag for those who didn't.
    op.execute(
        "UPDATE users SET bot_started = TRUE "
        "WHERE telegram_id IS NOT NULL AND is_bot = FALSE"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_bot_started")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS bot_started")
