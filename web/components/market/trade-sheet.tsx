"use client";

/* Trade detail — shown as a bottom sheet from the market AND from a notification,
   so it lives here rather than inside either screen. */
import { ChevronRight, Coins, Copy, Flame, Gem, Hash } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "@/lib/api";
import { RARITY_COLOR, useSkins, type Design } from "@/lib/skins";
import { PlayingCard } from "@/components/table/playing-card";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function Price({ coins, gems }: { coins?: number; gems?: number }) {
  if (gems)
    return (
      <span className="flex items-center gap-1 font-bold">
        <Gem className="size-3.5 text-gem" /> {gems}
      </span>
    );
  return (
    <span className="flex items-center gap-1 font-bold">
      <Coins className="size-3.5 text-gold" /> {fmt(coins || 0)}
    </span>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2.5 last:border-0">
      <span className="text-[11px] uppercase text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/* ---- one trade, as a bottom sheet (same gesture as tapping a player) ---- */

export function Party({
  label,
  p,
  onUser,
}: {
  label: string;
  p: any;
  onUser: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 py-2.5 last:border-0">
      <span className="w-14 text-[11px] uppercase text-muted-foreground">{label}</span>
      {p ? (
        <button
          onClick={() => onUser(p.id)}
          className="flex min-w-0 flex-1 items-center gap-2 active:opacity-70"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-secondary text-gold">
              <AvatarIcon code={p.avatar} className="size-3.5" />
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-semibold">{p.name}</span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <span className="flex-1 text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

export function TradeSheet({
  trade: t,
  onClose,
  onUser,
}: {
  trade: any;
  onClose: () => void;
  onUser: (id: number) => void;
}) {
  const { designs } = useSkins();
  if (!t) return null;
  const d: Design | undefined = designs[t.design];

  return (
    <Sheet open={!!t} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Trade</SheetTitle>
        </SheetHeader>

        {/* SheetContent has no horizontal padding of its own — the body supplies it,
            same as the player sheet. Without this the card art gets clipped. */}
        <div className="px-4 pb-6">
          <div className="flex flex-col items-center text-center">
            <PlayingCard card={t.card} size="xl" design={t.design} />
            <div className="mt-2 text-xl font-extrabold">
              {t.design_name || d?.name}
            </div>
            <div
              className={`text-[10px] font-bold uppercase ${RARITY_COLOR[t.rarity]}`}
            >
              {t.rarity}
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">
                #{t.serial}
                {t.mint ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    / {fmt(t.mint)}
                  </span>
                ) : null}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  t.side === "sold"
                    ? "bg-win/20 text-win"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {t.side}
              </span>
            </div>
            {t.uid && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(t.uid);
                  toast("Item ID copied");
                }}
                className="mt-2 flex items-center gap-1 font-mono text-[11px] text-muted-foreground active:opacity-70"
              >
                <Hash className="size-3" />
                {t.uid}
                <Copy className="size-3" />
              </button>
            )}
          </div>

          <Card className="mt-4 p-4">
            <Party label="Seller" p={t.seller} onUser={onUser} />
            <Party label="Buyer" p={t.buyer} onUser={onUser} />
          </Card>

          <Card className="mt-3 p-4">
            <Row label="Price">
              <Price
                coins={t.currency === "coins" ? t.price : 0}
                gems={t.currency === "gems" ? t.price : 0}
              />
            </Row>
            <Row label="Market fee">
              <span className="flex items-center gap-1 text-sm font-bold text-lose">
                <Flame className="size-3.5" />−
                {t.currency === "coins" ? fmt(t.fee) : t.fee}
              </span>
            </Row>
            <Row label={t.side === "sold" ? "You received" : "Seller received"}>
              <Price
                coins={t.currency === "coins" ? t.net : 0}
                gems={t.currency === "gems" ? t.net : 0}
              />
            </Row>
            <Row label="Date">
              <span className="text-xs text-muted-foreground">
                {t.at ? new Date(t.at).toLocaleString() : "—"}
              </span>
            </Row>
          </Card>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            The fee is burned, not paid to anyone.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
