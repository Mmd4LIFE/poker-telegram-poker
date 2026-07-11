"use client";

import { useEffect, useState } from "react";
import { Star, Wrench, Users, ShoppingCart, Info, Medal } from "lucide-react";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Metric({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <Card className="flex-1 items-center p-4 text-center">
      <div className={`text-xl font-extrabold ${className ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

export function AdminScreen() {
  const { go } = useApp();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.adminStats().then(setD).catch((e) => setErr(e.message));
  }, []);

  return (
    <>
      <PageHeader title="Admin" onBack={() => go("profile")} />
      {err ? (
        <Card className="p-4 text-sm">{err}</Card>
      ) : !d ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="flex gap-3">
            <Metric value={`⭐ ${fmt(d.stars_revenue)}`} label="Stars earned" className="text-gold" />
            <Metric value={`${d.ton_revenue_ton} TON`} label="TON earned" className="text-gem" />
          </div>
          <div className="mt-3 flex gap-3">
            <Metric value={String(d.stars_orders)} label="Star orders" />
            <Metric value={`${d.paying_users}/${d.total_users}`} label="Payers / users" />
          </div>

          <Card className="mt-3 flex-row gap-2 bg-secondary/50 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-gold" />
            <p className="text-xs text-muted-foreground">
              Sales records. The real Stars sit in your bot&apos;s Telegram balance —
              withdraw as TON via Fragment. TON payments go to your configured wallet.
            </p>
          </Card>

          <h2 className="mb-2 mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Medal className="size-3.5" /> Top Spenders
          </h2>
          <Card className="p-4">
            {d.top_spenders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              d.top_spenders.map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
                  <span className="w-5 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">{t.user}</div>
                    <div className="text-[11px] text-muted-foreground">ID {t.telegram_id ?? "—"}</div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-gold">
                    <Star className="size-3" /> {fmt(t.stars)}
                  </span>
                </div>
              ))
            )}
          </Card>

          <h2 className="mb-2 mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShoppingCart className="size-3.5" /> Recent Purchases
          </h2>
          <Card className="p-4">
            {d.recent_purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              d.recent_purchases.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
                  {p.provider === "stars" ? (
                    <Star className="size-4 text-gold" />
                  ) : (
                    <Users className="size-4 text-gem" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">{p.user}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.product} · {fmt(p.coins)} coins
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gold">
                    {p.provider === "stars" ? `⭐ ${p.amount}` : `${(p.amount / 1e9).toFixed(2)} TON`}
                  </span>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </>
  );
}
