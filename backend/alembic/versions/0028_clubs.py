"""clubs: rename squads → clubs (tables + columns), add CP ledger & join requests

Data-preserving: existing squads/squad_members/squad_messages are RENAMED (ALTER),
so all rows survive. squad_id columns (incl. rooms.squad_id) become club_id. New
club_point_events / club_join_requests tables and a system flag on club_messages.

Revision ID: 0028_clubs
Revises: 0027_explorer_cards
"""
from alembic import op
import sqlalchemy as sa

revision = "0028_clubs"
down_revision = "0027_explorer_cards"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    return bind.execute(
        sa.text("select 1 from information_schema.tables where table_name=:n"), {"n": name}
    ).first() is not None


def _has_col(bind, table: str, col: str) -> bool:
    return bind.execute(
        sa.text("select 1 from information_schema.columns where table_name=:t and column_name=:c"),
        {"t": table, "c": col},
    ).first() is not None


def upgrade() -> None:
    bind = op.get_bind()

    # 1) rename the tables (FKs follow the target automatically in Postgres)
    if _has_table(bind, "squads") and not _has_table(bind, "clubs"):
        op.rename_table("squads", "clubs")
    if _has_table(bind, "squad_members") and not _has_table(bind, "club_members"):
        op.rename_table("squad_members", "club_members")
    if _has_table(bind, "squad_messages") and not _has_table(bind, "club_messages"):
        op.rename_table("squad_messages", "club_messages")

    # 2) rename squad_id -> club_id on the child tables and on rooms
    if _has_col(bind, "club_members", "squad_id"):
        op.alter_column("club_members", "squad_id", new_column_name="club_id")
    if _has_col(bind, "club_messages", "squad_id"):
        op.alter_column("club_messages", "squad_id", new_column_name="club_id")
    if _has_col(bind, "rooms", "squad_id"):
        op.alter_column("rooms", "squad_id", new_column_name="club_id")

    # 3) system flag on club chat
    if not _has_col(bind, "club_messages", "system"):
        op.add_column("club_messages", sa.Column("system", sa.Boolean, server_default=sa.false(), nullable=False))

    # 4) new tables (reference the renamed clubs table)
    if not _has_table(bind, "club_point_events"):
        op.create_table(
            "club_point_events",
            sa.Column("id", sa.BigInteger, primary_key=True),
            sa.Column("club_id", sa.Integer, sa.ForeignKey("clubs.id", ondelete="CASCADE"), index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True),
            sa.Column("cp", sa.Integer, server_default="0"),
            sa.Column("iso_year", sa.Integer, index=True),
            sa.Column("iso_week", sa.Integer, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not _has_table(bind, "club_join_requests"):
        op.create_table(
            "club_join_requests",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("club_id", sa.Integer, sa.ForeignKey("clubs.id", ondelete="CASCADE"), index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("club_id", "user_id", name="uq_club_join_request"),
        )


def downgrade() -> None:
    op.drop_table("club_join_requests")
    op.drop_table("club_point_events")
    if _has_col(op.get_bind(), "club_messages", "system"):
        op.drop_column("club_messages", "system")
    op.alter_column("rooms", "club_id", new_column_name="squad_id")
    op.alter_column("club_messages", "club_id", new_column_name="squad_id")
    op.alter_column("club_members", "club_id", new_column_name="squad_id")
    op.rename_table("club_messages", "squad_messages")
    op.rename_table("club_members", "squad_members")
    op.rename_table("clubs", "squads")
