"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export function JoinRoomScreen() {
  const { user, go, enterTable } = useApp();
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [buy, setBuy] = useState(0);
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setBusy(true);
    try {
      const r = await api.roomInfo(code.trim().toUpperCase());
      setInfo(r);
      setBuy(Math.min(r.max_buy_in, Math.max(r.min_buy_in, r.min_buy_in * 3)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    try {
      await api.joinRoom(info.code, buy);
      enterTable(info.code);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const notEnough = info && (user?.coins ?? 0) < info.min_buy_in;

  return (
    <>
      <PageHeader title="Join by Code" onBack={() => go("lobby")} />
      {!info ? (
        <Card className="gap-3 p-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            className="text-center text-2xl font-bold tracking-[0.2em]"
          />
          <Button className="w-full font-bold" size="lg" disabled={busy || code.length < 4} onClick={lookup}>
            Find Table
          </Button>
        </Card>
      ) : (
        <Card className="gap-3 p-4">
          <div>
            <div className="text-lg font-bold">{info.name}</div>
            <div className="text-xs text-muted-foreground">
              #{info.code} · blinds {fmt(info.small_blind)}/{fmt(info.big_blind)} · {info.players}/
              {info.max_players}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Buy-in: {fmt(buy)}</div>
            <Slider
              min={info.min_buy_in}
              max={Math.min(info.max_buy_in, user?.coins ?? info.max_buy_in)}
              step={info.small_blind}
              value={[buy]}
              onValueChange={(v) => setBuy(v[0])}
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Min {fmt(info.min_buy_in)}</span>
              <span>Max {fmt(info.max_buy_in)}</span>
            </div>
          </div>
          {notEnough && (
            <div className="text-xs text-lose">Not enough coins — visit the Shop or claim your daily reward.</div>
          )}
          <Button className="w-full font-bold" size="lg" disabled={busy || notEnough} onClick={join}>
            Take a Seat
          </Button>
        </Card>
      )}
    </>
  );
}
