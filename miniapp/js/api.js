// REST API client + auth state.
const API = (() => {
  const base = "";
  let token = localStorage.getItem("pcm_token") || null;

  async function req(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch (e) {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function authenticate() {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData;
    if (initData) {
      const r = await req("POST", "/api/auth/telegram", { init_data: initData });
      token = r.token;
      localStorage.setItem("pcm_token", token);
      return r.user;
    }
    // local dev fallback
    const devId = Number(localStorage.getItem("pcm_devid") ||
      (Math.floor(Math.random() * 1e9)));
    localStorage.setItem("pcm_devid", devId);
    const r = await req("POST", "/api/auth/dev", {
      telegram_id: devId, first_name: "Guest", username: "guest" + (devId % 1000),
    });
    token = r.token;
    localStorage.setItem("pcm_token", token);
    return r.user;
  }

  return {
    authenticate,
    getToken: () => token,
    me: () => req("GET", "/api/me"),
    daily: () => req("POST", "/api/daily"),
    wallet: () => req("GET", "/api/wallet/history"),
    leaderboard: (metric) => req("GET", "/api/leaderboard?metric=" + metric),
    listRooms: () => req("GET", "/api/rooms"),
    createRoom: (b) => req("POST", "/api/rooms", b),
    joinRoom: (code, buy) => req("POST", `/api/rooms/${code}/join`, { buy_in: buy }),
    joinRandom: (buy) => req("POST", "/api/rooms/join/random", { buy_in: buy }),
    currentRoom: () => req("GET", "/api/rooms/state/current"),
    leaveRoom: (code) => req("POST", `/api/rooms/${code}/leave`),
    rebuy: (code, amt) => req("POST", `/api/rooms/${code}/rebuy`, { amount: amt }),
    roomInfo: (code) => req("GET", `/api/rooms/${code}`),
    catalog: () => req("GET", "/api/shop/catalog"),
    buyStars: (code) => req("POST", "/api/shop/stars/invoice", { product_code: code }),
    tonIntent: (code) => req("POST", "/api/shop/ton/intent", { product_code: code }),
    tonVerify: (payload) => req("POST", "/api/shop/ton/verify", { payload }),
    boxes: () => req("GET", "/api/shop/boxes"),
    openBox: (code, pay) => req("POST", "/api/shop/boxes/open", { box_code: code, pay_with: pay }),
    achievements: () => req("GET", "/api/achievements"),
    challenges: () => req("GET", "/api/challenges"),
    referral: () => req("GET", "/api/referral"),
    adminStats: () => req("GET", "/api/admin/stats"),
    mySquad: () => req("GET", "/api/squads/me"),
    createSquad: (b) => req("POST", "/api/squads", b),
    joinSquad: (code) => req("POST", "/api/squads/join", { code }),
    leaveSquad: () => req("POST", "/api/squads/leave"),
  };
})();
