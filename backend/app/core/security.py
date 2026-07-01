"""Telegram Mini App auth (initData validation) and session JWTs."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"
TOKEN_TTL = 60 * 60 * 24 * 7  # 7 days


class AuthError(Exception):
    pass


def validate_init_data(init_data: str, max_age: int = 86400) -> dict:
    """Validate Telegram WebApp initData and return the parsed payload.

    Raises AuthError on any failure.
    """
    if not init_data:
        raise AuthError("Empty initData")
    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError as e:
        raise AuthError(f"Malformed initData: {e}") from e

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise AuthError("Missing hash")

    data_check_string = "\n".join(
        f"{k}={parsed[k]}" for k in sorted(parsed.keys())
    )
    secret_key = hmac.new(
        b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    calc_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        raise AuthError("Invalid hash — data not from Telegram")

    auth_date = int(parsed.get("auth_date", "0"))
    if max_age and auth_date and (time.time() - auth_date) > max_age:
        raise AuthError("initData expired")

    user_raw = parsed.get("user")
    if not user_raw:
        raise AuthError("No user in initData")
    parsed["user"] = json.loads(user_raw)
    return parsed


def create_access_token(user_id: int, telegram_id: int | None) -> str:
    payload = {
        "sub": str(user_id),
        "tg": telegram_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise AuthError(f"Invalid token: {e}") from e
