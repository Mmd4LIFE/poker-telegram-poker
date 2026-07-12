"""ORM models. Import everything here so Alembic autogenerate sees all tables."""
from app.models.user import User  # noqa: F401
from app.models.room import Room, RoomPlayer, Hand  # noqa: F401
from app.models.economy import Transaction, Box, UserBox, Purchase, Product  # noqa: F401
from app.models.progression import (  # noqa: F401
    Achievement,
    UserAchievement,
    Challenge,
    UserChallenge,
)
from app.models.squad import Squad, SquadMember, SquadMessage  # noqa: F401
from app.models.social import Friendship, PlayerHand  # noqa: F401
from app.models.cards import (  # noqa: F401
    AppSetting,
    CardDesign,
    CardSkin,
    MarketListing,
)
from app.models.marketing import Broadcast, Segment, SegmentUser  # noqa: F401

__all__ = [
    "User",
    "Room",
    "RoomPlayer",
    "Hand",
    "Transaction",
    "Box",
    "UserBox",
    "Purchase",
    "Product",
    "Achievement",
    "UserAchievement",
    "Challenge",
    "UserChallenge",
    "Squad",
    "SquadMember",
    "SquadMessage",
    "Friendship",
    "PlayerHand",
    "CardDesign",
    "CardSkin",
    "MarketListing",
    "AppSetting",
    "Segment",
    "SegmentUser",
    "Broadcast",
]
