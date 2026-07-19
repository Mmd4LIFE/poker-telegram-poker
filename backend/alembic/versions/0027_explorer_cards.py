"""explorer_cards — saved data-explorer questions (Metabase-style cards)

Revision ID: 0027_explorer_cards
Revises: 0026_league_inleague
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0027_explorer_cards"
down_revision = "0026_league_inleague"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "explorer_cards" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "explorer_cards",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.String(400), server_default=""),
            sa.Column("kind", sa.String(12), server_default="builder", index=True),
            sa.Column("spec", JSONB, server_default="{}"),
            sa.Column("sql", sa.Text, nullable=True),
            sa.Column("viz", JSONB, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("explorer_cards")
