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
  "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤",
  contains: "contains", starts: "starts with", in: "in (a,b,c)", null: "is empty", notnull: "is not empty",
};
const PAGE = 25;

function fmtCell(v: any): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : "{…}";
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

  const loadCards = useCallback(() => api.explorerCards().then((r: any) => setCards(r.cards)).catch(() => setCards([])), []);
  useEffect(() => { api.explorerTables().then(setMeta).catch(() => {}); loadCards(); }, [loadCards]);

  if (!meta) return <Loader2 className="mx-auto mt-8 size-6 animate-spin text-gold" />;

  const home = () => { setView("home"); setEditing(null); loadCards(); };

  if (view === "browse") return <Browse meta={meta} onBack={home} />;
  if (view === "build")
    return <Builder meta={meta} editing={editing} onBack={home} onSaved={home} />;
  if (view === "native")
    return <Native meta={meta} editing={editing} onBack={home} onSaved={home} />;
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
        <div className="grid grid-cols-2 gap-2">
          {list.map((t: any) => (
            <button key={t.name} onClick={() => openTable(t.name)} className="text-left">
              <Card className="gap-1 p-3 active:scale-[0.98]">
                <div className="flex items-center gap-1.5"><Table2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate font-mono text-xs font-bold">{t.name}</span></div>
                <div className="text-[11px] text-muted-foreground">{t.rows < 0 ? "—" : t.rows.toLocaleString()} rows · {t.columns.length} cols</div>
              </Card>
            </button>
          ))}
        </div>
      </>
    );
  }
  const cols: any[] = cur?.columns ?? [];
  const from = data ? offset + 1 : 0;
  const to = data ? Math.min(offset + PAGE, data.total) : 0;
  return (
    <>
      <BackBar onBack={() => setTable(null)} title={table} note={data ? `${data.total.toLocaleString()} rows` : ""} mono />
      <FilterBuilder cols={cols} operators={meta.operators} filters={filters} setFilters={setFilters} busy={busy} onRun={() => { setOffset(0); run(table, filters, sort, 0); }} />
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

/* ============================ builder ============================ */
function Builder({ meta, editing, onBack, onSaved }: { meta: any; editing: any; onBack: () => void; onSaved: () => void }) {
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
          {meta.tables.map((t: any) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>

        {table && (
          <>
            <JoinBuilder meta={meta} base={table} joins={joins} setJoins={setJoins} />
            <FilterBuilder cols={cols} operators={meta.operators} filters={filters} setFilters={setFilters} inline />
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
                      className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", on ? "bg-gold text-black" : "bg-secondary text-muted-foreground")}>{c.name}</button>;
                  })}
                </div>
                {/* per-column bucketing: datetime → day/week/month…, number → bins */}
                {groups.map((g, i) => {
                  const t = typeOf(g.col);
                  if (t !== "datetime" && t !== "number") return null;
                  const opts = t === "datetime" ? ["", ...(meta.buckets || [])] : ["", "bin:10", "bin:100", "bin:1000", "bin:10000"];
                  return (
                    <div key={g.col} className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate font-mono text-muted-foreground">{g.col}</span>
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
              {data && <Button variant="outline" onClick={() => setSaveOpen(true)}><Save className="size-4" /> {editing ? "Update" : "Save"}</Button>}
            </div>
          </>
        )}
      </Card>
      <ResultView data={data} viz={viz} setViz={setViz} />
      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={persist} initialName={editing?.name} initialDesc={editing?.description} />
    </>
  );
}

function JoinBuilder({ meta, base, joins, setJoins }: { meta: any; base: string; joins: any[]; setJoins: (j: any) => void }) {
  const baseCols = meta.tables.find((t: any) => t.name === base)?.columns ?? [];
  const aliased = withAliases(base, joins);
  return (
    <div className="space-y-1.5">
      {joins.map((j, i) => {
        const jcols = meta.tables.find((t: any) => t.name === j.table)?.columns ?? [];
        const alias = aliased[i].alias;
        return (
          <div key={i} className="rounded-lg bg-black/20 p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <Link2 className="size-3.5 text-gold" />
              <select value={j.type} onChange={(e) => setJoins((xs: any[]) => xs.map((x, k) => k === i ? { ...x, type: e.target.value } : x))}
                className="rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[10px]">
                <option value="left">left join</option><option value="inner">inner join</option>
              </select>
              <select value={j.table} onChange={(e) => setJoins((xs: any[]) => xs.map((x, k) => k === i ? { ...x, table: e.target.value, right: "" } : x))}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1 text-[11px]">
                <option value="">table…</option>
                {meta.tables.map((t: any) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              {alias && alias !== j.table && (
                <span className="shrink-0 rounded bg-gold/20 px-1 py-0.5 text-[9px] font-bold text-gold" title="join alias">as {alias}</span>
              )}
              <button onClick={() => setJoins((xs: any[]) => xs.filter((_: any, k: number) => k !== i))} className="grid size-6 place-items-center rounded bg-secondary text-muted-foreground"><X className="size-3" /></button>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <select value={j.left} onChange={(e) => setJoins((xs: any[]) => xs.map((x, k) => k === i ? { ...x, left: e.target.value } : x))}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1">
                <option value="">{base}.column…</option>
                {baseCols.map((c: any) => <option key={c.name} value={c.name}>{base}.{c.name}</option>)}
              </select>
              <span className="text-muted-foreground">=</span>
              <select value={j.right} onChange={(e) => setJoins((xs: any[]) => xs.map((x, k) => k === i ? { ...x, right: e.target.value } : x))}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-1.5 py-1">
                <option value="">{alias || "table"}.column…</option>
                {jcols.map((c: any) => <option key={c.name} value={c.name}>{alias}.{c.name}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      <Button size="sm" variant="outline" className="h-7" onClick={() => setJoins((xs: any[]) => [...xs, { table: "", type: "left", left: "", right: "" }])}>
        <Link2 className="size-3.5" /> Join data
      </Button>
    </div>
  );
}

/* ============================ native SQL ============================ */
function Native({ meta, editing, onBack, onSaved }: { meta: any; editing: any; onBack: () => void; onSaved: () => void }) {
  const [sql, setSql] = useState(editing?.kind === "native" ? editing.sql : "select * from dim_user limit 20");
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
              <div key={t.name}><span className="font-mono font-bold text-gold">{t.name}</span><span className="ml-1 text-muted-foreground">{t.columns.map((c: any) => c.name).join(", ")}</span></div>
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

function FilterBuilder({ cols, operators, filters, setFilters, busy, onRun, inline }: {
  cols: any[]; operators: string[]; filters: any[]; setFilters: (f: any) => void; busy?: boolean; onRun?: () => void; inline?: boolean;
}) {
  const body = (
    <>
      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select value={f.col} onChange={(e) => setFilters((fs: any[]) => fs.map((x, j) => j === i ? { ...x, col: e.target.value } : x))}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
            <option value="">column…</option>
            {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select value={f.op} onChange={(e) => setFilters((fs: any[]) => fs.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}
            className="rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
            {operators.map((o) => <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>)}
          </select>
          {!["null", "notnull"].includes(f.op) && (
            <Input value={f.val ?? ""} onChange={(e) => setFilters((fs: any[]) => fs.map((x, j) => j === i ? { ...x, val: e.target.value } : x))} placeholder="value" className="h-8 w-24 text-xs" />
          )}
          <button onClick={() => setFilters((fs: any[]) => fs.filter((_: any, j: number) => j !== i))} className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><X className="size-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8" onClick={() => setFilters((fs: any[]) => [...fs, { col: "", op: "=", val: "" }])}><Plus className="size-3.5" /> Filter</Button>
        {onRun && <Button size="sm" className="h-8 flex-1" disabled={busy} onClick={onRun}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Run"}</Button>}
      </div>
    </>
  );
  if (inline) return <div className="space-y-2">{body}</div>;
  return <Card className="mb-2 gap-2 p-3">{body}</Card>;
}
