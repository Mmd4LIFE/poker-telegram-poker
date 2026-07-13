"use client";

import { useEffect, useState } from "react";
import { Dna, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { RadarChart } from "@/components/radar-chart";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Your own poker fingerprint. Self-view only, on purpose: an opponent's radar
 *  would be a HUD, and would hand an edge to whoever bothered to look. */
export function PokerDna() {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    api.dna().then(setD).catch(() => {});
  }, []);

  if (!d) return null;

  if (!d.ready) {
    const pct = Math.round((100 * d.hands) / d.min_hands);
    return (
      <Card className="mt-4 items-center gap-2 p-5 text-center">
        <div className="grid size-11 place-items-center rounded-xl bg-secondary">
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-extrabold">Poker DNA</div>
        <div className="text-xs text-muted-foreground">
          Play <b className="text-foreground">{d.hands_needed} more hands</b> to
          reveal your profile.
        </div>
        <div className="mt-1 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-[var(--color-gem)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[11px] text-muted-foreground">
          {d.hands} / {d.min_hands} hands
        </div>
        <p className="mt-1 max-w-64 text-[11px] leading-snug text-muted-foreground">
          Poker stats need a real sample. Fewer hands than this and the chart would
          be measuring luck, not you.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-4 items-center gap-1 p-4">
      <div className="flex w-full items-center gap-2">
        <Dna className="size-4 text-gold" />
        <span className="flex-1 text-sm font-extrabold">Poker DNA</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-gold">
          {d.style}
        </span>
      </div>

      <RadarChart
        axes={d.axes}
        scores={d.scores}
        confidence={d.confidence}
        size={280}
      />

      <div className="grid w-full grid-cols-3 gap-2 text-center">
        {[
          { k: "VPIP", v: `${d.raw.vpip}%` },
          { k: "PFR", v: `${d.raw.pfr}%` },
          { k: "Aggression", v: d.raw.af },
        ].map((x) => (
          <div key={x.k} className="rounded-lg bg-secondary/60 p-2">
            <div className="text-sm font-bold">{x.v}</div>
            <div className="text-[10px] uppercase text-muted-foreground">{x.k}</div>
          </div>
        ))}
      </div>

      {d.confidence < 1 && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Still sharpening — keep playing and the shape settles.
        </p>
      )}
    </Card>
  );
}
