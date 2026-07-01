"""aiogram message/command/payment handlers."""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    PreCheckoutQuery,
    WebAppInfo,
)

from app.config import settings
from app.database import SessionLocal
from app.services.payments import fulfill_stars_payment
from app.services.users import get_or_create_from_telegram

logger = logging.getLogger("poker.bot")
router = Router()


def _webapp_kb(param: str | None = None) -> InlineKeyboardMarkup:
    url = settings.WEBAPP_URL
    if param:
        url = f"{url}?startapp={param}"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎮 Play Poker", web_app=WebAppInfo(url=url))],
        [
            InlineKeyboardButton(text="🏆 Leaderboard", web_app=WebAppInfo(url=f"{settings.WEBAPP_URL}?startapp=leaderboard")),
            InlineKeyboardButton(text="💰 Shop", web_app=WebAppInfo(url=f"{settings.WEBAPP_URL}?startapp=shop")),
        ],
    ])


WELCOME = (
    "<b>♠️ Poker CM — Texas Hold'em ♥️</b>\n\n"
    "Welcome to the ultimate Telegram poker experience!\n\n"
    "• 🎲 Play live No-Limit Hold'em with friends or AI\n"
    "• 🧑‍🤝‍🧑 Create private rooms & squads\n"
    "• 🏅 Level up, earn achievements & climb the leaderboard\n"
    "• 💎 Collect coins, gems & open loot boxes\n\n"
    "Tap <b>Play Poker</b> to sit at a table 👇"
)


@router.message(CommandStart(deep_link=True))
async def start_deeplink(message: Message, command: CommandObject):
    param = command.args
    async with SessionLocal() as session:
        await get_or_create_from_telegram(session, message.from_user.model_dump())
        await session.commit()
    text = WELCOME
    if param and param not in ("shop", "leaderboard"):
        text += f"\n\n🔗 Joining table <code>{param}</code>…"
    await message.answer(text, reply_markup=_webapp_kb(param))


@router.message(CommandStart())
async def start(message: Message):
    async with SessionLocal() as session:
        _, created = await get_or_create_from_telegram(session, message.from_user.model_dump())
        await session.commit()
    text = WELCOME
    if created:
        text += f"\n\n🎁 <b>Welcome bonus:</b> {settings.SIGNUP_BONUS_COINS:,} coins added!"
    await message.answer(text, reply_markup=_webapp_kb())


@router.message(F.text == "/play")
async def play(message: Message):
    await message.answer("Take a seat 👇", reply_markup=_webapp_kb())


@router.message(F.text == "/help")
async def help_cmd(message: Message):
    await message.answer(
        "<b>How to play</b>\n\n"
        "Open the app, pick <b>Quick Play</b> for a random table, "
        "<b>Create Room</b> to host, or <b>Join</b> with a code from a friend.\n\n"
        "Tables auto-fill with AI opponents so you never wait.\n\n"
        "Commands: /play /profile /help",
        reply_markup=_webapp_kb(),
    )


@router.message(F.text == "/profile")
async def profile(message: Message):
    async with SessionLocal() as session:
        user, _ = await get_or_create_from_telegram(session, message.from_user.model_dump())
        await session.commit()
        await message.answer(
            f"<b>{user.display_name}</b>\n"
            f"Level {user.level} · {user.degree.title()}\n"
            f"🪙 {user.coins:,} coins · 💎 {user.gems} gems\n"
            f"🃏 Hands won: {user.hands_won} / {user.hands_played}\n"
            f"🏆 Biggest pot: {user.biggest_pot:,}",
            reply_markup=_webapp_kb(),
        )


# ---- payments --------------------------------------------------------------
@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery):
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def on_successful_payment(message: Message):
    sp = message.successful_payment
    async with SessionLocal() as session:
        purchase = await fulfill_stars_payment(
            session, sp.invoice_payload,
            sp.telegram_payment_charge_id, sp.total_amount,
        )
        await session.commit()
    if purchase:
        await message.answer(
            f"✅ Payment received! <b>{purchase.coins_granted:,} coins</b>"
            + (f" + {purchase.gems_granted} gems" if purchase.gems_granted else "")
            + " added to your balance. Good luck at the tables! 🍀"
        )
    else:
        await message.answer("✅ Payment received. Thank you!")
