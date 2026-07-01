"""referral fields on users

Idempotent: on a fresh DB the initial create_all() already creates these columns
(models define them), so we guard with IF NOT EXISTS; on a pre-existing DB this
adds them.

Revision ID: 0002_referrals
Revises: 0001_initial
Create Date: 2026-07-01
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0002_referrals"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earned BIGINT NOT NULL DEFAULT 0"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_referred_by ON users (referred_by)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_referred_by")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS referral_earned")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS referral_count")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS referred_by")
