"use client";

import { Coins, Gem } from "lucide-react";
import { fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { NotificationBell } from "@/components/notifications";

export function WalletBar() {
  const { user, go } = useApp();
  if (!user) return null;
  return (
    <div className="mb-4 flex items-center gap-3">
      {/* avatar + name are the way into your profile */}
      <button
        onClick={() => go("profile")}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
      >
        <Avatar className="size-11 shrink-0 border border-white/10">
          <AvatarFallback className="bg-secondary text-gold">
            <AvatarIcon
              code={user.avatar}
              color={user.avatar_color}
              className="size-5"
            />
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
      </button>

      {/* Grid, not a right-aligned stack: the icons must sit in one column, which
          they can't if the rows are right-aligned and the numbers differ in width. */}
      <div className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-x-1 gap-y-0.5">
        <Coins className="size-3.5 text-gold" />
        <span className="text-sm font-bold tabular-nums text-gold">
          {fmt(user.coins)}
        </span>
        <Gem className="size-3.5 text-gem" />
        <span className="text-sm font-bold tabular-nums text-gem">{user.gems}</span>
      </div>

      <NotificationBell />
    </div>
  );
}
