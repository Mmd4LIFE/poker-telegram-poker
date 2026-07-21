"use client";

import { Gamepad2, Layers, Lock, ShoppingBag, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import type { View } from "@/lib/types";
import { TAB_FEATURE } from "@/lib/gates";

// Play sits dead centre — it's the thumb's home position and the thing you open
// the app to do.
const TABS: { view: View; label: string; icon: React.ElementType; match: View[] }[] = [
  { view: "shop", label: "Shop", icon: ShoppingBag, match: ["shop"] },
  { view: "cards", label: "Cards", icon: Layers, match: ["cards"] },
  { view: "lobby", label: "Play", icon: Gamepad2, match: ["lobby", "create", "club"] },
  { view: "leaderboard", label: "Ranks", icon: Trophy, match: ["leaderboard", "friends", "league"] },
  { view: "profile", label: "Me", icon: User, match: ["profile", "invite", "admin", "quests", "customize", "changelog"] },
];

export function BottomNav() {
  const { view, go, dailyReady, isUnlocked, showLocked } = useApp();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => {
        const active = t.match.includes(view);
        const Icon = t.icon;
        const primary = t.view === "lobby";
        const gate = TAB_FEATURE[t.view];
        const locked = gate ? !isUnlocked(gate) : false;

        return (
          <button
            key={t.view}
            onClick={() => (locked && gate ? showLocked(gate) : go(t.view))}
            aria-label={t.label}
            className={cn(
              "relative flex flex-1 flex-col items-center py-4 transition-colors",
              locked ? "text-muted-foreground/40" : active ? "text-gold" : "text-muted-foreground",
            )}
          >
            {primary ? (
              <>
                {/* Raised into a notch: the ring is painted in the page background,
                    so it punches a clean curve through the nav's top border. It's
                    absolutely positioned, so it can't shift the row's height. The
                    circle stays neutral when active — the gold icon is the selected
                    state, exactly like every other tab. */}
                <span className="absolute -top-4 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-br from-secondary to-card ring-4 ring-background transition-transform active:scale-95">
                  <Icon className="size-7" />
                </span>
                {/* spacer so the row keeps the same height as the icon-only tabs */}
                <span className="size-6" aria-hidden />
              </>
            ) : (
              <span className="relative">
                <Icon className="size-6" />
                {locked && (
                  <span className="absolute -right-1.5 -top-1 grid size-3.5 place-items-center rounded-full bg-background">
                    <Lock className="size-2.5 text-muted-foreground" />
                  </span>
                )}
                {!locked && t.view === "shop" && dailyReady && (
                  <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-lose ring-2 ring-background" />
                )}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
