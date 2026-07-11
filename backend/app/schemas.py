"""Pydantic request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.leveling import degree_for_level, level_progress
from app.models import User


# ---- auth ------------------------------------------------------------------
class AuthRequest(BaseModel):
    init_data: str = Field(..., description="Telegram WebApp initData string")


class DevAuthRequest(BaseModel):
    """Only usable when ENV != production — fakes a login for local testing."""
    telegram_id: int
    first_name: str = "Dev"
    username: str | None = None


class TokenResponse(BaseModel):
    token: str
    user: "UserProfile"


# ---- user ------------------------------------------------------------------
class UserProfile(BaseModel):
    id: int
    telegram_id: int | None
    display_name: str
    handle: str | None
    username: str | None
    avatar: str
    name_color: str
    coins: int
    gems: int
    level: int
    xp: int
    degree: str
    degree_label: str
    level_progress: float
    next_level_xp: int
    hands_played: int
    hands_won: int
    games_played: int
    biggest_pot: int
    total_won: int
    win_rate: float
    best_win_streak: int
    daily_streak: int
    referral_count: int
    referral_earned: int
    is_bot: bool
    is_admin: bool = False

    @classmethod
    def from_user(cls, u: User) -> "UserProfile":
        from app.config import settings
        prog = level_progress(u.xp)
        _, label = degree_for_level(u.level)
        win_rate = round(u.hands_won / u.hands_played * 100, 1) if u.hands_played else 0.0
        return cls(
            id=u.id, telegram_id=u.telegram_id, display_name=u.display_name,
            handle=u.handle, username=u.username, avatar=u.avatar,
            name_color=u.name_color or "", coins=u.coins, gems=u.gems,
            level=u.level, xp=u.xp, degree=u.degree, degree_label=label,
            level_progress=prog["progress"], next_level_xp=prog["next_level_xp"],
            hands_played=u.hands_played, hands_won=u.hands_won,
            games_played=u.games_played, biggest_pot=u.biggest_pot,
            total_won=u.total_won, win_rate=win_rate,
            best_win_streak=u.best_win_streak, daily_streak=u.daily_streak,
            referral_count=u.referral_count, referral_earned=u.referral_earned,
            is_bot=u.is_bot,
            is_admin=(u.telegram_id in settings.admin_ids),
        )


# ---- rooms -----------------------------------------------------------------
class CreateRoomRequest(BaseModel):
    name: str = Field("Poker Table", max_length=48)
    is_private: bool = False
    allow_bots: bool = True
    max_players: int = Field(6, ge=2, le=9)
    small_blind: int = Field(50, ge=1)
    big_blind: int = Field(100, ge=2)
    min_buy_in: int = Field(2000, ge=1)
    max_buy_in: int = Field(20000, ge=1)
    squad_code: str | None = None


class JoinRoomRequest(BaseModel):
    buy_in: int | None = None


class RebuyRequest(BaseModel):
    amount: int = Field(..., ge=1)


class ActionRequest(BaseModel):
    action: str
    amount: int = 0


class RoomSummary(BaseModel):
    code: str
    name: str
    status: str
    players: int
    max_players: int
    small_blind: int
    big_blind: int
    min_buy_in: int
    max_buy_in: int
    is_private: bool
    allow_bots: bool


# ---- economy ---------------------------------------------------------------
class BuyStarsRequest(BaseModel):
    product_code: str


class OpenBoxRequest(BaseModel):
    box_code: str
    pay_with: str = "coins"  # coins | gems


# ---- squads ----------------------------------------------------------------
class CreateSquadRequest(BaseModel):
    name: str = Field(..., max_length=48)
    tag: str = Field("", max_length=8)
    emblem: str = "♠️"
    description: str = ""


class JoinSquadRequest(BaseModel):
    code: str


TokenResponse.model_rebuild()
