# PRD — Progressive Onboarding & Feature Gating

**Status:** Draft for review · **Owner:** @mmdsvm · **Author:** product/eng
**Scope of this doc:** the full roadmap. Implementation lands phase-by-phase after review.

---

## 1. Summary

Today a brand-new player lands in the full app: every home tile, every bottom-nav tab, the
whole shop/cards/league/clubs surface — all visible and tappable from second one. That is a
lot to absorb and buries the one thing a new player should do: **play a hand.**

This feature introduces a **progressive onboarding**: a new user starts with **Quick Play**
as the only actionable thing; every other surface is shown **locked** with an "Unlocks at
Lv N" badge, and reveals itself with a one-time spotlight as the player levels up by
playing. Level is the gate; playing is how you earn it.

Every gated surface is **testable by an admin** through an in-app **onboarding sandbox** —
view-as-new-user, jump to any level, reset, and preview any single step — without needing a
throwaway account.

### Locked-in product decisions (from review)
| Decision | Choice |
|---|---|
| Locked-feature visibility | **Show all, locked** — greyed with a lock + "Unlocks at Lv N" |
| Progression / reveal | **Level gate + reveal moment** — level unlocks; first cross triggers a one-time spotlight |
| Admin testing | **Full onboarding sandbox** — view-as-new-user, jump-to-level, reset, preview step; admins otherwise bypass all gates |
| This turn | **PRD only** — build begins after review |

---

## 2. Goals & non-goals

### Goals
- A new player's first screen has **one obvious action** (Quick Play); nothing else competes.
- Features **reveal progressively** by level, each with a moment that teaches what it is.
- The whole map is **visible from day one** (aspirational), just locked — the player always
  knows what's coming and roughly when.
- Gates are **server-authoritative**: a locked feature can't be reached by a deep link or a
  hand-crafted request, not just hidden in the UI.
- **Admins can walk the entire flow** in-app and tune it, so every step is verifiable.
- Thresholds are **data, not code** — tunable without a deploy (Phase 5).

### Non-goals (for v1)
- Action-based / quest-driven unlocks ("win a pot to unlock X"). Level is the sole gate in
  v1; quests are a future evolution (see §12).
- Reworking the XP/level curve itself. We build on the existing
  [`core/leveling.py`](../../backend/app/core/leveling.py).
- Changing what any feature *does* — only *when it appears*.
- A/B testing infrastructure (hooks noted for later).

---

## 3. Current state (what we're building on)

**Navigation** — [`bottom-nav.tsx`](../../web/components/bottom-nav.tsx), routed by
[`app-shell.tsx`](../../web/components/app-shell.tsx) via the `view` state in `lib/store`:

| Tab | Icon | Primary view | Also routes |
|---|---|---|---|
| Shop | 🛍️ | `shop` | — |
| Cards | 🗂️ | `cards` | — |
| **Play** (center) | 🎮 | `lobby` | `create`, `club` |
| Ranks | 🏆 | `leaderboard` | `friends`, `league` |
| Me | 👤 | `profile` | `invite`, `admin`, `quests`, `customize`, `changelog` |

**Home (lobby)** — [`lobby.tsx`](../../web/components/screens/lobby.tsx) tiles: **Quick Play**
(wide, hot), **Create Room**, **Club**, plus the Open Tables list, the League banner, and the
current-room banner.

**Levels** — [`core/leveling.py`](../../backend/app/core/leveling.py):
`level_for_xp(xp)` on a smoothing curve; XP from `XP_PER_HAND=5`, `XP_PER_HAND_WON=25`,
`XP_PER_SHOWDOWN_WIN=15`, `XP_PER_GAME=20`. Cumulative XP per level (`xp_for_level`):

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP floor | 0 | 100 | 300 | 600 | 1000 | 1500 | 2100 | 2800 | 3600 | 4500 |
| ≈ Quick games¹ | — | ~1 | ~2 | ~4 | ~6 | ~9 | ~13 | ~17 | ~22 | ~28 |

¹ Rough: a Sit & Go grants `XP_PER_GAME` + ~5/hand; ~120–180 XP/game. Tune with real data.

**Degrees** (rank tiers, already shown): Rookie L1 · Amateur L5 · Pro L10 · Shark L20 ·
Elite L35 · Master L50 · Legend L75.

**Existing pieces we reuse:** `LevelUpOverlay` (already fires on level-up — the natural place
to announce unlocks), `add_xp` in [`services/progression.py`](../../backend/app/services/progression.py),
and the admin panel shell in [`screens/admin.tsx`](../../web/components/screens/admin.tsx).

**Prior related rule to reconcile:** Club **join/create** is currently gated to **level 10**
(per the Clubs work). This PRD proposes the Club **section** reveals at **L7**; see §5.3.

---

## 4. Experience overview

### 4.1 First session (brand-new user, L1)
- Home shows **Quick Play** front-and-center and **hot**. It is the only lit action.
- Every other home tile and bottom-nav tab is **visible but locked**: desaturated, a small
  🔒, and a caption **"Unlocks at Lv N"**.
- Tapping a locked surface opens a light **explainer sheet**: what it is, one line of value,
  and "Unlocks at Level N — keep playing!". No dead ends.
- **Joining an invited table still works at L1** (a friend's `rm-` deep link) — only
  *hosting* (Create Room) is gated. Social in, friction out.

### 4.2 The loop
Play Quick Play → earn XP → level up → `LevelUpOverlay` announces the new unlock(s) → next
home visit, a **spotlight** points at the freshly unlocked tile/tab once → tapping it the
first time may show a one-line coach mark. Each reveal fires **exactly once** (tracked
server-side).

### 4.3 Locked visual language (design tokens)
- Locked card: `opacity ~45%`, no accent glow, lock chip top-right, `Unlocks · Lv N` caption.
- Locked nav tab: greyed icon + a tiny lock; tap → explainer sheet (doesn't switch tabs).
- Unlock reveal: a one-time gold **spotlight ring** + tooltip; respects reduced-motion.
- Copy deck lives in the appendix (§13).

---

## 5. The gating model

### 5.1 Feature registry
A single server-owned registry maps each **gateable surface** to a **minimum level** and its
**reveal metadata**. This is the source of truth; the client only renders what the server says.

```
FEATURE key        surface (view / tile / action)          gate   reveal copy
-----------------  --------------------------------------  -----  --------------------------------
quick_play         lobby: Quick Play tile + join invited    L1    (always on — no reveal)
daily_reward       shop daily reward hook                   L1    "Come back daily for coins"
changelog          Me: What's new                           L1    —
join_room          join an invited table (rm- deep link)    L1    (always on)
create_room        lobby: Create Room tile + /create        L2    "Host your own table"
customize          Me: Customize (equip avatar/skins)       L2    "Make it yours"
friends            Ranks: Friends + Invite                  L3    "Add friends, play together"
shop               nav: Shop                                L3    "Coins, gems & skins"
quests             Me: Quests                               L3    "Daily goals, extra rewards"
cards              nav: Cards (collection + market)         L4    "Collect & trade card skins"
leaderboard        Ranks: global leaderboard                L4    "See where you rank"
league             Ranks: League (+ Skill roadmap)          L5    "Ranked seasons, promotion"
clubs              lobby: Club tile + /club                 L7    "Join a club, play as a team"
```

> All thresholds are **defaults** and **config-tunable** (Phase 5). The two the user fixed —
> `create_room = L2`, `clubs = L7` — are honored.

### 5.2 Progression ladder (what unlocks when)
- **L1 — Rookie / start:** Quick Play, join-invited, daily reward, changelog.
- **L2 (~1 game):** Create Room, Customize.
- **L3 (~2 games):** Friends & Invite, Shop, Quests.
- **L4 (~4 games):** Cards (collection + market), global Leaderboard.
- **L5 (~6 games, Amateur):** League + Skill/DQ roadmap.
- **L7 (~13 games):** Clubs.

Rationale: play first (L1) → express & host (L2) → social & economy (L3) → collection &
status (L4) → competition (L5) → teams (L7). Each tier adds one conceptual layer, never two.

### 5.3 The Club L7-vs-L10 reconciliation (decision needed)
Current code requires **level 10** to join/create a club. Options:
- **(A) Reveal at L7, join at L10** — the Club tab appears at L7 but shows "Join unlocks at
  Lv 10" inside. Two-stage tease. *(Safest; preserves the existing economy rule.)*
- **(B) Lower join to L7** — align both to L7. Simpler, but changes club-economy assumptions.
- **Recommendation:** **(A)** for v1; revisit once we see L7→L10 drop-off.

### 5.4 Enforcement (must be server-side)
Hiding a tile is not a gate. Every gated **action endpoint** validates the caller's effective
level and refuses when locked:
- `POST /api/rooms` (create) → 403 below `create_room` gate.
- `POST /api/clubs/*` (join/create) → 403 below `clubs`/join gate.
- `league join`, `market`, `shop purchase`, etc. → same pattern.
- **Not gated:** `POST /api/rooms/join` for an invited `rm-` code (join-invited is L1).
A shared helper `require_feature(user, "create_room")` (raises 403) wraps these.

---

## 6. Data model

### 6.1 Gates config
- **v1:** a Python constant `FEATURE_GATES: dict[str, FeatureGate]` in a new
  `app/services/onboarding.py` (key → min_level, tab, reveal copy, enforce-endpoint list).
- **Phase 5:** an optional `feature_gate_overrides` table (or a single JSONB config row)
  so admins can retune thresholds live; the effective gate = override ?? default.

### 6.2 Per-user onboarding state
Add one column to `users` (no new table needed for v1):

```python
# app/models/user.py
onboarding: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
# shape:
# {
#   "seen_reveals": ["create_room", "shop", ...],   # reveals already spotlighted
#   "intro_done": true,                               # finished first-run
#   "sandbox": { "effective_level": 3 } | null        # ADMIN-ONLY test override
# }
```

- Unlock status is **derived** (`user.level` vs gate) — we never store per-feature unlock
  booleans, so retuning a threshold instantly re-derives for everyone.
- `seen_reveals` is the only real state: it makes each spotlight fire once.
- `sandbox` is written **only for admins** by the sandbox endpoints (§8).

### 6.3 Migration / backfill (grandfathering)
Existing players must **not** be spotlighted for features they've used for weeks. On migrate:
- For each user, set `seen_reveals = [every feature whose gate ≤ user.level]` and
  `intro_done = true`. New reveals only fire for gates they cross *after* launch.
- Bots are ignored (no UI, no endpoints hit).

---

## 7. API design

### 7.1 Player
- **`GET /api/onboarding`** → the client's single source of truth:
  ```json
  {
    "level": 3, "effective_level": 3,
    "features": {
      "create_room": {"min_level": 2, "unlocked": true,  "reveal_seen": true},
      "cards":       {"min_level": 4, "unlocked": false, "reveal_seen": false},
      "clubs":       {"min_level": 7, "unlocked": false, "reveal_seen": false}
    },
    "next_unlock": {"feature": "cards", "min_level": 4},
    "pending_reveals": ["shop", "quests"]      // unlocked but not yet spotlighted
  }
  ```
- **`POST /api/onboarding/seen`** `{ "feature": "shop" }` → append to `seen_reveals`
  (idempotent). Called when a spotlight is shown/dismissed.

`effective_level` = sandbox override if present (admins) else real `level`. All `unlocked`
flags derive from `effective_level`.

### 7.2 Admin sandbox (see §8)
- **`POST /api/admin/onboarding/sandbox`** `{ "effective_level": 1 | null }` — set/clear the
  admin's own view-as-level. `null` clears (back to full bypass).
- **`POST /api/admin/onboarding/reset`** `{ "level"?: n }` — clear `seen_reveals` (+ optional
  effective_level) so the admin can replay reveals from a chosen level.
- **`GET /api/admin/onboarding/preview?feature=clubs`** → the exact locked-state + reveal
  payload for one feature, for spot-checking copy without leveling.

### 7.3 Enforcement helper
`require_feature(user, key)` in `deps`/service layer → `HTTPException(403, "Locked — unlocks
at level N")`. Admins with no sandbox bypass; admins with a sandbox obey it.

---

## 8. Admin onboarding sandbox

The primary way to **test every step**. Lives in the admin panel
([`screens/admin.tsx`](../../web/components/screens/admin.tsx)) as an "Onboarding" section.

### 8.1 Controls
- **View as new user** — one tap: sets `sandbox.effective_level = 1` + clears `seen_reveals`.
  The admin's own app now behaves exactly like a fresh install (locked tiles, reveals fire).
- **Jump to level** — a slider/stepper (1…50) setting `effective_level`; the home + nav
  re-gate instantly so you can see each tier's state.
- **Reset my onboarding** — clears `seen_reveals` (+ optional effective_level) to replay the
  spotlights.
- **Preview a step** — pick any feature → see its locked card, explainer sheet, and reveal
  spotlight in isolation (via `GET …/preview`), no leveling required.
- **Exit sandbox** — clears `sandbox`, admin returns to full-bypass (everything unlocked).

### 8.2 Rules
- Sandbox writes only to **the admin's own** `users.onboarding.sandbox` — never affects other
  players or global config.
- With **no** sandbox set, an admin **bypasses all gates** (sees everything) — so day-to-day
  admin work isn't gated.
- Server enforcement (`require_feature`) honors the admin's sandbox, so a "view as L1" admin
  actually gets 403s from gated endpoints — a true end-to-end test, not just a visual mock.
- A persistent banner ("🧪 Onboarding sandbox — viewing as Lv N · Exit") shows while active,
  so an admin never forgets they're gated.

---

## 9. Analytics & activation funnel

Onboarding is a funnel; we must measure it.
- **Events:** `level_reached(level)`, `feature_unlocked(key, level)`, `feature_first_opened(key)`.
- **Where:** append to the existing telemetry/transaction stream, then roll into the
  `analytics` schema (a `fact_activation` view: user × feature × unlocked_at × first_used_at).
- **Explorer cards** (using the data explorer we just shipped): "% of new users reaching L2…L7",
  "unlock → first-use conversion per feature", "median time/games to each unlock",
  "drop-off cliff" (where activation stalls). These directly inform threshold tuning (Phase 5).

---

## 10. Edge cases & risks

| Case | Handling |
|---|---|
| Deep link to a locked surface (`start=shop`, `sq-` club) | Route to the explainer sheet, not the feature. |
| Invited to a table (`rm-`) at L1 | **Allowed** — join-invited is L1; only hosting is gated. |
| Existing high-level users | Backfill `seen_reveals` so no retroactive spotlights (§6.3). |
| Admins | Bypass by default; sandbox to test (§8). |
| Bots | Never hit these endpoints/UI; skip entirely. |
| Client/server disagree on level | Server is authoritative; UI re-fetches `/api/onboarding` after any XP gain / on level-up. |
| Feature flag off | `ONBOARDING_ENABLED=false` → everything unlocked, no reveals (safe kill switch). |
| Reduced motion | Spotlight degrades to a static highlight. |
| Threshold retune | Deriving from level means a retune is instant; already-past users keep their `seen_reveals`. |

---

## 11. Phased roadmap

Each phase is independently shippable and testable.

### Phase 0 — Foundations (server)
- `app/services/onboarding.py`: `FEATURE_GATES`, `effective_level(user)`, `is_unlocked(user, key)`,
  `require_feature(user, key)`.
- `users.onboarding` JSONB column + Alembic migration + **grandfather backfill**.
- `GET /api/onboarding`, `POST /api/onboarding/seen`.
- Wrap the gated endpoints (`create_room`, `clubs`, `league`, `shop`, `market`) with
  `require_feature`. Feature flag `ONBOARDING_ENABLED`.
- **Exit test:** curl `/api/onboarding` at various levels; gated POSTs 403 correctly.

### Phase 1 — Home lockdown + locked UI (client)
- A `useOnboarding()` hook fetching `/api/onboarding` (cached, refetched on level-up).
- Home tiles + bottom-nav tabs render **locked** states (greyed, lock, "Unlocks Lv N").
- Explainer sheet on locked tap; deep-link guard routes locked → explainer.
- New user at L1 sees only Quick Play lit (+ join-invited).
- **Exit test:** a fresh account sees the intended first screen; nothing gated is reachable.

### Phase 2 — Reveal moments
- `LevelUpOverlay` lists "Unlocked: …" for gates crossed.
- One-time spotlight on newly unlocked tile/tab; first-open coach mark.
- `pending_reveals` → spotlight → `POST /seen`.
- **Exit test:** each reveal fires exactly once; nothing re-spotlights on reload.

### Phase 3 — Admin onboarding sandbox
- Admin panel "Onboarding" section: view-as-new, jump-to-level, reset, preview, exit.
- `POST /api/admin/onboarding/{sandbox,reset}`, `GET …/preview`.
- Sandbox banner; server enforcement honors sandbox.
- **Exit test:** an admin walks L1→L7 in-app and hits real 403s while sandboxed.

### Phase 4 — Analytics funnel
- Emit `level_reached` / `feature_unlocked` / `feature_first_opened`.
- `analytics.fact_activation` view + saved explorer cards + a small activation dashboard.

### Phase 5 — Tuning & polish
- `feature_gate_overrides` (admin-tunable thresholds, no deploy).
- Copy pass, motion polish, reduced-motion, i18n-ready strings.
- Hooks for future A/B on thresholds.

**Suggested first build:** Phase 0 + Phase 1 together (the gate engine + the visible
lockdown), since they're only valuable as a pair; then 2, 3, 4, 5.

---

## 12. Future / explicitly deferred
- **Quest-driven unlocks** ("win a pot", "add a friend") layered on top of level gates.
- **Contextual nudges** ("you have 500 coins — the Shop is open!").
- **Personalized order** (surface Clubs earlier for users who arrived via a club invite).
- **A/B testing** thresholds and reveal copy.

---

## 13. Appendix

### 13.1 Copy deck (draft)
- Locked caption: **`Unlocks · Lv {n}`**
- Explainer sheet title/body per feature (see registry §5.1 "reveal copy").
- Level-up unlock line: **`🔓 New: {Feature} unlocked!`**
- Sandbox banner: **`🧪 Onboarding sandbox — viewing as Lv {n} · Exit`**
- 403 message: **`Locked — unlocks at level {n}. Keep playing!`**

### 13.2 Full gating matrix
See §5.1. Fixed by review: `create_room = L2`, `clubs = L7`. All others are proposed defaults,
tunable in Phase 5.

### 13.3 Open decisions
1. **Club L7 reveal vs L10 join** — recommend option (A) two-stage (§5.3).
2. **Shop vs Cards order** — proposed Shop L3 / Cards L4; confirm.
3. **Quests at L3** — or fold quests in later? (They drive the same loop; L3 seems right.)
4. **Exact XP/level feel** — validate the "≈ games per level" against real telemetry after
   Phase 4 and retune gates if the L1→L2 step feels too fast/slow.
