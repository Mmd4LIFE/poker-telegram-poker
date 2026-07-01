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

    # Gameplay
    TURN_TIMEOUT_SECONDS: int = 25
    BOT_THINK_MIN: float = 1.5
    BOT_THINK_MAX: float = 4.0

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
