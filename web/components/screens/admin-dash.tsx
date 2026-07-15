"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  LineChart,
  Users,
  Loader2,
  DollarSign,
  Spade,
  Bot,
  Trophy,
  Repeat,
} from "lucide-react";
import { api, fmt } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AdminData } from "@/components/screens/admin-data";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* The admin Dashboards: a raw Data explorer + a set of derived dashboards, all read
   from the analytics layer (views + fact_daily snapshots + live aggregation). */

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

/* A labelled horizontal-bar list — the workhorse of the categorical dashboards. */
function HBars({
  rows,
  color = "var(--color-gold)",
  fmtVal = (v: number) => v.toLocaleString(),
}: {
  rows: { label: string; value: number; sub?: string }[];
  color?: string;
  fmtVal?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="mb-0.5 flex justify-between text-[11px]">
            <span className="font-mono">{r.label}</span>
            <span className="text-muted-foreground">
              {fmtVal(r.value)}
              {r.sub ? <span className="ml-1 opacity-70">{r.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-secondary">
            <div
              className="h-full rounded"
              style={{ width: `${(100 * r.value) / max}%`, backgroundColor: color, opacity: 0.8 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card className="mb-3 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase text-muted-foreground">
        <span>{title}</span>
        {note && <span className="font-normal normal-case">{note}</span>}
      </div>
      {children}
    </Card>
  );
}

function useDash(loader: () => Promise<any>) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => loader().then(setD).catch(() => {}), [loader]);
  useEffect(() => {
    load();
  }, [load]);
  return d;
}

function Economy() {
  const d = useDash(useCallback(() => api.dashEconomy(30), []));
  if (!d) return <Spinner />;
  const days = d.days || [];
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Coins in circulation" value={fmt(d.latest.coins_circulation)} tone="text-gold" />
        <Stat label="Gems in circulation" value={fmt(d.latest.gems_circulation)} tone="text-gem" />
      </div>
      <Section title="Coins in circulation · 30d">
        <Bars data={days} keyName="coins_circulation" />
      </Section>
      <Section title="Net coin flow / day" note="green in · red out">
        <Bars data={days} keyName="net" />
      </Section>
      <Section title="Faucets vs sinks (30d, by kind)">
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
                  <div className="rounded-l bg-win/70" style={{ width: `${(100 * k.in) / max}%` }} />
                </div>
                <div className="flex flex-1">
                  <div className="rounded-r bg-lose/70" style={{ width: `${(100 * k.out) / max}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </Section>
      <Section title="Coins burned by market fee / day">
        <Bars data={days} keyName="fee_coins_burned" color="var(--color-lose)" />
      </Section>
    </>
  );
}

function Engagement() {
  const d = useDash(useCallback(() => api.dashEngagement(30), []));
  if (!d) return <Spinner />;
  const days = d.days || [];
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Players" value={fmt(d.latest.users_total)} />
        <Stat label="Reachable" value={fmt(d.latest.reachable)} tone="text-win" />
        <Stat label="DAU today" value={fmt(d.latest.dau)} tone="text-gold" />
      </div>
      <Section title="Daily active players · 30d">
        <Bars data={days} keyName="dau" />
      </Section>
      <Section title="New players / day">
        <Bars data={days} keyName="new_users" color="var(--color-win)" />
      </Section>
      <Section title="Total players (cumulative)">
        <Bars data={days} keyName="users_total" color="#7cc4ff" />
      </Section>
      <Section title="Hands played / day">
        <Bars data={days} keyName="hands_played" />
      </Section>
    </>
  );
}

function Revenue() {
  const d = useDash(useCallback(() => api.dashRevenue(30), []));
  if (!d) return <Spinner />;
  const days = d.days || [];
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Stars gross" value={`⭐ ${fmt(d.latest.stars_all)}`} tone="text-gold" />
        <Stat label="TON gross" value={`${d.latest.ton_all} 💎`} tone="text-gem" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Paying users" value={fmt(d.latest.payers)} tone="text-win" />
        <Stat label="Conversion" value={`${d.latest.conversion}%`} />
      </div>
      <Section title="Stars revenue / day">
        <Bars data={days} keyName="stars_revenue" color="var(--color-gold)" />
      </Section>
      <Section title="Active payers / day">
        <Bars data={days} keyName="active_payers" color="var(--color-win)" />
      </Section>
      <Section title="Paid orders / day" note={`ARPPU ⭐${d.latest.arppu_stars}`}>
        <Bars data={days} keyName="purchases_paid" color="#7cc4ff" />
      </Section>
      <Section title="Top packs (30d, by revenue)">
        {(d.by_product || []).length === 0 ? (
          <Empty>No paid purchases in range</Empty>
        ) : (
          <HBars
            rows={d.by_product.map((p: any) => ({
              label: p.code,
              value: p.revenue,
              sub: `×${p.count} · ${p.provider}`,
            }))}
            fmtVal={(v) => fmt(v)}
          />
        )}
      </Section>
    </>
  );
}

function Poker() {
  const d = useDash(useCallback(() => api.dashPoker(30), []));
  if (!d) return <Spinner />;
  const days = d.days || [];
  const pop = d.population || {};
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Hands (30d)" value={fmt(d.latest.hands)} tone="text-gold" />
        <Stat label="Showdown rate" value={`${d.latest.showdown_rate}%`} tone="text-win" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Avg pot" value={fmt(d.latest.avg_pot)} />
        <Stat label="Biggest pot" value={fmt(d.latest.biggest_pot)} tone="text-gem" />
      </div>
      <Section title="Hands played / day">
        <Bars data={days} keyName="hands" />
      </Section>
      <Section title="Showdown rate / day" note="% of hands to showdown">
        <Bars data={days} keyName="showdown_rate" color="#7cc4ff" />
      </Section>
      <Section title="Pot-size distribution (30d)">
        <HBars rows={(d.pot_dist || []).map((b: any) => ({ label: b.label, value: b.count }))} />
      </Section>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Pop. VPIP" value={`${pop.vpip}%`} />
        <Stat label="Pop. PFR" value={`${pop.pfr}%`} />
        <Stat label="Pop. AF" value={`${pop.af}`} />
      </div>
      <Section title="Playing styles" note="active humans (≥20 hands)">
        <HBars
          rows={(pop.styles || []).map((s: any) => ({ label: s.label, value: s.count }))}
          color="var(--color-gem)"
        />
      </Section>
    </>
  );
}

function Bots() {
  const d = useDash(useCallback(() => api.dashBots(), []));
  if (!d) return <Spinner />;
  const fill = d.league_fill || { simulated: 0, real: 0 };
  const corr = d.dq_skill_corr;
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Bots" value={fmt(d.totals.bots)} tone="text-gold" />
        <Stat label="Humans" value={fmt(d.totals.humans)} tone="text-win" />
        <Stat label="Bot coins" value={fmt(d.totals.bot_coins)} />
      </div>
      <Section
        title="Skill ↔ decision quality"
        note={corr == null ? "—" : `ρ ${corr} · n=${d.corr_n}`}
      >
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
          Average DQ should climb with configured skill — that&apos;s the whole premise of the bot
          ladder. A positive ρ near 1 means it holds.
        </p>
        <HBars
          rows={(d.dq_by_band || []).map((b: any) => ({
            label: b.label,
            value: b.dq,
            sub: `n=${b.n}`,
          }))}
          color="var(--color-win)"
          fmtVal={(v) => `${v}`}
        />
      </Section>
      <Section title="Bots by personality">
        <HBars rows={(d.by_personality || []).map((p: any) => ({ label: p.label, value: p.count }))} />
      </Section>
      <Section title="League fill (30d)" note="games dealt vs sampled">
        <HBars
          rows={[
            { label: "real (humans played)", value: fill.real },
            { label: "simulated (bot-only)", value: fill.simulated },
          ]}
          color="var(--color-gem)"
        />
      </Section>
    </>
  );
}

function League() {
  const d = useDash(useCallback(() => api.dashLeague(), []));
  if (!d) return <Spinner />;
  const oc = d.outcomes || { promoted: 0, held: 0, demoted: 0 };
  const maxTier = Math.max(1, ...(d.tier_dist || []).map((t: any) => t.humans + t.bots));
  return (
    <>
      <Section title="Tier distribution" note="humans vs bots">
        {(d.tier_dist || []).map((t: any) => (
          <div key={t.tier} className="mb-1.5">
            <div className="mb-0.5 flex justify-between text-[11px]">
              <span className="font-mono capitalize">{t.tier}</span>
              <span className="text-muted-foreground">
                <span className="text-win">{t.humans}</span> ·{" "}
                <span className="opacity-70">{t.bots} bots</span>
              </span>
            </div>
            <div className="flex h-2 gap-[2px] overflow-hidden rounded bg-secondary">
              <div className="h-full bg-win/80" style={{ width: `${(100 * t.humans) / maxTier}%` }} />
              <div className="h-full bg-muted-foreground/40" style={{ width: `${(100 * t.bots) / maxTier}%` }} />
            </div>
          </div>
        ))}
      </Section>
      <Section title="Daily participation" note="distinct humans / season">
        <Bars data={d.participation || []} keyName="humans" color="var(--color-gold)" />
      </Section>
      <Section title="Last close" note="humans">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Promoted" value={fmt(oc.promoted)} tone="text-win" />
          <Stat label="Held" value={fmt(oc.held)} />
          <Stat label="Demoted" value={fmt(oc.demoted)} tone="text-lose" />
        </div>
      </Section>
    </>
  );
}

function Behaviour() {
  const d = useDash(useCallback(() => api.dashBehaviour(), []));
  if (!d) return <Spinner />;
  return (
    <>
      <Section title="Weekly retention" note="% of cohort active, by week">
        <div className="no-scrollbar overflow-x-auto">
          <table className="text-[10px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-1.5 py-1 text-left font-semibold">Signup week</th>
                <th className="px-1 py-1 font-semibold">Size</th>
                {[0, 1, 2, 3, 4].map((w) => (
                  <th key={w} className="px-1 py-1 font-semibold">
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d.retention || []).map((r: any) => (
                <tr key={r.cohort}>
                  <td className="whitespace-nowrap px-1.5 py-1 font-mono">{r.cohort}</td>
                  <td className="px-1 py-1 text-center text-muted-foreground">{r.size}</td>
                  {r.cells.map((c: any, i: number) => (
                    <td key={i} className="px-0.5 py-0.5">
                      <div
                        className="grid h-6 w-9 place-items-center rounded font-semibold"
                        style={{
                          backgroundColor: `color-mix(in srgb, var(--color-gold) ${Math.min(
                            100,
                            c.pct,
                          )}%, var(--color-secondary))`,
                          color: c.pct > 45 ? "#000" : "var(--color-muted-foreground)",
                        }}
                        title={`${c.n} active`}
                      >
                        {c.pct > 0 ? `${c.pct}` : "·"}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Feature adoption" note={`share of ${fmt(d.humans)} players`}>
        <HBars
          rows={(d.adoption || []).map((a: any) => ({
            label: a.label,
            value: a.pct,
            sub: `${fmt(a.n)}`,
          }))}
          color="var(--color-win)"
          fmtVal={(v) => `${v}%`}
        />
      </Section>
      <Section title="Engagement depth" note="players by lifetime hands">
        <HBars rows={(d.depth || []).map((b: any) => ({ label: b.label, value: b.count }))} />
      </Section>
    </>
  );
}

function Spinner() {
  return <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-center text-[11px] text-muted-foreground">{children}</p>;
}

const TABS = [
  { k: "economy", label: "Economy", icon: LineChart, C: Economy },
  { k: "revenue", label: "Revenue", icon: DollarSign, C: Revenue },
  { k: "engagement", label: "Players", icon: Users, C: Engagement },
  { k: "behaviour", label: "Behaviour", icon: Repeat, C: Behaviour },
  { k: "poker", label: "Poker", icon: Spade, C: Poker },
  { k: "bots", label: "Bots", icon: Bot, C: Bots },
  { k: "league", label: "League", icon: Trophy, C: League },
  { k: "explorer", label: "Explorer", icon: Database, C: AdminData },
] as const;

export function Dashboards() {
  const [view, setView] = useState<string>("economy");
  const Active = TABS.find((t) => t.k === view)?.C ?? Economy;
  return (
    <>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.k}
              onClick={() => setView(t.k)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold",
                view === t.k ? "bg-gold text-black" : "bg-secondary text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      <Active />
    </>
  );
}
