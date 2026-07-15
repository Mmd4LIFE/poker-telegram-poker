# Card Skins & The Player Market

Every one of the 52 cards can wear a **skin** — one minted instance of a *design* on one
card, with a serial (`Royal Gold K♥ #12/150`). Supply is finite, so a real player market
emerges. Code: `models/cards.py`, `services/cards.py`, `api/routes_cards.py`,
`api/routes_market.py`.

## The model

- **CardDesign** — a look (palette). Per-card price scales with **rank** (Ace ≈ 4.5× a
  deuce) and **suit** (spades 1.30 > diamonds 1.15 > hearts 1.05 > clubs 1.00). `mint_per_card`
  is the supply cap; `0` disables shop sales. **`0` means UNLIMITED in the minter — a
  supply-capped-but-unbuyable design (e.g. Champion) uses a positive cap with zero price.**
- **CardSkin** — one owned instance: `(design, card, serial)` + a public `uid`
  (`7F3K-92QD`, alphabet excludes I/O/0/1). The serial is the collectible rank; the uid
  names the copy.
- **MarketListing** — a P2P sale; sold rows double as price history.

## Minting

`services/cards.mint` row-locks the design and hands out the next serial, so two buyers
can't get the same one. Once a design's mint for a card is exhausted, the **market is
the only source** — that's what makes it scarce and gives the market real prices.

## Rendering (hybrid)

The board + your own hand render in **your** skins (you always enjoy what you bought);
revealed hole cards at showdown render in their **owner's** skins (the flex is public).
Each seat broadcasts its full skin map — sending only held-card skins would leak the hand.

## The market

- **Grid by (design, card)** showing the **floor** price and count, like Telegram's gift
  market. Tap → all listings for that pair, cheapest first.
- List / cancel / buy in **coins or gems**. Floor / last-sale / 24h-volume stats per pair.
- **5% fee, BURNED** (admin-tunable, `AppSetting["market_fee_pct"]`) — the market is a
  coin/gem **sink**, offsetting box inflation. The fee is destroyed, never banked.
- Buys are **row-locked** on the listing and both wallets (locked in id order to avoid
  deadlocks); the loser of a race sees "already sold".
- Both sides get an in-app notification; tap it to open the full trade receipt.

## Admin
`Admin → Cards`: supply burn-down per design, market volume + fees burned, price/mint
tuning (mint can be raised but never cut below the highest minted serial).
