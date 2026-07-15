"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  BookOpen,
  Coins,
  Loader2,
  LogIn,
  Shield,
  Smile,
  Trophy,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { haptic, notify, shareInvite } from "@/lib/telegram";
import { AvatarIcon, EMOTES, EMOTE_ICONS } from "@/lib/avatars";
import * as Poker from "@/lib/poker";
import { PlayingCard } from "@/components/table/playing-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* A league table looks nothing like a cash table — deliberately. You should never
   have to check the lobby to find out whether the hand you're in counts for LP. */
const LEAGUE_FELT: Record<string, string> = {
  bronze: "radial-gradient(ellipse at center, rgba(205,127,50,.30) 0%, rgba(60,20,0,.75) 100%)",
  silver: "radial-gradient(ellipse at center, rgba(192,192,192,.28) 0%, rgba(20,30,45,.78) 100%)",
  gold: "radial-gradient(ellipse at center, rgba(245,197,24,.30) 0%, rgba(50,35,0,.78) 100%)",
  diamond: "radial-gradient(ellipse at center, rgba(63,169,255,.30) 0%, rgba(4,25,50,.80) 100%)",
};
const LEAGUE_RING: Record<string, string> = {
  bronze: "border-[#8a5a2b]",
  silver: "border-[#8e99a8]",
  gold: "border-[#b8860b]",
  diamond: "border-[#2b6ca8]",
};
const LEAGUE_TEXT: Record<string, string> = {
  bronze: "text-[#cd7f32]",
  silver: "text-[#c0c0c0]",
  gold: "text-gold",
  diamond: "text-[#3fa9ff]",
};

/* Bet slider with snap points — the crypto-exchange pattern: one control, with the
   useful amounts marked ON the track instead of a separate row of buttons. Tap a tick
   to jump to it, or drag anywhere in between. */
function BetSlider({
  min,
  max,
  step,
  value,
  onChange,
  ticks,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  ticks: { label: string; value: number }[];
}) {
  const span = Math.max(1, max - min);
  const pctOf = (v: number) =>
    Math.max(0, Math.min(100, ((v - min) / span) * 100));

  // Drop crowded ticks. Two labels 4% apart print on top of each other — which is
  // what "Min ½ Pot" was. Spacing is judged in SCREEN distance, not chip value: on a
  // deep stack min-raise and pot are miles apart, on a short one they're the same
  // spot. All-in always survives; it's the one that matters.
  const MIN_GAP = 16; // percent of track
  const marks = (() => {
    const scaled = ticks
      .map((t) => ({
        ...t,
        value: Math.round(Math.min(max, Math.max(min, t.value))),
      }))
      .map((t) => ({ ...t, pct: pctOf(t.value) }))
      .sort((a, b) => a.pct - b.pct);

    const kept: typeof scaled = [];
    for (const t of scaled) {
      const last = kept[kept.length - 1];
      if (!last || t.pct - last.pct >= MIN_GAP) {
        kept.push(t);
      } else if (t.label === "All-in") {
        kept[kept.length - 1] = t; // the shove wins any collision
      }
    }
    return kept;
  })();

  // A speed bump: within a hair of a tick, the thumb magnetises to it and buzzes. You
  // can still stop anywhere — this just makes the useful sizes easy to hit.
  const SNAP = span * 0.03;
  const lastSnap = useRef<number | null>(null);
  const handle = (raw: number) => {
    const near = marks.find((t) => Math.abs(raw - t.value) <= SNAP);
    if (near) {
      if (lastSnap.current !== near.value) {
        haptic("light");
        lastSnap.current = near.value;
      }
      onChange(near.value);
      return;
    }
    lastSnap.current = null;
    onChange(raw);
  };

  const anchor = (pct: number) =>
    pct <= 4 ? "translate-x-0" : pct >= 96 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase text-muted-foreground">Raise to</span>
        <span className="text-sm font-extrabold text-gold">{fmt(value)}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-secondary" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gold"
          style={{ width: `${pctOf(value)}%` }}
        />
        {marks.map((t) => (
          <button
            key={t.label}
            onClick={() => handle(t.value)}
            className="absolute top-1/2 z-10 size-5 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${t.pct}%` }}
            aria-label={t.label}
          >
            <span
              className={cn(
                "mx-auto block rounded-full ring-2 ring-[#0a0e16] transition-all",
                value === t.value
                  ? "size-3 bg-gold"
                  : value > t.value
                    ? "size-2 bg-gold/70"
                    : "size-2 bg-white/30",
              )}
            />
          </button>
        ))}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handle(Number(e.target.value))}
          className="pcm-range absolute inset-0 z-20 w-full cursor-pointer"
        />
      </div>

      <div className="relative mt-0.5 h-4">
        {marks.map((t) => (
          <button
            key={t.label}
            onClick={() => handle(t.value)}
            className={cn(
              "absolute whitespace-nowrap text-[10px] font-semibold transition-colors",
              anchor(t.pct),
              value === t.value ? "text-gold" : "text-muted-foreground",
            )}
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PokerTable({ code }: { code: string }) {
  const { user, exitTable, openUser, refresh } = useApp();
  const meId = user!.id;
  const [state, setState] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [ranksOpen, setRanksOpen] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [minBuy, setMinBuy] = useState(2000);
  const [room, setRoom] = useState<any>(null);
  const [lg, setLg] = useState<any>(null);        // my league standing
  const [lgDelta, setLgDelta] = useState<any>(null);  // what this tournament changed
  const sngOverRef = useRef<null | (() => void)>(null);
  const [seating, setSeating] = useState(false);
  const [emotes, setEmotes] = useState<Record<number, { e: string; id: number }>>({});
  const [emoteOpen, setEmoteOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const aliveRef = useRef(true);
  const resultTimer = useRef<any>(null);
  const emoteSeq = useRef(0);

  // ---- websocket ----
  const connect = useCallback(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/room/${code}?token=${api.getToken()}`,
    );
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "sync" }));
    ws.onclose = () => {
      if (aliveRef.current) setTimeout(connect, 1500);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "state") setState(msg);
      else if (msg.type === "events") {
        for (const ev of msg.events) if (ev.type === "action") haptic("light");
      } else if (msg.type === "hand_result") {
        const winners = msg.result.results.filter((r: any) => r.won > 0);
        if (winners.length) {
          setResult(msg.result);
          notify("success");
          refresh(); // update coins/level (triggers level-up animation)
          clearTimeout(resultTimer.current);
          resultTimer.current = setTimeout(() => setResult(null), 4500);
        }
      } else if (msg.type === "sng_over") {
        sngOverRef.current?.();
      } else if (msg.type === "emote") {
        const id = ++emoteSeq.current;
        setEmotes((m) => ({ ...m, [msg.user_id]: { e: msg.emote, id } }));
        setTimeout(() => {
          setEmotes((m) => (m[msg.user_id]?.id === id ? (() => { const c = { ...m }; delete c[msg.user_id]; return c; })() : m));
        }, 3500);
      }
    };
  }, [code]);

  useEffect(() => {
    aliveRef.current = true;
    connect();
    const ping = setInterval(
      () => wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify({ type: "ping" })),
      25000,
    );
    api.roomInfo(code)
      .then((r) => {
        setMinBuy(r.min_buy_in);
        setRoom(r);
      })
      .catch(() => {});
    return () => {
      aliveRef.current = false;
      clearInterval(ping);
      clearTimeout(resultTimer.current);
      wsRef.current?.close();
    };
  }, [code, connect]);

  // countdown ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const send = (obj: any) => wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(obj));

  async function leave() {
    aliveRef.current = false;
    wsRef.current?.close();
    // A Sit & Go can't be left — your seat plays on and blinds off. Closing the view
    // is all "Leave" means here; calling leaveRoom would try to cash out tournament
    // chips as coins.
    if (!isLeague) {
      try {
        await api.leaveRoom(code);
      } catch {
        /* ignore */
      }
    }
    exitTable();
  }

  const isLeague = (room?.mode ?? "cash") === "sng";
  const leagueTier = room?.league_tier || "bronze";

  // Your standing, so you can see what you're playing for without leaving the table.
  useEffect(() => {
    if (!isLeague) return;
    api.league().then(setLg).catch(() => {});
  }, [isLeague]);

  // When the tournament ends, re-pull and show what actually moved. A ladder that
  // changes silently teaches you nothing.
  const onSngOver = useCallback(async () => {
    const before = lg;
    await new Promise((r) => setTimeout(r, 1200)); // let the result be booked
    try {
      const after: any = await api.league();
      setLg(after);
      if (before) {
        setLgDelta({
          lp: (after.my_lp ?? 0) - (before.my_lp ?? 0),
          fromRank: before.my_rank,
          toRank: after.my_rank,
        });
      }
    } catch {
      /* ignore */
    }
  }, [lg]);

  // the socket handler is built once, so it reaches the latest callback through a ref
  useEffect(() => {
    sngOverRef.current = onSngOver;
  }, [onSngOver]);

  const seats: any[] = state?.seats ?? [];
  const me = seats.find((s) => s.user_id === meId);

  // live LP projection for a Sit & Go
  const lpTable: number[] = room?.lp_table ?? [];
  const alive = seats.filter((s) => (s.stack ?? 0) > 0 || s.in_hand);
  const myStack = me?.stack ?? 0;
  // place-if-it-ended-now = 1 + how many survivors have MORE chips than me
  const projPlace = isLeague && me
    ? 1 + alive.filter((s) => (s.stack ?? 0) > myStack && s.user_id !== meId).length
    : null;
  const projLp =
    projPlace && lpTable.length
      ? lpTable[Math.min(projPlace - 1, lpTable.length - 1)]
      : null;

  // spectator -> seat
  const seatBuyIn = Math.min(
    Math.max(minBuy, room?.min_buy_in ?? minBuy),
    room?.max_buy_in ?? Number.MAX_SAFE_INTEGER,
    user?.coins ?? 0,
  );
  const canAffordSeat = (user?.coins ?? 0) >= (room?.min_buy_in ?? minBuy);
  const tableFull = !!room && seats.length >= room.max_players;
  const legal = state?.you?.legal;
  const board: string[] = state?.board ?? [];
  const oppCount = seats.filter((s) => s.in_hand && !s.folded && s.user_id !== meId).length;

  // equity — memoized by (hole, board, opp)
  const myHole: string[] = me?.hole && me.hole[0] !== "??" ? me.hole : [];
  const eqKey = myHole.join("") + "|" + board.join("") + "|" + oppCount;
  const equity = useMemo(() => {
    if (!myHole.length || !me?.in_hand || me?.folded) return null;
    if (oppCount <= 0) return 1;
    return Poker.equity(myHole, board, oppCount, oppCount >= 4 ? 140 : 220);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqKey]);

  // sync raise slider to legal range when the turn changes
  useEffect(() => {
    if (legal?.can_act && legal.raise) {
      setRaiseTo((v) => {
        const lo = legal.min_raise_to, hi = legal.max_raise_to;
        return Math.min(hi, Math.max(lo, v || lo));
      });
    }
  }, [legal?.can_act, legal?.min_raise_to, legal?.max_raise_to, legal?.raise]);

  function act(action: string, amount = 0) {
    send({ type: "action", action, amount });
    haptic("medium");
  }
  /* Entering a table only opens the socket — you arrive as a spectator. This is
     what actually puts you in a seat; you're dealt in from the next hand, posting
     the blind in turn like any player joining a live game. */
  async function takeSeat() {
    setSeating(true);
    try {
      const buy = Math.min(
        Math.max(minBuy, room?.min_buy_in ?? minBuy),
        room?.max_buy_in ?? Number.MAX_SAFE_INTEGER,
        user?.coins ?? 0,
      );
      await api.joinRoom(code, buy);
      toast.success(`Seated — bought in for ${fmt(buy)}`);
      notify("success");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSeating(false);
    }
  }

  async function rebuy() {
    try {
      await api.rebuy(code, minBuy);
      toast.success("Rebought " + fmt(minBuy));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // order seats so "me" sits at the bottom
  const ordered = useMemo(() => {
    const arr = [...seats].sort((a, b) => a.seat - b.seat);
    const i = arr.findIndex((s) => s.user_id === meId);
    return i > 0 ? arr.slice(i).concat(arr.slice(0, i)) : arr;
  }, [seats, meId]);
  const n = ordered.length || 1;

  const made: Poker.Made | null = myHole.length
    ? board.length >= 3
      ? Poker.describe(myHole.concat(board))
      : Poker.preflopLabel(myHole)
    : null;
  const drawList = myHole.length ? Poker.draws(myHole, board) : [];
  const eqPct = equity === null ? null : Math.round(equity * 100);
  const eqColor = eqPct === null ? "" : eqPct >= 60 ? "text-win" : eqPct >= 33 ? "text-gold" : "text-lose";
  const eqBar = eqPct === null ? "bg-muted" : eqPct >= 60 ? "bg-win" : eqPct >= 33 ? "bg-gold" : "bg-lose";

  const deadline = state?.you?.deadline;
  const secsLeft = deadline ? Math.max(0, deadline - now / 1000) : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#142033,#0a0e16)]">
      {/* top bar */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <Button variant="outline" size="sm" onClick={leave}>
          <ArrowLeft className="size-4" /> Leave
        </Button>
        {isLeague ? (
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full bg-card",
              LEAGUE_TEXT[leagueTier],
            )}
            title={leagueTier}
          >
            <Shield className="size-4" />
          </div>
        ) : (
          <div className="shrink-0 rounded-full bg-card px-3 py-1 text-sm font-bold">
            #{code}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          {!isLeague && (
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                user &&
                shareInvite(user, "room", code, "Join my poker table on Poker CM!")
              }
            >
              <UserPlus className="size-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => setEmoteOpen((v) => !v)}>
            <Smile className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setRanksOpen(true)}>
            <BookOpen className="size-4" />
          </Button>
          {isLeague && lg?.my_rank ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-1 text-xs font-bold">
              <Trophy className="size-3 text-gold" />
              <span className="tabular-nums">{lg.my_rank}</span>
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-bold text-gold">
            <Coins className="size-3" /> {me ? fmt(me.stack) : 0}
          </div>
        </div>
      </div>

      {/* emote picker */}
      {emoteOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setEmoteOpen(false)} />
          <div
            className="absolute left-1/2 top-1/2 z-40 grid w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-card p-4 shadow-2xl"
          >
            {EMOTES.map((e) => {
              const EmoteIcon = EMOTE_ICONS[e];
              return (
                <button
                  key={e}
                  className="grid aspect-square place-items-center rounded-xl bg-secondary text-gold active:scale-90"
                  onClick={() => {
                    send({ type: "emote", emote: e });
                    haptic("light");
                    setEmoteOpen(false);
                  }}
                >
                  <EmoteIcon className="size-6" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* The playing area is its own box, and it stops where the bottom panel
          starts. Everything inside is positioned in %% of THIS box — so when the
          action controls open, the table lifts instead of my seat and my cards
          disappearing underneath them. */}
      <div className="absolute inset-x-0 top-0" style={{ bottom: 196 }}>
        {/* felt — a league table wears its tier's colours so you can never be unsure
            whether the hand you're playing counts */}
        <div
          className={cn(
            "absolute left-1/2 top-[50%] aspect-[4/4.2] w-[86%] max-w-[430px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[46%/40%] border-[10px]",
            isLeague ? LEAGUE_RING[leagueTier] : "border-[#3a2415]",
          )}
          style={{
            backgroundImage:
              (isLeague
                ? LEAGUE_FELT[leagueTier] + ", "
                : "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,.45) 100%), ") +
              "url(/poker-table.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "inset 0 0 60px rgba(0,0,0,.5), 0 10px 40px rgba(0,0,0,.6)",
          }}
        />
        {/* board + pot */}
        <div className="absolute left-1/2 top-[47%] w-[90%] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="flex min-h-[52px] items-center justify-center gap-1.5">
            {board.map((c, i) => (
              <PlayingCard key={i} card={c} />
            ))}
          </div>
          <div className="mt-2 text-sm font-extrabold text-gold">
            {state?.pot ? (
              <>
                POT {fmt(state.pot)} <span className="text-xs font-normal text-muted-foreground">· {state.street}</span>
              </>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">
                {state?.street === "idle" ? "Waiting…" : state?.street}
              </span>
            )}
          </div>
        </div>

        {/* Bet chips ride their own ring, on the felt between each player and the pot
            — where chips actually go. Hung off the seat they landed on the cards. */}
        {ordered.map((p, i) => {
          if (!p.bet) return null;
          const a = (i * 2 * Math.PI) / n;
          const bx = 50 + 30 * Math.sin(a);
          const by = 52 + 17 * Math.cos(a);
          return (
            <div
              key={"bet-" + p.user_id}
              className="absolute z-[7] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-gold ring-1 ring-gold/30"
              style={{ left: `${bx}%`, top: `${by}%` }}
            >
              {fmt(p.bet)}
            </div>
          );
        })}

        {/* seats */}
        {ordered.map((p, i) => {
          const a = (i * 2 * Math.PI) / n;
          const x = 50 + 42 * Math.sin(a);
          const y = 50 + 25 * Math.cos(a);
          const isDealer = state?.button === p.user_id;
          return (
            <div
              key={p.user_id}
              className={cn(
                "absolute z-[5] w-24 -translate-x-1/2 -translate-y-1/2 text-center transition-opacity",
                p.folded && "opacity-40",
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
            >

              {emotes[p.user_id] && (() => {
                const EmoteIcon = EMOTE_ICONS[emotes[p.user_id].e];
                return (
                  <div className="absolute left-1/2 top-[-30px] z-10 -translate-x-1/2 animate-bounce rounded-full bg-card p-1.5 text-gold shadow-lg">
                    {EmoteIcon ? <EmoteIcon className="size-5" /> : null}
                  </div>
                );
              })()}
              {/* my hand sits ON the felt in front of me */}
              {p.user_id === meId && p.hole?.length ? (
                <div className="mb-1 flex justify-center gap-0.5">
                  {p.hole.map((c: string, k: number) => (
                    <PlayingCard key={k} card={c} size="md" design={p.skins?.[c]} />
                  ))}
                </div>
              ) : null}
              <button
                disabled={p.is_bot || p.user_id === meId}
                onClick={() => !p.is_bot && p.user_id !== meId && openUser(p.user_id)}
                className={cn(
                  "relative mx-auto grid size-11 place-items-center rounded-full border-2 bg-secondary text-gold",
                  p.is_turn ? "border-gold shadow-[0_0_14px_var(--color-gold)]" : "border-white/10",
                )}
              >
                <AvatarIcon code={p.avatar} color={p.avatar_color} className="size-5" />
                {isDealer && (
                  <span className="absolute -left-1 top-6 grid size-4 place-items-center rounded-full bg-white text-[9px] font-bold text-black">
                    D
                  </span>
                )}
              </button>
              <div
                className="mt-0.5 truncate text-[11px] font-semibold"
                style={p.name_color ? { color: p.name_color } : undefined}
              >
                {p.name}
              </div>
              <div className="text-[11px] font-bold text-gold">
                {p.sitting_out ? "SIT OUT" : fmt(p.stack)}
              </div>
              {/* Opponents' card BACKS are drawn only at showdown — face down they say
                  nothing (everyone holds two) and they were covering the action labels
                  at the side seats. A revealed hand still shows, in its owner's skin. */}
              {p.user_id !== meId &&
              p.hole?.length &&
              p.hole.some((c: string) => c !== "??") ? (
                <div className="mt-0.5 flex justify-center gap-0.5">
                  {p.hole.map((c: string, k: number) => (
                    <PlayingCard key={k} card={c} size="xs" design={p.skins?.[c]} />
                  ))}
                </div>
              ) : null}
              {p.last_action && (
                <div className="absolute left-1/2 top-[-22px] -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] uppercase tracking-wide">
                  {p.last_action}
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* result banner */}
      {result && (
        <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-gold bg-black/80 px-6 py-4 text-center">
          <Trophy className="mx-auto size-7 text-gold" />
          {result.results
            .filter((r: any) => r.won > 0)
            .map((w: any, i: number) => (
              <div key={i}>
                <div className="mt-1 font-extrabold">{w.name}</div>
                <div className="text-xs text-muted-foreground">
                  {w.hand_name}
                  {result.showdown ? "" : " (uncontested)"}
                </div>
                <div className="mt-1 font-extrabold text-gold">+{fmt(w.won)}</div>
              </div>
            ))}
        </div>
      )}

      {/* what the tournament changed — a ladder that moves silently teaches nothing */}
      {lgDelta && (
        <div className="absolute inset-x-0 top-24 z-30 flex justify-center px-6">
          <div className="w-full max-w-xs rounded-2xl border border-gold/40 bg-card/95 p-4 text-center shadow-xl backdrop-blur">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Sit &amp; Go complete
            </div>
            <div
              className={cn(
                "mt-1 text-3xl font-extrabold",
                lgDelta.lp >= 0 ? "text-win" : "text-lose",
              )}
            >
              {lgDelta.lp >= 0 ? "+" : ""}
              {lgDelta.lp} LP
            </div>
            {lgDelta.fromRank && lgDelta.toRank && (
              <div className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold">
                <span className="text-muted-foreground">#{lgDelta.fromRank}</span>
                <ArrowLeft className="size-3.5 rotate-180 text-muted-foreground" />
                <span
                  className={
                    lgDelta.toRank < lgDelta.fromRank ? "text-win" : "text-lose"
                  }
                >
                  #{lgDelta.toRank}
                </span>
              </div>
            )}
            <Button size="sm" className="mt-3 w-full" onClick={() => { setLgDelta(null); exitTable(); }}>
              Back to the league
            </Button>
          </div>
        </div>
      )}

      {/* bottom: hand tray + controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 bg-[#0a0e16]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* controls */}
        {legal?.can_act ? (
          <div className="border-t border-white/10 p-3">
            {legal.raise && legal.max_raise_to > legal.min_raise_to && (
              <>
                <BetSlider
                  min={legal.min_raise_to}
                  max={legal.max_raise_to}
                  step={state.big_blind || 1}
                  value={raiseTo}
                  onChange={setRaiseTo}
                  ticks={[
                    { label: "Min", value: legal.min_raise_to },
                    {
                      label: "½ Pot",
                      value:
                        Math.round((legal.pot ?? state.pot) / 2) +
                        (legal.call_amount ?? 0) +
                        legal.min_raise_to,
                    },
                    {
                      label: "Pot",
                      value: (legal.pot ?? state.pot) + (legal.to_call ?? 0),
                    },
                    { label: "All-in", value: legal.max_raise_to },
                  ]}
                />
              </>
            )}
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1 font-bold" onClick={() => act("fold")}>
                Fold
              </Button>
              {legal.check ? (
                <Button variant="secondary" className="flex-1 font-bold" onClick={() => act("check")}>
                  Check
                </Button>
              ) : (
                <Button variant="secondary" className="flex-1 font-bold" onClick={() => act("call")}>
                  Call {fmt(legal.call_amount)}
                </Button>
              )}
              {legal.raise &&
                (legal.max_raise_to > legal.min_raise_to ? (
                  <Button className="flex-1 font-bold" onClick={() => act("raise", raiseTo)}>
                    {legal.to_call > 0 ? "Raise" : "Bet"} {fmt(raiseTo)}
                  </Button>
                ) : (
                  // min-raise == max-raise: the only raise available is shoving
                  <Button
                    className="flex-1 font-bold"
                    onClick={() => act("raise", legal.max_raise_to)}
                  >
                    All-in {fmt(legal.max_raise_to)}
                  </Button>
                ))}
            </div>
            {secsLeft !== null && (
              <div className="mt-1.5 text-center text-xs text-muted-foreground">⏱ {secsLeft.toFixed(0)}s</div>
            )}
          </div>
        ) : me && me.stack <= 0 && me.sitting_out ? (
          isLeague ? (
            <div className="border-t border-white/10 p-3 text-center text-sm font-semibold text-muted-foreground">
              You busted out — no rebuys in a tournament
            </div>
          ) : (
            <div className="border-t border-white/10 p-3">
              <Button className="w-full font-bold" onClick={rebuy}>
                <Coins className="size-4" /> Rebuy {fmt(minBuy)}
              </Button>
            </div>
          )
        ) : null}
        {/* Live LP projection — this is what makes "when is LP calculated" legible:
            where you'd finish RIGHT NOW, and what it pays. Updates every hand. */}
        {isLeague && projPlace && projLp !== null && (
          <div className="flex items-center gap-2 border-t border-white/10 bg-black/20 px-4 py-1.5 text-[11px]">
            <Trophy className="size-3.5 text-gold" />
            <span className="text-muted-foreground">
              Finish now:{" "}
              <span className="font-bold text-foreground">
                {projPlace}
                {projPlace === 1 ? "st" : projPlace === 2 ? "nd" : projPlace === 3 ? "rd" : "th"}
              </span>{" "}
              of {alive.length}
            </span>
            <span
              className={cn(
                "ml-auto rounded-full px-2 py-0.5 font-bold",
                projLp >= 0 ? "bg-win/20 text-win" : "bg-lose/20 text-lose",
              )}
            >
              {projLp >= 0 ? "+" : ""}
              {projLp} LP
            </span>
          </div>
        )}

        {/* hand tray — the read, kept BELOW the buttons */}
        <div className="flex min-h-[66px] items-center gap-3 border-t border-white/10 px-4 py-2.5">
          {made ? (
            <>
              {/* the five cards your hand is actually built from — the fastest way to
                  learn what "King-high" or "two pair" is pointing at */}
              {made.five?.length ? (
                <div className="flex shrink-0 items-center gap-1">
                  <div className="flex gap-0.5">
                    {made.five
                      .filter((c) => myHole.includes(c))
                      .map((c, k) => (
                        <PlayingCard key={"m" + k} card={c} size="xs" />
                      ))}
                  </div>
                  {made.five.some((c) => !myHole.includes(c)) && (
                    <>
                      <span className="text-[10px] text-muted-foreground">+</span>
                      <div className="flex gap-0.5 opacity-70">
                        {made.five
                          .filter((c) => !myHole.includes(c))
                          .map((c, k) => (
                            <PlayingCard key={"b" + k} card={c} size="xs" />
                          ))}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[17px] font-extrabold leading-tight",
                    made.cat >= 3 ? "text-win" : made.cat >= 1 ? "" : "text-muted-foreground",
                  )}
                >
                  {made.name}{" "}
                  {made.detail && <span className="text-[13px] font-normal text-muted-foreground">{made.detail}</span>}
                  {drawList.length > 0 && (
                    <span className="ml-1 text-xs font-semibold text-gem">+ {drawList.join(" · ")}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className={cn("h-full rounded-full transition-all", eqBar)} style={{ width: `${eqPct ?? 0}%` }} />
                  </div>
                  <span className={cn("min-w-[46px] text-right text-sm font-extrabold", eqColor)}>
                    {oppCount > 0 ? `${eqPct}%` : "WIN"}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {oppCount > 0 ? `win vs ${oppCount} · ${state?.street}` : "last one standing"}
                </div>
              </div>
            </>
          ) : (
            !me ? (
              <div className="flex w-full items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold">Watching</div>
                  <div className="text-[11px] text-muted-foreground">
                    Buy in for {fmt(seatBuyIn)} · blinds {fmt(room?.small_blind ?? 0)}/
                    {fmt(room?.big_blind ?? 0)}
                  </div>
                </div>
                <Button
                  size="lg"
                  disabled={seating || !canAffordSeat || tableFull}
                  onClick={takeSeat}
                >
                  {seating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : tableFull ? (
                    "Table full"
                  ) : !canAffordSeat ? (
                    "Not enough coins"
                  ) : (
                    <>
                      <LogIn className="size-4" /> Take seat
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="w-full text-center text-sm text-muted-foreground">
                {me?.folded
                  ? "You folded"
                  : state?.street === "idle"
                    ? "Shuffling up — dealing you in…"
                    : "You're seated — dealt in on the next hand"}
              </div>
            )
          )}
        </div>

      </div>

      {/* rankings sheet */}
      <Dialog open={ranksOpen} onOpenChange={setRanksOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hand Rankings</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            {Poker.RANKINGS.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2 border-b border-white/5 py-2 last:border-0">
                <span className="w-4 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="flex gap-0.5">
                  {r.ex.map((c, k) => (
                    <PlayingCard key={k} card={c} size="sm" />
                  ))}
                </div>
                <div className="ml-1">
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.d}</div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
