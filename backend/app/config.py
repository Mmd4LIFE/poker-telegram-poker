"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=True)

    # Telegram
    BOT_TOKEN: str = ""
    PUBLIC_URL: str = "https://localhost"
    WEBAPP_URL: str = "https://localhost"
    BOT_MODE: str = "polling"  # polling | webhook
    WEBHOOK_SECRET: str = "change-me"

    # Security
    SECRET_KEY: str = "change-me"
    ADMIN_IDS: str = ""

    # Database
    POSTGRES_USER: str = "poker"
    POSTGRES_PASSWORD: str = "poker_secret"
    POSTGRES_DB: str = "poker"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Economy
    SIGNUP_BONUS_COINS: int = 10000
    DAILY_REWARD_COINS: int = 1000
    TON_WALLET_ADDRESS: str = ""
    COINS_PER_STAR: int = 1000

    # Rooms
    MAX_ACTIVE_ROOMS_PER_USER: int = 3   # tables a player may host at once
    ROOM_IDLE_CLOSE_HOURS: float = 1.0

    # Card market: house cut on every sale, burned (a coin/gem sink).
    MARKET_FEE_PCT: int = 5

    # One-off reward for pressing Start (i.e. becoming reachable by the bot).
    BOT_START_BONUS: int = 2_000

    # Self-play tables kept running. Each is one asyncio task on a 1GB box, so this
    # is deliberately small — raise it only after watching RAM.
    BOT_TABLES: int = 2
    BOT_TABLE_SEATS: int = 5   # auto-close tables idle this long
    # When NOBODY is watching a self-play table, it deals at most one hand per this many
    # seconds instead of grinding continuously. A self-play table exists to keep the
    # lobby looking alive, not to play out thousands of hands nobody sees — on a 1GB box
    # that dealt ~9.7k hands/table in 5 days, which is pure wasted CPU and DB growth.
    # When a human opens the table (becomes a viewer) it instantly resumes full speed.
    BOT_TABLE_IDLE_SECONDS: float = 90.0

    # Loot boxes
    BOX_DAILY_LIMIT: int = 20   # max box opens per user per day (0 = unlimited)

    # Referrals
    REFERRAL_REFERRER_REWARD: int = 5000   # coins the inviter gets per friend
    REFERRAL_FRIEND_REWARD: int = 2500     # bonus coins the new friend gets
    BOT_USERNAME: str = ""                 # auto-filled from getMe if empty

    # Gameplay
    TURN_TIMEOUT_SECONDS: int = 25
    BOT_THINK_MIN: float = 1.5
    BOT_THINK_MAX: float = 4.0
    # How long a seat is kept after a player disconnects before it is reaped
    # (chips refunded to their wallet). Protects against brief network blips.
    IDLE_SEAT_GRACE_SECONDS: int = 90
    JANITOR_INTERVAL_SECONDS: int = 30

    # Onboarding: progressive feature gating. Kill switch — off = everything unlocked.
    ONBOARDING_ENABLED: bool = True

    # App
    ENV: str = "production"
    LOG_LEVEL: str = "INFO"

    @cached_property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @cached_property
    def sync_database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @cached_property
    def admin_ids(self) -> set[int]:
        out: set[int] = set()
        for part in self.ADMIN_IDS.split(","):
            part = part.strip()
            if part.isdigit():
                out.add(int(part))
        return out


settings = Settings()
