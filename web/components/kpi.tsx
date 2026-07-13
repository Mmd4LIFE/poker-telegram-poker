"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Formula } from "@/components/formula";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface KpiDoc {
  label: string;
  name: string;
  what: string;
  formula: string;
  read?: string;
}

/** A stat tile you can tap to find out what it actually means. Every number in the
 *  panel is defined and shows its formula — a KPI nobody can explain is decoration. */
export function KpiTile({
  value,
  doc,
  tone,
}: {
  value: React.ReactNode;
  doc: KpiDoc;
  tone?: "win" | "lose";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-lg bg-secondary/60 p-2 text-center active:opacity-70"
      >
        <Info className="absolute right-1 top-1 size-2.5 text-muted-foreground/60" />
        <div
          className={`text-sm font-bold ${
            tone === "win" ? "text-win" : tone === "lose" ? "text-lose" : ""
          }`}
        >
          {value}
        </div>
        <div className="text-[10px] uppercase text-muted-foreground">{doc.label}</div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{doc.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-snug text-muted-foreground">{doc.what}</p>
            <Formula src={doc.formula} />
            {doc.read && (
              <p className="rounded-lg bg-secondary/60 p-2.5 text-[11px] leading-snug text-muted-foreground">
                <b className="text-foreground">How to read it: </b>
                {doc.read}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The radar axes get the same treatment — tap the legend to see the formula. */
export function AxisLegend({
  axes,
  scores,
  docs,
  shrinkage,
}: {
  axes: { key: string; label: string; blurb?: string }[];
  scores: Record<string, number>;
  docs: Record<string, { what: string; formula: string }>;
  shrinkage?: { what: string; formula: string };
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState(false);
  const d = pick ? docs?.[pick] : null;
  const axis = axes.find((a) => a.key === pick);

  return (
    <>
      <div className="mt-2 w-full">
        {axes.map((a) => (
          <button
            key={a.key}
            onClick={() => setPick(a.key)}
            className="flex w-full items-center gap-2 border-b border-white/5 py-1.5 last:border-0 active:opacity-70"
          >
            <Info className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="flex-1 text-left text-[11px] font-semibold uppercase text-muted-foreground">
              {a.label}
            </span>
            <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gold"
                style={{ width: `${scores[a.key] ?? 0}%` }}
              />
            </div>
            <span className="w-7 text-right text-xs font-bold tabular-nums">
              {Math.round(scores[a.key] ?? 0)}
            </span>
          </button>
        ))}
        {shrinkage && (
          <button
            onClick={() => setNote(true)}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/70 active:opacity-70"
          >
            <Info className="size-3" /> why thin samples read neutral
          </button>
        )}
      </div>

      <Dialog open={!!pick} onOpenChange={(o) => !o && setPick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{axis?.label}</DialogTitle>
          </DialogHeader>
          {d && (
            <div className="space-y-3">
              <p className="text-sm leading-snug text-muted-foreground">{d.what}</p>
              <Formula src={d.formula} />
              <p className="text-[11px] text-muted-foreground">
                Every rate above is itself shrunk toward a neutral prior before
                scaling, so a handful of hands can&apos;t spike an axis.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={note} onOpenChange={setNote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why a thin sample reads neutral</DialogTitle>
          </DialogHeader>
          {shrinkage && (
            <div className="space-y-3">
              <p className="text-sm leading-snug text-muted-foreground">
                {shrinkage.what}
              </p>
              <Formula src={shrinkage.formula} />
              <p className="text-[11px] leading-snug text-muted-foreground">
                <b className="text-foreground">n</b> is the evidence behind{" "}
                <i>that axis</i>, not total hands — showdowns are rare, so Hand
                Reading stays cautious long after Aggression has settled.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
