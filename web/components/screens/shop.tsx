"use client";

import { useEffect, useState } from "react";
import { Star, Gem, Package, Gift, Box as BoxIcon, Crown, Coins, History, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { openInvoice, notify } from "@/lib/telegram";
import { WalletBar } from "@/components/wallet-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BoxOpenDialog } from "@/components/shop/box-open-dialog";
import { DailyReward } from "@/components/shop/daily-reward";
import { ChampionRedeemDialog } from "@/components/champion-redeem";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIER_COLOR: Record<string, string> = {
  common: "text-muted-foreground",
  rare: "text-[#3fa9ff]",
  epic: "text-[#a06bff]",
  legendary: "text-gold",
};
const TIER_ICON: Record<string, LucideIcon> = {
  common: Package,
  rare: Gift,
  epic: BoxIcon,
  legendary: Crown,
};

export function ShopScreen() {
  const { refresh, user } = useApp();
  const [cat, setCat] = useState<any>(null);
  const [boxInfo, setBoxInfo] = useState<any>(null);
  const [openingBox, setOpeningBox] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [ton, setTon] = useState<any>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);

  const shards = user?.league_shards ?? 0;
  const perSkin = cat?.shards_per_skin ?? 25;

  const boxes: any[] = boxInfo?.boxes ?? [];

  const loadBoxes = () => api.boxes().then(setBoxInfo).catch(() => {});
  useEffect(() => {
    api.catalog().then(setCat).catch(() => {});
    loadBoxes();
  }, []);

  async function buyTon(code: string) {
    try {
      setTon(await api.tonIntent(code));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function verifyTon() {
    try {
      const v: any = await api.tonVerify(ton.payload);
      if (v.status === "paid") {
        toast.success("TON payment confirmed!");
        notify("success");
        setTon(null);
        refresh();
      } else toast("Not found yet — wait a moment and retry.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function buyStars(code: string) {
    try {
      const r: any = await api.buyStars(code);
      const status = await openInvoice(r.invoice_link);
      if (status === "paid") {
        toast.success("Purchase complete!");
        notify("success");
        setTimeout(refresh, 1200);
      } else if (status === "failed") toast.error("Payment failed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    try {
      setHistory(await api.boxHistory());
    } catch {
      setHistory([]);
    }
  }

  return (
    <>
      <WalletBar />
      <DailyReward />

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Coin &amp; Gem Packs
      </h2>
      {cat && (
        <Card className="p-4">
          {cat.stars.map((p: any) => (
            <div key={p.code} className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
              <div className="relative grid size-9 place-items-center rounded-lg bg-secondary">
                <Star className="size-5 text-gold" />
                {p.discount_pct > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-lose px-1 text-[9px] font-bold text-white">
                    -{p.discount_pct}%
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Coins className="size-3.5 text-gold" /> {fmt(p.coins)}
                  </span>
                  {p.gems ? (
                    <span className="flex items-center gap-1">
                      <Gem className="size-3.5 text-gem" /> {p.gems}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button size="sm" onClick={() => buyStars(p.code)}>
                <Star className="size-3.5" />
                {p.discount_pct > 0 && (
                  <span className="mr-1 text-[10px] line-through opacity-60">{p.base_stars}</span>
                )}
                {p.stars}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {cat?.ton?.length > 0 && (
        <>
          <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            TON Packs
          </h2>
          <Card className="p-4">
            {cat.ton.map((p: any) => (
              <div key={p.code} className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
                <div className="relative grid size-9 place-items-center rounded-lg bg-secondary">
                  <Gem className="size-5 text-gem" />
                  {p.discount_pct > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-lose px-1 text-[9px] font-bold text-white">
                      -{p.discount_pct}%
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Coins className="size-3.5 text-gold" /> {fmt(p.coins)}
                    </span>
                    {p.gems ? (
                      <span className="flex items-center gap-1">
                        <Gem className="size-3.5 text-gem" /> {p.gems}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => buyTon(p.code)}>
                  {p.ton} TON
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}

      <div className="mb-2 mt-5 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Loot Boxes
        </h2>
        <button
          onClick={openHistory}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"
        >
          <History className="size-3.5" /> History
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {boxes.map((b: any) => {
          const TierIcon = TIER_ICON[b.tier] || Package;
          const locked = b.locked;
          return (
          <button
            key={b.code}
            disabled={locked}
            onClick={() => !locked && setOpeningBox(b)}
            className={`flex flex-col items-center gap-1 rounded-2xl border border-white/5 bg-gradient-to-br from-secondary to-card p-4 text-center ${
              locked ? "opacity-40 grayscale" : "active:scale-[0.97]"
            }`}
          >
            <TierIcon
              className={`size-11 ${locked ? "text-muted-foreground" : TIER_COLOR[b.tier] || ""}`}
            />
            <div className="mt-1 text-sm font-extrabold">{b.name}</div>
            <div
              className={`text-[10px] font-bold uppercase ${
                locked ? "text-muted-foreground" : TIER_COLOR[b.tier] || ""
              }`}
            >
              {locked ? "back tomorrow" : b.tier}
            </div>
            <div className="mt-1 flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold">
              {b.price_gems && !b.price_coins ? (
                <>
                  <Gem className="size-3.5 text-gem" /> {b.price_gems}
                </>
              ) : (
                <>
                  <Coins className="size-3.5 text-gold" /> {fmt(b.price_coins)}
                </>
              )}
            </div>
            {b.daily_limit ? (
              <div className="text-[10px] text-muted-foreground">
                {b.remaining_today}/{b.daily_limit} today
              </div>
            ) : null}
          </button>
          );
        })}
      </div>

      {/* League Skins — bought with League Shards, not coins/gems */}
      <div className="mb-2 mt-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          League Skins
        </h2>
      </div>
      <Card className="gap-3 border-gold/30 bg-gradient-to-br from-gold/10 to-card p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
            <Crown className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold">Champion skin</div>
            <div className="text-[11px] text-muted-foreground">
              Exclusive — the only way to get one is with League Shards.
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1 text-sm font-extrabold text-gold">
              <Sparkles className="size-3.5" /> {perSkin}
            </div>
            <div className="text-[10px] text-muted-foreground">you have {shards}</div>
          </div>
        </div>
        {/* progress to next skin */}
        <div className="h-2 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${Math.min(100, ((shards % perSkin) / perSkin) * 100)}%` }}
          />
        </div>
        <Button
          className="w-full font-bold"
          disabled={shards < perSkin}
          onClick={() => setRedeemOpen(true)}
        >
          {shards >= perSkin
            ? "Redeem with shards"
            : `Need ${perSkin - (shards % perSkin)} more shards`}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Earn shards by finishing near the top of your daily league.
        </p>
      </Card>

      <ChampionRedeemDialog
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
        shards={shards}
        per={perSkin}
        onDone={refresh}
      />

      <BoxOpenDialog
        box={openingBox}
        onDone={() => {
          refresh();
          loadBoxes();
        }}
        onClose={() => setOpeningBox(null)}
      />

      {/* TON payment */}
      <Dialog open={!!ton} onOpenChange={(o) => !o && setTon(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay with TON</DialogTitle>
          </DialogHeader>
          {ton && (
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-2xl font-extrabold text-gem">{ton.amount_ton} TON</div>
                <div className="text-xs text-muted-foreground">Send exactly this amount</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">To wallet</div>
                <div className="break-all rounded-lg bg-secondary p-2 text-xs">{ton.wallet}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Comment (required!)</div>
                <div className="rounded-lg bg-secondary p-2 text-xs">{ton.comment}</div>
              </div>
              <Button className="w-full" onClick={verifyTon}>
                I&apos;ve paid — Verify
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Include the comment or funds can&apos;t be matched.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" /> Box Openings
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto">
            {history === null ? (
              <p className="p-2 text-sm text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No boxes opened yet.</p>
            ) : (
              history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
                  {(() => {
                    const Hi = TIER_ICON[h.tier] || Package;
                    return <Hi className={`size-6 ${TIER_COLOR[h.tier] || ""}`} />;
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">{h.box_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {h.at ? new Date(h.at).toLocaleString() : ""}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-gold">
                    <Sparkles className="size-3" />
                    {h.reward?.type === "coins"
                      ? `${fmt(h.reward.amount)} coins`
                      : h.reward?.type === "gems"
                        ? `${h.reward.amount} gems`
                        : h.reward?.label || "avatar"}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
