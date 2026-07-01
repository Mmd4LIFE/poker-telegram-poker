// Card rendering helpers. Cards are "Rs" strings (rank+suit).
const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK_LABEL = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };

function rankLabel(r) { return RANK_LABEL[r] || r; }

function cardEl(card, small) {
  const el = document.createElement("div");
  el.className = "pcard" + (small ? " sm" : "");
  if (!card || card === "??") {
    el.classList.add("back");
    el.innerHTML = "";
    return el;
  }
  const r = card[0], s = card[1];
  if (s === "h" || s === "d") el.classList.add("red");
  el.innerHTML = `<span class="r">${rankLabel(r)}</span><span class="s">${SUIT_SYMBOL[s]}</span>`;
  return el;
}

function renderCards(container, cards, small) {
  container.innerHTML = "";
  (cards || []).forEach((c) => container.appendChild(cardEl(c, small)));
}
