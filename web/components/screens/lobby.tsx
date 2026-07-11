"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Plus,
  KeyRound,
  Shield,
  Gift,
  Users,
  Play,
  Spade,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { haptic } from "@/lib/telegram";
import type { RoomSummary } from "@/lib/types";
import { WalletBar } from "@/components/wallet-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Tile({
  icon: Icon,
  title,
  sub,
  onClick,
  wide,
  hot,
}: {
  icon: React.ElementType;
  title: string;
  sub: string;
  onClick: () => void;
  wide?: boolean;
  hot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-2xl border border-white/5 p-5 text-center transition-transform active:scale-[0.97]",
        wide && "col-span-2",
        hot
          ? "bg-gradient-to-br from-[#b8860b] to-[#6b4e00]"
          : "bg-gradient-to-br from-secondary to-card",
      )}
    >
      <Icon className={cn("size-7", hot ? "text-white" : "text-gold")} />
      <span className="font-extrabold">{title}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </button>
  );
}

export function LobbyScreen() {
  const { user, refresh, go, enterTable } = useApp();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [current, setCurrent] = useState<RoomSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.currentRoom().then(setCurrent).catch(() => {});
    api.listRooms().then(setRooms).catch(() => setRooms([]));
  }, []);

  function quickPlay() {
    // Preview build: the live table is still being ported to the new UI.
    haptic("medium");
    enterTable("quick");
  }
  void busy;
  void setBusy;

  async function claimDaily() {
    try {
      const r = await api.daily();
      toast[r.claimed ? "success" : "message"](
        r.claimed ? `+${fmt(r.reward)} coins · streak ${r.streak}` : "Already claimed",
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <WalletBar />
      <h1 className="mb-3 flex items-center gap-2 text-2xl font-extrabold">
        <Spade className="size-6 text-gold" /> Play Poker
      </h1>

      {current && (
        <Card
          onClick={() => enterTable(current.code)}
          className="mb-3 cursor-pointer flex-row items-center gap-3 bg-gradient-to-br from-felt to-felt-dark p-4 active:scale-[0.99]"
        >
          <Play className="size-6 text-white" />
          <div className="flex-1">
            <div className="font-bold">Resume your table</div>
            <div className="text-xs text-white/70">
              #{current.code} · stack {fmt(current.stack || 0)}
            </div>
          </div>
          <ChevronRight className="size-5 text-white/80" />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile
          icon={Zap}
          title="Quick Play"
          sub="Jump in instantly"
          onClick={quickPlay}
          wide
          hot
        />
        <Tile icon={Plus} title="Create Room" sub="Host a table" onClick={() => go("create")} />
        <Tile icon={KeyRound} title="Join by Code" sub="Friend's code" onClick={() => go("join")} />
        <Tile icon={Shield} title="Squad" sub="Play with crew" onClick={() => go("squad")} />
        <Tile
          icon={Gift}
          title="Daily Reward"
          sub={`Streak: ${user?.daily_streak ?? 0}`}
          onClick={claimDaily}
        />
        <Tile
          icon={Users}
          title="Invite & Earn"
          sub="5,000 per friend"
          onClick={() => go("invite")}
          wide
          hot
        />
      </div>

      <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Open Tables
      </h2>
      <Card className="p-4">
        {rooms === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tables. Create one!</p>
        ) : (
          rooms.map((r) => (
            <div
              key={r.code}
              className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0"
            >
              <Spade className="size-5 text-gold" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-semibold">
                  {r.name}{" "}
                  <span className="text-xs text-muted-foreground">#{r.code}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.players}/{r.max_players} · blinds {fmt(r.small_blind)}/{fmt(r.big_blind)}
                </div>
              </div>
              <Button size="sm" onClick={() => enterTable(r.code)}>
                Join
              </Button>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
