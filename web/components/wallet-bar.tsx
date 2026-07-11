"use client";

import { Coins, Gem } from "lucide-react";
import { fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function WalletBar() {
  const { user } = useApp();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 mb-4">
      <Avatar className="size-11 border border-white/10">
        <AvatarFallback className="bg-secondary text-lg">
          {user.avatar || user.display_name.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{user.display_name}</div>
        <div className="text-xs text-muted-foreground">
          Lvl {user.level} · {user.degree_label || user.degree}
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
