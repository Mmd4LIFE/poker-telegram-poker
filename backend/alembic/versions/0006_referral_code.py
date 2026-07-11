"""referral_code + avatar_color on users

Adds an opaque referral_code (backfilled for existing users) and avatar_color.

Revision ID: 0006_referral_code
Revises: 0005_icon_avatars
Create Date: 2026-07-11
"""
from __future__ import annotations

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_referral_code"
down_revision: Union[str, None] = "0005_icon_avatars"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(24) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16)")

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM users WHERE referral_code IS NULL")).fetchall()
    used: set[str] = set()
    for r in rows:
        code = secrets.token_hex(5)
        while code in used:
            code = secrets.token_hex(5)
        used.add(code)
        conn.execute(
            sa.text("UPDATE users SET referral_code = :c WHERE id = :id"),
            {"c": code, "id": r.id},
        )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code ON users (referral_code)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_referral_code")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS referral_code")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS avatar_color")
