"""clan features: squad is_public/total_won + squad_messages

Revision ID: 0008_clan
Revises: 0007_per_avatar_colors
Create Date: 2026-07-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_clan"
down_revision: Union[str, None] = "0007_per_avatar_colors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE squads ADD COLUMN IF NOT EXISTS total_won BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE squads ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true")
    op.execute("CREATE INDEX IF NOT EXISTS ix_squads_is_public ON squads (is_public)")

    if "squad_messages" not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table(
            "squad_messages",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("squad_id", sa.Integer(),
                      sa.ForeignKey("squads.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("text", sa.String(length=300), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_squad_messages_squad_id", "squad_messages", ["squad_id"])
        op.create_index("ix_squad_messages_created_at", "squad_messages", ["created_at"])


def downgrade() -> None:
    op.drop_table("squad_messages")
    op.execute("ALTER TABLE squads DROP COLUMN IF EXISTS is_public")
    op.execute("ALTER TABLE squads DROP COLUMN IF EXISTS total_won")
