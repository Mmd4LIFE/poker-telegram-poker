"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Coins, Gem, Flame, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The 7-day ladder. One look tells you: can I claim, where am I, what's coming. */
export function DailyReward() {
  const { refresh, refreshDaily } = useApp();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.dailyStatus().then(setD).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  async function claim() {
    setBusy(true);
    try {
      const r: any = await api.daily();
      if (r.claimed) {
        const bits = [`+${fmt(r.reward)} coins`];
        if (r.gems) bits.push(`+${r.gems} gems`);
        toast.success(`${bits.join(" · ")} — day ${r.day}`);
        notify("success");
      } else {
        toast("Already claimed — come back tomorrow");
      }
      setD(r.ladder ? r : d);
      await Promise.all([load(), refresh(), refreshDaily()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return null;

  const ready = !d.claimed_today;
  const ladder: any[] = d.ladder || [];
  // rungs already banked in this cycle
  const done = d.claimed_today ? d.day : d.day - 1;

  return (
    <Card
      className={`mb-4 gap-3 p-4 ${
        ready
          ? "border-gold/50 bg-gradient-to-br from-gold/20 to-secondary"
          : "bg-secondary/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`grid size-11 shrink-0 place-items-center rounded-xl ${
            ready ? "bg-gold text-black" : "bg-black/30 text-muted-foreground"
          }`}
        >
          {ready ? <Gift className="size-6" /> : <Check className="size-6" />}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-extrabold">
            {ready ? "Daily reward" : "Claimed today"}
          </span>
          {d.streak > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-gold">
              <Flame className="size-3.5" />
              {d.streak}
            </span>
          )}
        </div>
        {ready && (
          <Button size="sm" disabled={busy} onClick={claim}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Claim"}
          </Button>
        )}
      </div>

      {/* the road ahead — day 7 is the gem payout */}
      <div className="flex gap-1">
        {ladder.map((r) => {
          const banked = r.day <= done;
          const today = ready && r.day === d.day;
          return (
            <div
              key={r.day}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border py-1.5 ${
                today
                  ? "border-gold bg-gold/15"
                  : banked
                    ? "border-white/10 bg-black/25"
                    : "border-white/5"
              }`}
            >
              <span
                className={`text-[9px] font-bold ${
                  today ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {r.day}
              </span>
              {banked ? (
                <Check className="size-3.5 text-win" />
              ) : r.gems ? (
                <Gem className="size-3.5 text-gem" />
              ) : (
                <Coins
                  className={`size-3.5 ${today ? "text-gold" : "text-muted-foreground/60"}`}
                />
              )}
              <span
                className={`text-[9px] font-bold leading-none ${
                  today ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {r.gems ? `${r.gems}` : fmt(r.coins)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
