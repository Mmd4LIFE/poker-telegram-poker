# Poker DNA — the behavioural radar

A 7-axis radar of **how a player actually plays**, computed from real hands. Code:
`services/dna.py` (formulas), `models/dna.py` (`PlayerStats` counters), captured in
`game/runtime.py`, surfaced in `poker-dna.tsx` (self) and Admin → Bots.

## The seven axes
Aggression, Discipline, Deception, Hand Reading, Position, Composure, Adaptation.

Two rules keep it honest:
1. **It reflects behaviour, never configuration.** A bot set to "aggressive" that folds
   all day reads as passive — that's the truth.
2. **Each axis is regressed toward 50 by its OWN evidence** (empirical Bayes), not by
   total hands. Showdown stats are rare, so Hand Reading stays cautious long after
   Aggression firms up. Zero data → a neutral heptagon.

## Notes
- **Deception** measures firing with *nothing* (hand actually held is recorded on each
  aggressive postflop action) — an earlier version measured "won without showdown",
  which was fold equity, not bluffing (the rock scored highest, the maniac lowest).
- Unlocks at 100 hands; below that the UI says how many are left.
- Stored as raw integer counters; percentages derived on read, so formulas can change
  without a backfill.
