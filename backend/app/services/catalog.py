"""Static shop catalog for Stars / TON coin & gem packs."""
from __future__ import annotations

# Telegram Stars packs. `stars` = price in XTR.
STAR_PRODUCTS: dict[str, dict] = {
    "coins_small":  {"label": "Stack of Chips", "icon": "🪙", "stars": 50,   "coins": 50_000,   "gems": 0},
    "coins_medium": {"label": "Chip Case",      "icon": "💰", "stars": 150,  "coins": 180_000,  "gems": 5},
    "coins_large":  {"label": "Chip Vault",     "icon": "🏦", "stars": 500,  "coins": 700_000,  "gems": 25},
    "coins_whale":  {"label": "High Roller",    "icon": "🐋", "stars": 1500, "coins": 2_500_000,"gems": 100},
    "gems_pack":    {"label": "Gem Pouch",      "icon": "💎", "stars": 250,  "coins": 0,        "gems": 100},
    "vip_month":    {"label": "VIP Month",      "icon": "👑", "stars": 400,  "coins": 250_000,  "gems": 50},
}

# TON packs. `ton_nano` = price in nanoTON (1 TON = 1e9).
TON_PRODUCTS: dict[str, dict] = {
    "ton_starter": {"label": "TON Starter", "icon": "💠", "ton_nano": 500_000_000,   "coins": 200_000,   "gems": 20},
    "ton_pro":     {"label": "TON Pro",     "icon": "💠", "ton_nano": 2_000_000_000, "coins": 1_000_000, "gems": 120},
    "ton_elite":   {"label": "TON Elite",   "icon": "💠", "ton_nano": 5_000_000_000, "coins": 3_000_000, "gems": 400},
}


def star_catalog() -> list[dict]:
    return [{"code": k, **v} for k, v in STAR_PRODUCTS.items()]


def ton_catalog() -> list[dict]:
    out = []
    for k, v in TON_PRODUCTS.items():
        item = {"code": k, **v}
        item["ton"] = v["ton_nano"] / 1e9
        out.append(item)
    return out
