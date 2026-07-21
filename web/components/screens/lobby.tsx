"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Lock, Play, Plus, Shield, Spade, Trash2, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { GATES } from "@/lib/gates";
import { haptic } from "@/lib/telegram";
import type { RoomSummary } from "@/lib/types";
import { WalletBar } from "@/components/wallet-bar";
import { NotifyGate } from "@/components/notify-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Filter = "all" | "mine" | "friends" | "other";

function Tile({
  icon: Icon, title, onClick, wide, hot, locked, lockLevel,
}: {
  icon: React.ElementType; title: string;
  onClick: () => void; wide?: boolean; hot?: boolean; locked?: boolean; lockLevel?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-2xl border border-white/5 p-5 text-center transition-transform active:scale-[0.97]",
        wide && "col-span-2",
        locked
          ? "bg-gradient-to-br from-secondary/50 to-card/50"
          : hot
            ? "bg-gradient-to-br from-[#b8860b] to-[#6b4e00]"
            : "bg-gradient-to-br from-secondary to-card",
      )}
    >
      {locked && (
        <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-black/40">
          <Lock className="size-3 text-muted-foreground" />
        </span>
      )}
      <Icon className={cn("size-7", locked ? "text-muted-foreground/60" : hot ? "text-white" : "text-gold")} />
      <span className={cn("font-extrabold", locked && "text-muted-foreground/70")}>{title}</span>
      {locked && lockLevel != null && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-gold/80">Unlocks · Lv {lockLevel}</span>
      )}
    </button>
  );
}

const LEAGUE_CARD: Record<string, string> = {
  bronze: "border-[#cd7f32]/40 bg-gradient-to-br from-[#cd7f32]/20 to-secondary",
  silver: "border-[#c0c0c0]/40 bg-gradient-to-br from-[#c0c0c0]/15 to-secondary",
  gold: "border-gold/50 bg-gradient-to-br from-gold/20 to-secondary",
  diamond: "border-[#3fa9ff]/40 bg-gradient-to-br from-[#3fa9ff]/20 to-secondary",
};
const LEAGUE_ICON: Record<string, string> = {
  bronze: "text-[#cd7f32]",
  silver: "text-[#c0c0c0]",
  gold: "text-gold",
  diamond: "text-[#3fa9ff]",
};

export function LobbyScreen() {
  const { go, enterTable, isUnlocked, showLocked } = useApp();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [current, setCurrent] = useState<RoomSummary | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmClose, setConfirmClose] = useState<RoomSummary | null>(null);

  const load = useCallback(() => {
    api.listRooms().then(setRooms).catch(() => setRooms([]));
    api.currentRoom().then(setCurrent).catch(() => {});
    api.leagueActive().then((r: any) => setLeague(r.active ? r : null)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function quickPlay() {
    if (busy) return;
    setBusy(true);
    haptic("medium");
    try {
      const room = await api.joinRandom(null);
      enterTable(room.code);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeRoom() {
    if (!confirmClose) return;
    try {
      await api.closeRoom(confirmClose.code);
      toast.success("Table closed");
      setConfirmClose(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const shown = (rooms ?? []).filter((r) =>
    filter === "all" ? true
      : filter === "mine" ? r.is_mine
      : filter === "friends" ? r.host_is_friend
      : !r.is_mine && !r.host_is_friend,
  );

  const FILTERS: { k: Filter; label: string }[] = [
    { k: "all", label: "All" },
    { k: "mine", label: "Mine" },
    { k: "friends", label: "Friends" },
    { k: "other", label: "Other" },
  ];

  return (
    <>
      <WalletBar />
      <NotifyGate />
      {/* a live league Sit & Go looks nothing like a cash resume — tier-coloured,
          labelled, and it goes back to the tournament you're already in */}
      {league && (
        <Card
          onClick={() => enterTable(league.code)}
          className={cn(
            "mb-3 cursor-pointer flex-row items-center gap-3 border p-4 active:scale-[0.99]",
            LEAGUE_CARD[league.tier] || "border-gold/40 bg-gradient-to-br from-gold/20 to-secondary",
          )}
        >
          <Shield className={cn("size-6", LEAGUE_ICON[league.tier])} />
          <div className="flex-1">
            <div className="font-bold">{league.tier_name} Sit &amp; Go in progress</div>
            <div className="text-xs text-muted-foreground">
              Tap to return — it plays on without you
            </div>
          </div>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Card>
      )}

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
        <Tile icon={Zap} title="Quick Play" onClick={quickPlay} wide hot />
        <Tile icon={Plus} title="Create Room"
          locked={!isUnlocked("create_room")} lockLevel={GATES.create_room.level}
          onClick={() => (isUnlocked("create_room") ? go("create") : showLocked("create_room"))} />
        <Tile icon={Shield} title="Club"
          locked={!isUnlocked("clubs")} lockLevel={GATES.clubs.level}
          onClick={() => (isUnlocked("clubs") ? go("club") : showLocked("clubs"))} />
      </div>

      {/* Open tables */}
      <Card className="mt-4 gap-0 p-0">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center justify-between p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Open Tables {rooms ? `(${rooms.length})` : ""}
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="px-4 pb-4">
            <div className="mb-2 flex gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-bold",
                    filter === f.k ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {rooms === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : shown.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                {filter === "mine" ? "You don't host any tables." : "No tables here."}
              </p>
            ) : (
              shown.map((r) => (
                <div key={r.code} className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
                  <Spade className="size-5 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {r.name} <span className="text-xs text-muted-foreground">#{r.code}</span>
                    </div>
                    <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {r.is_mine ? (
                        <span className="text-gold">Your table</span>
                      ) : r.host_is_friend ? (
                        <span className="flex items-center gap-0.5 text-gem">
                          <Users className="size-3" /> {r.host_name}
                        </span>
                      ) : (
                        <span>{r.host_name || "—"}</span>
                      )}
                      <span>· {r.players}/{r.max_players} · {fmt(r.small_blind)}/{fmt(r.big_blind)}</span>
                    </div>
                  </div>
                  {r.is_mine && (
                    <Button variant="outline" size="icon" className="size-8 text-lose"
                      onClick={() => setConfirmClose(r)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                  <Button size="sm" onClick={() => enterTable(r.code)}>Join</Button>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      <Dialog open={!!confirmClose} onOpenChange={(o) => !o && setConfirmClose(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close this table?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Everyone at <b className="text-foreground">{confirmClose?.name}</b> will be
            cashed out and the table removed.
          </p>
          <DialogFooter className="mt-2 flex-row gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmClose(null)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" onClick={closeRoom}>
              <Trash2 className="size-4" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
