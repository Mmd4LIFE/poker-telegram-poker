"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, LineChart, Users, Loader2 } from "lucide-react";
import { api, fmt } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AdminData } from "@/components/screens/admin-data";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* The admin Dashboards section: a raw Data explorer + derived Economy and Engagement
   dashboards, all read from the analytics layer (views + fact_daily snapshots). */

function Bars({
  data,
  keyName,
  color = "var(--color-gold)",
  height = 56,
}: {
  data: any[];
  keyName: string;
  color?: string;
  height?: number;
}) {
  const vals = data.map((d) => Number(d[keyName]) || 0);
  const max = Math.max(1, ...vals.map(Math.abs));
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => {
        const v = Number(d[keyName]) || 0;
        return (
          <div
            key={i}
            className="min-w-[3px] flex-1 rounded-t"
            style={{
              height: `${(100 * Math.abs(v)) / max}%`,
              backgroundColor: v < 0 ? "var(--color-lose)" : color,
              opacity: 0.85,
            }}
            title={`${d.day}: ${v.toLocaleString()}`}
          />
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2.5 text-center">
      <div className={cn("text-base font-extrabold", tone)}>{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function Economy() {
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => api.dashEconomy(30).then(setD).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />;
  const days = d.days || [];
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Coins in circulation" value={fmt(d.latest.coins_circulation)} tone="text-gold" />
        <Stat label="Gems in circulation" value={fmt(d.latest.gems_circulation)} tone="text-gem" />
      </div>

      <Card className="mb-3 p-3">
        <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
          Coins in circulation · 30d
        </div>
        <Bars data={days} keyName="coins_circulation" />
      </Card>

      <Card className="mb-3 p-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase text-muted-foreground">
          <span>Net coin flow / day</span>
          <span className="font-normal normal-case">green in · red out</span>
        </div>
        <Bars data={days} keyName="net" />
      </Card>

      <Card className="mb-3 p-3">
        <div className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">
          Faucets vs sinks (30d, by kind)
        </div>
        {(d.by_kind || []).map((k: any) => {
          const max = Math.max(1, ...d.by_kind.map((x: any) => Math.max(x.in, x.out)));
          return (
            <div key={k.kind} className="mb-1.5">
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="font-mono">{k.kind}</span>
                <span className="text-muted-foreground">
                  <span className="text-win">+{fmt(k.in)}</span> ·{" "}
                  <span className="text-lose">−{fmt(k.out)}</span>
                </span>
              </div>
              <div className="flex h-2 gap-0.5">
                <div className="flex flex-1 justify-end">
                  <div
                    className="rounded-l bg-win/70"
                    style={{ width: `${(100 * k.in) / max}%` }}
                  />
                </div>
                <div className="flex flex-1">
                  <div
                    className="rounded-r bg-lose/70"
                    style={{ width: `${(100 * k.out) / max}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="p-3">
        <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
          Coins burned by market fee / day
        </div>
        <Bars data={days} keyName="fee_coins_burned" color="var(--color-lose)" />
      </Card>
    </>
  );
}

function Engagement() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api.dashEngagement(30).then(setD).catch(() => {});
  }, []);
  if (!d) return <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />;
  const days = d.days || [];
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Players" value={fmt(d.latest.users_total)} />
        <Stat label="Reachable" value={fmt(d.latest.reachable)} tone="text-win" />
        <Stat label="DAU today" value={fmt(d.latest.dau)} tone="text-gold" />
      </div>
      <Card className="mb-3 p-3">
        <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
          Daily active players · 30d
        </div>
        <Bars data={days} keyName="dau" color="var(--color-gold)" />
      </Card>
      <Card className="mb-3 p-3">
        <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
          New players / day
        </div>
        <Bars data={days} keyName="new_users" color="var(--color-win)" />
      </Card>
      <Card className="mb-3 p-3">
        <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
          Total players (cumulative)
        </div>
        <Bars data={days} keyName="users_total" color="#7cc4ff" />
      </Card>
      <Card className="p-3">
        <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
          Hands played / day
        </div>
        <Bars data={days} keyName="hands_played" />
      </Card>
    </>
  );
}

export function Dashboards() {
  const [view, setView] = useState<"explorer" | "economy" | "engagement">("economy");
  const tabs = [
    { k: "economy", label: "Economy", icon: LineChart },
    { k: "engagement", label: "Players", icon: Users },
    { k: "explorer", label: "Explorer", icon: Database },
  ] as const;
  return (
    <>
      <div className="mb-3 flex gap-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.k}
              onClick={() => setView(t.k)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold",
                view === t.k ? "bg-gold text-black" : "bg-secondary text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      {view === "economy" && <Economy />}
      {view === "engagement" && <Engagement />}
      {view === "explorer" && <AdminData />}
    </>
  );
}
