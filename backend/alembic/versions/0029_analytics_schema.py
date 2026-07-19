"""analytics schema: move the derived star-schema out of public

fact_daily (table) + dim_user / fact_transaction / fact_hand / fact_trade (views) move
into a dedicated `analytics` schema, so the derived reporting layer is visibly separate
from the operational tables. Views keep referencing the public tables (cross-schema is
fine). Idempotent: uses IF EXISTS so a re-run is a no-op.

Revision ID: 0029_analytics_schema
Revises: 0028_clubs
"""
from alembic import op

revision = "0029_analytics_schema"
down_revision = "0028_clubs"
branch_labels = None
depends_on = None

_VIEWS = ("dim_user", "fact_transaction", "fact_hand", "fact_trade")


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    op.execute("ALTER TABLE IF EXISTS public.fact_daily SET SCHEMA analytics")
    for v in _VIEWS:
        op.execute(f"ALTER VIEW IF EXISTS public.{v} SET SCHEMA analytics")


def downgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS analytics.fact_daily SET SCHEMA public")
    for v in _VIEWS:
        op.execute(f"ALTER VIEW IF EXISTS analytics.{v} SET SCHEMA public")
