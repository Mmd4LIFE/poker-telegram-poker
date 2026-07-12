"""app_settings: runtime knobs the admin can change without a redeploy

Revision ID: 0012_app_settings
Revises: 0011_card_skins
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012_app_settings"
down_revision = "0011_card_skins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "app_settings" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(48), primary_key=True),
            sa.Column("value", postgresql.JSONB, server_default="{}"),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )


def downgrade() -> None:
    op.drop_table("app_settings")
