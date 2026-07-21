"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database, Table2, Plus, X, ChevronLeft, ChevronRight, ArrowDown, ArrowUp,
  Loader2, Search, Sigma, Code, Save, Play, Trash2, Braces, Pencil, Link2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Chart, VizPicker, autoViz, type Viz } from "@/components/admin/explorer-chart";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* In-app Metabase: browse, build questions (join + filter + summarise), native SQL,
   charts, and saved cards you can open/edit/visualise. Read-only, admin-only. */

const OP_LABEL: Record<string, string> = {
  "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤", between: "between",
  contains: "contains", starts: "starts with", in: "is any of", null: "is empty", notnull: "is not empty",
};
const PAGE = 25;

function fmtCell(v: any): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : "{…}";
  if (typeof v === "string") {
    // trim ISO timestamps to "YYYY-MM-DD HH:MM" (full value stays in the tap popup)
    const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;
  }
  return String(v);
}
const isComplex = (v: any) => v !== null && typeof v === "object";

function ValueDialog({ value, onClose }: { value: any; onClose: () => void }) {
  const pretty = value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm"><Braces className="size-4 text-gold" /> Value</DialogTitle>
        </DialogHeader>
        <button onClick={() => navigator.clipboard?.writeText(pretty).then(() => toast.success("Copied"), () => {})}
          className="self-start text-[10px] font-semibold text-muted-foreground underline">copy</button>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-foreground">{pretty}</pre>
      </DialogContent>
    </Dialog>
  );
}

function ResultsGrid({ data, sort, onSort }: { data: any; sort?: { col: string | null; dir: "asc" | "desc" }; onSort?: (c: string) => void }) {
  const [peek, setPeek] = useState<any>(undefined);
  if (!data) return null;
  return (
    <>
      <div className="no-scrollbar overflow-x-auto">
        <table className="min-w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/10">
              {data.columns.map((c: string) => (
                <th key={c} onClick={() => onSort?.(c)}
                  className={cn("whitespace-nowrap px-2 py-2 font-mono font-bold text-muted-foreground", onSort && "cursor-pointer active:opacity-70")}>
                  <span className="inline-flex items-center gap-1">
                    {c}
                    {sort?.col === c && (sort.dir === "desc" ? <ArrowDown className="size-3 text-gold" /> : <ArrowUp className="size-3 text-gold" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row: any, i: number) => (
              <tr key={i} className="border-b border-white/5">
                {data.columns.map((c: string) => {
                  const v = row[c];
                  return (
                    <td key={c} onClick={() => setPeek({ v })} title="Tap to view"
                      className={cn("max-w-[200px] cursor-pointer truncate whitespace-nowrap px-2 py-1.5 font-mono active:bg-white/5", isComplex(v) && "text-[#7cc4ff]")}>
                      {fmtCell(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={data.columns.length || 1} className="px-2 py-6 text-center text-muted-foreground">No rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {peek !== undefined && <ValueDialog value={peek.v} onClose={() => setPeek(undefined)} />}
    </>
  );
}

function buildCsv(data: any): string {
  const cols: string[] = data.columns;
  const esc = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...data.rows.map((r: any) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/* rasterise an <svg> to a base64 PNG (dark ground so it reads in Telegram) */
function svgToPng(svg: SVGSVGElement): Promise<string> {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 340;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 210;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#171a21";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/* result = viz picker + chart or grid; export goes to the admin's Telegram chat */
function ResultView({ data, viz, setViz, title = "export" }: { data: any; viz: Viz; setViz: (v: Viz) => void; title?: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  if (!data) return null;

  async function send() {
    setSending(true);
    try {
      if (viz.type === "table") {
        await api.explorerSendCsv(title, buildCsv(data));
        toast.success("CSV sent to your Telegram");
      } else {
        const svg = chartRef.current?.querySelector("svg");
        if (!svg) { toast.error("No chart to send"); return; }
        const png = await svgToPng(svg as SVGSVGElement);
        await api.explorerSendImage(title, png);
        toast.success("Chart sent to your Telegram");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="gap-2 overflow-hidden p-0">
      <div className="border-b border-white/10 p-2.5">
        <VizPicker data={data} viz={viz} onChange={setViz} />
      </div>
      {viz.type === "table" ? <ResultsGrid data={data} /> : <div ref={chartRef} className="p-2"><Chart data={data} viz={viz} /></div>}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>{data.rows.length} rows{data.total > data.rows.length ? ` of ${data.total}` : ""}{data.capped ? " (capped)" : ""}</span>
        <button onClick={send} disabled={sending} className="ml-auto flex items-center gap-1 font-semibold text-gold active:opacity-70 disabled:opacity-50">
          {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          {viz.type === "table" ? "Send CSV" : "Send chart"}
        </button>
      </div>
    </Card>
  );
}

function SaveDialog({ open, onClose, onSave, initialName = "", initialDesc = "" }: {
  open: boolean; onClose: () => void; onSave: (n: string, d: string) => Promise<void>; initialName?: string; initialDesc?: string;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(initialName); setDesc(initialDesc); } }, [open, initialName, initialDesc]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Save question</DialogTitle></DialogHeader>
        <Input placeholder="Question name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Button disabled={!name.trim() || busy} onClick={async () => { setBusy(true); try { await onSave(name.trim(), desc.trim()); onClose(); } finally { setBusy(false); } }}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ main ============================ */
export function AdminData() {
  const [view, setView] = useState<"home" | "browse" | "build" | "native" | "card">("home");
  const [meta, setMeta] = useState<any>(null);
  const [cards, setCards] = useState<any[] | null>(null);
  const [openCard, setOpenCard] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null); // a card being edited
  const [seedSql, setSeedSql] = useState<string | null>(null); // builder → native handoff

  const loadCards = useCallback(() => api.explorerCards().then((r: any) => setCards(r.cards)).catch(() => setCards([])), []);
  useEffect(() => { api.explorerTables().then(setMeta).catch(() => {}); loadCards(); }, [loadCards]);

  if (!meta) return <Loader2 className="mx-auto mt-8 size-6 animate-spin text-gold" />;

  const home = () => { setView("home"); setEditing(null); setSeedSql(null); loadCards(); };

  if (view === "browse") return <Browse meta={meta} onBack={home} />;
  if (view === "build")
    return <Builder meta={meta} editing={editing} onBack={home} onSaved={home}
      onToSql={(sql: string) => { setEditing(null); setSeedSql(sql); setView("native"); }} />;
  if (view === "native")
    return <Native meta={meta} editing={editing} seedSql={seedSql} onBack={home} onSaved={home} />;
  if (view === "card" && openCard)
    return (
      <CardDetail
        card={openCard}
        onBack={home}
        onDeleted={home}
        onEdit={(c: any) => { setEditing(c); setView(c.kind === "native" ? "native" : "build"); }}
      />
    );

  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <ActionTile icon={Sigma} label="New question" onClick={() => { setEditing(null); setView("build"); }} />
        <ActionTile icon={Code} label="Native SQL" onClick={() => { setEditing(null); setView("native"); }} />
        <ActionTile icon={Database} label="Browse data" onClick={() => setView("browse")} />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-extrabold">Saved questions</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{cards?.length ?? 0}</span>
      </div>
      {!cards ? (
        <Loader2 className="mx-auto mt-4 size-5 animate-spin text-gold" />
      ) : cards.length === 0 ? (
        <Card className="items-center gap-1 p-6 text-center">
          <Sigma className="size-6 text-muted-foreground" />
          <div className="text-sm font-semibold">No saved questions yet</div>
          <div className="text-xs text-muted-foreground">Build one or write SQL, then save it.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <button key={c.id} onClick={() => { setOpenCard(c); setView("card"); }} className="block w-full text-left">
              <Card className="flex-row items-center gap-3 p-3 active:scale-[0.99]">
                {c.kind === "native" ? <Code className="size-4 shrink-0 text-[#7cc4ff]" /> : <Sigma className="size-4 shrink-0 text-gold" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{c.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.description || (c.kind === "native" ? "native SQL" : c.spec?.table)}
                    {c.viz?.type && c.viz.type !== "table" ? ` · ${c.viz.type}` : ""}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Card>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ActionTile({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="active:scale-[0.97]">
      <Card className="items-center gap-1.5 p-3 text-center"><Icon className="size-6 text-gold" /><span className="text-[11px] font-bold leading-tight">{label}</span></Card>
    </button>
  );
}

/* ============================ card detail ============================ */
function CardDetail({ card, onBack, onDeleted, onEdit }: { card: any; onBack: () => void; onDeleted: () => void; onEdit: (c: any) => void }) {
  const [data, setData] = useState<any>(null);
  const [viz, setViz] = useState<Viz>(card.viz?.type ? card.viz : { type: "table" });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.explorerCardRun(card.id)
      .then((d: any) => { setData(d); if (!card.viz?.type) setViz(autoViz(d)); })
      .catch((e) => setErr((e as Error).message));
  }, [card]);

  async function saveViz(v: Viz) {
    setViz(v);
    try { await api.explorerCardUpdate(card.id, { viz: v }); } catch { /* best effort */ }
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><ChevronLeft className="size-4" /> Questions</button>
        <span className="ml-1 min-w-0 flex-1 truncate text-sm font-extrabold">{card.name}</span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(card)}><Pencil className="size-3.5" /> Edit</Button>
        <button onClick={async () => { await api.explorerCardDelete(card.id); onDeleted(); }}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-white/5"><Trash2 className="size-3.5" /></button>
      </div>
      {card.description && <p className="mb-2 text-xs text-muted-foreground">{card.description}</p>}
      {err ? (
        <Card className="p-4 text-sm text-lose">{err}</Card>
      ) : !data ? (
        <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />
      ) : (
        <ResultView data={data} viz={viz} setViz={saveViz} title={card.name} />
      )}
    </>
  );
}

/* ============================ browse ============================ */
function Browse({ meta, onBack }: { meta: any; onBack: () => void }) {
  const [table, setTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [filters, setFilters] = useState<any[]>([]);
  const [sort, setSort] = useState<{ col: string | null; dir: "asc" | "desc" }>({ col: null, dir: "desc" });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const cur = meta?.tables?.find((t: any) => t.name === table);

  const run = useCallback(async (t: string, f: any[], s: any, off: number) => {
    setBusy(true);
    try { setData(await api.explorerQuery({ table: t, filters: f.filter((x) => x.col), sort: s.col, dir: s.dir, limit: PAGE, offset: off })); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }, []);

  function openTable(name: string) { setTable(name); setFilters([]); setSort({ col: null, dir: "desc" }); setOffset(0); setData(null); run(name, [], { col: null, dir: "desc" }, 0); }
  function toggleSort(col: string) { const next = sort.col === col ? { col, dir: sort.dir === "desc" ? "asc" : "desc" } as const : { col, dir: "desc" } as const; setSort(next); if (table) run(table, filters, next, offset); }
  function page(dir: number) { if (!table || !data) return; const next = Math.max(0, offset + dir * PAGE); if (next >= data.total) return; setOffset(next); run(table, filters, sort, next); }

  if (!table) {
    const list = meta.tables.filter((t: any) => t.name.includes(tableSearch.toLowerCase()));
    return (
      <>
        <BackBar onBack={onBack} title="Browse data" note={`${meta.tables.length} tables`} />
        <div className="relative mb-3"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Find a table" className="pl-9" /></div>
        {[
          { key: "analytics", label: "Analytics", icon: Sigma, tint: "text-[#7cc4ff]", ring: "border-[#7cc4ff]/30" },
          { key: "public", label: "App data", icon: Database, tint: "text-muted-foreground", ring: "" },
        ].map((grp) => {
          const group = list.filter((t: any) => (t.schema || "public") === grp.key);
          if (!group.length) return null;
          const Icon = grp.icon;
          return (
            <div key={grp.key} className="mb-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <Icon className={cn("size-3.5", grp.tint)} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{grp.label}</span>
                <span className="text-[10px] text-muted-foreground">{group.length}</span>
                {grp.key === "analytics" && (
                  <span className="ml-1 rounded bg-[#7cc4ff]/15 px-1 text-[9px] font-semibold text-[#7cc4ff]">schema: analytics</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.map((t: any) => (
                  <button key={t.name} onClick={() => openTable(t.name)} className="text-left">
                    <Card className={cn("gap-1 border p-3 active:scale-[0.98]", grp.ring)}>
                      <div className="flex items-center gap-1.5">
                        <Table2 className={cn("size-3.5 shrink-0", grp.tint)} />
                        <span className="truncate font-mono text-xs font-bold">{t.name}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{t.rows < 0 ? "—" : t.rows.toLocaleString()} rows · {t.columns.length} cols</div>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  }
  const cols: any[] = cur?.columns ?? [];
  const from = data ? offset + 1 : 0;
  const to = data ? Math.min(offset + PAGE, data.total) : 0;
  return (
    <>
      <BackBar onBack={() => setTable(null)} title={table} note={data ? `${data.total.toLocaleString()} rows` : ""} mono />
      <FilterBuilder meta={meta} base={table} joins={[]} cols={cols} filters={filters} setFilters={setFilters} busy={busy} onRun={() => { setOffset(0); run(table, filters, sort, 0); }} />
      {!data ? <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" /> : (
        <Card className="gap-0 overflow-hidden p-0">
          <ResultsGrid data={data} sort={sort} onSort={toggleSort} />
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">{from}–{to} of {data.total.toLocaleString()}</span>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={offset <= 0 || busy} onClick={() => page(-1)}><ChevronLeft className="size-4" /></Button>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={to >= data.total || busy} onClick={() => page(1)}><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

/* schema-grouped <option>s for a table <select> */
function TableOptions({ tables }: { tables: any[] }) {
  const groups: [string, string][] = [["analytics", "Analytics"], ["public", "App data"]];
  return (
    <>
      {groups.map(([k, label]) => {
        const g = tables.filter((t) => (t.schema || "public") === k);
        if (!g.length) return null;
        return (
          <optgroup key={k} label={label}>
            {g.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

/* assign each join a unique alias so the same table can be joined twice */
function withAliases(base: string, joins: any[]): any[] {
  const used = new Set([base]);
  return joins.map((j) => {
    let a = j.table || "";
    if (a) {
      if (used.has(a)) { let k = 2; while (used.has(`${j.table}_${k}`)) k++; a = `${j.table}_${k}`; }
      used.add(a);
    }
    return { ...j, alias: a };
  });
}

/* qualified column list for filter/group/agg (handles aliased joins) */
function colsFor(meta: any, table: string, joins: any[]): any[] {
  const find = (n: string) => meta.tables.find((t: any) => t.name === n);
  if (!joins.length) return find(table)?.columns ?? [];
  const aj = withAliases(table, joins);
  const out: any[] = [];
  const add = (alias: string, tn: string) =>
    find(tn)?.columns.forEach((c: any) => out.push({ ...c, name: `${alias}.${c.name}` }));
  add(table, table);
  aj.forEach((j) => j.table && add(j.alias, j.table));
  return out;
}

/* map a (possibly alias-qualified) column name back to its real source table + bare
   column, so we can profile it (distinct values / range) on the underlying table. */
function sourceOf(base: string, joins: any[], qualified: string): { table: string; col: string } {
  const dot = qualified.indexOf(".");
  if (dot < 0) return { table: base, col: qualified };
  const alias = qualified.slice(0, dot);
  const col = qualified.slice(dot + 1);
  if (alias === base) return { table: base, col };
  const found = withAliases(base, joins).find((j) => j.alias === alias);
  return { table: found?.table || base, col };
}

/* one-click join suggestions from the relationship graph: every relation that links a
   table already in the query to a new table, in either direction, with keys pre-filled. */
function joinSuggestions(meta: any, base: string, joins: any[]): any[] {
  const rels: any[] = meta.relations || [];
  const inQuery = new Set<string>([base, ...joins.map((j) => j.table).filter(Boolean)]);
  const existing = new Set(joins.map((j) => `${j.table}|${j.left}|${j.right}`));
  const out: any[] = [];
  const push = (table: string, left: string, right: string, via: string, kind: string, card: string) => {
    if (!table || inQuery.has(table)) return; // new tables only; custom join re-adds
    const key = `${table}|${left}|${right}`;
    if (existing.has(key) || out.some((o) => o.key === key)) return;
    out.push({ key, table, left, right, via, kind, card });
  };
  for (const r of rels) {
    const clause = `${r.from_table}.${r.from_col} = ${r.to_table}.${r.to_col}`;
    // cardinality is stated as existing-side → new-side, so the icon reads left-to-right.
    // The FK column's uniqueness decides one-to-one vs many. The PK ("to") side is one.
    if (inQuery.has(r.from_table)) // existing holds the FK → each existing row hits one new row
      push(r.to_table, `${r.from_table}.${r.from_col}`, r.to_col, clause, r.kind, r.from_unique ? "one-to-one" : "many-to-one");
    if (inQuery.has(r.to_table))   // existing is the PK side → one existing row, many new rows
      push(r.from_table, `${r.to_table}.${r.to_col}`, r.from_col, clause, r.kind, r.from_unique ? "one-to-one" : "one-to-many");
  }
  return out;
}

/* crow's-foot cardinality glyph (ER-diagram notation): a spine with a "one" bar or a
   "many" fork at each end. Left end = the data already in your query, right end = the
   table you'd be adding, so it reads left-to-right: e.g. many-to-one = ⪫—┃. */
function CardinalityIcon({ card, className }: { card: string; className?: string }) {
  const [left, right] = card.split("-to-"); // "one" | "many"
  const foot = (endX: number, dir: 1 | -1, many: boolean) =>
    many ? (
      <>
        <line x1={endX} y1={7} x2={endX + dir * 5} y2={2} />
        <line x1={endX} y1={7} x2={endX + dir * 5} y2={7} />
        <line x1={endX} y1={7} x2={endX + dir * 5} y2={12} />
      </>
    ) : (
      <line x1={endX + dir * 3} y1={3} x2={endX + dir * 3} y2={11} />
    );
  return (
    <svg width={22} height={14} viewBox="0 0 22 14" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" className={className}
      role="img" aria-label={card.replace(/-/g, " ")}>
      <line x1={6} y1={7} x2={16} y2={7} />
      {foot(6, -1, left === "many")}
      {foot(16, 1, right === "many")}
    </svg>
  );
}

const opsForType = (meta: any, type?: string): string[] =>
  (type && meta.ops_by_type?.[type]) || meta.operators || [];

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* quick date-range presets for a datetime "between" filter */
function datePresets(): { label: string; lo: string; hi: string }[] {
  const now = new Date();
  const hi = toLocalInput(now);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ago = (days: number) => toLocalInput(new Date(now.getTime() - days * 864e5));
  return [
    { label: "Today", lo: toLocalInput(startOfDay), hi },
    { label: "7d", lo: ago(7), hi },
    { label: "30d", lo: ago(30), hi },
    { label: "Month", lo: toLocalInput(new Date(now.getFullYear(), now.getMonth(), 1)), hi },
  ];
}

/* ---- per-table colour coding ------------------------------------------------
   Each table in the query (base + each join alias) gets a stable colour so the
   qualified column names read at a glance as belonging to a table. */
const TABLE_COLORS = ["#f2b705", "#3e63dd", "#30a46c", "#e5709b", "#7b61ff", "#12a4c9", "#e5484d", "#f2711c"];

function tableColorMap(base: string, joins: any[]): Record<string, string> {
  const map: Record<string, string> = { [base]: TABLE_COLORS[0] };
  withAliases(base, joins).forEach((j, i) => { if (j.alias) map[j.alias] = TABLE_COLORS[(i + 1) % TABLE_COLORS.length]; });
  return map;
}
const aliasOfCol = (base: string, name: string) => { const d = name.indexOf("."); return d < 0 ? base : name.slice(0, d); };
const colColor = (map: Record<string, string>, base: string, name: string) => map[aliasOfCol(base, name)];

/* a column name with its table prefix tinted in that table's colour */
function ColName({ name, color, dim }: { name: string; color?: string; dim?: boolean }) {
  const d = name.indexOf(".");
  if (d < 0) return <span>{name}</span>;
  return (
    <span>
      <span style={dim ? undefined : { color }} className="font-semibold">{name.slice(0, d)}</span>
      <span className="opacity-40">.</span>{name.slice(d + 1)}
    </span>
  );
}

/* a small colour dot for the table a (qualified) column belongs to */
function ColDot({ map, base, name }: { map: Record<string, string>; base: string; name?: string }) {
  const c = name ? colColor(map, base, name) : undefined;
  return <span className="size-2 shrink-0 rounded-full" style={{ background: c || "transparent", boxShadow: c ? "none" : "inset 0 0 0 1px rgba(255,255,255,.15)" }} />;
}

/* =============== pretty SQL generation from a builder spec =============== */
function sqlLit(type: string, v: any): string {
  if (v === null || v === undefined || v === "") return "NULL";
  if (type === "number") return String(v);
  if (type === "bool") return ["true", "1", "yes", "t"].includes(String(v).toLowerCase()) ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function bucketSql(expr: string, bucket: string | undefined): string {
  if (!bucket) return expr;
  const b = String(bucket).toLowerCase();
  if (b === "minute" || b === "hour") return `DATE_TRUNC('${b}', ${expr})`;
  if (["day", "week", "month", "quarter", "year"].includes(b)) return `DATE_TRUNC('${b}', ${expr})::date`;
  if (b === "date") return `${expr}::date`;
  if (b.startsWith("bin:")) { const n = b.slice(4); return `FLOOR(${expr} / ${n}) * ${n}`; }
  return expr;
}
function condSql(f: any, type: string): string {
  const c = f.col;
  switch (f.op) {
    case "null": return `${c} IS NULL`;
    case "notnull": return `${c} IS NOT NULL`;
    case "between": return `${c} BETWEEN ${sqlLit(type, f.val?.[0])} AND ${sqlLit(type, f.val?.[1])}`;
    case "in": {
      const arr = Array.isArray(f.val) ? f.val : String(f.val ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return `${c} IN (${arr.map((v: any) => sqlLit(type, v)).join(", ")})`;
    }
    case "contains": return `CAST(${c} AS VARCHAR) ILIKE ${sqlLit("text", `%${f.val}%`)}`;
    case "starts": return `CAST(${c} AS VARCHAR) ILIKE ${sqlLit("text", `${f.val}%`)}`;
    default: return `${c} ${f.op} ${sqlLit(type, f.val)}`;
  }
}
function qualifyTable(meta: any, table: string): string {
  const s = meta.tables.find((t: any) => t.name === table)?.schema;
  return s && s !== "public" ? `${s}.${table}` : table;
}

/* Build professional, ready-to-run Postgres from a builder spec: uppercase keywords,
   aligned joins, one indented item per line, and an ORDER BY that references the same
   aliases the SELECT introduces. Semantically mirrors the visual-builder query. */
function generateSql(meta: any, spec: any): string {
  const base = spec.table;
  const joins = withAliases(base, spec.joins || []).filter((j: any) => j.table && j.left && j.right);
  const cols = colsFor(meta, base, joins);
  const typeOf = (n: string) => cols.find((c: any) => c.name === n)?.type || "text";
  const aggs = spec.aggregations || [];
  const groups = (spec.group_by || []).map((g: any) => (typeof g === "string" ? { col: g } : g));
  const isAgg = aggs.length > 0;

  const selectItems: string[] = [];
  const groupExprs: string[] = [];
  const sortName: Record<string, string> = {};

  if (isAgg) {
    for (const g of groups) {
      const raw = bucketSql(g.col, g.bucket);
      const alias = g.col.replace(/[.:]/g, "_");
      const needAlias = raw !== g.col || alias !== g.col;
      selectItems.push(needAlias ? `${raw} AS ${alias}` : g.col);
      groupExprs.push(raw);
      sortName[g.col] = alias;
    }
    for (const a of aggs) {
      const alias = a.fn === "count" && !a.col ? "count" : `${a.fn}_${(a.col || "").replace(/[.:]/g, "_")}`;
      const expr = a.fn === "count" && !a.col ? "COUNT(*)"
        : a.fn === "distinct" ? `COUNT(DISTINCT ${a.col})`
        : `${a.fn.toUpperCase()}(${a.col})`;
      selectItems.push(`${expr} AS ${alias}`);
      sortName[alias] = alias;
    }
  } else {
    selectItems.push(`${base}.*`);
    joins.forEach((j: any) => selectItems.push(`${j.alias}.*`));
  }

  const lines: string[] = ["SELECT", selectItems.map((s) => `  ${s}`).join(",\n"), `FROM ${qualifyTable(meta, base)}`];

  const targets = joins.map((j: any) => {
    const name = qualifyTable(meta, j.table);
    return j.alias && j.alias !== j.table ? `${name} AS ${j.alias}` : name;
  });
  const pad = Math.max(0, ...targets.map((t: string) => t.length));
  joins.forEach((j: any, i: number) => {
    const kw = j.type === "inner" ? "INNER JOIN" : "LEFT JOIN";
    lines.push(`${kw} ${targets[i].padEnd(pad)} ON ${j.left} = ${j.alias}.${j.right}`);
  });

  const conds = (spec.filters || []).filter((f: any) => f.col).map((f: any) => condSql(f, typeOf(f.col)));
  if (conds.length) {
    lines.push(`WHERE ${conds[0]}`);
    conds.slice(1).forEach((c: string) => lines.push(`  AND ${c}`));
  }
  if (isAgg && groupExprs.length) lines.push("GROUP BY", groupExprs.map((e) => `  ${e}`).join(",\n"));
  if (spec.sort) lines.push(`ORDER BY ${sortName[spec.sort] || spec.sort} ${(spec.dir || "desc").toUpperCase()}`);
  lines.push(`LIMIT ${spec.limit || 100}`);
  return lines.join("\n") + ";";
}

function SqlDialog({ sql, onClose, onOpenEditor }: { sql: string; onClose: () => void; onOpenEditor: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm"><Code className="size-4 text-[#7cc4ff]" /> Generated SQL</DialogTitle>
        </DialogHeader>
        <pre className="max-h-[52vh] overflow-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed text-foreground">{sql}</pre>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => navigator.clipboard?.writeText(sql).then(() => toast.success("SQL copied"), () => {})}>
            <Braces className="size-4" /> Copy
          </Button>
          <Button className="flex-1" onClick={onOpenEditor}><Code className="size-4" /> Open in SQL editor</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ builder ============================ */
function Builder({ meta, editing, onBack, onSaved, onToSql }: { meta: any; editing: any; onBack: () => void; onSaved: () => void; onToSql: (sql: string) => void }) {
  const init = editing?.kind === "builder" ? editing.spec || {} : {};
  const [table, setTable] = useState<string>(init.table || "");
  const [joins, setJoins] = useState<any[]>(init.joins || []);
  const [filters, setFilters] = useState<any[]>(init.filters || []);
  const [summarize, setSummarize] = useState<boolean>(!!(init.aggregations?.length));
  const [aggs, setAggs] = useState<any[]>(init.aggregations?.length ? init.aggregations : [{ fn: "count", col: "" }]);
  const [groups, setGroups] = useState<any[]>((init.group_by || []).map((g: any) => (typeof g === "string" ? { col: g } : g)));
  const [sortBy, setSortBy] = useState<{ col: string; dir: "asc" | "desc" }>({ col: init.sort || "", dir: init.dir || "desc" });
  const [limit, setLimit] = useState<number>(init.limit || 100);
  const [data, setData] = useState<any>(null);
  const [viz, setViz] = useState<Viz>(editing?.viz?.type ? editing.viz : { type: "table" });
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);

  const colorMap = tableColorMap(table, joins);
  const hasJoins = joins.length > 0;
  const cols = colsFor(meta, table, joins);
  const typeOf = (name: string) => cols.find((c: any) => c.name === name)?.type;
  const aggAlias = (a: any) => (a.fn === "count" && !a.col ? "count" : `${a.fn}_${(a.col || "").replace(/\./g, "_")}`);
  const outNames = summarize ? [...groups.map((g) => g.col), ...aggs.filter((a) => a.fn).map(aggAlias)] : [];

  function spec() {
    return { table,
      joins: withAliases(table, joins).filter((j) => j.table && j.left && j.right),
      filters: filters.filter((x) => x.col), aggregations: summarize ? aggs.filter((a) => a.fn) : [],
      group_by: summarize ? groups : [],
      sort: sortBy.col || undefined, dir: sortBy.dir, limit: Math.max(1, Math.min(500, limit || 100)) };
  }
  async function run() {
    if (!table) return;
    setBusy(true);
    try { const d = await api.explorerQuery(spec()); setData(d); if (!editing?.viz?.type) setViz(autoViz(d)); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function persist(name: string, description: string) {
    const body = { name, description, kind: "builder", spec: spec(), viz };
    if (editing) await api.explorerCardUpdate(editing.id, body); else await api.explorerCardCreate(body);
    toast.success("Saved"); onSaved();
  }

  return (
    <>
      <BackBar onBack={onBack} title={editing ? "Edit question" : "New question"} />
      <Card className="mb-2 gap-2 p-3">
        <label className="text-[11px] font-bold uppercase text-muted-foreground">Data</label>
        <select value={table} onChange={(e) => { setTable(e.target.value); setJoins([]); setFilters([]); setGroups([]); setData(null); }}
          className="rounded-lg border border-white/10 bg-secondary px-2 py-2 text-xs">
          <option value="">choose a table…</option>
          <TableOptions tables={meta.tables} />
        </select>

        {table && (
          <>
            <JoinBuilder meta={meta} base={table} joins={joins} setJoins={setJoins} colorMap={colorMap} />
            {hasJoins && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(colorMap).map(([t, c]) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: c }}>
                    <span className="size-2 rounded-full" style={{ background: c }} /> {t}
                  </span>
                ))}
              </div>
            )}
            <FilterBuilder meta={meta} base={table} joins={joins} cols={cols} filters={filters} setFilters={setFilters} colorMap={colorMap} inline />
            <div className="mt-1 flex items-center gap-2">
              <button onClick={() => setSummarize((v) => !v)}
                className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold", summarize ? "bg-gold text-black" : "bg-secondary text-muted-foreground")}>
                <Sigma className="size-3.5" /> Summarize
              </button>
              <span className="text-[10px] text-muted-foreground">{summarize ? "aggregate + group" : "raw rows"}</span>
            </div>
            {summarize && (
              <div className="space-y-2 rounded-lg bg-black/20 p-2">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Metrics</div>
                {aggs.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select value={a.fn} onChange={(e) => setAggs((xs) => xs.map((x, j) => j === i ? { ...x, fn: e.target.value } : x))}
                      className="rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
                      {meta.aggregations.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    {hasJoins && a.col && <ColDot map={colorMap} base={table} name={a.col} />}
                    <select value={a.col || ""} onChange={(e) => setAggs((xs) => xs.map((x, j) => j === i ? { ...x, col: e.target.value } : x))}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
                      <option value="">{a.fn === "count" ? "all rows" : "column…"}</option>
                      {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    <button onClick={() => setAggs((xs) => xs.filter((_, j) => j !== i))} className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><X className="size-3.5" /></button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="h-7" onClick={() => setAggs((xs) => [...xs, { fn: "sum", col: "" }])}><Plus className="size-3.5" /> Metric</Button>
                <div className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">Group by</div>
                <div className="flex flex-wrap gap-1">
                  {cols.map((c) => {
                    const on = groups.some((g) => g.col === c.name);
                    return <button key={c.name} onClick={() => setGroups((g) => on ? g.filter((x) => x.col !== c.name) : [...g, { col: c.name, bucket: c.type === "datetime" ? "day" : undefined }])}
                      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", on ? "bg-gold text-black" : "bg-secondary text-muted-foreground")}>
                      {hasJoins && !on && <span className="size-1.5 rounded-full" style={{ background: colColor(colorMap, table, c.name) }} />}
                      <ColName name={c.name} color={colColor(colorMap, table, c.name)} dim={on} />
                    </button>;
                  })}
                </div>
                {/* per-column bucketing: datetime → day/week/month…, number → bins */}
                {groups.map((g, i) => {
                  const t = typeOf(g.col);
                  if (t !== "datetime" && t !== "number") return null;
                  const opts = t === "datetime" ? ["", ...(meta.buckets || [])] : ["", "bin:10", "bin:100", "bin:1000", "bin:10000"];
                  return (
                    <div key={g.col} className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate font-mono text-muted-foreground"><ColName name={g.col} color={colColor(colorMap, table, g.col)} /></span>
                      <span className="text-muted-foreground">by</span>
                      <select value={g.bucket || ""} onChange={(e) => setGroups((gs) => gs.map((x, j) => j === i ? { ...x, bucket: e.target.value || undefined } : x))}
                        className="rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[11px]">
                        {opts.map((o) => <option key={o} value={o}>{o === "" ? (t === "datetime" ? "exact" : "raw") : o.startsWith("bin:") ? `bins of ${o.slice(4)}` : o}</option>)}
                      </select>
                    </div>
                  );
                })}

                {/* sort + limit */}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground">Sort</span>
                  <select value={sortBy.col} onChange={(e) => setSortBy((s) => ({ ...s, col: e.target.value }))}
                    className="rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[11px]">
                    <option value="">default</option>
                    {outNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button onClick={() => setSortBy((s) => ({ ...s, dir: s.dir === "desc" ? "asc" : "desc" }))}
                    className="rounded-lg bg-secondary px-2 py-1 text-[11px] font-semibold">{sortBy.dir === "desc" ? "↓ desc" : "↑ asc"}</button>
                  <span className="ml-1 text-muted-foreground">Limit</span>
                  <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-16 rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[11px]" />
                </div>
              </div>
            )}
            <div className="mt-1 flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={run}>{busy ? <Loader2 className="size-4 animate-spin" /> : <><Play className="size-4" /> Run</>}</Button>
              <Button variant="outline" onClick={() => setSqlOpen(true)} title="View SQL"><Code className="size-4" /> SQL</Button>
              {data && <Button variant="outline" onClick={() => setSaveOpen(true)}><Save className="size-4" /> {editing ? "Update" : "Save"}</Button>}
            </div>
          </>
        )}
      </Card>
      <ResultView data={data} viz={viz} setViz={setViz} />
      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={persist} initialName={editing?.name} initialDesc={editing?.description} />
      {sqlOpen && table && (
        <SqlDialog sql={generateSql(meta, spec())} onClose={() => setSqlOpen(false)}
          onOpenEditor={() => { const s = generateSql(meta, spec()); setSqlOpen(false); onToSql(s); }} />
      )}
    </>
  );
}

function JoinBuilder({ meta, base, joins, setJoins, colorMap }: { meta: any; base: string; joins: any[]; setJoins: (j: any) => void; colorMap: Record<string, string> }) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState(false);
  const aliased = withAliases(base, joins);
  const suggestions = joinSuggestions(meta, base, joins);

  const addJoin = (table: string, left: string, right: string) => {
    setJoins((xs: any[]) => [...xs, { table, type: "left", left, right }]);
    setAdding(false);
    setCustom(false);
  };

  return (
    <div className="space-y-1.5">
      {joins.map((j, i) => (
        <JoinRow key={i} meta={meta} base={base} joins={joins} index={i} alias={aliased[i].alias} setJoins={setJoins} colorMap={colorMap} />
      ))}

      {!adding ? (
        <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding(true)}>
          <Link2 className="size-3.5" /> Join data
        </Button>
      ) : (
        <div className="space-y-1.5 rounded-lg bg-black/20 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add related data</span>
            <button onClick={() => { setAdding(false); setCustom(false); }} className="grid size-5 place-items-center rounded text-muted-foreground"><X className="size-3" /></button>
          </div>
          {suggestions.length === 0 && !custom && (
            <div className="text-[11px] text-muted-foreground">No detected relationships — add a custom join.</div>
          )}
          <div className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <button key={s.key} onClick={() => addJoin(s.table, s.left, s.right)}
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1.5 text-left active:scale-[0.99]">
                <CardinalityIcon card={s.card} className="shrink-0 text-gold" />
                <span className="shrink-0 font-mono text-[11px] font-bold">{s.table}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">{s.via}</span>
                <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-bold",
                  s.kind === "fk" ? "bg-win/15 text-win" : "bg-white/5 text-muted-foreground")}
                  title={s.kind === "fk" ? "foreign key" : s.kind === "curated" ? "known relation" : "guessed from name"}>
                  {s.kind === "fk" ? "FK" : s.kind === "curated" ? "REL" : "GUESS"}
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => setCustom((v) => !v)} className="self-start text-[10px] font-semibold text-muted-foreground underline">
            {custom ? "hide custom join" : "custom join…"}
          </button>
          {custom && <CustomJoin meta={meta} base={base} joins={joins} onAdd={addJoin} />}
        </div>
      )}
    </div>
  );
}

/* an existing join, shown as a readable clause; the keys can be revealed + overridden */
function JoinRow({ meta, base, joins, index, alias, setJoins, colorMap }: {
  meta: any; base: string; joins: any[]; index: number; alias: string; setJoins: (j: any) => void; colorMap: Record<string, string>;
}) {
  const j = joins[index];
  const [edit, setEdit] = useState(!(j.left && j.right));
  const patch = (p: any) => setJoins((xs: any[]) => xs.map((x, k) => (k === index ? { ...x, ...p } : x)));
  const jcols = meta.tables.find((t: any) => t.name === j.table)?.columns ?? [];
  const leftCols = colsFor(meta, base, joins.slice(0, index)); // base + earlier joins
  return (
    <div className="rounded-lg bg-black/20 p-2">
      <div className="flex items-center gap-1.5">
        <select value={j.type} onChange={(e) => patch({ type: e.target.value })}
          className="rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[10px]">
          <option value="left">left join</option><option value="inner">inner join</option>
        </select>
        <span className="size-2 shrink-0 rounded-full" style={{ background: colorMap[alias] }} />
        <span className="font-mono text-[11px] font-bold" style={{ color: colorMap[alias] }}>{j.table || "—"}</span>
        {alias && alias !== j.table && (
          <span className="shrink-0 rounded bg-gold/20 px-1 py-0.5 text-[9px] font-bold text-gold" title="join alias">as {alias}</span>
        )}
        <button onClick={() => setEdit((v) => !v)} className="ml-auto grid size-6 place-items-center rounded bg-secondary text-muted-foreground" title="edit keys"><Pencil className="size-3" /></button>
        <button onClick={() => setJoins((xs: any[]) => xs.filter((_: any, k: number) => k !== index))} className="grid size-6 place-items-center rounded bg-secondary text-muted-foreground"><X className="size-3" /></button>
      </div>
      {edit ? (
        <div className="mt-1 flex items-center gap-1 text-[10px]">
          <select value={j.left} onChange={(e) => patch({ left: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1">
            <option value="">left column…</option>
            {leftCols.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <span className="text-muted-foreground">=</span>
          <select value={j.right} onChange={(e) => patch({ right: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1">
            <option value="">{alias || j.table}.column…</option>
            {jcols.map((c: any) => <option key={c.name} value={c.name}>{alias}.{c.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          on <ColName name={j.left} color={colColor(colorMap, base, j.left)} /> = <ColName name={`${alias}.${j.right}`} color={colorMap[alias]} />
        </div>
      )}
    </div>
  );
}

/* manual fallback when no relationship is detected (or you want a non-standard key) */
function CustomJoin({ meta, base, joins, onAdd }: { meta: any; base: string; joins: any[]; onAdd: (t: string, l: string, r: string) => void }) {
  const [table, setTable] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const leftCols = colsFor(meta, base, joins);
  const jcols = meta.tables.find((t: any) => t.name === table)?.columns ?? [];
  return (
    <div className="space-y-1.5 rounded-lg bg-black/20 p-2">
      <select value={table} onChange={(e) => { setTable(e.target.value); setRight(""); }}
        className="w-full rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[11px]">
        <option value="">table…</option>
        <TableOptions tables={meta.tables} />
      </select>
      <div className="flex items-center gap-1 text-[10px]">
        <select value={left} onChange={(e) => setLeft(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1">
          <option value="">left column…</option>
          {leftCols.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <span className="text-muted-foreground">=</span>
        <select value={right} onChange={(e) => setRight(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1">
          <option value="">{table || "table"}.column…</option>
          {jcols.map((c: any) => <option key={c.name} value={c.name}>{table}.{c.name}</option>)}
        </select>
      </div>
      <Button size="sm" variant="outline" className="h-7 w-full" disabled={!table || !left || !right} onClick={() => onAdd(table, left, right)}>
        <Plus className="size-3.5" /> Add join
      </Button>
    </div>
  );
}

/* ============================ native SQL ============================ */
function Native({ meta, editing, seedSql, onBack, onSaved }: { meta: any; editing: any; seedSql?: string | null; onBack: () => void; onSaved: () => void }) {
  const [sql, setSql] = useState(editing?.kind === "native" ? editing.sql : (seedSql || "select * from dim_user limit 20"));
  const [data, setData] = useState<any>(null);
  const [viz, setViz] = useState<Viz>(editing?.viz?.type ? editing.viz : { type: "table" });
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [schema, setSchema] = useState(false);

  async function run() {
    setBusy(true);
    try { const d = await api.explorerSql(sql); setData(d); if (!editing?.viz?.type) setViz(autoViz(d)); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function persist(name: string, description: string) {
    const body = { name, description, kind: "native", sql, viz };
    if (editing) await api.explorerCardUpdate(editing.id, body); else await api.explorerCardCreate(body);
    toast.success("Saved"); onSaved();
  }

  return (
    <>
      <BackBar onBack={onBack} title={editing ? "Edit SQL" : "Native SQL"} />
      <Card className="mb-2 gap-2 p-3">
        <textarea value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} rows={5}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[12px] text-foreground outline-none focus:border-gold/40"
          placeholder="select ... — read-only SELECT / WITH only" />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={run}>{busy ? <Loader2 className="size-4 animate-spin" /> : <><Play className="size-4" /> Run</>}</Button>
          {data && <Button variant="outline" onClick={() => setSaveOpen(true)}><Save className="size-4" /> {editing ? "Update" : "Save"}</Button>}
        </div>
        <button onClick={() => setSchema((v) => !v)} className="self-start text-[10px] font-semibold text-muted-foreground underline">{schema ? "hide" : "show"} tables & columns</button>
        {schema && (
          <div className="no-scrollbar max-h-40 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-2 text-[10px]">
            {meta.tables.map((t: any) => (
              <div key={t.name}><span className="font-mono font-bold text-gold">{t.schema === "analytics" ? "analytics." + t.name : t.name}</span><span className="ml-1 text-muted-foreground">{t.columns.map((c: any) => c.name).join(", ")}</span></div>
            ))}
          </div>
        )}
      </Card>
      <ResultView data={data} viz={viz} setViz={setViz} />
      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={persist} initialName={editing?.name} initialDesc={editing?.description} />
    </>
  );
}

/* ---- shared bits ---- */
function BackBar({ onBack, title, note, mono }: { onBack: () => void; title: string; note?: string; mono?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><ChevronLeft className="size-4" /> Back</button>
      <span className={cn("ml-1 text-sm font-extrabold", mono && "font-mono")}>{title}</span>
      {note && <span className="ml-auto text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function FilterBuilder({ meta, base, joins, cols, filters, setFilters, busy, onRun, inline, colorMap }: {
  meta: any; base: string; joins: any[]; cols: any[]; filters: any[]; setFilters: (f: any) => void; busy?: boolean; onRun?: () => void; inline?: boolean; colorMap?: Record<string, string>;
}) {
  const showDots = !!colorMap && joins.length > 0;
  // profile cache keyed by real source table.column (null = in-flight)
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const typeOf = (name: string) => cols.find((c: any) => c.name === name)?.type || "text";
  const keyOf = (name: string) => { const s = sourceOf(base, joins, name); return `${s.table}.${s.col}`; };

  // lazily profile each filtered column so the value editor can adapt (enum list / range)
  const colKey = filters.map((f) => f.col).filter(Boolean).join("|");
  useEffect(() => {
    filters.forEach((f) => {
      if (!f.col) return;
      const s = sourceOf(base, joins, f.col);
      const key = `${s.table}.${s.col}`;
      setProfiles((p) => {
        if (p[key] !== undefined) return p;
        api.explorerColumnProfile(s.table, s.col)
          .then((pr: any) => setProfiles((q) => ({ ...q, [key]: pr })))
          .catch(() => setProfiles((q) => ({ ...q, [key]: { enum: false } })));
        return { ...p, [key]: null };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKey, base]);

  const setF = (i: number, patch: any) => setFilters((fs: any[]) => fs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pickCol = (i: number, name: string) => {
    const ops = opsForType(meta, typeOf(name));
    setF(i, { col: name, op: ops[0] || "=", val: "" });
  };

  const body = (
    <>
      {filters.map((f, i) => {
        const type = typeOf(f.col);
        const ops = opsForType(meta, type);
        const prof = f.col ? profiles[keyOf(f.col)] : undefined;
        const hasVal = f.col && !["null", "notnull"].includes(f.op);
        return (
          <div key={i} className="rounded-lg bg-black/10 p-1.5">
            <div className="flex items-center gap-1.5">
              {showDots && <ColDot map={colorMap!} base={base} name={f.col || undefined} />}
              <select value={f.col} onChange={(e) => pickCol(i, e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
                <option value="">column…</option>
                {cols.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {f.col && (
                <select value={f.op} onChange={(e) => setF(i, { op: e.target.value, val: e.target.value === "between" ? ["", ""] : "" })}
                  className="rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
                  {ops.map((o: string) => <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>)}
                </select>
              )}
              <button onClick={() => setFilters((fs: any[]) => fs.filter((_: any, j: number) => j !== i))} className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><X className="size-3.5" /></button>
            </div>
            {hasVal && (
              <div className="mt-1.5">
                <FilterValue type={type} op={f.op} profile={prof} value={f.val} onChange={(v: any) => setF(i, { val: v })} />
                {prof === null && <div className="mt-1 text-[9px] text-muted-foreground">reading values…</div>}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8" onClick={() => setFilters((fs: any[]) => [...fs, { col: "", op: "=", val: "" }])}><Plus className="size-3.5" /> Filter</Button>
        {onRun && <Button size="sm" className="h-8 flex-1" disabled={busy} onClick={onRun}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Run"}</Button>}
      </div>
    </>
  );
  if (inline) return <div className="space-y-2">{body}</div>;
  return <Card className="mb-2 gap-2 p-3">{body}</Card>;
}

/* type-aware value editor: date/number range, enum pick-list, boolean, or plain input */
function FilterValue({ type, op, profile, value, onChange }: {
  type: string; op: string; profile: any; value: any; onChange: (v: any) => void;
}) {
  const enumVals: any[] | null = profile && profile.enum ? profile.values : null;
  const cls = "h-8 w-full min-w-0 rounded-lg border border-white/10 bg-secondary px-2 text-xs";

  if (op === "between") {
    const arr = Array.isArray(value) ? value : ["", ""];
    const set = (k: number, v: string) => onChange(k === 0 ? [v, arr[1] ?? ""] : [arr[0] ?? "", v]);
    const itype = type === "datetime" ? "datetime-local" : "number";
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input type={itype} value={arr[0] ?? ""} onChange={(e) => set(0, e.target.value)} className={cls} />
          <span className="shrink-0 text-[10px] text-muted-foreground">to</span>
          <input type={itype} value={arr[1] ?? ""} onChange={(e) => set(1, e.target.value)} className={cls} />
        </div>
        {type === "datetime" && (
          <div className="flex flex-wrap gap-1">
            {datePresets().map((p) => (
              <button key={p.label} onClick={() => onChange([p.lo, p.hi])}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground active:bg-white/10">{p.label}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (op === "in") {
    if (enumVals) {
      const sel: any[] = Array.isArray(value) ? value : [];
      const toggle = (v: any) => onChange(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
      return (
        <div className="flex flex-wrap gap-1">
          {enumVals.map((v) => (
            <button key={String(v)} onClick={() => toggle(v)}
              className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", sel.includes(v) ? "bg-gold text-black" : "bg-secondary text-muted-foreground")}>
              {v === null ? "∅" : String(v)}
            </button>
          ))}
        </div>
      );
    }
    return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="a, b, c" className={cls} />;
  }

  if (type === "bool") {
    return (
      <select value={String(value ?? "true")} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="true">true</option><option value="false">false</option>
      </select>
    );
  }
  if (enumVals && (op === "=" || op === "!=")) {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">choose…</option>
        {enumVals.map((v) => <option key={String(v)} value={String(v)}>{v === null ? "∅" : String(v)}</option>)}
      </select>
    );
  }
  if (type === "datetime") return <input type="datetime-local" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cls} />;
  if (type === "number") return <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="value" className={cls} />;
  return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="value" className={cls} />;
}
