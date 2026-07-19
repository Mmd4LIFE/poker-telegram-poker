"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Clock,
  Crown,
  History,
  Info,
  Loader2,
  Lock,
  Brain,
  Shield,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/table/playing-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIER_COLOR: Record<string, string> = {
  bronze: "text-[#cd7f32]",
  silver: "text-[#c0c0c0]",
  gold: "text-gold",
  diamond: "text-[#3fa9ff]",
};

function countdown(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

export function LeagueScreen() {
  const { enterTable, refresh } = useApp();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [hist, setHist] = useState<any>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  async function redeem(card: string) {
    setRedeeming(true);
    try {
      await api.redeemShards(card);
      toast.success("Champion skin minted!");
      notify("success");
      setRedeemOpen(false);
      load();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRedeeming(false);
    }
  }

  async function openHistory() {
    setHistOpen(true);
    if (!hist) {
      try {
        setHist(await api.leagueHistory());
      } catch {
        setHist({ days: [] });
      }
    }
  }

  const load = useCallback(() => api.league().then(setD).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function play() {
    setBusy(true);
    try {
      const r: any = await api.leaguePlay();
      notify("success");
      enterTable(r.code);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-gold" />;

  if (!d.enabled)
    return (
      <Card className="items-center gap-2 p-8 text-center">
        <Trophy className="size-8 text-muted-foreground" />
        <div className="text-sm font-semibold">The league is closed</div>
      </Card>
    );

  if (d.locked)
    return (
      <Card className="items-center gap-2 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-secondary">
          <Lock className="size-6 text-muted-foreground" />
        </div>
        <div className="text-sm font-extrabold">League locked</div>
        <div className="text-xs text-muted-foreground">
          Unlocks at <b className="text-foreground">level {d.unlock_level}</b> —
          you&apos;re level {d.level}.
        </div>
      </Card>
    );

  if (d.pending)
    return (
      <Card className="items-center gap-2 p-8 text-center">
        <Trophy className="size-8 text-gold" />
        <div className="text-sm font-extrabold">You&apos;re in</div>
        <div className="text-xs text-muted-foreground">
          You&apos;ll be seated in a Bronze cohort at the next rollover.
        </div>
      </Card>
    );

  const rows: any[] = d.standings || [];

  return (
    <>
      <Card className="mb-3 gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary">
            <Shield className={cn("size-7", TIER_COLOR[d.tier])} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn("text-lg font-extrabold", TIER_COLOR[d.tier])}>
              {d.tier_name}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> {countdown(d.seconds_to_close)}
              <button
                onClick={() => setHelp(true)}
                className="ml-0.5 text-gold active:opacity-70"
                aria-label="How the league works"
              >
                <Info className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold">#{d.my_rank}</div>
            <div className="text-[11px] text-muted-foreground">{d.my_lp} LP</div>
          </div>
          <button
            onClick={openHistory}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary active:scale-95"
            aria-label="League history"
          >
            <History className="size-4 text-muted-foreground" />
          </button>
        </div>

        <Button
          size="lg"
          className="w-full"
          disabled={busy || d.games_left <= 0}
          onClick={play}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : d.games_left > 0 ? (
            <>
              Play
              <span className="ml-1 rounded-full bg-black/25 px-2 py-0.5 text-xs">
                {d.games_left}
              </span>
            </>
          ) : (
            <>Back tomorrow</>
          )}
        </Button>

        <ShardPanel
          shards={d.shards ?? 0}
          per={d.shards_per_skin ?? 25}
          onRedeem={() => setRedeemOpen(true)}
        />
      </Card>

      <Card className="p-2">
        {rows.map((r, i) => {
          const line =
            d.promote && i === d.promote - 1
              ? "promote"
              : d.demote && i === rows.length - d.demote - 1
                ? "demote"
                : null;
          return (
            <div key={r.user_id}>
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-2",
                  r.is_me && "bg-gold/15",
                )}
              >
                <span
                  className={cn(
                    "w-6 text-center text-xs font-bold tabular-nums",
                    r.zone === "promote"
                      ? "text-win"
                      : r.zone === "demote"
                        ? "text-lose"
                        : "text-muted-foreground",
                  )}
                >
                  {r.rank}
                </span>
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-secondary text-gold">
                    <AvatarIcon
                      code={r.avatar}
                      color={r.avatar_color}
                      className="size-4"
                    />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-semibold"
                    style={r.name_color ? { color: r.name_color } : undefined}
                  >
                    {r.name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Swords className="size-3" />
                      {r.games}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Crown className="size-3" />
                      {r.wins}
                    </span>
                    {r.dq != null && (
                      <span className="flex items-center gap-0.5" title="Decision Quality">
                        <Brain className="size-3" />
                        {r.dq}
                      </span>
                    )}
                    {r.skill_score != null && (
                      <span
                        className="font-bold text-gold"
                        title="Skill score (experimental — not used for ranking yet)"
                      >
                        S{r.skill_score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end leading-none">
                  <span className="text-sm font-extrabold tabular-nums">{r.lp}</span>
                  <span className="text-[9px] uppercase text-muted-foreground">LP</span>
                </div>
              </div>

              {line === "promote" && (
                <div className="my-1 flex items-center gap-2 px-2">
                  <div className="h-px flex-1 bg-win/40" />
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-win">
                    <ChevronUp className="size-3" /> promotion
                  </span>
                  <div className="h-px flex-1 bg-win/40" />
                </div>
              )}
              {line === "demote" && (
                <div className="my-1 flex items-center gap-2 px-2">
                  <div className="h-px flex-1 bg-lose/40" />
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-lose">
                    <ChevronDown className="size-3" /> relegation
                  </span>
                  <div className="h-px flex-1 bg-lose/40" />
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Sheet open={histOpen} onOpenChange={setHistOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>League history</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {!hist ? (
              <Loader2 className="mx-auto my-8 size-6 animate-spin text-gold" />
            ) : hist.days?.length ? (
              <>
                <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <div className={cn("text-sm font-bold", TIER_COLOR[hist.best_tier])}>
                      {hist.best_tier_name ?? "—"}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">best</div>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <div className="text-sm font-bold text-win">{hist.promotions}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">promos</div>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <div className="text-sm font-bold">{hist.played}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">days</div>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <div className="text-sm font-bold text-gold">{hist.shards_total ?? 0}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">shards</div>
                  </div>
                </div>

                <Card className="p-2">
                  {hist.days.map((h: any) => (
                    <div
                      key={h.day}
                      className="flex items-center gap-3 border-b border-white/5 px-1 py-2.5 last:border-0"
                    >
                      <Shield className={cn("size-5 shrink-0", TIER_COLOR[h.tier])} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">
                          {h.tier_name}
                          <span className="ml-1 font-normal text-muted-foreground">
                            #{h.rank}/{h.size}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{h.day}</span>
                          <span className="flex items-center gap-0.5">
                            <Swords className="size-3" />
                            {h.games}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Crown className="size-3" />
                            {h.wins}
                          </span>
                          {h.shards > 0 && (
                            <span className="flex items-center gap-0.5 text-gold">
                              <Sparkles className="size-3" />
                              {h.shards}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-extrabold tabular-nums">{h.lp}</span>
                      {h.outcome === "promoted" ? (
                        <ChevronUp className="size-4 shrink-0 text-win" />
                      ) : h.outcome === "demoted" ? (
                        <ChevronDown className="size-4 shrink-0 text-lose" />
                      ) : (
                        <span className="w-4 text-center text-muted-foreground">·</span>
                      )}
                    </div>
                  ))}
                </Card>
              </>
            ) : (
              <Card className="items-center gap-1 p-8 text-center">
                <History className="size-7 text-muted-foreground" />
                <div className="text-sm font-semibold">No finished seasons yet</div>
                <div className="text-xs text-muted-foreground">
                  Today&apos;s league closes at midnight — it&apos;ll show up here.
                </div>
              </Card>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How the league works</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto text-sm leading-snug text-muted-foreground">
            <p>
              <b className="text-foreground">A game counts when it finishes.</b> LP is
              awarded on your <i>finishing place</i> in the Sit &amp; Go — not per hand.
              If you bust out, the tournament keeps playing without you and your place
              is booked when the last player standing takes the chips. So your LP can
              land a few minutes after you leave the table.
            </p>
            <div className="rounded-lg bg-secondary/60 p-2.5 text-foreground">
              <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
                LP by finishing place
              </div>
              <div className="grid grid-cols-6 gap-1 text-center text-xs font-bold">
                {["1st","2nd","3rd","4th","5th","6th"].map((p, i) => (
                  <div key={p}>
                    <div className="text-[10px] text-muted-foreground">{p}</div>
                    <div className={i < 3 ? "text-win" : "text-lose"}>
                      {[25, 15, 8, -6, -18, -24][i] > 0 ? "+" : ""}
                      {[25, 15, 8, -6, -18, -24][i]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p>
              <b className="text-foreground">Only your first {d.games_cap} games a day
              count.</b> LP is roughly zero-sum at the table, so grinding more games
              can&apos;t lift you — the ladder measures how well you play, not how long.
            </p>
            <p>
              <b className="text-foreground">At midnight ({d.tier_name} resets)</b> the
              top {d.promote} promote
              {d.demote ? ` and the bottom ${d.demote} drop a tier` : ""}. Rewards go to
              the top finishers, and League Shards build toward the exclusive Champion
              card skin — the only way to get one.
            </p>
            <p className="text-[11px]">
              Play zero games and you hold no slot: you can&apos;t climb by doing nothing.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* redeem: pick which of the 52 cards wears the exclusive Champion skin */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem a Champion skin</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Costs <b className="text-gold">{d.shards_per_skin}</b> shards — you have{" "}
            <b className="text-foreground">{d.shards}</b>. Pick the card to wear it.
          </p>
          <div className="mt-2 max-h-[60vh] space-y-1.5 overflow-y-auto">
            {CARD_SUITS.map((s) => (
              <div key={s} className="flex flex-wrap gap-1">
                {CARD_RANKS.map((r) => {
                  const card = r + s;
                  return (
                    <button
                      key={card}
                      disabled={redeeming}
                      onClick={() => redeem(card)}
                      className="transition active:scale-90 disabled:opacity-40"
                    >
                      <PlayingCard card={card} size="sm" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const CARD_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const CARD_SUITS = ["s", "h", "d", "c"];

function ShardPanel({
  shards,
  per,
  onRedeem,
}: {
  shards: number;
  per: number;
  onRedeem: () => void;
}) {
  const ready = Math.floor(shards / per);
  const into = shards % per;
  const canRedeem = shards >= per;
  return (
    <div className="rounded-lg bg-gradient-to-br from-gold/15 to-secondary/60 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          League Shards
        </span>
        <span className="ml-auto text-lg font-extrabold text-gold tabular-nums">{shards}</span>
      </div>
      {/* progress toward the next Champion skin */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full rounded-full bg-gold transition-all"
          style={{ width: `${Math.min(100, (into / per) * 100)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {into}/{per} to next skin
        </span>
        <span>{ready > 0 ? `${ready} skin${ready === 1 ? "" : "s"} ready` : "Top-finish to earn"}</span>
      </div>
      <Button
        size="sm"
        className="mt-2 w-full font-bold"
        disabled={!canRedeem}
        onClick={onRedeem}
      >
        {canRedeem ? "Redeem a Champion skin" : `Need ${per - into} more shards`}
      </Button>
    </div>
  );
}
