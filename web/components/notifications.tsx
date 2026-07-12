"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  Bell,
  ChevronRight,
  Coins,
  Gem,
  Inbox,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api, fmt } from "@/lib/api";
import { TradeSheet } from "@/components/market/trade-sheet";
import { useApp } from "@/lib/store";
import { PlayingCard } from "@/components/table/playing-card";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NotifCtx {
  unread: number;
  items: any[];
  open: () => void;
  reload: () => void;
}

const Ctx = createContext<NotifCtx>({
  unread: 0,
  items: [],
  open: () => {},
  reload: () => {},
});

export function useNotifications() {
  return useContext(Ctx);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { openUser } = useApp();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [sheet, setSheet] = useState(false);
  const [trade, setTrade] = useState<any>(null);

  // A trade notification is a receipt — tapping it should open the receipt.
  async function openTrade(n: any) {
    const id = n?.meta?.listing_id;
    if (!id) return;
    try {
      setTrade(await api.marketTrade(id));
      setSheet(false); // never stack two sheets
    } catch {
      /* the listing may have been pruned — just do nothing */
    }
  }

  const reload = useCallback(async () => {
    try {
      const r: any = await api.notifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* notifications are never load-bearing — fail quiet */
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 45000);
    return () => clearInterval(t);
  }, [reload]);

  // Opening the bell IS the read receipt: clear the badge immediately, then
  // persist. The list keeps showing which ones were new via the dot.
  const open = useCallback(async () => {
    setSheet(true);
    if (unread > 0) {
      setUnread(0);
      try {
        await api.readNotifications();
      } catch {
        /* ignore */
      }
    }
  }, [unread]);

  return (
    <Ctx.Provider value={{ unread, items, open, reload }}>
      {children}
      <Sheet
        open={sheet}
        onOpenChange={(o) => {
          setSheet(o);
          if (!o) reload(); // re-pull so the 'new' dots settle
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[88vh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {items.length === 0 ? (
              <Card className="items-center gap-1 p-8 text-center">
                <Inbox className="size-7 text-muted-foreground" />
                <div className="text-sm font-semibold">Nothing yet</div>
                <div className="text-xs text-muted-foreground">
                  Card sales and purchases will show up here.
                </div>
              </Card>
            ) : (
              <Card className="p-3">
                {items.map((n) => {
                  const sold = n.kind === "trade_sold";
                  const m = n.meta || {};
                  const clickable = !!m.listing_id;
                  return (
                    <button
                      key={n.id}
                      disabled={!clickable}
                      onClick={() => openTrade(n)}
                      className="flex w-full items-start gap-3 border-b border-white/5 py-3 text-left last:border-0 active:opacity-70"
                    >
                      {m.card ? (
                        <PlayingCard card={m.card} size="sm" design={m.design} />
                      ) : (
                        <div className="grid size-7 place-items-center rounded-lg bg-secondary">
                          <Bell className="size-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {sold ? (
                            <TrendingUp className="size-3.5 shrink-0 text-win" />
                          ) : (
                            <TrendingDown className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate text-sm font-semibold">
                            {n.title}
                          </span>
                          {!n.read && (
                            <span className="size-1.5 shrink-0 rounded-full bg-gold" />
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          {n.body}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {n.at ? new Date(n.at).toLocaleString() : ""}
                        </div>
                      </div>
                      {m.price ? (
                        <span
                          className={`flex shrink-0 items-center gap-1 text-sm font-bold ${
                            sold ? "text-win" : "text-muted-foreground"
                          }`}
                        >
                          {m.currency === "gems" ? (
                            <Gem className="size-3.5 text-gem" />
                          ) : (
                            <Coins className="size-3.5 text-gold" />
                          )}
                          {m.currency === "gems" ? m.price : fmt(m.price)}
                        </span>
                      ) : null}
                      {clickable && (
                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </Card>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <TradeSheet
        trade={trade}
        onClose={() => setTrade(null)}
        onUser={(id) => {
          setTrade(null);
          openUser(id);
        }}
      />
    </Ctx.Provider>
  );
}

/** The bell itself — a dot, not a count: "you have something new" is the signal. */
export function NotificationBell() {
  const { unread, open } = useNotifications();
  return (
    <button
      onClick={open}
      className="relative grid size-9 shrink-0 place-items-center rounded-full bg-card active:scale-95"
      aria-label="Notifications"
    >
      <Bell className="size-4.5 text-muted-foreground" />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gold ring-2 ring-background" />
      )}
    </button>
  );
}
