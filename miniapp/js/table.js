// Live poker table: websocket + rendering + action controls.
class PokerTable {
  constructor(code, meId, onExit) {
    this.code = code;
    this.meId = meId;
    this.onExit = onExit;
    this.ws = null;
    this.state = null;
    this.raiseTo = 0;
    this._timerInt = null;
    this._reconnect = true;
  }

  mount() {
    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="table-view" id="tv">
        <div class="table-top">
          <button class="btn ghost sm" id="leaveBtn">← Leave</button>
          <div class="chip"><span id="tblCode">${this.code}</span></div>
          <div class="row" style="gap:6px">
            <button class="btn ghost sm" id="ranksBtn">📖</button>
            <div class="chip coins">🪙 <span id="tblStack">0</span></div>
          </div>
        </div>
        <div class="felt">
          <div class="felt-center">
            <div class="board" id="board"></div>
            <div class="pot" id="pot"></div>
          </div>
        </div>
        <div id="seats"></div>
        <div class="bottom-wrap">
          <div class="myhand empty" id="myhand"></div>
          <div class="controls hidden" id="controls"></div>
        </div>
        <div id="banner"></div>
        <div class="ranks-sheet hidden" id="ranksSheet"></div>
      </div>`;
    document.getElementById("tabbar").classList.add("hidden");
    document.getElementById("leaveBtn").onclick = () => this.leave();
    document.getElementById("ranksBtn").onclick = () => this.toggleRankings();
    this.connect();
  }

  toggleRankings() {
    const el = document.getElementById("ranksSheet");
    if (!el.classList.contains("hidden")) { el.classList.add("hidden"); return; }
    el.innerHTML = `
      <div class="ranks-inner">
        <div class="row between"><h2 style="margin:0">Hand Rankings</h2>
          <button class="btn ghost sm" id="ranksClose">✕</button></div>
        ${PEval.RANKINGS.map((r, i) => `
          <div class="rank-row">
            <div class="rn">${i + 1}</div>
            <div class="rcards"></div>
            <div class="rmain"><div class="t">${r.name}</div><div class="d">${r.d}</div></div>
          </div>`).join("")}
      </div>`;
    el.classList.remove("hidden");
    el.querySelectorAll(".rcards").forEach((c, i) =>
      renderCards(c, PEval.RANKINGS[i].ex, true));
    el.querySelector("#ranksClose").onclick = () => el.classList.add("hidden");
    el.onclick = (e) => { if (e.target === el) el.classList.add("hidden"); };
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws/room/${this.code}?token=${API.getToken()}`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    this.ws.onclose = () => {
      if (this._reconnect) setTimeout(() => this.connect(), 1500);
    };
    this.ws.onopen = () => this.send({ type: "sync" });
    clearInterval(this._pingInt);
    this._pingInt = setInterval(() => this.send({ type: "ping" }), 25000);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  async leave() {
    this._reconnect = false;
    clearInterval(this._pingInt);
    clearInterval(this._timerInt);
    if (this.ws) this.ws.close();
    try { await API.leaveRoom(this.code); } catch (e) {}
    this.onExit();
  }

  onMessage(msg) {
    if (msg.type === "state") {
      this.state = msg;
      this.render();
    } else if (msg.type === "events") {
      msg.events.forEach((ev) => this.handleEvent(ev));
    } else if (msg.type === "hand_result") {
      this.showResult(msg.result);
    } else if (msg.type === "pong") {
      // ignore
    }
  }

  handleEvent(ev) {
    if (ev.type === "action" && window.Telegram?.WebApp?.HapticFeedback) {
      Telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }

  render() {
    const s = this.state;
    if (!s) return;
    // board & pot
    renderCards(document.getElementById("board"), s.board);
    document.getElementById("pot").innerHTML = s.pot
      ? `POT: ${fmt(s.pot)} <small>· ${s.street}</small>`
      : `<small>${s.street === "idle" ? "Waiting…" : s.street}</small>`;

    const me = (s.seats || []).find((x) => x.user_id === this.meId);
    document.getElementById("tblStack").textContent = me ? fmt(me.stack) : "0";

    this.renderSeats(s, me);
    this.renderMyHand(s, me);
    this.renderControls(s, me);
  }

  renderMyHand(s, me) {
    const el = document.getElementById("myhand");
    if (!me || !me.in_hand || me.folded || !me.hole || me.hole[0] === "??" || me.hole.length < 2) {
      el.classList.add("empty");
      el.innerHTML = me && me.folded
        ? `<div class="mh-msg">🚫 You folded</div>`
        : `<div class="mh-msg">${s.street === "idle" ? "⏳ Waiting for next hand…" : "🂠 Waiting for cards…"}</div>`;
      return;
    }
    el.classList.remove("empty");
    const board = s.board || [];
    const oppCount = (s.seats || []).filter(
      (x) => x.in_hand && !x.folded && x.user_id !== this.meId
    ).length;

    const made = board.length >= 3
      ? PEval.describe(me.hole.concat(board))
      : PEval.preflopLabel(me.hole);
    const drawList = PEval.draws(me.hole, board);

    // equity — recompute only when hole/board/opponents change
    const key = me.hole.join("") + "|" + board.join("") + "|" + oppCount;
    if (this._eqKey !== key) {
      this._eqKey = key;
      const samples = oppCount >= 4 ? 140 : 220;
      this._eq = oppCount > 0 ? PEval.equity(me.hole, board, oppCount, samples) : 1;
    }
    const pct = Math.round(this._eq * 100);
    const color = pct >= 60 ? "var(--green)" : pct >= 33 ? "var(--accent)" : "var(--accent2)";
    const strong = made.cat >= 3 ? "strong" : made.cat >= 1 ? "" : "weak";

    el.innerHTML = `
      <div class="mh-cards" id="mhCards"></div>
      <div class="mh-info">
        <div class="mh-combo ${strong}">${made.name}
          ${made.detail ? `<span class="mh-detail">${made.detail}</span>` : ""}
          ${drawList.length ? `<span class="mh-draw">+ ${drawList.join(" · ")}</span>` : ""}
        </div>
        <div class="mh-eq">
          <div class="mh-eqbar"><i style="width:${pct}%;background:${color}"></i></div>
          <span class="mh-eqval" style="color:${color}">${oppCount > 0 ? pct + "%" : "WIN"}</span>
        </div>
        <div class="mh-sub">${oppCount > 0
          ? `win chance vs ${oppCount} ${oppCount > 1 ? "players" : "player"} · ${s.street}`
          : "last one standing"}</div>
      </div>`;
    renderCards(document.getElementById("mhCards"), me.hole);
  }

  renderSeats(s, me) {
    const wrap = document.getElementById("seats");
    wrap.innerHTML = "";
    const seats = s.seats || [];
    const n = seats.length || 1;
    // order so that "me" is at the bottom (index 0)
    let ordered = seats.slice().sort((a, b) => a.seat - b.seat);
    const myIdx = me ? ordered.findIndex((x) => x.user_id === this.meId) : 0;
    if (myIdx > 0) ordered = ordered.slice(myIdx).concat(ordered.slice(0, myIdx));

    ordered.forEach((p, i) => {
      const a = (i * 2 * Math.PI) / n;
      const x = 50 + 41 * Math.sin(a);
      const y = 42 + 34 * Math.cos(a);
      const el = document.createElement("div");
      el.className = "seat" + (p.is_turn ? " active" : "") + (p.folded ? " folded" : "");
      el.style.left = x + "%";
      el.style.top = y + "%";
      const isDealer = s.button === p.user_id;
      const holeHtml = `<div class="hole" id="hole_${p.user_id}"></div>`;
      el.innerHTML = `
        ${p.is_bot ? '<div class="badge">BOT</div>' : ""}
        ${isDealer ? '<div class="dealer">D</div>' : ""}
        <div class="ava">${p.avatar || "🎩"}</div>
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="st">${p.sitting_out ? "SIT OUT" : fmt(p.stack)}</div>
        ${holeHtml}
        ${p.last_action ? `<div class="action-tag">${p.last_action}</div>` : ""}`;
      wrap.appendChild(el);
      // my own cards are shown large in the hand tray, so keep the ring clean
      const ringHole = p.user_id === this.meId ? [] : p.hole;
      renderCards(document.getElementById("hole_" + p.user_id), ringHole, true);
      if (p.bet > 0) {
        const bet = document.createElement("div");
        bet.className = "bet";
        bet.textContent = fmt(p.bet);
        // place bet chip toward the center
        bet.style.left = (50 + 26 * Math.sin(a) - 50 + x) + "%"; // approx
        bet.style.left = x + "%";
        bet.style.top = (y - 14) + "%";
        bet.style.transform = "translate(-50%,0)";
        wrap.appendChild(bet);
      }
    });
  }

  renderControls(s, me) {
    const c = document.getElementById("controls");
    const you = s.you || {};
    const legal = you.legal;
    if (!legal || !legal.can_act) {
      c.classList.add("hidden");
      clearInterval(this._timerInt);
      // rebuy option if busted & seated
      if (me && me.stack <= 0 && me.sitting_out) {
        c.classList.remove("hidden");
        c.innerHTML = `<button class="btn" id="rebuyBtn">💵 Rebuy</button>`;
        document.getElementById("rebuyBtn").onclick = () => this.doRebuy();
      }
      return;
    }
    c.classList.remove("hidden");
    const toCall = legal.to_call || 0;
    const minR = legal.min_raise_to || 0;
    const maxR = legal.max_raise_to || 0;
    this.raiseTo = Math.max(this.raiseTo, minR);
    if (this.raiseTo > maxR) this.raiseTo = maxR;

    const canRaise = legal.raise;
    const pot = legal.pot || s.pot;
    c.innerHTML = `
      ${canRaise ? `
      <div class="quick-bets">
        <button data-q="min">Min</button>
        <button data-q="half">½ Pot</button>
        <button data-q="pot">Pot</button>
        <button data-q="allin">All-in</button>
      </div>
      <div class="raise-row">
        <input type="range" id="raiseSlider" min="${minR}" max="${maxR}" value="${this.raiseTo}" step="${s.big_blind || 1}">
        <div class="raise-amt" id="raiseAmt">${fmt(this.raiseTo)}</div>
      </div>` : ""}
      <div class="control-btns">
        <button class="btn danger" id="foldBtn">Fold</button>
        ${legal.check ? `<button class="btn secondary" id="checkBtn">Check</button>`
          : `<button class="btn secondary" id="callBtn">Call ${fmt(legal.call_amount)}</button>`}
        ${canRaise ? `<button class="btn" id="raiseBtn">${toCall > 0 ? "Raise" : "Bet"} ${fmt(this.raiseTo)}</button>` : ""}
      </div>
      <div class="muted" id="timer" style="text-align:center;margin-top:6px"></div>`;

    const setR = (v) => {
      this.raiseTo = Math.max(minR, Math.min(maxR, Math.round(v)));
      const sl = document.getElementById("raiseSlider");
      if (sl) sl.value = this.raiseTo;
      const amt = document.getElementById("raiseAmt");
      if (amt) amt.textContent = fmt(this.raiseTo);
      const rb = document.getElementById("raiseBtn");
      if (rb) rb.textContent = (toCall > 0 ? "Raise " : "Bet ") + fmt(this.raiseTo);
    };
    const sl = document.getElementById("raiseSlider");
    if (sl) sl.oninput = (e) => setR(Number(e.target.value));
    c.querySelectorAll(".quick-bets button").forEach((b) => {
      b.onclick = () => {
        const q = b.dataset.q;
        if (q === "min") setR(minR);
        else if (q === "half") setR(Math.round(pot / 2) + toCall + minR - minR);
        else if (q === "pot") setR(pot + toCall);
        else if (q === "allin") setR(maxR);
      };
    });
    const fold = document.getElementById("foldBtn");
    if (fold) fold.onclick = () => this.act("fold");
    const check = document.getElementById("checkBtn");
    if (check) check.onclick = () => this.act("check");
    const call = document.getElementById("callBtn");
    if (call) call.onclick = () => this.act("call");
    const raise = document.getElementById("raiseBtn");
    if (raise) raise.onclick = () => this.act("raise", this.raiseTo);

    this.startTimer(you.deadline);
  }

  startTimer(deadline) {
    clearInterval(this._timerInt);
    if (!deadline) return;
    const el = () => document.getElementById("timer");
    const tick = () => {
      const left = Math.max(0, deadline - Date.now() / 1000);
      const e = el();
      if (e) e.textContent = "⏱ " + left.toFixed(0) + "s";
      if (left <= 0) clearInterval(this._timerInt);
    };
    tick();
    this._timerInt = setInterval(tick, 250);
  }

  act(action, amount = 0) {
    this.send({ type: "action", action, amount });
    document.getElementById("controls").classList.add("hidden");
    clearInterval(this._timerInt);
    if (window.Telegram?.WebApp?.HapticFeedback)
      Telegram.WebApp.HapticFeedback.impactOccurred("medium");
  }

  async doRebuy() {
    try {
      const info = await API.roomInfo(this.code);
      await API.rebuy(this.code, info.min_buy_in);
      toast("Rebought " + fmt(info.min_buy_in));
    } catch (e) { toast(e.message); }
  }

  showResult(result) {
    const b = document.getElementById("banner");
    const winners = result.results.filter((r) => r.won > 0);
    const top = winners[0];
    if (!top) return;
    const names = winners.map((w) => escapeHtml(w.name)).join(", ");
    b.innerHTML = `
      <div class="result-banner">
        <div style="font-size:26px">🏆</div>
        <div style="font-weight:800;margin:4px 0">${names}</div>
        <div class="muted">${top.hand_name}${result.showdown ? "" : " (uncontested)"}</div>
        <div class="pot" style="margin-top:6px">+${fmt(top.won)}</div>
      </div>`;
    if (window.Telegram?.WebApp?.HapticFeedback)
      Telegram.WebApp.HapticFeedback.notificationOccurred("success");
    setTimeout(() => { b.innerHTML = ""; }, 4000);
  }
}

function fmt(n) {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => t.classList.add("hidden"), 2600);
}
