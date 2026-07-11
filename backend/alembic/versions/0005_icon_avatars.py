"""convert emoji avatars to icon codes

Migrates users.avatar and the avatar entries inside users.owned_cosmetics from
emoji to lucide icon codes. Colors (c:*) are left untouched.

Revision ID: 0005_icon_avatars
Revises: 0004_cosmetics
Create Date: 2026-07-11
"""
from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_icon_avatars"
down_revision: Union[str, None] = "0004_cosmetics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# old emoji -> new icon code
EMOJI_TO_CODE = {
    "🎩": "user", "🃏": "club", "🎲": "dice", "😎": "smile", "🤠": "user",
    "🦊": "dog", "🐱": "cat", "🐼": "cat", "🐵": "dog", "🐸": "fish",
    "🦁": "cat", "🐯": "cat", "🐺": "dog", "🦉": "bird", "🚀": "rocket",
    "🤖": "bot", "👽": "ghost", "🧠": "brain", "🎯": "target", "🔥": "flame",
    "👑": "crown", "🦈": "skull", "🐋": "fish", "💎": "diamond", "🀄": "club",
    "🎰": "dice", "💰": "trophy", "🏆": "trophy",
}
VALID = {
    "user", "cat", "dog", "bird", "fish", "rabbit", "ghost", "smile", "dice", "club",
    "squirrel", "turtle", "snail", "bug", "rocket", "bot", "brain", "target", "anchor",
    "flame", "crown", "gem", "skull", "diamond", "swords", "zap", "star", "trophy",
}


def _to_code(v: str) -> str:
    if v in VALID:
        return v
    return EMOJI_TO_CODE.get(v, "user")


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, avatar, owned_cosmetics FROM users")).fetchall()
    for r in rows:
        avatar = _to_code(r.avatar or "user")
        owned = r.owned_cosmetics or []
        new_owned = []
        for k in owned:
            if isinstance(k, str) and k.startswith("a:"):
                code = _to_code(k[2:])
                key = "a:" + code
                if key not in new_owned:
                    new_owned.append(key)
            else:
                new_owned.append(k)
        conn.execute(
            sa.text("UPDATE users SET avatar=:a, owned_cosmetics=CAST(:o AS jsonb) WHERE id=:id"),
            {"a": avatar, "o": json.dumps(new_owned), "id": r.id},
        )


def downgrade() -> None:
    pass
