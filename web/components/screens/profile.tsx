"use client";

import { useState, useEffect } from "react";
import {
  Target,
  UserPlus,
  TrendingUp,
  Coins,
  Trophy,
  Flame,
  Armchair,
  Wrench,
  Spade,
  Palette,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { WalletBar } from "@/components/wallet-bar";
import { NotifyGate } from "@/components/notify-gate";
import { PokerDna } from "@/components/poker-dna";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";

function StatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
      <Icon className="size-5 text-muted-foreground" />
      <span className="flex-1 text-sm">{label}</span>
      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">
        {value}
      </span>
    </div>
  );
}

export function ProfileScreen() {
  const { user, refresh, go } = useApp();
  const [busy, setBusy] = useState(false);

  // pull fresh profile (coins, level, friend count) when opening the tab
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!user) return null;

  async function claimDaily() {
    setBusy(true);
    try {
      const r = await api.daily();
      if (r.claimed) {
        toast.success(`+${fmt(r.reward)} coins · streak ${r.streak}`);
        notify("success");
      } else {
        toast("Already claimed — come back later");
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <WalletBar />
      <NotifyGate />

      <Card className="items-center p-6 text-center">
        <Avatar className="mx-auto size-20 border-2 border-gold/40">
          <AvatarFallback className="bg-secondary text-gold">
            <AvatarIcon code={user.avatar} color={user.avatar_color} className="size-9" />
          </AvatarFallback>
        </Avatar>
        <div
          className="mt-2 text-xl font-extrabold"
          style={user.name_color ? { color: user.name_color } : undefined}
        >
          {user.display_name}
        </div>
        <div className="text-sm text-muted-foreground">
          {user.handle || `Level ${user.level}`}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => go("customize")}>
          <Palette className="size-4" /> Customize profile
        </Button>
        {/* No bar here — the wallet bar above already shows one. Two progress bars
            on one screen for the same value is just noise. */}
        <div className="mt-4 flex w-full items-center justify-between text-sm">
          <span className="font-semibold">Level {user.level}</span>
          <span className="text-muted-foreground">
            {fmt(user.xp)} / {fmt(user.next_level_xp)} XP
          </span>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => go("quests")}>
          <Card className="items-center gap-1 bg-gradient-to-br from-gold/15 to-secondary p-4 text-center active:scale-[0.98]">
            <Target className="size-6 text-gold" />
            <div className="text-sm font-extrabold">Quests</div>
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              Daily &amp; weekly <ChevronRight className="size-3" />
            </div>
          </Card>
        </button>
        <button onClick={() => go("invite")}>
          <Card className="items-center gap-1 bg-gradient-to-br from-gem/15 to-secondary p-4 text-center active:scale-[0.98]">
            <UserPlus className="size-6 text-gem" />
            <div className="text-2xl font-extrabold leading-none">{user.referral_count}</div>
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              Recruited <ChevronRight className="size-3" />
            </div>
          </Card>
        </button>
      </div>

      <PokerDna />

      <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Statistics
      </h2>
      <Card className="p-4">
        <StatRow icon={Spade} label="Hands won" value={`${user.hands_won} / ${user.hands_played}`} />
        <StatRow icon={TrendingUp} label="Win rate" value={`${user.win_rate}%`} />
        <StatRow icon={Coins} label="Total won" value={fmt(user.total_won)} />
        <StatRow icon={Trophy} label="Biggest pot" value={fmt(user.biggest_pot)} />
        <StatRow icon={Flame} label="Best win streak" value={String(user.best_win_streak)} />
        <StatRow icon={Armchair} label="Tables played" value={String(user.games_played)} />
      </Card>



      {user.is_admin && (
        <Button
          variant="outline"
          className="mt-2.5 w-full"
          size="lg"
          onClick={() => go("admin")}
        >
          <Wrench className="size-4" /> Admin Dashboard
        </Button>
      )}
    </>
  );
}
