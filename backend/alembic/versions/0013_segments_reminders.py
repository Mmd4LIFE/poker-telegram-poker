"""segments, broadcasts, and the per-user timezone/reminder state

Revision ID: 0013_segments_reminders
Revises: 0012_app_settings
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_segments_reminders"
down_revision = "0012_app_settings"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tz_offset_min INTEGER DEFAULT 0")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS miss_notices INTEGER DEFAULT 0")

    t = _tables()

    if "segments" not in t:
        op.create_table(
            "segments",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("name", sa.String(64), nullable=False),
            sa.Column("rules", postgresql.JSONB, server_default="{}"),
            sa.Column("user_count", sa.Integer, server_default="0"),
            sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )

    if "segment_users" not in t:
        op.create_table(
            "segment_users",
            sa.Column(
                "segment_id",
                sa.Integer,
                sa.ForeignKey("segments.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column(
                "user_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
        )

    if "broadcasts" not in t:
        op.create_table(
            "broadcasts",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("text", sa.Text, nullable=False),
            sa.Column(
                "segment_id",
                sa.Integer,
                sa.ForeignKey("segments.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("segment_name", sa.String(64), server_default="Everyone"),
            sa.Column("status", sa.String(12), server_default="queued"),
            sa.Column("total", sa.Integer, server_default="0"),
            sa.Column("sent", sa.Integer, server_default="0"),
            sa.Column("failed", sa.Integer, server_default="0"),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_broadcasts_status", "broadcasts", ["status"])
        op.create_index("ix_broadcasts_created_at", "broadcasts", ["created_at"])


def downgrade() -> None:
    op.drop_table("broadcasts")
    op.drop_table("segment_users")
    op.drop_table("segments")
    for c in ("tz_offset_min", "last_reminder_at", "miss_notices"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {c}")
