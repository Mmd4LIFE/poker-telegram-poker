"""card_skins.uid — a public item id, distinct from the mint serial

Revision ID: 0015_skin_uid
Revises: 0014_bot_started
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_skin_uid"
down_revision = "0014_bot_started"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE card_skins ADD COLUMN IF NOT EXISTS uid VARCHAR(12)")
    # Backfill from a hash of the row id: unique by construction, and stable if this
    # migration is ever re-run. Alphabet excludes I/O/0/1 so uids stay readable.
    op.execute(
        """
        UPDATE card_skins SET uid = (
          SELECT string_agg(
            substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
                   1 + (get_byte(digest, i) % 32), 1), '')
          FROM (SELECT decode(md5(card_skins.id::text || 'pcm-skin'), 'hex') AS digest) d,
               generate_series(0, 7) AS i
        )
        WHERE uid IS NULL
        """
    )
    # re-insert the dash for readability: XXXX-XXXX
    op.execute(
        "UPDATE card_skins SET uid = substr(uid,1,4) || '-' || substr(uid,5,4) "
        "WHERE uid IS NOT NULL AND uid NOT LIKE '%-%'"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_card_skins_uid ON card_skins (uid)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_card_skins_uid")
    op.execute("ALTER TABLE card_skins DROP COLUMN IF EXISTS uid")
