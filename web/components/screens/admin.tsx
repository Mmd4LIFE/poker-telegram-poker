"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Star, Users, ShoppingCart, Info, Medal, Package, Gem, Coins,
  TriangleAlert, Check,
} from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Metric({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <Card className="flex-1 items-center p-4 text-center">
      <div className={cn("text-xl font-extrabold", className)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

export function AdminScreen() {
  const { go } = useApp();
  return (
    <>
      <PageHeader title="Admin" onBack={() => go("profile")} />
      <Tabs defaultValue="overview">
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="overview" className="flex-1">Sales</TabsTrigger>
          <TabsTrigger value="boxes" className="flex-1">Boxes</TabsTrigger>
          <TabsTrigger value="packs" className="flex-1">Packs</TabsTrigger>
          <TabsTrigger value="cards" className="flex-1">Cards</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="boxes"><Boxes /></TabsContent>
        <TabsContent value="packs"><Packs /></TabsContent>
        <TabsContent value="cards"><Cards /></TabsContent>
      </Tabs>
    </>
  );
}

function Overview() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.adminStats().then(setD).catch((e) => setErr(e.message));
  }, []);
  if (err) return <Card className="p-4 text-sm">{err}</Card>;
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <>
      <div className="flex gap-3">
        <Metric value={`${fmt(d.stars_revenue)}`} label="Stars earned" className="text-gold" />
        <Metric value={`${d.ton_revenue_ton} TON`} label="TON earned" className="text-gem" />
      </div>
      <div className="mt-3 flex gap-3">
        <Metric value={String(d.stars_orders)} label="Star orders" />
        <Metric value={`${d.paying_users}/${d.total_users}`} label="Payers / users" />
      </div>
      <Card className="mt-3 flex-row gap-2 bg-secondary/50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" />
        <p className="text-xs text-muted-foreground">
          Sales records. Real Stars sit in your bot&apos;s Telegram balance (withdraw as TON via Fragment).
        </p>
      </Card>

      <h2 className="mb-2 mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Medal className="size-3.5" /> Top Spenders
      </h2>
      <Card className="p-4">
        {d.top_spenders.length === 0 ? <p className="text-sm text-muted-foreground">No purchases yet.</p> :
          d.top_spenders.map((t: any, i: number) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
              <span className="w-5 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-semibold">{t.user}</div>
                <div className="text-[11px] text-muted-foreground">ID {t.telegram_id ?? "—"}</div>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold text-gold">
                <Star className="size-3" /> {fmt(t.stars)}
              </span>
            </div>
          ))}
      </Card>

      <h2 className="mb-2 mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <ShoppingCart className="size-3.5" /> Recent Purchases
      </h2>
      <Card className="p-4">
        {d.recent_purchases.length === 0 ? <p className="text-sm text-muted-foreground">No purchases yet.</p> :
          d.recent_purchases.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
              {p.provider === "stars" ? <Star className="size-4 text-gold" /> : <Users className="size-4 text-gem" />}
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-semibold">{p.user}</div>
                <div className="text-[11px] text-muted-foreground">{p.product} · {fmt(p.coins)} coins</div>
              </div>
              <span className="text-xs font-bold text-gold">
                {p.provider === "stars" ? `${p.amount}` : `${(p.amount / 1e9).toFixed(2)} TON`}
              </span>
            </div>
          ))}
      </Card>
    </>
  );
}

function Boxes() {
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => api.adminBoxes().then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function save(code: string, patch: any) {
    try {
      await api.adminUpdateBox(code, patch);
      toast.success("Saved");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <Card className="mb-3 flex-row gap-2 bg-secondary/50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" />
        <p className="text-xs text-muted-foreground">
          <b>RTP</b> = expected payout ÷ price. Healthy is 60–90% (house edge 10–40%).
          <b> Actual</b> is measured from the real ledger. Daily open limit: <b>{d.daily_limit || "off"}</b>.
        </p>
      </Card>
      {d.boxes.map((b: any) => (
        <BoxRow key={b.code} b={b} onSave={save} />
      ))}
    </>
  );
}

function BoxRow({ b, onSave }: any) {
  const [coins, setCoins] = useState(b.price_coins);
  const [gems, setGems] = useState(b.price_gems);
  const rtpPct = Math.round((b.rtp || 0) * 100);
  const actualPct = b.actual_rtp != null ? Math.round(b.actual_rtp * 100) : null;
  return (
    <Card className="mb-3 p-4">
      <div className="flex items-center gap-3">
        <Package className={cn("size-6", b.healthy ? "text-gold" : "text-lose")} />
        <div className="flex-1">
          <div className="text-sm font-bold">{b.name} <span className="text-xs text-muted-foreground">{b.tier}</span></div>
          <div className="text-[11px] text-muted-foreground">{b.opens} opens</div>
        </div>
        {!b.healthy && (
          <span className="flex items-center gap-1 rounded-full bg-lose/20 px-2 py-0.5 text-[10px] font-bold text-lose">
            <TriangleAlert className="size-3" /> unbalanced
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/60 p-2">
          <div className={cn("text-sm font-bold", b.healthy ? "text-win" : "text-lose")}>{rtpPct}%</div>
          <div className="text-[10px] text-muted-foreground">Target RTP</div>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2">
          <div className="text-sm font-bold">{actualPct != null ? `${actualPct}%` : "—"}</div>
          <div className="text-[10px] text-muted-foreground">Actual RTP</div>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2">
          <div className="text-sm font-bold text-gold">{fmt(b.expected_value)}</div>
          <div className="text-[10px] text-muted-foreground">EV (coins)</div>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        Suggested price for 80% RTP: <b className="text-foreground">{fmt(b.suggested_price)}</b> coins
      </div>

      <div className="mt-2 flex items-end gap-2">
        <label className="flex-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Coins className="size-3 text-gold" /> Coins</span>
          <Input type="number" value={coins} onChange={(e) => setCoins(Number(e.target.value))} className="mt-1 h-9" />
        </label>
        <label className="flex-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Gem className="size-3 text-gem" /> Gems</span>
          <Input type="number" value={gems} onChange={(e) => setGems(Number(e.target.value))} className="mt-1 h-9" />
        </label>
        <Button size="sm" onClick={() => onSave(b.code, { price_coins: coins, price_gems: gems })}>
          <Check className="size-4" />
        </Button>
        <Button size="sm" variant={b.is_active ? "outline" : "secondary"}
          onClick={() => onSave(b.code, { is_active: !b.is_active })}>
          {b.is_active ? "On" : "Off"}
        </Button>
      </div>
    </Card>
  );
}

function Packs() {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => api.adminProducts().then(setRows as never).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function save(code: string, patch: any) {
    try {
      await api.adminUpdateProduct(code, patch);
      toast.success("Saved");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <>
      <Card className="mb-3 flex-row gap-2 bg-secondary/50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" />
        <p className="text-xs text-muted-foreground">
          Set a <b>discount</b> to run an offer (e.g. 50% off). Price shown to players = base − discount.
        </p>
      </Card>
      {rows.map((p) => <PackRow key={p.code} p={p} onSave={save} />)}
    </>
  );
}

function PackRow({ p, onSave }: any) {
  const [price, setPrice] = useState(p.base_price);
  const [disc, setDisc] = useState(p.discount_pct);
  const isTon = p.kind === "ton";
  return (
    <Card className="mb-3 p-4">
      <div className="flex items-center gap-3">
        {isTon ? <Gem className="size-5 text-gem" /> : <Star className="size-5 text-gold" />}
        <div className="flex-1">
          <div className="text-sm font-bold">{p.label}</div>
          <div className="text-[11px] text-muted-foreground">
            {fmt(p.coins)} coins{p.gems ? ` · ${p.gems} gems` : ""} · sold {p.sold}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-gold">
            {isTon ? `${(p.price / 1e9).toFixed(2)} TON` : `${p.price} ⭐`}
          </div>
          {p.discount_pct > 0 && (
            <div className="text-[10px] text-muted-foreground line-through">
              {isTon ? `${(p.base_price / 1e9).toFixed(2)}` : p.base_price}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <label className="flex-1 text-[11px] text-muted-foreground">
          Base price {isTon ? "(nanoTON)" : "(stars)"}
          <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-1 h-9" />
        </label>
        <label className="w-24 text-[11px] text-muted-foreground">
          Discount %
          <Input type="number" value={disc} onChange={(e) => setDisc(Number(e.target.value))} className="mt-1 h-9" />
        </label>
        <Button size="sm" onClick={() => onSave(p.code, { base_price: price, discount_pct: disc })}>
          <Check className="size-4" />
        </Button>
        <Button size="sm" variant={p.is_active ? "outline" : "secondary"}
          onClick={() => onSave(p.code, { is_active: !p.is_active })}>
          {p.is_active ? "On" : "Off"}
        </Button>
      </div>
    </Card>
  );
}


/* Card-skin supply + market turnover. The fee column is coins/gems DESTROYED —
   that's the sink offsetting box payouts. */
function Cards() {
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<Record<string, any>>({});

  const load = useCallback(() => api.adminCards().then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function save(code: string) {
    const patch = edit[code];
    if (!patch) return;
    try {
      await api.adminUpdateDesign(code, patch);
      toast.success("Saved");
      setEdit((e) => ({ ...e, [code]: undefined }));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["coins", "gems"] as const).map((c) => (
          <Card key={c} className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{c} market</div>
            <div className="text-lg font-extrabold">{fmt(d.market[c].volume)}</div>
            <div className="text-[11px] text-muted-foreground">
              {d.market[c].sales} sales · {fmt(d.market[c].burned)} burned
            </div>
          </Card>
        ))}
      </div>

      {d.designs.map((x: any) => {
        const e = edit[x.code] || {};
        return (
          <Card key={x.code} className="mb-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-extrabold">{x.name}</div>
                <div className="text-[11px] uppercase text-muted-foreground">
                  {x.rarity} · {x.listed} listed
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">
                  {x.minted}/{fmt(x.supply_total)}
                </div>
                <div className={cn("text-[11px]", x.sold_out_pct > 90 ? "text-lose" : "text-muted-foreground")}>
                  {x.sold_out_pct}% minted
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              deuce {fmt(x.base_price_coins) || x.base_price_gems + "g"} → ace{" "}
              {x.ace_price_coins ? fmt(x.ace_price_coins) : x.ace_price_gems + "g"}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                className="h-8 text-xs"
                type="number"
                placeholder={"base " + (x.base_price_gems ? "gems" : "coins")}
                value={
                  x.base_price_gems
                    ? (e.base_price_gems ?? "")
                    : (e.base_price_coins ?? "")
                }
                onChange={(ev) =>
                  setEdit((p) => ({
                    ...p,
                    [x.code]: {
                      ...e,
                      [x.base_price_gems ? "base_price_gems" : "base_price_coins"]:
                        Number(ev.target.value),
                    },
                  }))
                }
              />
              <Input
                className="h-8 text-xs"
                type="number"
                placeholder={"mint " + x.mint_per_card}
                value={e.mint_per_card ?? ""}
                onChange={(ev) =>
                  setEdit((p) => ({
                    ...p,
                    [x.code]: { ...e, mint_per_card: Number(ev.target.value) },
                  }))
                }
              />
              <Button size="sm" className="h-8" onClick={() => save(x.code)}>
                Save
              </Button>
            </div>
          </Card>
        );
      })}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Mint can be raised but never cut below the highest serial already minted.
      </p>
    </>
  );
}
