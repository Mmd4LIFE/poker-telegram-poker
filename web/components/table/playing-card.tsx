import { cn } from "@/lib/utils";

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK: Record<string, string> = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };

export function PlayingCard({
  card,
  size = "md",
}: {
  card: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "lg"
      ? "w-11 h-16 text-xl rounded-lg"
      : size === "sm"
        ? "w-7 h-10 text-xs rounded"
        : "w-9 h-[52px] text-base rounded-md";

  if (!card || card === "??") {
    return (
      <div
        className={cn(
          dims,
          "shrink-0 border border-white/10 shadow-md",
          "bg-[repeating-linear-gradient(45deg,#24406b,#24406b_6px,#1b3054_6px,#1b3054_12px)]",
        )}
      />
    );
  }
  const r = card[0], s = card[1];
  const red = s === "h" || s === "d";
  return (
    <div
      className={cn(
        dims,
        "flex shrink-0 flex-col items-center justify-center bg-white font-extrabold leading-none text-neutral-900 shadow-md",
        red && "text-[#d42a3c]",
      )}
    >
      <span>{RANK[r] || r}</span>
      <span className={size === "sm" ? "text-[11px]" : "text-sm"}>{SUIT[s]}</span>
    </div>
  );
}

export function CardRow({ cards, size }: { cards: string[]; size?: "sm" | "md" | "lg" }) {
  return (
    <div className="flex gap-1.5">
      {cards.map((c, i) => (
        <PlayingCard key={i} card={c} size={size} />
      ))}
    </div>
  );
}
