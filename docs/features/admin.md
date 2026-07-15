# Admin Panel

Gated to `settings.admin_ids` (Telegram id `592354162`, @mmdsvm). Surfaced in
`api/routes_admin.py` and the **Me → Admin Dashboard** screen. Tabs:

- **Sales** — Stars/TON revenue and purchase analytics.
- **Boxes** — per-box EV, target vs actual RTP, opens, suggested price, **per-box daily
  limit**, editable price/rewards.
- **Packs** — DB-driven coin/gem products; price, discount, active.
- **Cards** — card-skin supply burn-down, market volume + fees burned, price/mint tuning,
  market fee %.
- **Reach** — [segments & broadcasts](marketing.md), the daily-reminder config.
- **Bots** — [Poker DNA](poker-dna.md) + [DQ](decision-quality.md) per bot, the DQ
  **validation banner + histogram**, grade-cutoff **Recompute**, create/delete bots,
  league roadmaps.
- **League** — cohort standings, Close-day-now, Sim-N-rounds, config knobs.
