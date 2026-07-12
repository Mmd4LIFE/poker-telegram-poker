"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  BookOpen,
  Coins,
  Loader2,
  LogIn,
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
import { PlayingCard, CardRow } from "@/components/table/playing-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
    try {
      await api.leaveRoom(code);
    } catch {
      /* ignore */
    }
    exitTable();
  }

  const seats: any[] = state?.seats ?? [];
  const me = seats.find((s) => s.user_id === meId);

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
        <div className="rounded-full bg-card px-3 py-1 text-sm font-bold">#{code}</div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="icon" onClick={() => setEmoteOpen((v) => !v)}>
            <Smile className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setRanksOpen(true)}>
            <BookOpen className="size-4" />
          </Button>
          <div className="flex items-center gap-1 rounded-full bg-card px-3 py-1 text-sm font-bold text-gold">
            <Coins className="size-3.5" /> {me ? fmt(me.stack) : 0}
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

      {/* felt */}
      <div
        className="absolute left-1/2 top-[50%] aspect-[4/4.2] w-[86%] max-w-[430px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[46%/40%] border-[10px] border-[#3a2415]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,.45) 100%), url(/poker-table.jpg)",
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

      {/* seats */}
      {ordered.map((p, i) => {
        const a = (i * 2 * Math.PI) / n;
        const x = 50 + 42 * Math.sin(a);
        const y = 52 + 27 * Math.cos(a);
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
            {p.bet > 0 && (
              <div className="absolute left-1/2 top-[-14px] -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-gold">
                {fmt(p.bet)}
              </div>
            )}
            {emotes[p.user_id] && (() => {
              const EmoteIcon = EMOTE_ICONS[emotes[p.user_id].e];
              return (
                <div className="absolute left-1/2 top-[-30px] z-10 -translate-x-1/2 animate-bounce rounded-full bg-card p-1.5 text-gold shadow-lg">
                  {EmoteIcon ? <EmoteIcon className="size-5" /> : null}
                </div>
              );
            })()}
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
            {p.user_id !== meId && (
              <div className="mt-0.5 flex justify-center gap-0.5">
                {(p.hole?.length ? p.hole : []).map((c: string, k: number) => (
                  <PlayingCard key={k} card={c} size="sm" design={p.skins?.[c]} />
                ))}
              </div>
            )}
            {p.last_action && (
              <div className="absolute left-1/2 top-[-22px] -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] uppercase tracking-wide">
                {p.last_action}
              </div>
            )}
          </div>
        );
      })}

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

      {/* bottom: hand tray + controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 bg-[#0a0e16]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* hand tray */}
        <div className="flex min-h-[66px] items-center gap-3 border-t border-white/10 px-4 py-2.5">
          {made ? (
            <>
              <CardRow cards={myHole} size="lg" />
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

        {/* controls */}
        {legal?.can_act ? (
          <div className="border-t border-white/10 p-3">
            {legal.raise && (
              <>
                <div className="mb-2 flex gap-1.5">
                  {[
                    { l: "Min", v: legal.min_raise_to },
                    { l: "½ Pot", v: Math.round((legal.pot ?? state.pot) / 2) + (legal.call_amount ?? 0) + legal.min_raise_to },
                    { l: "Pot", v: (legal.pot ?? state.pot) + (legal.to_call ?? 0) },
                    { l: "All-in", v: legal.max_raise_to },
                  ].map((q) => (
                    <button
                      key={q.l}
                      onClick={() => setRaiseTo(Math.min(legal.max_raise_to, Math.max(legal.min_raise_to, Math.round(q.v))))}
                      className="flex-1 rounded-lg bg-secondary py-1.5 text-xs font-semibold"
                    >
                      {q.l}
                    </button>
                  ))}
                </div>
                <div className="mb-2.5 flex items-center gap-3">
                  <input
                    type="range"
                    min={legal.min_raise_to}
                    max={legal.max_raise_to}
                    step={state.big_blind || 1}
                    value={raiseTo}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-[var(--color-gold)]"
                  />
                  <span className="min-w-[70px] text-center text-sm font-extrabold text-gold">{fmt(raiseTo)}</span>
                </div>
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
              {legal.raise && (
                <Button className="flex-1 font-bold" onClick={() => act("raise", raiseTo)}>
                  {legal.to_call > 0 ? "Raise" : "Bet"} {fmt(raiseTo)}
                </Button>
              )}
            </div>
            {secsLeft !== null && (
              <div className="mt-1.5 text-center text-xs text-muted-foreground">⏱ {secsLeft.toFixed(0)}s</div>
            )}
          </div>
        ) : me && me.stack <= 0 && me.sitting_out ? (
          <div className="border-t border-white/10 p-3">
            <Button className="w-full font-bold" onClick={rebuy}>
              <Coins className="size-4" /> Rebuy {fmt(minBuy)}
            </Button>
          </div>
        ) : null}
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
