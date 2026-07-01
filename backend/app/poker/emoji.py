"""Custom Telegram emoji mapping for the `pcmcards` sticker/emoji set.

The set at https://t.me/addemoji/pcmcards provides one *custom emoji* per card.
Custom (premium) emoji are referenced in messages by their **document id** using
message entities of type `custom_emoji`, not by unicode. Telegram does not expose
these ids through a public catalog, so an operator must collect them once:

    1. Send each emoji from the set to your bot (or forward a message using them).
    2. Read `message.entities[*].custom_emoji_id` for entities of type
       `custom_emoji` (aiogram: `MessageEntity.custom_emoji_id`).
    3. Paste the id next to the matching card code below.

Card codes are the same two-char codes used everywhere else (e.g. "As", "Th").
Leave a value as None to fall back to the unicode rendering (see cards.py).
"""
from __future__ import annotations

from app.poker.cards import card_unicode

# card code -> custom_emoji_id (string) | None
CUSTOM_EMOJI_IDS: dict[str, str | None] = {}


def render_card_for_chat(card: str) -> tuple[str, str | None]:
    """Return (text, custom_emoji_id_or_None) for a single card.

    Use the id to attach a `custom_emoji` MessageEntity spanning the returned
    text; if None, the plain unicode text is shown.
    """
    return card_unicode(card), CUSTOM_EMOJI_IDS.get(card)
