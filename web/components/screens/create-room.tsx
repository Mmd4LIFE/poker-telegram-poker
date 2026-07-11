"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function CreateRoomScreen() {
  const { user, go, enterTable } = useApp();
  const [name, setName] = useState(`${user?.display_name}'s Table`);
  const [sb, setSb] = useState(50);
  const [bb, setBb] = useState(100);
  const [minBuy, setMinBuy] = useState(2000);
  const [maxBuy, setMaxBuy] = useState(20000);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [bots, setBots] = useState(true);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const room = await api.createRoom({
        name,
        small_blind: sb,
        big_blind: bb,
        min_buy_in: minBuy,
        max_buy_in: maxBuy,
        max_players: maxPlayers,
        allow_bots: bots,
        is_private: priv,
      });
      await api.joinRoom(room.code, minBuy);
      enterTable(room.code);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const Num = ({ label, value, set }: { label: string; value: number; set: (n: number) => void }) => (
    <label className="flex-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="mt-1"
      />
    </label>
  );

  return (
    <>
      <PageHeader title="Create Room" onBack={() => go("lobby")} />
      <Card className="gap-3 p-4">
        <label className="text-xs text-muted-foreground">
          Table name
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </label>
        <div className="flex gap-3">
          <Num label="Small blind" value={sb} set={setSb} />
          <Num label="Big blind" value={bb} set={setBb} />
        </div>
        <div className="flex gap-3">
          <Num label="Min buy-in" value={minBuy} set={setMinBuy} />
          <Num label="Max buy-in" value={maxBuy} set={setMaxBuy} />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Max players</div>
          <div className="flex gap-2">
            {[2, 4, 6, 9].map((m) => (
              <button
                key={m}
                onClick={() => setMaxPlayers(m)}
                className={cn(
                  "flex-1 rounded-lg py-2 text-sm font-bold",
                  maxPlayers === m ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} />
          Fill empty seats with AI
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
          Private (invite only)
        </label>
        <Button className="mt-1 w-full font-bold" size="lg" disabled={busy} onClick={create}>
          Create &amp; Sit
        </Button>
      </Card>
    </>
  );
}
