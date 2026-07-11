"""friendships + player_hands

Idempotent: on a fresh DB the initial create_all() already builds these tables
(models define them), so we skip if present; on a pre-existing DB we create them.

Revision ID: 0003_social
Revises: 0002_referrals
Create Date: 2026-07-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_social"
down_revision: Union[str, None] = "0002_referrals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "friendships" not in tables:
        op.create_table(
            "friendships",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("friend_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(length=12), nullable=False, server_default="pending"),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"),
        )
        op.create_index("ix_friendships_user_id", "friendships", ["user_id"])
        op.create_index("ix_friendships_friend_id", "friendships", ["friend_id"])
        op.create_index("ix_friendships_status", "friendships", ["status"])

    if "player_hands" not in tables:
        op.create_table(
            "player_hands",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("user_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("room_id", sa.Integer(), nullable=False),
            sa.Column("room_code", sa.String(length=12), server_default=""),
            sa.Column("hand_no", sa.Integer(), server_default="0"),
            sa.Column("net", sa.BigInteger(), server_default="0"),
            sa.Column("won", sa.Boolean(), server_default=sa.false()),
            sa.Column("showdown", sa.Boolean(), server_default=sa.false()),
            sa.Column("hand_name", sa.String(length=32), server_default=""),
            sa.Column("pot", sa.BigInteger(), server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_player_hands_user_id", "player_hands", ["user_id"])
        op.create_index("ix_player_hands_room_id", "player_hands", ["room_id"])
        op.create_index("ix_player_hands_created_at", "player_hands", ["created_at"])


def downgrade() -> None:
    op.drop_table("player_hands")
    op.drop_table("friendships")
