"""cosmetics: name_color + owned_cosmetics on users

Idempotent (guards against 0001 create_all having already added them).

Revision ID: 0004_cosmetics
Revises: 0003_social
Create Date: 2026-07-11
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0004_cosmetics"
down_revision: Union[str, None] = "0003_social"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS name_color VARCHAR(24) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_cosmetics JSONB NOT NULL DEFAULT '[]'::jsonb")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS name_color")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS owned_cosmetics")
