"""room last_active_at (idle auto-close)

Revision ID: 0010_room_activity
Revises: 0009_economy
Create Date: 2026-07-11
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0010_room_activity"
down_revision: Union[str, None] = "0009_economy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_active_at "
        "TIMESTAMPTZ DEFAULT now()"
    )
    op.execute("UPDATE rooms SET last_active_at = now() WHERE last_active_at IS NULL")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rooms_last_active_at ON rooms (last_active_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_rooms_last_active_at")
    op.execute("ALTER TABLE rooms DROP COLUMN IF EXISTS last_active_at")
