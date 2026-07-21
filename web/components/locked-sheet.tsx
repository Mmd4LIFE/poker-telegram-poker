"use client";

import { Lock } from "lucide-react";
import { useApp } from "@/lib/store";
import { GATES } from "@/lib/gates";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The explainer shown when a player taps a locked feature: what it is, and the level it
// unlocks at. Never a dead end — it turns "why can't I tap this" into a goal.
export function LockedSheet() {
  const { lockedInfo, dismissLocked, onboarding, user } = useApp();
  if (!lockedInfo) return null;
  const g = GATES[lockedInfo];
  const lvl = onboarding?.level ?? user?.level ?? 1;
  return (
    <Dialog open onOpenChange={(o) => !o && dismissLocked()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="grid size-7 place-items-center rounded-full bg-gold/15">
              <Lock className="size-4 text-gold" />
            </span>
            {g.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{g.blurb}</p>
        <div className="mt-1 rounded-2xl bg-secondary p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Unlocks at</div>
          <div className="mt-0.5 text-3xl font-extrabold text-gold">Level {g.level}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            You&apos;re level {lvl} — keep playing to get there.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
