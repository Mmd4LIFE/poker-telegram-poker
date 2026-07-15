"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, Coins, Gem, Info, Medal, Package, Plus, ShoppingCart, Star, Trash2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadarChart } from "@/components/radar-chart";
import { AdminData } from "@/components/screens/admin-data";
import { KpiTile, AxisLegend } from "@/components/kpi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
        {/* too many tabs to fit — scroll horizontally instead of cramming */}
        <TabsList className="mb-3 flex w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="shrink-0">Sales</TabsTrigger>
          <TabsTrigger value="boxes" className="shrink-0">Boxes</TabsTrigger>
          <TabsTrigger value="packs" className="shrink-0">Packs</TabsTrigger>
          <TabsTrigger value="cards" className="shrink-0">Cards</TabsTrigger>
          <TabsTrigger value="reach" className="shrink-0">Reach</TabsTrigger>
          <TabsTrigger value="bots" className="shrink-0">Bots</TabsTrigger>
          <TabsTrigger value="league" className="shrink-0">League</TabsTrigger>
          <TabsTrigger value="data" className="shrink-0">Data</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="boxes"><Boxes /></TabsContent>
        <TabsContent value="packs"><Packs /></TabsContent>
        <TabsContent value="cards"><Cards /></TabsContent>
        <TabsContent value="reach"><Reach /></TabsContent>
        <TabsContent value="bots"><Bots /></TabsContent>
        <TabsContent value="league"><League /></TabsContent>
        <TabsContent value="data"><AdminData /></TabsContent>
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
  const [limit, setLimit] = useState(b.daily_limit ?? 0);
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
        <label className="flex-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">/ day</span>
          <Input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="mt-1 h-9"
          />
        </label>
        <Button
          size="sm"
          onClick={() =>
            onSave(b.code, {
              price_coins: coins,
              price_gems: gems,
              daily_limit: limit, // 0 = unlimited
            })
          }
        >
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
  const [fee, setFee] = useState("");

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

  async function saveFee() {
    try {
      await api.adminMarketFee(Number(fee));
      toast.success("Market fee updated");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <Card className="mb-3 p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Market fee
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Input
            className="h-8 text-xs"
            type="number"
            placeholder={`${d.fee_pct}%`}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <Button size="sm" className="h-8" onClick={saveFee}>
            Save
          </Button>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Currently {d.fee_pct}% — burned on every sale, so this is the dial on how
          hard the market drains coins out of the economy.
        </div>
      </Card>

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


/* Audience segments + broadcasts + the nightly reminder.

   Segment membership is materialised, not live: the rules join over skins,
   listings and squads, so we only compute on demand (Calculate) and again
   automatically right before a broadcast goes out. */
function Reach() {
  const [d, setD] = useState<any>(null);
  const [rem, setRem] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);

  const [edit, setEdit] = useState<any>(null); // segment being built
  const [preview, setPreview] = useState<number | null>(null);

  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>(""); // "" = everyone
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    api.adminSegments().then(setD).catch(() => {});
    api.adminReminder().then(setRem).catch(() => {});
    api.adminBroadcasts().then((r) => setHist(r as any[])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runPreview(rules: any) {
    try {
      const r: any = await api.adminPreviewSegment(rules);
      setPreview(r.user_count);
    } catch {
      setPreview(null);
    }
  }

  async function saveSegment() {
    if (!edit?.name) return toast.error("Name the segment");
    try {
      if (edit.id) await api.adminUpdateSegment(edit.id, { name: edit.name, rules: edit.rules });
      else await api.adminCreateSegment({ name: edit.name, rules: edit.rules });
      toast.success("Saved");
      setEdit(null);
      setPreview(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function compute(id: number) {
    try {
      const r: any = await api.adminComputeSegment(id);
      toast.success(`${r.user_count} users`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: number) {
    try {
      await api.adminDeleteSegment(id);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function send() {
    if (!text.trim()) return toast.error("Write a message");
    setSending(true);
    try {
      const r: any = await api.adminBroadcast(text, target ? Number(target) : null);
      toast.success(`Queued for ${r.segment}`);
      setText("");
      setTimeout(load, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function saveReminder() {
    try {
      const r = await api.adminUpdateReminder(rem);
      setRem(r);
      toast.success("Reminder settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const fields: any[] = d.fields || [];

  return (
    <>
      {/* --- broadcast --- */}
      <Card className="mb-3 p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Broadcast
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Message… HTML allowed (<b>, <i>, <a>)"
          className="mt-2 w-full rounded-lg border border-white/10 bg-secondary p-2 text-xs"
        />
        <div className="mt-2 flex gap-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs font-semibold"
          >
            <option value="">Everyone ({d.total_users})</option>
            {d.segments.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.user_count})
              </option>
            ))}
          </select>
          <Button size="sm" className="h-8" disabled={sending} onClick={send}>
            Send
          </Button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(d.variables || []).map((v: string) => (
            <button
              key={v}
              onClick={() => setText((t) => t + `{${v}}`)}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-gold"
            >
              {"{" + v + "}"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Tap a variable to insert it — each recipient gets their own values. The
          segment is recalculated at send time, so the audience is never stale.
        </p>
      </Card>

      {/* --- segments --- */}
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Segments
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => {
            setEdit({ name: "", rules: {} });
            setPreview(null);
          }}
        >
          New
        </Button>
      </div>

      {edit && (
        <Card className="mb-3 p-3">
          <Input
            className="h-8 text-xs"
            placeholder="Segment name"
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          />
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {fields.map((f) => (
              <div key={f.key}>
                <div className="mb-0.5 text-[10px] text-muted-foreground">{f.label}</div>
                {f.type === "bool" ? (
                  <select
                    value={
                      edit.rules[f.key] === undefined ? "" : String(edit.rules[f.key])
                    }
                    onChange={(e) => {
                      const rules = { ...edit.rules };
                      if (e.target.value === "") delete rules[f.key];
                      else rules[f.key] = e.target.value === "true";
                      setEdit({ ...edit, rules });
                    }}
                    className="h-7 w-full rounded-lg border border-white/10 bg-secondary px-1.5 text-[11px]"
                  >
                    <option value="">any</option>
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                ) : (
                  <Input
                    className="h-7 text-[11px]"
                    type={f.type === "int" ? "number" : "text"}
                    value={edit.rules[f.key] ?? ""}
                    onChange={(e) => {
                      const rules = { ...edit.rules };
                      const v = e.target.value;
                      if (v === "") delete rules[f.key];
                      else rules[f.key] = f.type === "int" ? Number(v) : v;
                      setEdit({ ...edit, rules });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => runPreview(edit.rules)}
            >
              Preview
            </Button>
            {preview !== null && (
              <span className="text-xs font-bold text-gold">{preview} users</span>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="outline" className="h-8" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8" onClick={saveSegment}>
              Save
            </Button>
          </div>
        </Card>
      )}

      {d.segments.map((s: any) => (
        <Card key={s.id} className="mb-2 p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {s.computed_at
                  ? `${s.user_count} users · ${new Date(s.computed_at).toLocaleDateString()}`
                  : "not calculated yet"}
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7" onClick={() => compute(s.id)}>
              Calculate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setEdit({ id: s.id, name: s.name, rules: s.rules || {} });
                setPreview(null);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => remove(s.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </Card>
      ))}

      {/* --- nightly reminder --- */}
      {rem && (
        <Card className="mb-3 mt-4 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Daily reminder
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={String(rem.enabled)}
              onChange={(e) => setRem({ ...rem, enabled: e.target.value === "true" })}
              className="h-8 rounded-lg border border-white/10 bg-secondary px-2 text-xs font-semibold"
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
            <Input
              className="h-8 w-20 text-xs"
              type="number"
              value={rem.hour}
              onChange={(e) => setRem({ ...rem, hour: Number(e.target.value) })}
            />
            <span className="text-[11px] text-muted-foreground">
              local hour (each user&apos;s own timezone)
            </span>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            Keep-streak message — {(rem.keep_variables || []).map((v: string) => `{${v}}`).join(" ")}
          </div>
          <textarea
            rows={3}
            value={rem.keep_text}
            onChange={(e) => setRem({ ...rem, keep_text: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-secondary p-2 text-[11px]"
          />
          <div className="mt-2 text-[10px] text-muted-foreground">
            Streak-broken message (sent at most twice, then we go quiet)
          </div>
          <textarea
            rows={3}
            value={rem.miss_text}
            onChange={(e) => setRem({ ...rem, miss_text: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-secondary p-2 text-[11px]"
          />
          <Button size="sm" className="mt-2 h-8" onClick={saveReminder}>
            Save reminder
          </Button>
        </Card>
      )}

      {/* --- history --- */}
      {hist.length > 0 && (
        <>
          <h3 className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Recent broadcasts
          </h3>
          <Card className="p-3">
            {hist.map((b: any) => (
              <div key={b.id} className="border-b border-white/5 py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-xs">{b.text}</span>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase",
                      b.status === "done" ? "text-win" : "text-gold",
                    )}
                  >
                    {b.status}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {b.segment} · {b.sent}/{b.total} sent
                  {b.failed ? ` · ${b.failed} failed` : ""}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}


/* Bot monitor. The radar is computed from hands the bot ACTUALLY played — not from
   the personality we configured it with. A bot set to "aggressive" that folds all
   day shows up as passive here, which is exactly what you want to see. */
function Bots() {
  const [d, setD] = useState<any>(null);
  const [pick, setPick] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ name: "", personality: "balanced", skill: 0.5, avatar: "bot" });

  const load = useCallback(() => api.adminBots().then(setD).catch(() => {}), []);
  const [dq, setDq] = useState<any>(null);
  const loadDq = useCallback(() => api.adminDq().then(setDq).catch(() => {}), []);
  useEffect(() => {
    load();
    loadDq();
  }, [load, loadDq]);

  async function recompute() {
    try {
      await api.adminDqRecompute();
      toast.success("Grade cutoffs recomputed from the distribution");
      loadDq();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function open(id: number) {
    try {
      setPick(await api.adminBot(id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function create() {
    try {
      const r: any = await api.adminCreateBot(form);
      toast.success(`${r.name} joined the pool`);
      setCreating(false);
      setForm({ name: "", personality: "balanced", skill: 0.5, avatar: "bot" });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: number) {
    try {
      await api.adminDeleteBot(id);
      setPick(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const bots: any[] = d.bots || [];
  const K = d.kpis || {};

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Card className="flex-1 p-3">
          <div className="text-lg font-extrabold">{bots.length}</div>
          <div className="text-[11px] text-muted-foreground">
            bots · DNA unlocks at {d.min_hands} hands
          </div>
        </Card>
        <Button size="sm" className="h-10" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New bot
        </Button>
      </div>

      {/* Decision-Quality validation: does the EV score actually rank bots by skill?
          If DQ correlates with configured skill, the metric is trustworthy. */}
      {dq && (
        <Card className="mb-3 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Decision-Quality validation
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                dq.verdict === "valid"
                  ? "bg-win/20 text-win"
                  : dq.verdict === "weak"
                    ? "bg-gold/20 text-gold"
                    : "bg-lose/20 text-lose",
              )}
            >
              {dq.verdict}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-secondary/60 p-2">
              <div className="text-sm font-bold">{dq.rho_dq_vs_skill ?? "—"}</div>
              <div className="text-[10px] uppercase text-muted-foreground">ρ vs skill</div>
            </div>
            <div className="rounded-lg bg-secondary/60 p-2">
              <div className="text-sm font-bold">{dq.rho_dq_vs_winrate ?? "—"}</div>
              <div className="text-[10px] uppercase text-muted-foreground">ρ vs winrate</div>
            </div>
            <div className="rounded-lg bg-secondary/60 p-2">
              <div className="text-sm font-bold">{dq.sample}</div>
              <div className="text-[10px] uppercase text-muted-foreground">bots (≥{dq.min_decisions})</div>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            ρ is rank-correlation of each bot&apos;s DQ with its configured skill. Above
            0.5 = the score measures skill; near 0 = the model needs retuning.
          </p>

          {dq.distribution?.n > 0 && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  DQ distribution ({dq.distribution.n})
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {dq.distribution.min}–{dq.distribution.max}, mean {dq.distribution.mean}
                </span>
              </div>
              {/* histogram */}
              <div className="mt-1.5 flex h-16 items-end gap-0.5">
                {dq.distribution.bins.map((b: any, i: number) => {
                  const max = Math.max(...dq.distribution.bins.map((x: any) => x.n), 1);
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gold/70"
                      style={{ height: `${(100 * b.n) / max}%` }}
                      title={`${b.lo}-${b.hi}: ${b.n}`}
                    />
                  );
                })}
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
                <span>{dq.distribution.min}</span>
                <span>p50 {dq.distribution.pcts?.["50"]}</span>
                <span>p90 {dq.distribution.pcts?.["90"]}</span>
                <span>{dq.distribution.max}</span>
              </div>
            </>
          )}

          {dq.grades?.length > 0 && (
            <>
              <div className="mt-3 mb-1 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Grade cutoffs (percentile bands)
                </div>
                <Button size="sm" variant="outline" className="h-7" onClick={recompute}>
                  Recompute
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {[...dq.grades].sort((a: any, b: any) => b.level - a.level).map((g: any) => (
                  <span
                    key={g.level}
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: g.color + "22", color: g.color }}
                  >
                    {g.name} ≥{g.min}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Grades are percentiles of the live population — Master is the top slice
                by construction, so &quot;everyone&apos;s a Master&quot; can&apos;t happen.
                Recompute pulls fresh cutoffs from the current distribution.
              </p>
            </>
          )}
        </Card>
      )}

      {bots.map((b) => (
        <button key={b.id} onClick={() => open(b.id)} className="mb-2 w-full text-left">
          <Card className="flex-row items-center gap-3 p-3 active:scale-[0.99]">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-secondary text-gold">
                <AvatarIcon code={b.avatar} className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{b.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {b.personality} · skill {b.skill}
                {b.dq != null && (
                  <span className="ml-1 text-gold">· DQ {b.dq}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-sm font-bold", b.net_won >= 0 ? "text-win" : "text-lose")}>
                {b.net_won >= 0 ? "+" : "−"}{fmt(Math.abs(b.net_won))}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {b.hands_won}/{b.hands} won
              </div>
            </div>
          </Card>
        </button>
      ))}

      {/* --- create --- */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New bot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Personality</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(d.personalities || []).map((p: string) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, personality: p })}
                    className={cn(
                      "rounded-lg border py-1.5 text-xs font-semibold capitalize",
                      form.personality === p
                        ? "border-gold text-gold"
                        : "border-white/10 text-muted-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Skill</span>
                <span className="font-bold text-foreground">{form.skill}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={form.skill}
                onChange={(e) => setForm({ ...form, skill: Number(e.target.value) })}
                className="w-full accent-[var(--color-gold)]"
              />
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                Skill drives how hard it thinks (Monte-Carlo samples), how accurately it
                judges its equity, and how well it reads opponents onto a range. A low
                skill bot still imagines everyone on random cards — which is exactly what
                makes it a fish.
              </p>
            </div>
            <Button className="w-full" onClick={create}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- detail --- */}
      <Sheet open={!!pick} onOpenChange={(o) => !o && setPick(null)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{pick?.name}</SheetTitle>
          </SheetHeader>
          {pick && (
            <div className="px-4 pb-6">
              <div className="flex flex-col items-center">
                <Avatar className="size-16 border-2 border-gold/40">
                  <AvatarFallback className="bg-secondary text-gold">
                    <AvatarIcon code={pick.avatar} className="size-7" />
                  </AvatarFallback>
                </Avatar>
                <div className="mt-1 text-[11px] uppercase text-muted-foreground">
                  {pick.personality} · skill {pick.skill}
                </div>
                <span className="mt-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-gold">
                  {pick.ready ? pick.style : `needs ${pick.hands_needed} more hands`}
                </span>
                <RadarChart
                  axes={pick.axes}
                  scores={pick.scores}
                  confidence={pick.confidence}
                  size={280}
                />
              </div>

              <AxisLegend
                axes={pick.axes}
                scores={pick.scores}
                docs={pick.axis_docs}
                shrinkage={pick.shrinkage}
              />

              <div className="mt-4 grid grid-cols-3 gap-2">
                <KpiTile value={`${pick.raw.vpip}%`} doc={pick.kpis.vpip} />
                <KpiTile value={`${pick.raw.pfr}%`} doc={pick.kpis.pfr} />
                <KpiTile value={pick.raw.af} doc={pick.kpis.af} />
                <KpiTile value={`${pick.raw.bluff}%`} doc={pick.kpis.bluff} />
                <KpiTile value={`${pick.raw.wsd}%`} doc={pick.kpis.wsd} />
                <KpiTile value={`${pick.raw.cbet}%`} doc={pick.kpis.cbet} />
                <KpiTile value={fmt(pick.hands)} doc={pick.kpis.hands} />
                <KpiTile
                  value={`${pick.hands_won} (${pick.win_rate}%)`}
                  doc={pick.kpis.won}
                />
                <KpiTile
                  value={fmt(pick.raw.net_won)}
                  doc={pick.kpis.net}
                  tone={pick.raw.net_won >= 0 ? "win" : "lose"}
                />
              </div>

              {pick.dq?.dq != null && (
                <>
                  <h3 className="mb-1.5 mt-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Decision quality</span>
                    <span className="font-normal normal-case">
                      {pick.dq.decisions} decisions
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-secondary/60 p-2 text-center">
                      <div className="text-lg font-extrabold text-gold">{pick.dq.dq}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">DQ score</div>
                    </div>
                    <div className="rounded-lg bg-secondary/60 p-2 text-center">
                      <div className="text-lg font-extrabold text-lose">{pick.dq.blunder_rate}%</div>
                      <div className="text-[10px] uppercase text-muted-foreground">blunder rate</div>
                    </div>
                  </div>
                  {pick.dq.worst?.length > 0 && (
                    <Card className="mt-2 p-2">
                      <div className="mb-1 px-1 text-[10px] uppercase text-muted-foreground">
                        Worst decisions
                      </div>
                      {pick.dq.worst.map((w: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 border-b border-white/5 px-1 py-1 text-[11px] last:border-0">
                          <span className="w-8 font-bold text-lose">{w.dq}</span>
                          <span className="flex-1 text-muted-foreground capitalize">{w.street}</span>
                          <span className="text-muted-foreground">
                            best {fmt(w.best)} · chose {fmt(w.chosen)}
                          </span>
                        </div>
                      ))}
                    </Card>
                  )}
                </>
              )}

              {pick.league?.days?.length > 0 && (
                <>
                  <h3 className="mb-1.5 mt-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>League roadmap</span>
                    <span className="font-normal normal-case">
                      best {pick.league.best_tier_name} · {pick.league.promotions}↑{" "}
                      {pick.league.demotions}↓
                    </span>
                  </h3>
                  <Card className="mb-3 p-2">
                    {pick.league.days.map((h: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 border-b border-white/5 px-1 py-1.5 last:border-0"
                      >
                        <span className="w-16 text-[10px] text-muted-foreground">
                          {h.day.slice(5)}
                        </span>
                        <span className="flex-1 text-xs font-semibold capitalize">
                          {h.tier}
                          <span className="ml-1 font-normal text-muted-foreground">
                            #{h.rank}
                          </span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {h.games}g · {h.wins}w
                        </span>
                        <span className="w-7 text-right text-xs font-bold tabular-nums">
                          {h.lp}
                        </span>
                        {h.outcome === "promoted" ? (
                          <span className="text-win">↑</span>
                        ) : h.outcome === "demoted" ? (
                          <span className="text-lose">↓</span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </div>
                    ))}
                  </Card>
                </>
              )}

              {pick.recent?.length > 0 && (
                <>
                  <h3 className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Recent hands
                  </h3>
                  <Card className="p-3">
                    {pick.recent.map((h: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 border-b border-white/5 py-2 last:border-0">
                        <span className="flex-1 truncate text-xs">
                          {h.hand_name || "—"}
                          <span className="ml-1 text-muted-foreground">#{h.room}</span>
                        </span>
                        <span className={cn("text-xs font-bold", h.net >= 0 ? "text-win" : "text-lose")}>
                          {h.net >= 0 ? "+" : "−"}{fmt(Math.abs(h.net))}
                        </span>
                      </div>
                    ))}
                  </Card>
                </>
              )}

              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => remove(pick.id)}
              >
                <Trash2 className="size-4" /> Delete bot
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}


/* League monitor. The point of the bot rows is that you can watch them climb and
   fall — a cohort of 24 with three humans in it only feels alive because they do. */
function League() {
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.adminLeague().then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function save(patch: any) {
    try {
      await api.adminLeagueCfg(patch);
      toast.success("Saved");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function sim(n: number) {
    setBusy(true);
    try {
      const r: any = await api.adminLeagueSimulate(n);
      toast.success(`${r.games} bot games simulated`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    try {
      const r: any = await api.adminLeagueClose();
      toast.success(`Closed: ${r.promoted} up, ${r.demoted} down, ${r.rewarded} paid`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const cfg = d.config || {};

  return (
    <>
      <Card className="mb-3 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold">{d.day}</div>
            <div className="text-[11px] text-muted-foreground">
              {cfg.timezone} · closes in {Math.floor(d.seconds_to_close / 3600)}h
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            unlock lvl {cfg.unlock_level} · {cfg.ranked_games_per_day} ranked/day
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" className="h-8 flex-1" disabled={busy} onClick={() => sim(5)}>
            Sim 5 rounds
          </Button>
          <Button size="sm" className="h-8 flex-1" disabled={busy} onClick={close}>
            Close day now
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Enabled</span>
          <Button
            size="sm"
            variant={cfg.enabled ? "outline" : "secondary"}
            className="h-7"
            onClick={() => save({ enabled: !cfg.enabled })}
          >
            {cfg.enabled ? "On" : "Off"}
          </Button>
          <span className="ml-2 text-[11px] text-muted-foreground">Bot fill</span>
          <Button
            size="sm"
            variant={cfg.bot_fill ? "outline" : "secondary"}
            className="h-7"
            onClick={() => save({ bot_fill: !cfg.bot_fill })}
          >
            {cfg.bot_fill ? "On" : "Off"}
          </Button>
        </div>
      </Card>

      {(d.cohorts || []).map((c: any) => (
        <Card key={c.id} className="mb-2 p-0">
          <button
            onClick={() => setOpen(open === c.id ? null : c.id)}
            className="flex items-center gap-2 p-3"
          >
            <span className="flex-1 text-left text-sm font-extrabold capitalize">
              {c.tier} #{c.idx}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {c.humans} human · {c.bots} bots
            </span>
          </button>
          {open === c.id && (
            <div className="border-t border-white/5 px-3 pb-2">
              {c.members.map((m: any) => (
                <div key={m.rank} className="flex items-center gap-2 border-b border-white/5 py-1.5 last:border-0">
                  <span className="w-5 text-center text-[11px] font-bold text-muted-foreground">
                    {m.rank}
                  </span>
                  <span className="flex-1 truncate text-xs">
                    {m.name}
                    {m.is_bot && (
                      <span className="ml-1 text-[9px] uppercase text-muted-foreground/70">
                        bot {m.personality} {m.skill}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{m.games}g</span>
                  <span className="w-8 text-right text-xs font-bold tabular-nums">{m.lp}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </>
  );
}
