"""analytics: fact_daily snapshot table + derived dimension/fact VIEWS

Views are computed on read from the operational tables — nothing is copied or moved,
so this is lossless and reversible. fact_daily is an append-only snapshot table.

Revision ID: 0023_analytics
Revises: 0022_skill_sp
"""
from alembic import op
import sqlalchemy as sa

revision = "0023_analytics"
down_revision = "0022_skill_sp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "fact_daily" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "fact_daily",
            sa.Column("day", sa.Date, primary_key=True),
            sa.Column("users_total", sa.Integer, server_default="0"),
            sa.Column("new_users", sa.Integer, server_default="0"),
            sa.Column("dau", sa.Integer, server_default="0"),
            sa.Column("reachable", sa.Integer, server_default="0"),
            sa.Column("coins_circulation", sa.BigInteger, server_default="0"),
            sa.Column("gems_circulation", sa.BigInteger, server_default="0"),
            sa.Column("coins_in", sa.BigInteger, server_default="0"),
            sa.Column("coins_out", sa.BigInteger, server_default="0"),
            sa.Column("gems_in", sa.BigInteger, server_default="0"),
            sa.Column("gems_out", sa.BigInteger, server_default="0"),
            sa.Column("trades", sa.Integer, server_default="0"),
            sa.Column("fee_coins_burned", sa.BigInteger, server_default="0"),
            sa.Column("fee_gems_burned", sa.BigInteger, server_default="0"),
            sa.Column("hands_played", sa.Integer, server_default="0"),
            sa.Column("league_games", sa.Integer, server_default="0"),
            sa.Column("box_opens", sa.Integer, server_default="0"),
            sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # --- derived VIEWS (read-only, computed from the operational tables) ---
    op.execute("""
        CREATE OR REPLACE VIEW dim_user AS
        SELECT id, telegram_id, username, first_name, avatar, is_bot,
               bot_personality, bot_skill, referral_code, referred_by,
               league_tier, is_admin, is_banned, bot_started, created_at
        FROM users
    """)
    op.execute("""
        CREATE OR REPLACE VIEW fact_transaction AS
        SELECT id, user_id, currency, amount, balance_after, kind, ref, created_at,
               (amount > 0) AS is_credit
        FROM transactions
    """)
    op.execute("""
        CREATE OR REPLACE VIEW fact_hand AS
        SELECT id, user_id, room_code, hand_no, net, won, showdown, hand_name, pot, created_at
        FROM player_hands
    """)
    op.execute("""
        CREATE OR REPLACE VIEW fact_trade AS
        SELECT id, skin_id, seller_id, buyer_id, design_code, card, serial,
               price, currency, fee, status, created_at, closed_at
        FROM market_listings
        WHERE status = 'sold'
    """)


def downgrade() -> None:
    for v in ("fact_trade", "fact_hand", "fact_transaction", "dim_user"):
        op.execute(f"DROP VIEW IF EXISTS {v}")
    op.drop_table("fact_daily")
