"use client";

import { useCallback, useEffect } from "react";
import { Star, ChevronUp, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { fmt } from "@/lib/api";

export function LevelUpOverlay() {
  const { levelUp, clearLevelUp, user, onboarding, markRevealsSeen } = useApp();

  // features that just became reachable and haven't been spotlighted yet
  const reveals = (onboarding?.pending_reveals ?? [])
    .map((k) => onboarding?.features[k]?.title)
    .filter(Boolean) as string[];

  const dismiss = useCallback(() => {
    if (onboarding?.pending_reveals?.length) markRevealsSeen(onboarding.pending_reveals);
    clearLevelUp();
  }, [onboarding, markRevealsSeen, clearLevelUp]);

  useEffect(() => {
    if (levelUp !== null) {
      notify("success");
      const t = setTimeout(dismiss, reveals.length ? 6000 : 4200);
      return () => clearTimeout(t);
    }
  }, [levelUp, dismiss, reveals.length]);

  if (levelUp === null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
      onClick={dismiss}
      style={{ ["--pcm-glow" as string]: "#f5c518cc" }}
    >
      <div className="pcm-pop relative flex flex-col items-center px-8 text-center">
        <div className="pcm-rays absolute inset-[-30%] -z-10 opacity-40"
          style={{ background: "conic-gradient(from 0deg, transparent, #f5c518cc, transparent, #f5c518cc, transparent)", borderRadius: "9999px" }} />
        <div className="grid size-28 place-items-center rounded-full bg-card pcm-glow">
          <div className="flex flex-col items-center">
            <ChevronUp className="size-5 text-gold" />
            <Star className="size-9 text-gold" />
          </div>
        </div>
        <div className="mt-5 text-xs font-bold uppercase tracking-[0.25em] text-gold">
          Level Up
        </div>
        <div className="mt-1 text-4xl font-extrabold">Level {levelUp}</div>
        {user && (
          <div className="mt-1 text-sm text-muted-foreground">
            +{fmt(500 * levelUp)} bonus coins
          </div>
        )}
        {reveals.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            {reveals.map((title) => (
              <div key={title} className="flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-sm font-bold text-gold">
                <Sparkles className="size-3.5" /> Unlocked: {title}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-xs text-muted-foreground">Tap to continue</div>
      </div>
    </div>
  );
}
