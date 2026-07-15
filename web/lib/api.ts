// REST client for the FastAPI backend (same origin, /api/*).
import { tg } from "./telegram";
import type { RoomSummary, UserProfile } from "./types";

let token: string | null =
  typeof window !== "undefined" ? localStorage.getItem("pcm_token") : null;

async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch("/api" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).detail || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getToken: () => token,

  async authenticate(): Promise<UserProfile> {
    const initData = tg()?.initData;
    if (initData) {
      const r = await req<{ token: string; user: UserProfile }>(
        "POST",
        "/auth/telegram",
        { init_data: initData },
      );
      token = r.token;
      localStorage.setItem("pcm_token", token);
      return r.user;
    }
    // local browser preview fallback (disabled in prod backend)
    let devId = Number(localStorage.getItem("pcm_devid") || 0);
    if (!devId) {
      devId = Math.floor(Math.random() * 1e9);
      localStorage.setItem("pcm_devid", String(devId));
    }
    const r = await req<{ token: string; user: UserProfile }>("POST", "/auth/dev", {
      telegram_id: devId,
      first_name: "Guest",
      username: "guest" + (devId % 1000),
    });
    token = r.token;
    localStorage.setItem("pcm_token", token);
    return r.user;
  },

  me: () => req<UserProfile>("GET", "/me"),
  changelog: () => req("GET", "/changelog"),
  daily: () => req("POST", "/daily"),
  dailyStatus: () => req("GET", "/daily"),
  setTz: (offset_min: number) => req("POST", "/me/tz", { offset_min }),
  dna: () => req("GET", "/dna"),
  league: () => req("GET", "/league"),
  leaguePlay: () => req("POST", "/league/play"),
  leagueHistory: () => req("GET", "/league/history"),
  leagueActive: () => req("GET", "/league/active"),
  leagueForfeit: (code: string) => req("POST", "/league/forfeit", { code }),
  skill: () => req("GET", "/skill"),
  skillBoard: () => req("GET", "/skill/leaderboard"),
  redeemShards: (card: string) => req("POST", "/cards/redeem-shards", { card }),
  adminLeague: () => req("GET", "/admin/league"),
  adminLeagueCfg: (b: unknown) => req("PATCH", "/admin/league", b),
  adminLeagueClose: () => req("POST", "/admin/league/close"),
  adminLeagueSimulate: (n: number) => req("POST", `/admin/league/simulate?rounds=${n}`),
  adminBots: () => req("GET", "/admin/bots"),
  adminBot: (id: number) => req("GET", `/admin/bots/${id}`),
  adminDq: () => req("GET", "/admin/dq"),
  adminDqRecompute: () => req("POST", "/admin/dq/recompute"),
  adminCreateBot: (b: unknown) => req("POST", "/admin/bots", b),
  adminDeleteBot: (id: number) => req("DELETE", `/admin/bots/${id}`),
  notifications: () => req("GET", "/notifications"),
  readNotifications: () => req("POST", "/notifications/read"),
  wallet: () => req("GET", "/wallet/history"),
  leaderboard: (metric: string) => req("GET", "/leaderboard?metric=" + metric),
  listRooms: () => req<RoomSummary[]>("GET", "/rooms"),
  currentRoom: () => req<RoomSummary | null>("GET", "/rooms/state/current"),
  createRoom: (b: unknown) => req<RoomSummary>("POST", "/rooms", b),
  joinRoom: (code: string, buy: number | null) =>
    req<RoomSummary>("POST", `/rooms/${code}/join`, { buy_in: buy }),
  joinRandom: (buy: number | null) =>
    req<RoomSummary>("POST", "/rooms/join/random", { buy_in: buy }),
  leaveRoom: (code: string) => req("POST", `/rooms/${code}/leave`),
  closeRoom: (code: string) => req("DELETE", `/rooms/${code}`),
  rebuy: (code: string, amt: number) => req("POST", `/rooms/${code}/rebuy`, { amount: amt }),
  roomInfo: (code: string) => req<RoomSummary>("GET", `/rooms/${code}`),
  catalog: () => req("GET", "/shop/catalog"),
  buyStars: (code: string) => req("POST", "/shop/stars/invoice", { product_code: code }),
  tonIntent: (code: string) => req("POST", "/shop/ton/intent", { product_code: code }),
  tonVerify: (payload: string) => req("POST", "/shop/ton/verify", { payload }),
  boxes: () => req("GET", "/shop/boxes"),
  openBox: (code: string, pay: string) =>
    req("POST", "/shop/boxes/open", { box_code: code, pay_with: pay }),
  boxHistory: () => req("GET", "/shop/boxes/history"),
  achievements: () => req("GET", "/achievements"),
  challenges: () => req("GET", "/challenges"),
  referral: () => req("GET", "/referral"),
  adminStats: () => req("GET", "/admin/stats"),
  adminBoxes: () => req("GET", "/admin/boxes"),
  adminUpdateBox: (code: string, b: unknown) => req("PATCH", `/admin/boxes/${code}`, b),
  adminProducts: () => req("GET", "/admin/products"),
  adminUpdateProduct: (code: string, b: unknown) => req("PATCH", `/admin/products/${code}`, b),
  squadEdit: (b: unknown) => req("PATCH", "/squads", b),

  // --- card skins ---
  cardDesigns: () => req("GET", "/cards/designs"),
  collection: () => req("GET", "/cards/collection"),
  cardShop: (q: { design?: string; card?: string } = {}) =>
    req(
      "GET",
      "/cards/shop" +
        (q.design ? `?design=${q.design}` : q.card ? `?card=${q.card}` : ""),
    ),
  buyCard: (design: string, card: string, currency: string) =>
    req("POST", "/cards/buy", { design, card, currency }),
  equipCard: (card: string, skin_id: number | null) =>
    req("POST", "/cards/equip", { card, skin_id }),
  skinDetail: (id: number) => req("GET", `/cards/skins/${id}`),
  cardPurchases: () => req("GET", "/cards/purchases"),
  adminCards: () => req("GET", "/admin/cards"),
  adminUpdateDesign: (code: string, b: unknown) => req("PATCH", `/admin/cards/${code}`, b),
  adminMarketFee: (fee_pct: number) => req("PATCH", "/admin/market", { fee_pct }),

  // --- audience / broadcast ---
  adminSegments: () => req("GET", "/admin/segments"),
  adminCreateSegment: (b: unknown) => req("POST", "/admin/segments", b),
  adminUpdateSegment: (id: number, b: unknown) => req("PATCH", `/admin/segments/${id}`, b),
  adminDeleteSegment: (id: number) => req("DELETE", `/admin/segments/${id}`),
  adminComputeSegment: (id: number) => req("POST", `/admin/segments/${id}/compute`),
  adminPreviewSegment: (rules: unknown) =>
    req("POST", "/admin/segments/preview", { rules }),
  adminBroadcast: (text: string, segment_id: number | null) =>
    req("POST", "/admin/broadcast", { text, segment_id }),
  adminBroadcasts: () => req("GET", "/admin/broadcasts"),
  adminReminder: () => req("GET", "/admin/reminder"),
  adminUpdateReminder: (b: unknown) => req("PATCH", "/admin/reminder", b),

  // --- market ---
  marketGroups: (q: Record<string, string>) =>
    req("GET", "/market/groups?" + new URLSearchParams(q).toString()),
  market: (q: Record<string, string>) =>
    req("GET", "/market?" + new URLSearchParams(q).toString()),
  marketStats: (design: string, card: string) =>
    req("GET", `/market/stats?design=${design}&card=${card}`),
  marketList: (skin_id: number, price: number, currency: string) =>
    req("POST", "/market/list", { skin_id, price, currency }),
  marketCancel: (listing_id: number) => req("POST", "/market/cancel", { listing_id }),
  marketBuy: (listing_id: number) => req("POST", "/market/buy", { listing_id }),
  marketMine: () => req("GET", "/market/mine"),
  marketTrade: (id: number) => req("GET", `/market/trades/${id}`),
  friends: () => req("GET", "/friends"),
  friendSearch: (q: string) => req("GET", "/friends/search?q=" + encodeURIComponent(q)),
  friendRequest: (id: number) => req("POST", "/friends/request", { user_id: id }),
  friendAccept: (id: number) => req("POST", "/friends/accept", { user_id: id }),
  friendRemove: (id: number) => req("POST", "/friends/remove", { user_id: id }),
  friendsLeaderboard: (metric: string) =>
    req("GET", "/friends/leaderboard?metric=" + metric),
  userProfile: (id: number) => req(`GET`, `/users/${id}`),
  myHistory: () => req("GET", "/me/history"),
  cosmetics: () => req("GET", "/cosmetics"),
  buyCosmetic: (kind: string, code: string) => req("POST", "/cosmetics/buy", { kind, code }),
  equipCosmetic: (kind: string, code: string) => req("POST", "/cosmetics/equip", { kind, code }),
  mySquad: () => req("GET", "/squads/me"),
  createSquad: (b: unknown) => req("POST", "/squads", b),
  joinSquad: (code: string) => req("POST", "/squads/join", { code }),
  leaveSquad: () => req("POST", "/squads/leave"),
  squadBrowse: (q: string) => req("GET", "/squads/browse?q=" + encodeURIComponent(q)),
  squadLeaderboard: () => req("GET", "/squads/leaderboard"),
  squadPromote: (id: number) => req("POST", "/squads/members/promote", { user_id: id }),
  squadDemote: (id: number) => req("POST", "/squads/members/demote", { user_id: id }),
  squadKick: (id: number) => req("POST", "/squads/members/kick", { user_id: id }),
  squadMessages: (after: number) => req("GET", "/squads/messages?after=" + after),
  squadSend: (text: string) => req("POST", "/squads/messages", { text }),
};

export function fmt(n: number): string {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
