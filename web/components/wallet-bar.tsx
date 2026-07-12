"use client";

import { Coins, Gem } from "lucide-react";
import { fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { NotificationBell } from "@/components/notifications";

export function WalletBar() {
  const { user } = useApp();
  if (!user) return null;
  return (
    <div className="mb-4 flex items-center gap-3">
      <Avatar className="size-11 border border-white/10">
        <AvatarFallback className="bg-secondary text-gold">
          <AvatarIcon code={user.avatar} color={user.avatar_color} className="size-5" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div
          className="truncate font-semibold"
          style={user.name_color ? { color: user.name_color } : undefined}
        >
          {user.display_name}
        </div>
        <div className="text-[11px] text-muted-foreground">Level {user.level}</div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-[var(--color-gem)]"
            style={{ width: `${Math.round((user.level_progress || 0) * 100)}%` }}
          />
        </div>
      </div>

      {/* Balances stacked in one column: side by side they crowded the name on
          narrow phones, and the bell needs the width. */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="flex items-center gap-1 text-sm font-bold text-gold">
          <Coins className="size-3.5" /> {fmt(user.coins)}
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-gem">
          <Gem className="size-3.5" /> {user.gems}
        </span>
      </div>

      <NotificationBell />
    </div>
  );
}
