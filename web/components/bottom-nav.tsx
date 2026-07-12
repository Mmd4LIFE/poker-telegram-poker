"use client";

import { Gamepad2, Layers, ShoppingBag, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import type { View } from "@/lib/types";

// Play sits dead centre — it's the thumb's home position and the thing you open
// the app to do.
const TABS: { view: View; label: string; icon: React.ElementType; match: View[] }[] = [
  { view: "shop", label: "Shop", icon: ShoppingBag, match: ["shop"] },
  { view: "cards", label: "Cards", icon: Layers, match: ["cards"] },
  { view: "lobby", label: "Play", icon: Gamepad2, match: ["lobby", "create", "squad"] },
  { view: "leaderboard", label: "Ranks", icon: Trophy, match: ["leaderboard", "friends"] },
  { view: "profile", label: "Me", icon: User, match: ["profile", "invite", "admin", "quests", "customize"] },
];

export function BottomNav() {
  const { view, go } = useApp();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => {
        const active = t.match.includes(view);
        const Icon = t.icon;
        const primary = t.view === "lobby";

        return (
          <button
            key={t.view}
            onClick={() => go(t.view)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors",
              active ? "text-gold" : "text-muted-foreground",
            )}
          >
            {primary ? (
              <>
                {/* Raised into a notch. The ring is painted in the page background,
                    so it punches a clean curve through the nav's top border — that's
                    the notch, no SVG needed. The button is absolutely positioned, so
                    it can't push the label off the baseline the other tabs share. */}
                <span
                  className={cn(
                    "absolute -top-6 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full ring-4 ring-background transition-transform active:scale-95",
                    active
                      ? "bg-gradient-to-br from-gold to-[#b8860b]"
                      : "bg-gradient-to-br from-secondary to-card",
                  )}
                >
                  <Icon
                    className={cn("size-7", active ? "text-black" : "text-gold")}
                  />
                </span>
                {/* invisible spacer the exact height of a normal tab icon, so every
                    label sits on the same line */}
                <span className="size-5" aria-hidden />
              </>
            ) : (
              <Icon className="size-5" />
            )}
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
