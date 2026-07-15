# Economy — Coins, Gems, the Ledger

**Two currencies:** `coins` (soft, earned + buyable) and `gems` (premium). They are
**never combined** into one figure anywhere.

## The one ledger — `services/economy.py`

Every balance change goes through `adjust_balance` (→ `credit`/`debit`), which writes an
immutable `Transaction` row with `balance_after`. `InsufficientFunds` is raised rather
than allowing a negative balance (unless `allow_negative`). **If you move money without
going through this, you have a bug.**

## Faucets (money in)
- Signup bonus, **daily reward ladder** (7-day, day 7 pays gems), **bot-start bonus**
  (pressing Start), referral rewards, league prizes, loot boxes, achievements/challenges.

## Sinks (money out / destroyed)
- **Card-market fee** (5%, **burned**) — the primary deflationary sink.
- **Card minting** (coins/gems spent on skins).
- League buy-ins / shard economy.
- Loot boxes are tuned to ~80% RTP (see admin box monitor).

## Why sinks matter
Loot boxes were once wildly EV-positive (a balance reached 16.7M). The market fee being
**burned** rather than banked is the deliberate counterweight — every trade destroys
coins. When adding anything that pays out, add or check a sink. See
[cards-and-market.md](cards-and-market.md).

## Real money
- **Telegram Stars** (`routes_shop`) — invoices in XTR; Stars land in the bot's Telegram
  balance (withdraw via Fragment). The app stores the sale record only.
- **TON** — on-chain verification of a payment with a required comment.
- **Products** are DB-driven (`models/economy.Product`) with admin-tunable price/discount.

## Tournament chips are NOT money
Sit & Go stacks are tournament chips. `unseat_player` and `rebuy` refuse SNG rooms so a
stack can never be cashed out as coins. This is an integrity rule, not a preference.
