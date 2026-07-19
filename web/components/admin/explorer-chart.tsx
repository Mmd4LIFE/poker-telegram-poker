"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Lightweight, dependency-free SVG charts for the data explorer. Palette is the
   validated dark categorical set (blue/green/magenta/yellow/aqua/orange/violet/red),
   assigned in fixed order so a series keeps its colour as the count changes. */

export type Viz = { type: string; x?: string; y?: string[] };

export const VIZ_TYPES = ["table", "column", "bar", "line", "area", "combo", "pie"] as const;

// fixed-order categorical palette (dark surface), CVD-checked
const SERIES = ["#3987e5", "#199e70", "#d55181", "#c98500", "#9085e9", "#d95926", "#e66767", "#008300"];
const AXIS = "#8b90a0";
const GRID = "rgba(255,255,255,0.08)";

function nf(v: number): string {
  if (v == null || isNaN(v)) return "0";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  if (!Number.isInteger(v)) return v.toFixed(2);
  return String(v);
}

function niceScale(max: number, min = 0) {
  if (max === min) max = min + 1;
  const range = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(range / 4)));
  const err = (range / 4) / step;
  const mult = err >= 5 ? 10 : err >= 2 ? 5 : err >= 1 ? 2 : 1;
  const s = mult * step;
  const niceMin = Math.floor(min / s) * s;
  const niceMax = Math.ceil(max / s) * s;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + 1e-9; t += s) ticks.push(t);
  return { min: niceMin, max: niceMax, ticks };
}

/** Auto-pick a sensible default viz from a result. */
export function autoViz(data: any): Viz {
  if (!data?.columns?.length) return { type: "table" };
  const cols: string[] = data.columns;
  const ct: Record<string, string> = data.coltypes || {};
  const numeric = (c: string) =>
    ct[c] === "number" ||
    (ct[c] === undefined && data.rows?.length && typeof data.rows[0][c] === "number");
  const nums = cols.filter(numeric);
  const dims = cols.filter((c) => !numeric(c));
  if (data.aggregated && dims.length && nums.length) {
    return { type: "column", x: dims[0], y: nums.slice(0, 3) };
  }
  return { type: "table" };
}

export function Chart({ data, viz }: { data: any; viz: Viz }) {
  if (!data) return null;
  if (viz.type === "table") return null; // table handled by the caller's grid
  const x = viz.x!;
  const ys = (viz.y || []).filter(Boolean);
  if (!x || ys.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Pick an X dimension and at least one measure.
      </div>
    );
  }
  const rows = (data.rows || []).slice(0, 30);
  const cats = rows.map((r: any) => String(r[x] ?? "∅"));
  const series = ys.map((col) => rows.map((r: any) => Number(r[col]) || 0));

  if (viz.type === "pie") return <Pie cats={cats} vals={series[0]} label={ys[0]} />;

  // shared cartesian frame
  const W = 340, H = 210, ml = 42, mr = 10, mt = 10, mb = 34;
  const pw = W - ml - mr, ph = H - mt - mb;
  const allVals = series.flat();
  const rawMax = Math.max(1, ...allVals);
  const rawMin = Math.min(0, ...allVals);
  const sc = niceScale(rawMax, rawMin);
  const y = (v: number) => mt + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
  const catW = pw / Math.max(1, cats.length);

  const isBars = viz.type === "column" || (viz.type === "combo");
  const barSeries = viz.type === "combo" ? [series[0]] : series;
  const lineSeries =
    viz.type === "line" || viz.type === "area"
      ? series
      : viz.type === "combo"
        ? series.slice(1)
        : [];

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
        {/* gridlines + y labels */}
        {sc.ticks.map((t, i) => (
          <g key={i}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={ml - 4} y={y(t) + 3} textAnchor="end" fontSize={8} fill={AXIS}>{nf(t)}</text>
          </g>
        ))}
        {/* zero baseline */}
        <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke={AXIS} strokeWidth={1} opacity={0.4} />

        {/* horizontal bars variant — categories run DOWN, so slot by plot height */}
        {viz.type === "bar"
          ? cats.map((c: string, i: number) => {
              const rowH = ph / Math.max(1, cats.length);
              const bh = (rowH * 0.7) / series.length;
              return series.map((s, si) => {
                const v = s[i];
                const yTop = mt + i * rowH + rowH * 0.15 + si * bh;
                const x0 = ml;
                const len = ((v - Math.max(0, sc.min)) / (sc.max - sc.min)) * pw;
                return (
                  <rect key={`${i}-${si}`} x={x0} y={yTop} width={Math.max(0, len)} height={bh - 1}
                    rx={2} fill={SERIES[si % SERIES.length]}>
                    <title>{`${c} · ${ys[si]}: ${nf(v)}`}</title>
                  </rect>
                );
              });
            })
          : null}

        {/* vertical bars (column / combo bar part) */}
        {isBars &&
          cats.map((c: string, i: number) => {
            const groupW = catW * 0.72;
            const bw = groupW / barSeries.length;
            const x0 = ml + i * catW + (catW - groupW) / 2;
            return barSeries.map((s, si) => {
              const v = s[i];
              const yv = y(Math.max(0, v));
              const y0 = y(Math.min(0, v));
              return (
                <rect key={`${i}-${si}`} x={x0 + si * bw} y={Math.min(yv, y(0))} width={bw - 1.5}
                  height={Math.abs(y0 - yv) || 0.5} rx={2} fill={SERIES[si % SERIES.length]}>
                  <title>{`${c} · ${ys[si]}: ${nf(v)}`}</title>
                </rect>
              );
            });
          })}

        {/* lines / area */}
        {lineSeries.map((s, si) => {
          const idx = viz.type === "combo" ? si + 1 : si;
          const color = SERIES[idx % SERIES.length];
          const pts = s.map((v: number, i: number) => `${ml + i * catW + catW / 2},${y(v)}`);
          const path = "M" + pts.join(" L");
          return (
            <g key={si}>
              {viz.type === "area" && (
                <path d={`${path} L${ml + (s.length - 1) * catW + catW / 2},${y(0)} L${ml + catW / 2},${y(0)} Z`}
                  fill={color} opacity={0.15} />
              )}
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.map((v: number, i: number) => (
                <circle key={i} cx={ml + i * catW + catW / 2} cy={y(v)} r={2.5} fill={color}>
                  <title>{`${cats[i]} · ${ys[idx]}: ${nf(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {/* x labels (only for cartesian, thinned to fit) */}
        {viz.type !== "bar" &&
          cats.map((c: string, i: number) => {
            const every = Math.ceil(cats.length / 8);
            if (i % every !== 0) return null;
            return (
              <text key={i} x={ml + i * catW + catW / 2} y={H - mb + 12} textAnchor="middle"
                fontSize={8} fill={AXIS}>
                {c.length > 7 ? c.slice(0, 6) + "…" : c}
              </text>
            );
          })}
        {viz.type === "bar" &&
          cats.map((c: string, i: number) => {
            const rowH = ph / Math.max(1, cats.length);
            return (
              <text key={i} x={ml - 4} y={mt + i * rowH + rowH / 2 + 3} textAnchor="end" fontSize={7} fill={AXIS}>
                {c.length > 7 ? c.slice(0, 6) + "…" : c}
              </text>
            );
          })}
      </svg>

      {/* legend (>=2 series) */}
      {ys.length > 1 && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1">
          {ys.map((col, i) => (
            <span key={col} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="size-2 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              {col}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Pie({ cats, vals, label }: { cats: string[]; vals: number[]; label: string }) {
  const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const R = 70, cx = 90, cy = 90;
  let acc = 0;
  const slices = vals.map((v, i) => {
    const frac = Math.max(0, v) / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)];
    const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
    return { d: `M${cx},${cy} L${p0[0]},${p0[1]} A${R},${R} 0 ${large} 1 ${p1[0]},${p1[1]} Z`, frac, i };
  });
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 180 180" className="h-40 w-40 shrink-0">
        {slices.map((s) => (
          <path key={s.i} d={s.d} fill={SERIES[s.i % SERIES.length]} stroke="#171a21" strokeWidth={1.5}>
            <title>{`${cats[s.i]}: ${nf(vals[s.i])} (${Math.round(s.frac * 100)}%)`}</title>
          </path>
        ))}
      </svg>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
        {cats.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <span className="size-2 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate">{c}</span>
            <span className="tabular-nums text-muted-foreground">{nf(vals[i])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Field pickers for the viz (type, X, measures). */
export function VizPicker({
  data, viz, onChange,
}: {
  data: any; viz: Viz; onChange: (v: Viz) => void;
}) {
  const cols: string[] = data?.columns || [];
  const ct: Record<string, string> = data?.coltypes || {};
  const numeric = (c: string) =>
    ct[c] === "number" ||
    (ct[c] === undefined && data?.rows?.length && typeof data.rows[0][c] === "number");
  const nums = cols.filter(numeric);
  const dims = cols;

  return (
    <div className="space-y-2">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {VIZ_TYPES.map((t) => (
          <button key={t} onClick={() => onChange({ ...viz, type: t })}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold capitalize ${
              viz.type === t ? "bg-gold text-black" : "bg-secondary text-muted-foreground"
            }`}>
            {t}
          </button>
        ))}
      </div>
      {viz.type !== "table" && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">X</span>
          <select value={viz.x || ""} onChange={(e) => onChange({ ...viz, x: e.target.value })}
            className="rounded-lg border border-white/10 bg-secondary px-2 py-1 text-xs">
            <option value="">column…</option>
            {dims.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-muted-foreground">Y</span>
          <div className="flex flex-wrap gap-1">
            {nums.map((c) => {
              const on = (viz.y || []).includes(c);
              return (
                <button key={c}
                  onClick={() => {
                    const y = new Set(viz.y || []);
                    if (on) y.delete(c); else y.add(c);
                    onChange({ ...viz, y: [...y] });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    on ? "bg-gold text-black" : "bg-secondary text-muted-foreground"
                  }`}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
