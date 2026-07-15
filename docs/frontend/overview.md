# Frontend Overview

Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, lucide icons. **Static export**
(`output: 'export'`) — nginx serves the built files; there is no Node runtime in prod.

> `web/AGENTS.md`: this Next.js has breaking changes from older versions — check
> `node_modules/next/dist/docs/` before using an unfamiliar API.

## Entry & providers
`app/page.tsx` authenticates (Telegram initData → JWT), then wraps the app in, outermost
first: `ErrorBoundary` → `AppProvider` → `SkinProvider` → `NotificationProvider` →
`AppShell`. The **ErrorBoundary** turns a render crash into a recoverable card with the
error text, instead of Telegram's blank "This page couldn't load".

## State — `lib/store.tsx` (React context)
`useApp()` exposes `user`, `view`/`go`, `tableCode`/`enterTable`/`exitTable`,
`profileId`/`openUser`, `levelUp`, `dailyReady`, `refresh`. `SkinProvider` caches card
designs; `NotificationProvider` polls the bell + hosts the trade sheet.

## Screens — `components/screens/`
One per tab/view: `lobby`, `leaderboard` (Global/League/Skill/Friends), `league`, `skill`,
`cards`, `shop`, `profile` (Me), `squad`, `admin`, `create-room`, `customize`, `quests`,
`invite`, `changelog`. The bottom nav is Shop · Cards · **Play** (centre, raised) · Ranks
· Me.

## The table — `components/table/poker-table.tsx`
The live game view: WebSocket-driven seats on a ring, hole cards on the felt, the read
tray (made hand + the 5 cards making it + live equity), the bet slider with snap points,
and league-specific chrome (tier-coloured felt, live LP projection, forfeit confirm).

## API client — `lib/api.ts`
Thin `req(method, path, body)` wrapper adding the JWT. One method per endpoint.

## Poker in the browser — `lib/poker.ts`
A TS hand evaluator + Monte-Carlo `equity()` + `draws()`, used for the live win% and the
made-hand read without a round-trip.

## Deploy note
Chunk filenames are content-hashed. The deploy script keeps old chunks for 7 days so a
Mini App open across a deploy doesn't get stranded — see
[../operations/deployment.md](../operations/deployment.md).
