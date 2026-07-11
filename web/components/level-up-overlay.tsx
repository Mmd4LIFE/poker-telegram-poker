"use client";

import { useEffect } from "react";
import { Star, ChevronUp } from "lucide-react";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";

export function LevelUpOverlay() {
  const { levelUp, clearLevelUp, user } = useApp();

  useEffect(() => {
    if (levelUp !== null) {
      notify("success");
      const t = setTimeout(clearLevelUp, 4200);
      return () => clearTimeout(t);
    }
  }, [levelUp, clearLevelUp]);

  if (levelUp === null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
      onClick={clearLevelUp}
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
          <div className="mt-1 text-sm text-muted-foreground">{user.degree_label || user.degree}</div>
        )}
        <div className="mt-4 text-xs text-muted-foreground">Tap to continue</div>
      </div>
    </div>
  );
}
