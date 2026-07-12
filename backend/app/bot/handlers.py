"""aiogram message/command/payment handlers."""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    PreCheckoutQuery,
    WebAppInfo,
)

from app.config import settings
from app.database import SessionLocal
from app.services.economy import credit
from app.services.payments import fulfill_stars_payment
from app.services.users import get_or_create_from_telegram

logger = logging.getLogger("poker.bot")
router = Router()


async def _mark_started(session, user) -> int:
    """Pressing Start is what makes a user reachable. Pay them once for it.

    Users who only ever open the Mini App (e.g. via an invite deep link) never
    create a bot conversation, and Telegram will not let us message them at all.
    """
    if user.bot_started:
        return 0
    user.bot_started = True
    bonus = settings.BOT_START_BONUS
    if bonus:
        await credit(session, user, bonus, "bot_start_bonus")
    return bonus


def _app_url(param: str | None = None) -> str:
    url = settings.WEBAPP_URL
    return f"{url}?startapp={param}" if param else url


def _webapp_kb(param: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎮 Play Poker", web_app=WebAppInfo(url=_app_url(param)))],
        [InlineKeyboardButton(text="🤝 Invite friends", callback_data="invite")],
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
        user, created = await get_or_create_from_telegram(
            session, message.from_user.model_dump(), referral=param
        )
        bonus = await _mark_started(session, user)
        await session.commit()
    text = WELCOME
    if bonus and not created:
        text += f"\n\n🔔 <b>Notifications on — +{bonus:,} coins.</b>"
    is_ref = bool(param) and (param.startswith("ref-") or param.startswith("ref_")
                              or param.startswith("sq-") or param.startswith("rm-"))
    if created and is_ref:
        text += f"\n\n🎁 <b>+{settings.REFERRAL_FRIEND_REWARD:,} bonus coins</b> for joining via a friend's invite!"
    elif param and not is_ref and param not in ("shop", "leaderboard"):
        text += f"\n\n🔗 Joining table <code>{param}</code>…"
    await message.answer(text, reply_markup=_webapp_kb(param))


@router.message(CommandStart())
async def start(message: Message):
    async with SessionLocal() as session:
        user, created = await get_or_create_from_telegram(
            session, message.from_user.model_dump()
        )
        bonus = await _mark_started(session, user)
        await session.commit()
    text = WELCOME
    if created:
        text += f"\n\n🎁 <b>Welcome bonus:</b> {settings.SIGNUP_BONUS_COINS:,} coins added!"
    elif bonus:
        text += f"\n\n🔔 <b>Notifications on — +{bonus:,} coins.</b>"
    await message.answer(text, reply_markup=_webapp_kb())


@router.callback_query(F.data == "invite")
async def invite(cb: CallbackQuery):
    """Drop the user's own referral link into the chat, ready to forward."""
    from app.bot.instance import get_bot_username
    from app.services.users import ensure_referral_code

    async with SessionLocal() as session:
        user, _ = await get_or_create_from_telegram(
            session, cb.from_user.model_dump()
        )
        code = await ensure_referral_code(session, user)
        await session.commit()

    link = f"https://t.me/{get_bot_username()}?start=ref-{code}"
    await cb.message.answer(
        "<b>🤝 Your invite link</b>\n\n"
        f"{link}\n\n"
        f"Forward it to a friend: you get <b>{settings.REFERRAL_REFERRER_REWARD:,} "
        f"coins</b>, they start with <b>{settings.REFERRAL_FRIEND_REWARD:,}</b>.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="📤 Share with a friend",
                switch_inline_query=f"\n\n♠️ Play Poker CM with me!\n{link}",
            )
        ]]),
        disable_web_page_preview=False,
    )
    await cb.answer()


@router.message(F.text == "/play")
async def play(message: Message):
    await message.answer("Take a seat 👇", reply_markup=_webapp_kb())


@router.message(F.text == "/preview")
async def preview(message: Message):
    """Open the new Next.js + shadcn UI (preview build served at /app)."""
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✨ Open new UI (preview)",
            web_app=WebAppInfo(url=f"{settings.WEBAPP_URL}/app"),
        )
    ]])
    await message.answer(
        "Here's the new Next.js + shadcn interface in progress. "
        "The live table is still being ported — use /play for the full game.",
        reply_markup=kb,
    )


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
