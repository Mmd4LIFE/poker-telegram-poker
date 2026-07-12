"""Economy balancing: value model + EV calculator for loot boxes.

Used to keep boxes profitable for the house (and to power the admin panel's
monitoring / auto-balance tooling).
"""
from __future__ import annotations

# Reference value of one gem, expressed in coins.
# (Stars catalogue: 50 XTR -> 50k coins  =>  1 XTR ~ 1000 coins.
#   250 XTR -> 100 gems                  =>  1 gem ~ 2.5 XTR ~ 2500 coins.)
GEM_COIN_VALUE = 2500

# Rough coin value of an avatar cosmetic (gem-priced avatars ~ 25-80 gems).
AVATAR_COIN_VALUE = 100_000

# Target expected-value payout as a fraction of box price.
TARGET_RTP = 0.80  # 80% back to players, 20% house edge


def reward_value(reward: dict) -> int:
    """Coin-equivalent value of a single reward entry."""
    t = reward.get("type")
    if t == "coins":
        return int(reward.get("amount", 0))
    if t == "gems":
        return int(reward.get("amount", 0)) * GEM_COIN_VALUE
    if t == "avatar":
        return AVATAR_COIN_VALUE
    return 0


def box_price_coins(box) -> int:
    """Coin-equivalent price of a box (gems converted)."""
    if box.price_coins:
        return int(box.price_coins)
    return int(box.price_gems or 0) * GEM_COIN_VALUE


def expected_value(rewards: list[dict]) -> float:
    total_w = sum(max(0, r.get("weight", 0)) for r in rewards) or 1
    return sum(reward_value(r) * max(0, r.get("weight", 0)) for r in rewards) / total_w


def box_stats(box) -> dict:
    """EV / RTP / house-edge for a box definition."""
    price = box_price_coins(box)
    ev = expected_value(box.rewards or [])
    rtp = (ev / price) if price else 0.0
    return {
        "price_coin_equiv": price,
        "expected_value": round(ev),
        "rtp": round(rtp, 4),              # payout ratio
        "house_edge": round(1 - rtp, 4),
        "healthy": 0.60 <= rtp <= 0.90,    # sane band
        "target_rtp": TARGET_RTP,
    }


def suggest_price(rewards: list[dict], target_rtp: float = TARGET_RTP) -> int:
    """Price (in coins) that yields the target RTP for a reward table."""
    ev = expected_value(rewards)
    if target_rtp <= 0:
        return 0
    return int(round(ev / target_rtp))
