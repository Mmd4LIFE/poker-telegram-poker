// App router + views.
const App = (() => {
  let user = null;
  let currentTable = null;
  const tg = window.Telegram?.WebApp;

  async function init() {
    if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor?.("#0d1117"); tg.setBackgroundColor?.("#0d1117"); }
    try {
      user = await API.authenticate();
    } catch (e) {
      document.getElementById("app").innerHTML =
        `<div class="view"><div class="card">⚠️ Login failed: ${escapeHtml(e.message)}<br><br>
        Open this app from the Telegram bot.</div></div>`;
      return;
    }
    document.getElementById("tabbar").classList.remove("hidden");
    setupTabs();
    // deep link: startapp param may be a room code
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && !["shop", "leaderboard"].includes(startParam)) {
      openTableFlow(startParam);
      return;
    }
    if (startParam === "shop") return show("shop");
    if (startParam === "leaderboard") return show("leaderboard");
    show("lobby");
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => show(t.dataset.view);
    });
  }

  function setActiveTab(view) {
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === view));
  }

  async function refreshUser() {
    try { user = await API.me(); } catch (e) {}
  }

  function walletBar() {
    return `<div class="topbar">
      <div class="ava">${user.avatar}</div>
      <div class="grow">
        <div style="font-weight:700">${escapeHtml(user.display_name)}</div>
        <div class="muted">Lvl ${user.level} · ${user.degree_label || user.degree}</div>
      </div>
      <div class="chip coins">🪙 ${fmt(user.coins)}</div>
      <div class="chip gems">💎 ${user.gems}</div>
    </div>`;
  }

  function setView(html) {
    const root = document.getElementById("app");
    root.innerHTML = `<div class="view">${html}</div>`;
  }

  async function show(view) {
    if (currentTable) return;
    document.getElementById("tabbar").classList.remove("hidden");
    setActiveTab(view);
    await refreshUser();
    if (view === "lobby") return renderLobby();
    if (view === "quests") return renderQuests();
    if (view === "shop") return renderShop();
    if (view === "leaderboard") return renderLeaderboard();
    if (view === "profile") return renderProfile();
  }

  // ---------- Lobby ----------
  async function renderLobby() {
    setView(`${walletBar()}
      <h1>♠️ Play Poker</h1>
      <div class="menu-grid">
        <div class="menu-tile hot wide" id="tQuick">
          <div class="ico">⚡</div><div class="t">Quick Play</div>
          <div class="d">Jump into a table instantly</div>
        </div>
        <div class="menu-tile" id="tCreate"><div class="ico">➕</div><div class="t">Create Room</div><div class="d">Host a table</div></div>
        <div class="menu-tile" id="tJoin"><div class="ico">🔑</div><div class="t">Join by Code</div><div class="d">Enter friend's code</div></div>
        <div class="menu-tile" id="tSquad"><div class="ico">🛡️</div><div class="t">Squad</div><div class="d">Play with your crew</div></div>
        <div class="menu-tile" id="tDaily"><div class="ico">🎁</div><div class="t">Daily Reward</div><div class="d">Streak: ${user.daily_streak}🔥</div></div>
      </div>
      <h2>Open Tables</h2>
      <div id="roomList" class="card"><div class="muted">Loading…</div></div>`);

    document.getElementById("tQuick").onclick = () => quickPlay();
    document.getElementById("tCreate").onclick = () => renderCreateRoom();
    document.getElementById("tJoin").onclick = () => joinByCodePrompt();
    document.getElementById("tSquad").onclick = () => renderSquad();
    document.getElementById("tDaily").onclick = () => claimDaily();

    try {
      const rooms = await API.listRooms();
      const list = document.getElementById("roomList");
      if (!rooms.length) { list.innerHTML = `<div class="muted">No open tables. Create one!</div>`; return; }
      list.innerHTML = rooms.map((r) => `
        <div class="lrow" data-code="${r.code}">
          <div class="ic">🃏</div>
          <div class="main"><div class="t">${escapeHtml(r.name)} <span class="muted">#${r.code}</span></div>
            <div class="d">${r.players}/${r.max_players} players · Blinds ${fmt(r.small_blind)}/${fmt(r.big_blind)}</div></div>
          <button class="btn sm">Join</button>
        </div>`).join("");
      list.querySelectorAll(".lrow").forEach((row) => {
        row.querySelector("button").onclick = () => openTableFlow(row.dataset.code);
      });
    } catch (e) { toast(e.message); }
  }

  async function quickPlay() {
    try {
      const room = await API.joinRandom(null);
      enterTable(room.code);
    } catch (e) { toast(e.message); }
  }

  function renderCreateRoom() {
    setView(`<div class="row between"><h1>Create Room</h1><button class="btn ghost sm" id="back">✕</button></div>
      <div class="card">
        <input class="input" id="rName" placeholder="Table name" value="${escapeHtml(user.display_name)}'s Table">
        <div class="row"><input class="input" id="rSb" type="number" placeholder="Small blind" value="50">
          <input class="input" id="rBb" type="number" placeholder="Big blind" value="100"></div>
        <div class="row"><input class="input" id="rMin" type="number" placeholder="Min buy-in" value="2000">
          <input class="input" id="rMax" type="number" placeholder="Max buy-in" value="20000"></div>
        <div class="row between" style="margin:8px 2px">
          <label>Max players</label>
          <select class="input" id="rMaxp" style="width:auto;margin:0">
            <option>2</option><option>4</option><option selected>6</option><option>9</option></select>
        </div>
        <label class="row center" style="gap:8px;margin:8px 2px"><input type="checkbox" id="rBots" checked> Fill empty seats with AI</label>
        <label class="row center" style="gap:8px;margin:8px 2px"><input type="checkbox" id="rPriv"> Private (invite only)</label>
        <button class="btn" id="createBtn">Create & Sit</button>
      </div>`);
    document.getElementById("back").onclick = () => show("lobby");
    document.getElementById("createBtn").onclick = async () => {
      try {
        const room = await API.createRoom({
          name: document.getElementById("rName").value || "Poker Table",
          small_blind: +document.getElementById("rSb").value,
          big_blind: +document.getElementById("rBb").value,
          min_buy_in: +document.getElementById("rMin").value,
          max_buy_in: +document.getElementById("rMax").value,
          max_players: +document.getElementById("rMaxp").value,
          allow_bots: document.getElementById("rBots").checked,
          is_private: document.getElementById("rPriv").checked,
        });
        await openTableFlow(room.code);
      } catch (e) { toast(e.message); }
    };
  }

  function joinByCodePrompt() {
    setView(`<div class="row between"><h1>Join by Code</h1><button class="btn ghost sm" id="back">✕</button></div>
      <div class="card">
        <input class="input" id="jCode" placeholder="ENTER CODE" style="text-transform:uppercase;text-align:center;letter-spacing:3px;font-size:22px">
        <button class="btn" id="joinBtn">Join Table</button>
      </div>`);
    document.getElementById("back").onclick = () => show("lobby");
    document.getElementById("joinBtn").onclick = () => {
      const code = document.getElementById("jCode").value.trim().toUpperCase();
      if (code) openTableFlow(code);
    };
  }

  async function openTableFlow(code) {
    // fetch room info to pick buy-in, then join and enter
    try {
      const info = await API.roomInfo(code);
      setView(`<div class="row between"><h1>${escapeHtml(info.name)}</h1><button class="btn ghost sm" id="back">✕</button></div>
        <div class="card">
          <div class="muted">Table #${info.code} · Blinds ${fmt(info.small_blind)}/${fmt(info.big_blind)}</div>
          <h2>Buy-in</h2>
          <input type="range" id="buyRange" min="${info.min_buy_in}" max="${Math.min(info.max_buy_in, user.coins)}" value="${Math.min(info.max_buy_in, Math.max(info.min_buy_in, Math.min(user.coins, info.min_buy_in*3)))}" step="${info.small_blind}" style="width:100%;accent-color:var(--accent)">
          <div class="row between"><span class="muted">Min ${fmt(info.min_buy_in)}</span>
            <span class="raise-amt" id="buyVal"></span>
            <span class="muted">Max ${fmt(info.max_buy_in)}</span></div>
          <button class="btn" id="sitBtn" style="margin-top:12px">Take a Seat</button>
          ${user.coins < info.min_buy_in ? '<div class="muted" style="color:var(--accent2);margin-top:8px">Not enough coins — visit the Shop or claim your daily reward.</div>' : ""}
        </div>`);
      document.getElementById("back").onclick = () => show("lobby");
      const range = document.getElementById("buyRange");
      const val = document.getElementById("buyVal");
      const upd = () => (val.textContent = fmt(+range.value));
      range.oninput = upd; upd();
      document.getElementById("sitBtn").onclick = async () => {
        try {
          await API.joinRoom(code, +range.value);
          enterTable(code);
        } catch (e) { toast(e.message); }
      };
    } catch (e) { toast(e.message); }
  }

  function enterTable(code) {
    currentTable = new PokerTable(code, user.id, () => {
      currentTable = null;
      show("lobby");
    });
    currentTable.mount();
  }

  async function claimDaily() {
    try {
      const r = await API.daily();
      if (r.claimed) toast(`🎁 +${fmt(r.reward)} coins! Streak ${r.streak}🔥`);
      else toast("Already claimed. Come back later!");
      await refreshUser();
      renderLobby();
    } catch (e) { toast(e.message); }
  }

  // ---------- Quests (achievements + challenges) ----------
  async function renderQuests() {
    setView(`${walletBar()}
      <div class="seg"><button class="active" data-t="ch">🎯 Challenges</button><button data-t="ac">🏆 Achievements</button></div>
      <div id="questBody"><div class="muted">Loading…</div></div>`);
    const body = document.getElementById("questBody");
    const load = async (which) => {
      body.innerHTML = `<div class="muted">Loading…</div>`;
      if (which === "ch") {
        const list = await API.challenges();
        body.innerHTML = `<div class="card">` + list.map((c) => questRow(c)).join("") + `</div>`;
      } else {
        const list = await API.achievements();
        body.innerHTML = `<div class="card">` + list.map((c) => questRow(c)).join("") + `</div>`;
      }
    };
    document.querySelectorAll(".seg button").forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll(".seg button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        load(b.dataset.t);
      };
    });
    load("ch");
  }

  function questRow(c) {
    const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
    return `<div class="lrow">
      <div class="ic">${c.icon}</div>
      <div class="main">
        <div class="t">${escapeHtml(c.title)} ${c.period ? `<span class="muted">(${c.period})</span>` : ""}</div>
        <div class="d">${escapeHtml(c.description)}</div>
        <div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i></div>
        <div class="d">${c.progress}/${c.target} · 🪙${fmt(c.reward_coins)}${c.reward_gems ? " 💎" + c.reward_gems : ""}</div>
      </div>
      ${c.completed ? `<span class="pill done">✓</span>` : `<span class="pill">${pct}%</span>`}
    </div>`;
  }

  // ---------- Shop ----------
  async function renderShop() {
    setView(`${walletBar()}<h1>💰 Shop</h1><div id="shopBody"><div class="muted">Loading…</div></div>`);
    const body = document.getElementById("shopBody");
    try {
      const [cat, boxes] = await Promise.all([API.catalog(), API.boxes()]);
      body.innerHTML = `
        <h2>⭐ Coin & Gem Packs (Telegram Stars)</h2>
        <div class="card">${cat.stars.map((p) => `
          <div class="lrow" data-star="${p.code}">
            <div class="ic">${p.icon}</div>
            <div class="main"><div class="t">${p.label}</div>
              <div class="d">🪙 ${fmt(p.coins)}${p.gems ? " · 💎 " + p.gems : ""}</div></div>
            <button class="btn sm">⭐ ${p.stars}</button>
          </div>`).join("")}</div>
        ${cat.ton && cat.ton.length ? `<h2>💠 TON Packs</h2>
        <div class="card">${cat.ton.map((p) => `
          <div class="lrow" data-ton="${p.code}">
            <div class="ic">${p.icon}</div>
            <div class="main"><div class="t">${p.label}</div>
              <div class="d">🪙 ${fmt(p.coins)}${p.gems ? " · 💎 " + p.gems : ""}</div></div>
            <button class="btn sm">${p.ton} TON</button>
          </div>`).join("")}</div>` : ""}
        <h2>🎁 Loot Boxes</h2>
        <div class="card">${boxes.map((b) => `
          <div class="lrow" data-box="${b.code}">
            <div class="ic">${b.icon}</div>
            <div class="main"><div class="t">${b.name} <span class="muted">${b.tier}</span></div>
              <div class="d">${escapeHtml(b.description)}</div></div>
            <button class="btn sm">${b.price_gems && !b.price_coins ? "💎 " + b.price_gems : "🪙 " + fmt(b.price_coins)}</button>
          </div>`).join("")}</div>`;
      body.querySelectorAll("[data-star] button").forEach((btn) => {
        btn.onclick = () => buyStars(btn.closest("[data-star]").dataset.star);
      });
      body.querySelectorAll("[data-ton] button").forEach((btn) => {
        btn.onclick = () => buyTon(btn.closest("[data-ton]").dataset.ton);
      });
      body.querySelectorAll("[data-box] button").forEach((btn) => {
        const code = btn.closest("[data-box]").dataset.box;
        const box = boxes.find((x) => x.code === code);
        btn.onclick = () => openBox(box);
      });
    } catch (e) { body.innerHTML = `<div class="card">${escapeHtml(e.message)}</div>`; }
  }

  async function buyStars(code) {
    try {
      const r = await API.buyStars(code);
      if (tg?.openInvoice) {
        tg.openInvoice(r.invoice_link, (status) => {
          if (status === "paid") { toast("✅ Purchase complete!"); setTimeout(() => renderShop(), 1200); }
          else if (status === "failed") toast("Payment failed");
        });
      } else {
        window.open(r.invoice_link, "_blank");
      }
    } catch (e) { toast(e.message); }
  }

  async function buyTon(code) {
    try {
      const r = await API.tonIntent(code);
      setView(`<div class="row between"><h1>Pay with TON</h1><button class="btn ghost sm" id="back">✕</button></div>
        <div class="card">
          <div class="muted">Send exactly</div>
          <div style="font-size:26px;font-weight:800;color:#7ee0ff">${r.amount_ton} TON</div>
          <h2>To wallet</h2><div class="input" style="word-break:break-all">${r.wallet}</div>
          <h2>Comment (required!)</h2><div class="input">${r.comment}</div>
          <button class="btn" id="verifyBtn">I've paid — Verify</button>
          <div class="muted" style="margin-top:8px">Include the comment or funds can't be matched.</div>
        </div>`);
      document.getElementById("back").onclick = () => renderShop();
      document.getElementById("verifyBtn").onclick = async () => {
        try {
          const v = await API.tonVerify(r.payload);
          if (v.status === "paid") { toast("✅ TON payment confirmed!"); renderShop(); }
          else toast("Not found yet — wait a moment and retry.");
        } catch (e) { toast(e.message); }
      };
    } catch (e) { toast(e.message); }
  }

  async function openBox(box) {
    const payGems = box.price_gems && !box.price_coins;
    try {
      const r = await API.openBox(box.code, payGems ? "gems" : "coins");
      const rw = r.reward;
      const label = rw.label || (rw.type === "coins" ? fmt(rw.amount) + " coins" : rw.type);
      toast(`${box.icon} You won: ${label}!`);
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      await refreshUser();
      renderShop();
    } catch (e) { toast(e.message); }
  }

  // ---------- Leaderboard ----------
  async function renderLeaderboard() {
    setView(`${walletBar()}<h1>🏆 Leaderboard</h1>
      <div class="seg"><button class="active" data-m="total_won">Winnings</button>
        <button data-m="level">Level</button><button data-m="hands_won">Wins</button></div>
      <div id="lbBody"><div class="muted">Loading…</div></div>`);
    const load = async (metric) => {
      const body = document.getElementById("lbBody");
      body.innerHTML = `<div class="muted">Loading…</div>`;
      const rows = await API.leaderboard(metric);
      body.innerHTML = `<div class="card">` + rows.map((r) => {
        const cls = r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : r.rank === 3 ? "bronze" : "";
        return `<div class="lrow">
          <div class="rank-badge ${cls}">${r.rank <= 3 ? ["🥇","🥈","🥉"][r.rank-1] : r.rank}</div>
          <div class="ic">${r.avatar}</div>
          <div class="main"><div class="t">${escapeHtml(r.display_name)}</div>
            <div class="d">Lvl ${r.level} · ${r.degree}</div></div>
          <div class="pill">${fmt(r.value)}</div></div>`;
      }).join("") + `</div>`;
    };
    document.querySelectorAll(".seg button").forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll(".seg button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        load(b.dataset.m);
      };
    });
    load("total_won");
  }

  // ---------- Profile ----------
  async function renderProfile() {
    const prog = Math.round((user.level_progress || 0) * 100);
    setView(`${walletBar()}
      <div class="card" style="text-align:center">
        <div style="font-size:54px">${user.avatar}</div>
        <div style="font-size:20px;font-weight:800">${escapeHtml(user.display_name)}</div>
        <div class="muted">${user.degree_label || user.degree}</div>
        <div class="row between" style="margin-top:12px"><span>Level ${user.level}</span><span class="muted">${fmt(user.xp)} / ${fmt(user.next_level_xp)} XP</span></div>
        <div class="bar"><i style="width:${prog}%"></i></div>
      </div>
      <div class="card">
        <div class="lrow"><div class="ic">🃏</div><div class="main"><div class="t">Hands won</div></div><div class="pill">${user.hands_won} / ${user.hands_played}</div></div>
        <div class="lrow"><div class="ic">📈</div><div class="main"><div class="t">Win rate</div></div><div class="pill">${user.win_rate}%</div></div>
        <div class="lrow"><div class="ic">💰</div><div class="main"><div class="t">Total won</div></div><div class="pill">${fmt(user.total_won)}</div></div>
        <div class="lrow"><div class="ic">🏆</div><div class="main"><div class="t">Biggest pot</div></div><div class="pill">${fmt(user.biggest_pot)}</div></div>
        <div class="lrow"><div class="ic">🔥</div><div class="main"><div class="t">Best win streak</div></div><div class="pill">${user.best_win_streak}</div></div>
        <div class="lrow"><div class="ic">🪑</div><div class="main"><div class="t">Tables played</div></div><div class="pill">${user.games_played}</div></div>
      </div>
      <button class="btn secondary" id="dailyBtn">🎁 Claim Daily Reward</button>
      ${tg ? `<button class="btn ghost" id="shareBtn" style="margin-top:10px">📢 Invite Friends</button>` : ""}`);
    document.getElementById("dailyBtn").onclick = () => claimDaily();
    const share = document.getElementById("shareBtn");
    if (share) share.onclick = () => {
      const url = `https://t.me/share/url?url=${encodeURIComponent("https://t.me")}&text=${encodeURIComponent("♠️ Play Poker CM with me!")}`;
      tg.openTelegramLink ? tg.openTelegramLink(url) : window.open(url);
    };
  }

  // ---------- Squad ----------
  async function renderSquad() {
    setView(`${walletBar()}<div class="row between"><h1>🛡️ Squad</h1><button class="btn ghost sm" id="back">✕</button></div>
      <div id="squadBody"><div class="muted">Loading…</div></div>`);
    document.getElementById("back").onclick = () => show("lobby");
    const body = document.getElementById("squadBody");
    const squad = await API.mySquad();
    if (squad) {
      body.innerHTML = `<div class="card" style="text-align:center">
          <div style="font-size:44px">${squad.emblem}</div>
          <div style="font-size:20px;font-weight:800">${escapeHtml(squad.name)} ${squad.tag ? "[" + escapeHtml(squad.tag) + "]" : ""}</div>
          <div class="muted">#${squad.code} · ${squad.members.length} members</div>
          <button class="btn sm secondary" id="squadRoom" style="margin-top:10px">Create Squad Table</button>
        </div>
        <div class="card">${squad.members.map((m) => `
          <div class="lrow"><div class="ic">${m.avatar}</div>
          <div class="main"><div class="t">${escapeHtml(m.display_name)}</div><div class="d">${m.role} · Lvl ${m.level}</div></div></div>`).join("")}</div>
        <button class="btn danger" id="leaveSquad">Leave Squad</button>`;
      document.getElementById("leaveSquad").onclick = async () => {
        await API.leaveSquad(); toast("Left squad"); renderSquad();
      };
      document.getElementById("squadRoom").onclick = async () => {
        const room = await API.createRoom({ name: squad.name + " Table", is_private: true, allow_bots: true });
        openTableFlow(room.code);
      };
    } else {
      body.innerHTML = `<div class="card">
          <h2>Create a Squad</h2>
          <input class="input" id="sqName" placeholder="Squad name">
          <div class="row"><input class="input" id="sqTag" placeholder="TAG" maxlength="6"><input class="input" id="sqEmblem" placeholder="Emblem" value="♠️"></div>
          <button class="btn" id="createSquad">Create</button>
        </div>
        <div class="card"><h2>Join a Squad</h2>
          <input class="input" id="sqCode" placeholder="SQUAD CODE" style="text-transform:uppercase">
          <button class="btn secondary" id="joinSquad">Join</button></div>`;
      document.getElementById("createSquad").onclick = async () => {
        try {
          await API.createSquad({
            name: document.getElementById("sqName").value,
            tag: document.getElementById("sqTag").value,
            emblem: document.getElementById("sqEmblem").value || "♠️",
          });
          renderSquad();
        } catch (e) { toast(e.message); }
      };
      document.getElementById("joinSquad").onclick = async () => {
        try { await API.joinSquad(document.getElementById("sqCode").value.toUpperCase()); renderSquad(); }
        catch (e) { toast(e.message); }
      };
    }
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", () => App.init());
