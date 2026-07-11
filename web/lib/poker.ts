// Client-side poker evaluator + Monte-Carlo equity (TS port).
// Cards are "Rs" strings (rank char + suit char).

const RV: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const RNAME: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const RSHORT: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const CAT: Record<number, string> = {
  8: "Straight Flush", 7: "Four of a Kind", 6: "Full House", 5: "Flush",
  4: "Straight", 3: "Three of a Kind", 2: "Two Pair", 1: "One Pair", 0: "High Card",
};
const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const FULL: string[] = [];
for (const s of SUITS) for (const r of RANKS) FULL.push(r + s);

function straightHigh(vals: number[]): number | null {
  const u = [...new Set(vals)].sort((a, b) => b - a);
  if (u.includes(14)) u.push(1);
  let run = 1;
  for (let i = 1; i < u.length; i++) {
    if (u[i] === u[i - 1] - 1) {
      run++;
      if (run >= 5) return u[i] + 4;
    } else run = 1;
  }
  return null;
}

function eval5(cards: string[]): number[] {
  const vals = cards.map((c) => RV[c[0]]).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const isFlush = suits.every((s) => s === suits[0]);
  const sh = straightHigh(vals);
  const counts: Record<number, number> = {};
  vals.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  const byCount = Object.entries(counts)
    .map(([v, c]) => [+v, c] as [number, number])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const pat = byCount.map((x) => x[1]);
  const ord = byCount.map((x) => x[0]);
  if (isFlush && sh) return [8, sh];
  if (pat[0] === 4) return [7, ord[0], ord[1]];
  if (pat[0] === 3 && pat[1] === 2) return [6, ord[0], ord[1]];
  if (isFlush) return [5, ...vals];
  if (sh) return [4, sh];
  if (pat[0] === 3) return [3, ...ord];
  if (pat[0] === 2 && pat[1] === 2) return [2, ord[0], ord[1], ord[2]];
  if (pat[0] === 2) return [1, ...ord];
  return [0, ...vals];
}

function cmp(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function* combos(arr: string[], k: number, start = 0, cur: string[] = []): Generator<string[]> {
  if (cur.length === k) {
    yield cur.slice();
    return;
  }
  for (let i = start; i <= arr.length - (k - cur.length); i++) {
    cur.push(arr[i]);
    yield* combos(arr, k, i + 1, cur);
    cur.pop();
  }
}

function bestScore(cards: string[]): number[] | null {
  if (cards.length < 5) return null;
  if (cards.length === 5) return eval5(cards);
  let best: number[] | null = null;
  for (const c of combos(cards, 5)) {
    const s = eval5(c);
    if (!best || cmp(s, best) > 0) best = s;
  }
  return best;
}

export interface Made {
  cat: number;
  name: string;
  detail: string;
}

export function describe(cards: string[]): Made {
  const s = bestScore(cards);
  if (!s) return { cat: 0, name: "", detail: "" };
  const cat = s[0];
  const rn = (v: number) => RNAME[v];
  let detail = "";
  switch (cat) {
    case 1: detail = rn(s[1]) + "s"; break;
    case 2: detail = rn(s[1]) + "s & " + rn(s[2]) + "s"; break;
    case 3: detail = "trip " + rn(s[1]) + "s"; break;
    case 7: detail = "quad " + rn(s[1]) + "s"; break;
    case 6: detail = rn(s[1]) + "s full of " + rn(s[2]) + "s"; break;
    case 5: case 4: case 8: case 0: detail = rn(s[1]) + "-high"; break;
  }
  return { cat, name: CAT[cat], detail };
}

export function preflopLabel(hole: string[]): Made {
  const a = RV[hole[0][0]], b = RV[hole[1][0]];
  const suited = hole[0][1] === hole[1][1];
  if (a === b) return { cat: 1, name: "Pocket " + RNAME[a] + "s", detail: "pair" };
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return { cat: 0, name: RSHORT[hi] + RSHORT[lo], detail: suited ? "suited" : "offsuit" };
}

export function draws(hole: string[], board: string[]): string[] {
  if (board.length < 3 || board.length > 4) return [];
  const cards = hole.concat(board);
  const out: string[] = [];
  const suitCount: Record<string, number> = {};
  cards.forEach((c) => (suitCount[c[1]] = (suitCount[c[1]] || 0) + 1));
  if (Object.values(suitCount).some((n) => n === 4)) out.push("Flush draw");
  const present = new Set(cards.map((c) => RV[c[0]]));
  if (present.has(14)) present.add(1);
  if (!straightHigh(cards.map((c) => RV[c[0]]))) {
    for (let lo = 1; lo <= 10; lo++) {
      let cnt = 0;
      for (let v = lo; v < lo + 5; v++) if (present.has(v)) cnt++;
      if (cnt === 4) {
        out.push("Straight draw");
        break;
      }
    }
  }
  return out;
}

export function equity(hole: string[], board: string[], nOpp: number, samples = 200): number {
  if (nOpp <= 0) return 1;
  const known = new Set([...hole, ...board]);
  const pool = FULL.filter((c) => !known.has(c));
  const need = 5 - board.length;
  let wins = 0;
  for (let s = 0; s < samples; s++) {
    const deck = pool.slice();
    const draw = () => {
      const j = (Math.random() * deck.length) | 0;
      const t = deck[j];
      deck[j] = deck[deck.length - 1];
      deck.pop();
      return t;
    };
    const opp: string[][] = [];
    for (let o = 0; o < nOpp; o++) opp.push([draw(), draw()]);
    const sb = board.slice();
    for (let i = 0; i < need; i++) sb.push(draw());
    const my = bestScore(hole.concat(sb))!;
    let win = true, tie = false;
    for (const oh of opp) {
      const c = cmp(my, bestScore(oh.concat(sb))!);
      if (c < 0) { win = false; break; }
      if (c === 0) tie = true;
    }
    if (win) wins += tie ? 0.5 : 1;
  }
  return wins / samples;
}

export const RANKINGS = [
  { name: "Royal Flush", ex: ["As", "Ks", "Qs", "Js", "Ts"], d: "A-K-Q-J-10 same suit" },
  { name: "Straight Flush", ex: ["9h", "8h", "7h", "6h", "5h"], d: "5 in a row, same suit" },
  { name: "Four of a Kind", ex: ["Qs", "Qh", "Qd", "Qc", "3s"], d: "4 of same rank" },
  { name: "Full House", ex: ["Js", "Jh", "Jd", "8s", "8h"], d: "3 + a pair" },
  { name: "Flush", ex: ["Ad", "Jd", "9d", "6d", "3d"], d: "5 same suit" },
  { name: "Straight", ex: ["9s", "8h", "7d", "6c", "5s"], d: "5 in a row" },
  { name: "Three of a Kind", ex: ["7s", "7h", "7d", "Ks", "2h"], d: "3 of same rank" },
  { name: "Two Pair", ex: ["Ah", "Ad", "9s", "9c", "4h"], d: "2 pairs" },
  { name: "One Pair", ex: ["Ks", "Kh", "Qd", "7c", "3s"], d: "2 of same rank" },
  { name: "High Card", ex: ["As", "Jh", "8d", "5c", "2s"], d: "highest card" },
];
