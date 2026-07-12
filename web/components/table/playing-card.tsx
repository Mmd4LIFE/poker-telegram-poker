"use client";

import { cn } from "@/lib/utils";
import { CLASSIC, DEFAULT_DESIGN, useSkins, type Palette } from "@/lib/skins";

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK: Record<string, string> = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };

const DIMS = {
  xs: "w-6 h-9 text-[10px] rounded-[3px]",
  sm: "w-7 h-10 text-xs rounded",
  md: "w-9 h-[52px] text-base rounded-md",
  lg: "w-11 h-16 text-xl rounded-lg",
  xl: "w-16 h-24 text-2xl rounded-xl",
};
export type CardSize = keyof typeof DIMS;

/** Renders a card in a skin. `design` overrides whatever the viewer wears — that's
 *  how an opponent's revealed hole cards show THEIR skin instead of yours. */
export function PlayingCard({
  card,
  size = "md",
  design,
  className,
}: {
  card: string;
  size?: CardSize;
  design?: string;
  className?: string;
}) {
  const { designs, mine } = useSkins();
  const dims = DIMS[size] || DIMS.md;

  if (!card || card === "??") {
    return (
      <div
        className={cn(
          dims,
          "shrink-0 border border-white/10 shadow-md",
          "bg-[repeating-linear-gradient(45deg,#24406b,#24406b_6px,#1b3054_6px,#1b3054_12px)]",
          className,
        )}
      />
    );
  }

  const r = card[0];
  const s = card[1];
  const red = s === "h" || s === "d";
  const code = design || mine[card] || DEFAULT_DESIGN;
  const p: Palette = (designs[code] || CLASSIC).palette || CLASSIC.palette;
  const ink = (red ? p.red : p.fg) || CLASSIC.palette.fg;

  return (
    <div
      className={cn(
        dims,
        "relative flex shrink-0 flex-col items-center justify-center overflow-hidden font-extrabold leading-none shadow-md",
        p.foil && "skin-foil",
        className,
      )}
      style={{
        background: p.bg || "#fff",
        color: ink,
        border: `1px solid ${p.border || "rgba(0,0,0,.15)"}`,
        boxShadow: p.glow || undefined,
      }}
    >
      <span className="relative z-10">{RANK[r] || r}</span>
      <span
        className={cn(
          "relative z-10",
          size === "sm" || size === "xs" ? "text-[11px]" : "text-sm",
        )}
      >
        {SUIT[s]}
      </span>
    </div>
  );
}

export function CardRow({
  cards,
  size,
  design,
  skins,
}: {
  cards: string[];
  size?: CardSize;
  /** force one design on every card (shop/market previews) */
  design?: string;
  /** {card: design} — renders an opponent's hand in THEIR skins */
  skins?: Record<string, string>;
}) {
  return (
    <div className="flex gap-1.5">
      {cards.map((c, i) => (
        <PlayingCard key={i} card={c} size={size} design={design || skins?.[c]} />
      ))}
    </div>
  );
}
