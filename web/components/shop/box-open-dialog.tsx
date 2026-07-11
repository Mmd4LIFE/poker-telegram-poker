"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Gem, Sparkles, Package } from "lucide-react";
import { api, fmt } from "@/lib/api";
import { notify, haptic } from "@/lib/telegram";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIER_GLOW: Record<string, string> = {
  common: "#9aa7b8aa",
  rare: "#3fa9ffcc",
  epic: "#a06bffcc",
  legendary: "#f5c518cc",
};
const TIER_LABEL: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export function BoxOpenDialog({
  box,
  onDone,
  onClose,
}: {
  box: any | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"opening" | "revealed" | "error">("opening");
  const [reward, setReward] = useState<any>(null);
  const [err, setErr] = useState("");
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!box) {
      setPhase("opening");
      setReward(null);
      setErr("");
      startedFor.current = null;
      return;
    }
    if (startedFor.current === box.code) return;
    startedFor.current = box.code;
    setPhase("opening");
    haptic("medium");
    const payGems = box.price_gems && !box.price_coins;
    const t0 = Date.now();
    api
      .openBox(box.code, payGems ? "gems" : "coins")
      .then((r: any) => {
        const wait = Math.max(0, 1500 - (Date.now() - t0));
        setTimeout(() => {
          setReward(r.reward);
          setPhase("revealed");
          notify("success");
          haptic("heavy");
          onDone();
        }, wait);
      })
      .catch((e) => {
        setErr(e.message);
        setPhase("error");
      });
  }, [box, onDone]);

  const glow = TIER_GLOW[box?.tier] || TIER_GLOW.common;

  return (
    <Dialog open={!!box} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-white/10">
        <DialogTitle className="sr-only">Opening {box?.name}</DialogTitle>
        <div
          className="flex flex-col items-center py-6 text-center"
          style={{ ["--pcm-glow" as any]: glow }}
        >
          {phase === "error" ? (
            <>
              <Package className="size-14 text-muted-foreground" />
              <p className="mt-3 font-semibold">Couldn&apos;t open</p>
              <p className="text-sm text-muted-foreground">{err}</p>
              <Button className="mt-4 w-full" onClick={onClose}>
                Close
              </Button>
            </>
          ) : phase === "opening" ? (
            <>
              <div className="relative grid size-28 place-items-center">
                <div className="pcm-rays absolute inset-[-30%] opacity-40"
                  style={{ background: `conic-gradient(from 0deg, transparent, ${glow}, transparent, ${glow}, transparent)`, borderRadius: "9999px" }} />
                <div className="pcm-shake grid size-24 place-items-center rounded-2xl bg-secondary pcm-glow text-6xl">
                  {box?.icon || "📦"}
                </div>
              </div>
              <p className="mt-5 font-bold">Opening {box?.name}…</p>
              <p className="text-xs text-muted-foreground">{TIER_LABEL[box?.tier] || ""} chest</p>
            </>
          ) : (
            <>
              <div className="pcm-pop relative grid size-32 place-items-center">
                <div className="pcm-rays absolute inset-[-40%] opacity-50"
                  style={{ background: `conic-gradient(from 0deg, transparent, ${glow}, transparent, ${glow}, transparent)`, borderRadius: "9999px" }} />
                <div
                  className="grid size-28 place-items-center rounded-3xl pcm-glow"
                  style={{ background: "var(--card)" }}
                >
                  {reward?.type === "avatar" ? (
                    <span className="text-6xl">{reward.value}</span>
                  ) : reward?.type === "gems" ? (
                    <Gem className="size-14 text-gem" />
                  ) : (
                    <Coins className="size-14 text-gold" />
                  )}
                </div>
              </div>
              <div className="mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider" style={{ color: glow }}>
                <Sparkles className="size-3.5" /> You won
              </div>
              <div className="mt-1 text-2xl font-extrabold">
                {reward?.type === "coins"
                  ? `${fmt(reward.amount)} coins`
                  : reward?.type === "gems"
                    ? `${reward.amount} gems`
                    : reward?.label || "New avatar"}
              </div>
              {reward?.type === "avatar" && (
                <div className="text-sm text-muted-foreground">Equipped automatically</div>
              )}
              <Button className="mt-5 w-full font-bold" onClick={onClose}>
                Awesome!
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
