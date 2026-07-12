"use client";

/* Card-skin renderer + the design/palette cache.
 *
 * The backend owns every design's look (a CSS palette), so new skins can ship
 * without a frontend deploy. Designs are fetched once and cached for the session.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface Palette {
  bg?: string;
  fg?: string;
  red?: string;
  border?: string;
  glow?: string;
  foil?: boolean;
}

export interface Design {
  code: string;
  name: string;
  rarity: string;
  palette: Palette;
  mint_per_card: number;
  tradable: boolean;
}

export const DEFAULT_DESIGN = "classic";

/** The look every player starts with. Not minted, not tradable, never sold out. */
export const CLASSIC: Design = {
  code: DEFAULT_DESIGN,
  name: "Classic",
  rarity: "common",
  palette: { bg: "#ffffff", fg: "#171717", red: "#d42a3c", border: "rgba(0,0,0,.15)" },
  mint_per_card: 0,
  tradable: false,
};

export const RARITY_COLOR: Record<string, string> = {
  common: "text-muted-foreground",
  rare: "text-[#3fa9ff]",
  epic: "text-[#a06bff]",
  legendary: "text-gold",
  mythic: "text-[#ff6bd6]",
};
export const RARITY_RING: Record<string, string> = {
  common: "border-white/10",
  rare: "border-[#3fa9ff]/50",
  epic: "border-[#a06bff]/50",
  legendary: "border-gold/60",
  mythic: "border-[#ff6bd6]/60",
};

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS = ["s", "h", "d", "c"];
export const SUIT_NAME: Record<string, string> = {
  s: "Spades",
  h: "Hearts",
  d: "Diamonds",
  c: "Clubs",
};

interface SkinCtx {
  designs: Record<string, Design>;
  /** {card: design_code} — what *I* wear. Used for the board and my own hand. */
  mine: Record<string, string>;
  setMine: (m: Record<string, string>) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<SkinCtx>({
  designs: { [DEFAULT_DESIGN]: CLASSIC },
  mine: {},
  setMine: () => {},
  reload: async () => {},
});

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const [designs, setDesigns] = useState<Record<string, Design>>({
    [DEFAULT_DESIGN]: CLASSIC,
  });
  const [mine, setMine] = useState<Record<string, string>>({});

  const reload = async () => {
    try {
      const [d, c] = await Promise.all([
        api.cardDesigns() as Promise<{ designs: Design[] }>,
        api.collection() as Promise<{ cards: { card: string; equipped: string }[] }>,
      ]);
      const map: Record<string, Design> = { [DEFAULT_DESIGN]: CLASSIC };
      for (const x of d.designs) map[x.code] = x;
      setDesigns(map);
      const m: Record<string, string> = {};
      for (const x of c.cards) if (x.equipped !== DEFAULT_DESIGN) m[x.card] = x.equipped;
      setMine(m);
    } catch {
      /* skins are cosmetic — never block the app on them */
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider value={{ designs, mine, setMine, reload }}>{children}</Ctx.Provider>
  );
}

export function useSkins() {
  return useContext(Ctx);
}

export function paletteOf(designs: Record<string, Design>, code?: string): Palette {
  return (designs[code || DEFAULT_DESIGN] || CLASSIC).palette;
}
