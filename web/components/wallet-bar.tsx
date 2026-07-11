"use client";

import { Coins, Gem } from "lucide-react";
import { fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";

export function WalletBar() {
  const { user } = useApp();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 mb-4">
      <Avatar className="size-11 border border-white/10">
        <AvatarFallback className="bg-secondary text-gold">
          <AvatarIcon code={user.avatar} color={user.avatar_color} className="size-5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div
          className="truncate font-semibold"
          style={user.name_color ? { color: user.name_color } : undefined}
        >
          {user.display_name}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Lvl {user.level} · {user.degree_label || user.degree}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-[var(--color-gem)]"
            style={{ width: `${Math.round((user.level_progress || 0) * 100)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-bold text-gold">
        <Coins className="size-4" /> {fmt(user.coins)}
      </div>
      <div className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-bold text-gem">
        <Gem className="size-4" /> {user.gems}
      </div>
    </div>
  );
}
