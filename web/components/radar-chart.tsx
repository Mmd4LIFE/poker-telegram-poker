"use client";

/* Poker DNA radar. Hand-rolled SVG — a charting library would be several hundred KB
   for one heptagon, and this Mini App loads over a Telegram webview. */

export interface Axis {
  key: string;
  label: string;
  blurb?: string;
}

export function RadarChart({
  axes,
  scores,
  compare,
  size = 260,
  confidence = 1,
}: {
  axes: Axis[];
  scores: Record<string, number>;
  /** optional second ring (e.g. the average player) drawn behind */
  compare?: Record<string, number>;
  size?: number;
  /** 0..1 — a thin sample draws a fainter shape rather than pretending to certainty */
  confidence?: number;
}) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = size / 2 - 34; // room for the labels

  // start at 12 o'clock and go clockwise
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const at = (i: number, v: number) => {
    const rad = (Math.max(0, Math.min(100, v)) / 100) * r;
    return [cx + rad * Math.cos(angle(i)), cy + rad * Math.sin(angle(i))] as const;
  };
  const poly = (vals: Record<string, number>) =>
    axes.map((a, i) => at(i, vals[a.key] ?? 0).join(",")).join(" ");

  const rings = [25, 50, 75, 100];

  return (
    <svg width={size} height={size + 8} viewBox={`0 0 ${size} ${size + 8}`}>
      {/* web */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={axes
            .map((_, i) => at(i, ring).join(","))
            .join(" ")}
          fill="none"
          stroke="currentColor"
          className="text-white/10"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = at(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="currentColor"
            className="text-white/10"
            strokeWidth={1}
          />
        );
      })}

      {/* comparison ring */}
      {compare && (
        <polygon
          points={poly(compare)}
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/50"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {/* the player */}
      <polygon
        points={poly(scores)}
        fill="var(--color-gold)"
        fillOpacity={0.18 + 0.14 * confidence}
        stroke="var(--color-gold)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {axes.map((a, i) => {
        const [x, y] = at(i, scores[a.key] ?? 0);
        return <circle key={a.key} cx={x} cy={y} r={3.5} fill="var(--color-gold)" />;
      })}

      {/* labels */}
      {axes.map((a, i) => {
        const [x, y] = at(i, 122);
        const anchor =
          Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
        return (
          <text
            key={a.key}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-muted-foreground text-[9px] font-bold uppercase tracking-wide"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
