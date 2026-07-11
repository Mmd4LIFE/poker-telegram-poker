"use client";

import { Gamepad2, Target, ShoppingBag, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import type { View } from "@/lib/types";

const TABS: { view: View; label: string; icon: React.ElementType }[] = [
  { view: "lobby", label: "Play", icon: Gamepad2 },
  { view: "quests", label: "Quests", icon: Target },
  { view: "shop", label: "Shop", icon: ShoppingBag },
  { view: "leaderboard", label: "Ranks", icon: Trophy },
  { view: "profile", label: "Me", icon: User },
];

export function BottomNav() {
  const { view, go } = useApp();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => {
        const active = view === t.view;
        const Icon = t.icon;
        return (
          <button
            key={t.view}
            onClick={() => go(t.view)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors",
              active ? "text-gold" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
