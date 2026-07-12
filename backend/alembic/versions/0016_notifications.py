"""in-app notifications

Revision ID: 0016_notifications
Revises: 0015_skin_uid
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016_notifications"
down_revision = "0015_skin_uid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "notifications" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("body", sa.String(256), server_default=""),
        sa.Column("meta", postgresql.JSONB, server_default="{}"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_kind", "notifications", ["kind"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])
    # the unread badge is the hottest query in the app — index it directly
    op.create_index(
        "ix_notifications_unread",
        "notifications",
        ["user_id"],
        postgresql_where=sa.text("read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("notifications")
