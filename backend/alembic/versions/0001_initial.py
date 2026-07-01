"""initial schema

Creates every table from the SQLAlchemy metadata. Subsequent schema changes
should be produced with `alembic revision --autogenerate`.

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-01
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.database import Base
import app.models  # noqa: F401  (populate metadata)

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
