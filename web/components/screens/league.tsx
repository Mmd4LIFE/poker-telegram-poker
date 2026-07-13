"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Clock,
  Gem,
  Loader2,
  Lock,
  Shield,
  Sparkles,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
              <Clock className="size-3" /> resets in {countdown(d.seconds_to_close)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold">#{d.my_rank}</div>
            <div className="text-[11px] text-muted-foreground">{d.my_lp} LP</div>
          </div>
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
            <>Play Sit &amp; Go · {d.games_left} left today</>
          ) : (
            <>Daily limit reached</>
          )}
        </Button>
        {d.games_left <= 0 && (
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            Only your first {d.games_cap} games count. The ladder measures how well you
            play, not how long.
          </p>
        )}

        {d.shards > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-secondary/60 p-2.5">
            <Sparkles className="size-4 text-gold" />
            <span className="flex-1 text-xs font-semibold">
              {d.shards} League Shards
            </span>
            <span className="text-[11px] text-muted-foreground">
              {d.shards_per_skin} = 1 Champion skin
            </span>
          </div>
        )}
      </Card>

      <h2 className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span>Standings</span>
        <span className="font-normal normal-case">
          top {d.promote} promote{d.demote ? ` · bottom ${d.demote} drop` : ""}
        </span>
      </h2>

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
                  <div className="text-[10px] text-muted-foreground">
                    {r.games} games · {r.wins} won
                  </div>
                </div>
                <span className="text-sm font-extrabold tabular-nums">{r.lp}</span>
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

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {(d.rewards || []).map((r: any, i: number) => (
          <span
            key={i}
            className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold"
          >
            <Trophy className="size-3 text-gold" /> top {r.upto}:
            {r.coins ? ` ${fmt(r.coins)}c` : ""}
            {r.gems ? (
              <>
                {" "}
                <Gem className="size-3 text-gem" />
                {r.gems}
              </>
            ) : null}
            {r.shards ? ` · ${r.shards} shards` : ""}
          </span>
        ))}
      </div>
    </>
  );
}
