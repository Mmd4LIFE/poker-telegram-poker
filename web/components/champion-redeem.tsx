"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { notify } from "@/lib/telegram";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayingCard } from "@/components/table/playing-card";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];

/* Spend League Shards to mint the exclusive Champion skin onto a card you choose.
   Shared by the League tab and the Shop so both spend shards the same way. */
export function ChampionRedeemDialog({
  open,
  onOpenChange,
  shards,
  per,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shards: number;
  per: number;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function redeem(card: string) {
    setBusy(true);
    try {
      await api.redeemShards(card);
      toast.success("Champion skin minted!");
      notify("success");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redeem a Champion skin</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Costs <b className="text-gold">{per} shards</b> — you have{" "}
          <b className="text-foreground">{shards}</b>. Pick the card to wear it.
        </p>
        <div className="mt-2 max-h-[60vh] space-y-1.5 overflow-y-auto">
          {SUITS.map((s) => (
            <div key={s} className="flex flex-wrap gap-1">
              {RANKS.map((r) => {
                const card = r + s;
                return (
                  <button
                    key={card}
                    disabled={busy}
                    onClick={() => redeem(card)}
                    className="transition active:scale-90 disabled:opacity-40"
                  >
                    <PlayingCard card={card} size="sm" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
