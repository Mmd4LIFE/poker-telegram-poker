"""products table + per-avatar color ownership keys

Revision ID: 0009_economy
Revises: 0008_clan
Create Date: 2026-07-11
"""
from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_economy"
down_revision: Union[str, None] = "0008_clan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "products" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "products",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(length=48), nullable=False),
            sa.Column("kind", sa.String(length=8), nullable=False),
            sa.Column("label", sa.String(length=64), nullable=False),
            sa.Column("base_price", sa.BigInteger(), server_default="0"),
            sa.Column("coins", sa.BigInteger(), server_default="0"),
            sa.Column("gems", sa.Integer(), server_default="0"),
            sa.Column("discount_pct", sa.Integer(), server_default="0"),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
            sa.Column("sort_order", sa.Integer(), server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("code", name="uq_products_code"),
        )
        op.create_index("ix_products_code", "products", ["code"])
        op.create_index("ix_products_kind", "products", ["kind"])

    # Convert global avatar-colour ownership ("ac:#hex") to per-avatar
    # ("ac:<avatar>:#hex") for the avatars the user actually coloured.
    rows = bind.execute(sa.text(
        "SELECT id, avatar, avatar_colors, owned_cosmetics FROM users"
    )).fetchall()
    for r in rows:
        owned = list(r.owned_cosmetics or [])
        colors = dict(r.avatar_colors or {})
        changed = False
        new_owned: list[str] = []
        for k in owned:
            parts = str(k).split(":")
            if parts[0] == "ac" and len(parts) == 2:  # old global format
                color = parts[1]
                targets = {a for a, c in colors.items() if c == color}
                targets.add(r.avatar or "user")
                for a in targets:
                    key = f"ac:{a}:{color}"
                    if key not in new_owned:
                        new_owned.append(key)
                changed = True
            else:
                if k not in new_owned:
                    new_owned.append(k)
        if changed:
            bind.execute(
                sa.text("UPDATE users SET owned_cosmetics = CAST(:v AS jsonb) WHERE id = :id"),
                {"v": json.dumps(new_owned), "id": r.id},
            )


def downgrade() -> None:
    op.drop_table("products")
