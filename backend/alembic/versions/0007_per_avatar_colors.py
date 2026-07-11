"""per-avatar colors

Adds users.avatar_colors (JSONB dict avatar_code -> css color) and migrates the
old single avatar_color onto the currently-equipped avatar.

Revision ID: 0007_per_avatar_colors
Revises: 0006_referral_code
Create Date: 2026-07-11
"""
from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_per_avatar_colors"
down_revision: Union[str, None] = "0006_referral_code"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_colors JSONB NOT NULL DEFAULT '{}'::jsonb")
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, avatar, avatar_color FROM users WHERE avatar_color <> ''"
    )).fetchall()
    for r in rows:
        conn.execute(
            sa.text("UPDATE users SET avatar_colors = CAST(:v AS jsonb) WHERE id = :id"),
            {"v": json.dumps({r.avatar: r.avatar_color}), "id": r.id},
        )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS avatar_colors")
