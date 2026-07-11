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
  daily: () => req("POST", "/daily"),
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
  rebuy: (code: string, amt: number) => req("POST", `/rooms/${code}/rebuy`, { amount: amt }),
  roomInfo: (code: string) => req<RoomSummary>("GET", `/rooms/${code}`),
  catalog: () => req("GET", "/shop/catalog"),
  buyStars: (code: string) => req("POST", "/shop/stars/invoice", { product_code: code }),
  tonIntent: (code: string) => req("POST", "/shop/ton/intent", { product_code: code }),
  tonVerify: (payload: string) => req("POST", "/shop/ton/verify", { payload }),
  boxes: () => req("GET", "/shop/boxes"),
  openBox: (code: string, pay: string) =>
    req("POST", "/shop/boxes/open", { box_code: code, pay_with: pay }),
  achievements: () => req("GET", "/achievements"),
  challenges: () => req("GET", "/challenges"),
  referral: () => req("GET", "/referral"),
  adminStats: () => req("GET", "/admin/stats"),
  mySquad: () => req("GET", "/squads/me"),
  createSquad: (b: unknown) => req("POST", "/squads", b),
  joinSquad: (code: string) => req("POST", "/squads/join", { code }),
  leaveSquad: () => req("POST", "/squads/leave"),
};

export function fmt(n: number): string {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
