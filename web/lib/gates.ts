// Progressive onboarding — client mirror of the server registry
// (backend services/onboarding.FEATURE_GATES). The server is authoritative; this exists so
// the UI can render locked states + explainer copy instantly on first paint (no flash),
// before GET /api/onboarding returns, and as a fallback if it fails.

export type GateKey =
  | "create_room" | "customize" | "friends" | "shop"
  | "quests" | "cards" | "leaderboard" | "league" | "clubs";

export interface GateMeta { level: number; title: string; blurb: string; tab: string }

export const GATES: Record<GateKey, GateMeta> = {
  create_room: { level: 2, title: "Create Room", blurb: "Host your own table and invite friends.", tab: "lobby" },
  customize:   { level: 2, title: "Customize",   blurb: "Choose your avatar and colors.",         tab: "profile" },
  friends:     { level: 3, title: "Friends",     blurb: "Add friends and play together.",         tab: "ranks" },
  shop:        { level: 3, title: "Shop",        blurb: "Coins, gems and card skins.",            tab: "shop" },
  quests:      { level: 3, title: "Quests",      blurb: "Daily goals for extra rewards.",         tab: "profile" },
  cards:       { level: 4, title: "Cards",       blurb: "Collect and trade card skins.",          tab: "cards" },
  leaderboard: { level: 4, title: "Leaderboard", blurb: "See where you rank.",                    tab: "ranks" },
  league:      { level: 5, title: "League",      blurb: "Ranked seasons with promotion.",         tab: "ranks" },
  clubs:       { level: 7, title: "Clubs",       blurb: "Join a club and play as a team.",        tab: "lobby" },
};

// Bottom-nav tab (keyed by its primary View) → the feature that gates the whole tab
// (the earliest-unlocking feature living under it). Play (lobby) & Me (profile) are never
// gated — Quick Play and your own profile are always available.
export const TAB_FEATURE: Partial<Record<string, GateKey>> = {
  shop: "shop",
  cards: "cards",
  leaderboard: "friends", // the "Ranks" tab
};

export interface FeatureState {
  min_level: number; unlocked: boolean; reveal_seen: boolean;
  title: string; blurb: string; tab: string;
}

export interface OnboardingState {
  enabled: boolean;
  level: number;
  real_level: number;
  admin: boolean;
  sandbox: { effective_level: number } | null;
  features: Record<string, FeatureState>;
  pending_reveals: string[];
  next_unlock: { feature: string; min_level: number; title: string } | null;
}
