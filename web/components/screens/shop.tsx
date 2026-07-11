"use client";

import { useEffect, useState } from "react";
import { Star, Gem, Package, Coins } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { openInvoice, notify } from "@/lib/telegram";
import { WalletBar } from "@/components/wallet-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Rows({
  items,
  render,
}: {
  items: any[];
  render: (i: any) => React.ReactNode;
}) {
  return (
    <Card className="p-4">
      {items.map((i) => (
        <div
          key={i.code}
          className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0"
        >
          {render(i)}
        </div>
      ))}
    </Card>
  );
}

export function ShopScreen() {
  const { refresh } = useApp();
  const [cat, setCat] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);

  useEffect(() => {
    api.catalog().then(setCat).catch(() => {});
    api.boxes().then(setBoxes as never).catch(() => {});
  }, []);

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
  async function openBox(box: any) {
    const payGems = box.price_gems && !box.price_coins;
    try {
      const r: any = await api.openBox(box.code, payGems ? "gems" : "coins");
      toast.success(
        `${box.name}: ${r.reward.label || fmt(r.reward.amount) + " coins"}!`,
      );
      notify("success");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <WalletBar />
      <h1 className="mb-3 flex items-center gap-2 text-2xl font-extrabold">
        <Coins className="size-6 text-gold" /> Shop
      </h1>

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Coin &amp; Gem Packs
      </h2>
      {cat && (
        <Rows
          items={cat.stars}
          render={(p) => (
            <>
              <div className="grid size-9 place-items-center rounded-lg bg-secondary">
                <Star className="size-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(p.coins)} coins{p.gems ? ` · ${p.gems} gems` : ""}
                </div>
              </div>
              <Button size="sm" onClick={() => buyStars(p.code)}>
                <Star className="size-3.5" /> {p.stars}
              </Button>
            </>
          )}
        />
      )}

      <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Loot Boxes
      </h2>
      {boxes.length > 0 && (
        <Rows
          items={boxes}
          render={(b) => (
            <>
              <div className="grid size-9 place-items-center rounded-lg bg-secondary">
                <Package className="size-5 text-gem" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold capitalize">
                  {b.name} <span className="text-xs text-muted-foreground">{b.tier}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{b.description}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openBox(b)}>
                {b.price_gems && !b.price_coins ? (
                  <>
                    <Gem className="size-3.5" /> {b.price_gems}
                  </>
                ) : (
                  <>
                    <Coins className="size-3.5" /> {fmt(b.price_coins)}
                  </>
                )}
              </Button>
            </>
          )}
        />
      )}
    </>
  );
}
