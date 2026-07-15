"""FastAPI application entrypoint. Runs the REST API, WebSocket and the bot."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    routes_admin,
    routes_auth,
    routes_cards,
    routes_cosmetics,
    routes_explorer,
    routes_friends,
    routes_league,
    routes_market,
    routes_profile,
    routes_progression,
    routes_referral,
    routes_rooms,
    routes_shop,
    routes_skill,
    routes_squads,
    routes_ws,
)
from app.config import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("poker")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.bot.runner import setup_bot, shutdown_bot
    from app.game.manager import manager

    try:
        await setup_bot()
    except Exception:  # noqa: BLE001
        logger.exception("Bot setup failed (continuing without bot)")
    manager.start_janitor()

    import asyncio

    from app.services.notify import reminder_loop

    reminders = asyncio.create_task(reminder_loop())

    from app.services.league import league_loop

    league_task = asyncio.create_task(league_loop())
    yield
    reminders.cancel()
    league_task.cancel()
    await manager.shutdown()
    await shutdown_bot()


app = FastAPI(title="Poker CM", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    routes_auth, routes_profile, routes_rooms, routes_shop,
    routes_progression, routes_squads, routes_referral, routes_admin,
    routes_friends, routes_cosmetics, routes_cards, routes_market, routes_league,
    routes_skill, routes_explorer, routes_ws,
):
    app.include_router(module.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "poker-cm", "version": app.version}


@app.post("/webhook/{secret}")
async def telegram_webhook(secret: str, request: Request):
    if secret != settings.WEBHOOK_SECRET:
        return Response(status_code=403)
    from aiogram.types import Update

    from app.bot.instance import get_bot, get_dispatcher

    data = await request.json()
    update = Update.model_validate(data, context={"bot": get_bot()})
    await get_dispatcher().feed_update(get_bot(), update)
    return {"ok": True}
