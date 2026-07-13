"""daily cohort league

Revision ID: 0020_league
Revises: 0019_dna_wins
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0020_league"
down_revision = "0019_dna_wins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS league_tier VARCHAR(12) DEFAULT 'bronze'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_league_tier ON users (league_tier)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS league_shards INTEGER DEFAULT 0")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mode VARCHAR(8) DEFAULT 'cash'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rooms_mode ON rooms (mode)")
    op.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cohort_id INTEGER")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rooms_cohort_id ON rooms (cohort_id)")

    t = set(sa.inspect(op.get_bind()).get_table_names())

    if "league_seasons" not in t:
        op.create_table(
            "league_seasons",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("day", sa.Date, nullable=False),
            sa.Column("status", sa.String(12), server_default="open"),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_league_seasons_day", "league_seasons", ["day"], unique=True)
        op.create_index("ix_league_seasons_status", "league_seasons", ["status"])

    if "cohorts" not in t:
        op.create_table(
            "cohorts",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("season_id", sa.Integer, sa.ForeignKey("league_seasons.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tier", sa.String(12), nullable=False),
            sa.Column("idx", sa.Integer, server_default="0"),
            sa.Column("capacity", sa.Integer, server_default="24"),
            sa.UniqueConstraint("season_id", "tier", "idx", name="uq_cohort"),
        )
        op.create_index("ix_cohorts_season_id", "cohorts", ["season_id"])
        op.create_index("ix_cohorts_tier", "cohorts", ["tier"])

    if "cohort_members" not in t:
        op.create_table(
            "cohort_members",
            sa.Column("cohort_id", sa.Integer, sa.ForeignKey("cohorts.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("lp", sa.Integer, server_default="0"),
            sa.Column("ranked_games", sa.Integer, server_default="0"),
            sa.Column("games", sa.Integer, server_default="0"),
            sa.Column("wins", sa.Integer, server_default="0"),
            sa.Column("rank", sa.Integer, server_default="0"),
            sa.Column("outcome", sa.String(12), server_default=""),
            sa.Column("is_bot", sa.Boolean, server_default=sa.false()),
        )
        op.create_index("ix_cohort_members_is_bot", "cohort_members", ["is_bot"])

    if "league_games" not in t:
        op.create_table(
            "league_games",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("cohort_id", sa.Integer, sa.ForeignKey("cohorts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("room_code", sa.String(12), nullable=True),
            sa.Column("simulated", sa.Boolean, server_default=sa.false()),
            sa.Column("results", postgresql.JSONB, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_league_games_cohort_id", "league_games", ["cohort_id"])
        op.create_index("ix_league_games_simulated", "league_games", ["simulated"])


def downgrade() -> None:
    op.drop_table("league_games")
    op.drop_table("cohort_members")
    op.drop_table("cohorts")
    op.drop_table("league_seasons")
    for c in ("league_tier", "league_shards"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {c}")
    for c in ("mode", "cohort_id"):
        op.execute(f"ALTER TABLE rooms DROP COLUMN IF EXISTS {c}")
