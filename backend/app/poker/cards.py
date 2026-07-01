"""Card representation, deck and rendering helpers.

A card is encoded as a two-char string: rank + suit.
  ranks: 2 3 4 5 6 7 8 9 T J Q K A
  suits: s (spades) h (hearts) d (diamonds) c (clubs)
e.g. "As" = Ace of spades, "Th" = Ten of hearts.

The Mini App renders cards with CSS. For Telegram chat messages we expose a
unicode fallback; to use the custom `pcmcards` emoji set, fill the
CUSTOM_EMOJI_IDS mapping (see app/poker/emoji.py) with the document ids from
https://t.me/addemoji/pcmcards.
"""
from __future__ import annotations

import secrets

RANKS = "23456789TJQKA"
SUITS = "shdc"

RANK_VALUE = {r: i for i, r in enumerate(RANKS, start=2)}  # 2..14

SUIT_SYMBOL = {"s": "♠", "h": "♥", "d": "♦", "c": "♣"}
SUIT_NAME = {"s": "spades", "h": "hearts", "d": "diamonds", "c": "clubs"}
RANK_NAME = {
    "T": "10", "J": "J", "Q": "Q", "K": "K", "A": "A",
    **{r: r for r in "23456789"},
}

FULL_DECK: list[str] = [r + s for s in SUITS for r in RANKS]


def make_deck() -> list[str]:
    return FULL_DECK.copy()


def shuffle(deck: list[str]) -> None:
    """Cryptographically secure in-place Fisher-Yates shuffle."""
    for i in range(len(deck) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        deck[i], deck[j] = deck[j], deck[i]


def card_unicode(card: str) -> str:
    """Human readable unicode form, e.g. 'A♠'."""
    return f"{RANK_NAME[card[0]]}{SUIT_SYMBOL[card[1]]}"


def cards_unicode(cards: list[str]) -> str:
    return " ".join(card_unicode(c) for c in cards)
