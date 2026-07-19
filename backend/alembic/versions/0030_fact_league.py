"""analytics.fact_league — one row per player per league day

A derived VIEW joining cohort_members → cohorts → league_seasons, so league performance
(LP, placement, promotion/relegation, shards, in-league DQ) is queryable over time in the
explorer. Additive + idempotent (CREATE OR REPLACE).

Revision ID: 0030_fact_league
Revises: 0029_analytics_schema
"""
from alembic import op

revision = "0030_fact_league"
down_revision = "0029_analytics_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    op.execute(
        """
        CREATE OR REPLACE VIEW analytics.fact_league AS
        SELECT
            cm.cohort_id,
            cm.user_id,
            cm.is_bot,
            s.day,
            s.status                                   AS season_status,
            c.tier,
            c.idx                                      AS cohort_idx,
            cm.lp,
            cm.ranked_games,
            cm.games,
            cm.wins,
            cm.rank                                    AS place,
            cm.outcome,
            cm.shards_awarded,
            cm.il_hands,
            cm.il_net,
            CASE WHEN cm.il_dq_w > 0
                 THEN round((cm.il_dq_wt / cm.il_dq_w)::numeric, 1)
            END                                        AS il_dq,
            s.closed_at
        FROM cohort_members cm
        JOIN cohorts c        ON c.id = cm.cohort_id
        JOIN league_seasons s ON s.id = c.season_id
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS analytics.fact_league")
