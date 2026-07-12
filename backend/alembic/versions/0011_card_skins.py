"""card skins: designs, minted instances, market listings

Revision ID: 0011_card_skins
Revises: 0010_room_activity
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0011_card_skins"
down_revision = "0010_room_activity"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_skins JSONB DEFAULT '{}'::jsonb"
    )

    if not _has_table("card_designs"):
        op.create_table(
            "card_designs",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("code", sa.String(32), nullable=False),
            sa.Column("name", sa.String(64), nullable=False),
            sa.Column("rarity", sa.String(16), server_default="common"),
            sa.Column("base_price_coins", sa.BigInteger, server_default="0"),
            sa.Column("base_price_gems", sa.Integer, server_default="0"),
            sa.Column("mint_per_card", sa.Integer, server_default="1000"),
            sa.Column("palette", postgresql.JSONB, server_default="{}"),
            sa.Column("tradable", sa.Boolean, server_default=sa.true()),
            sa.Column("active", sa.Boolean, server_default=sa.true()),
            sa.Column("sort", sa.Integer, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_card_designs_code", "card_designs", ["code"], unique=True)
        op.create_index("ix_card_designs_rarity", "card_designs", ["rarity"])

    if not _has_table("card_skins"):
        op.create_table(
            "card_skins",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("design_code", sa.String(32), nullable=False),
            sa.Column("card", sa.String(2), nullable=False),
            sa.Column("serial", sa.Integer, nullable=False),
            sa.Column(
                "owner_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("on_market", sa.Boolean, server_default=sa.false()),
            sa.Column("source", sa.String(16), server_default="shop"),
            sa.Column("minted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("acquired_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("design_code", "card", "serial", name="uq_skin_serial"),
        )
        op.create_index("ix_card_skins_design_code", "card_skins", ["design_code"])
        op.create_index("ix_card_skins_card", "card_skins", ["card"])
        op.create_index("ix_card_skins_owner_id", "card_skins", ["owner_id"])
        op.create_index("ix_card_skins_on_market", "card_skins", ["on_market"])
        op.create_index("ix_skin_owner_card", "card_skins", ["owner_id", "card"])
        op.create_index("ix_skin_design_card", "card_skins", ["design_code", "card"])

    if not _has_table("market_listings"):
        op.create_table(
            "market_listings",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "skin_id",
                sa.Integer,
                sa.ForeignKey("card_skins.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "seller_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "buyer_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("design_code", sa.String(32), nullable=False),
            sa.Column("card", sa.String(2), nullable=False),
            sa.Column("serial", sa.Integer, server_default="0"),
            sa.Column("price", sa.BigInteger, nullable=False),
            sa.Column("currency", sa.String(8), server_default="coins"),
            sa.Column("fee", sa.BigInteger, server_default="0"),
            sa.Column("status", sa.String(12), server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_market_listings_skin_id", "market_listings", ["skin_id"])
        op.create_index("ix_market_listings_seller_id", "market_listings", ["seller_id"])
        op.create_index("ix_market_listings_buyer_id", "market_listings", ["buyer_id"])
        op.create_index("ix_market_listings_design_code", "market_listings", ["design_code"])
        op.create_index("ix_market_listings_card", "market_listings", ["card"])
        op.create_index("ix_market_listings_status", "market_listings", ["status"])
        op.create_index("ix_market_listings_created_at", "market_listings", ["created_at"])
        op.create_index("ix_listing_browse", "market_listings", ["status", "design_code", "card"])
        op.create_index("ix_listing_price", "market_listings", ["status", "currency", "price"])


def downgrade() -> None:
    op.drop_table("market_listings")
    op.drop_table("card_skins")
    op.drop_table("card_designs")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS equipped_skins")
