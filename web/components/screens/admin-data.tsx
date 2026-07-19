"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Table2,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Loader2,
  Search,
  Sigma,
  Code,
  Save,
  Play,
  Trash2,
  Braces,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* An in-app Metabase: browse tables, build questions (filter + summarise), write
   read-only native SQL, and save any of them as re-runnable cards. Read-only,
   admin-only. */

const OP_LABEL: Record<string, string> = {
  "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤",
  contains: "contains", starts: "starts with", in: "in (a,b,c)",
  null: "is empty", notnull: "is not empty",
};
const PAGE = 25;

function fmtCell(v: any): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : "{…}";
  return String(v);
}
const isComplex = (v: any) =>
  v !== null && typeof v === "object";

/* ---- a value popup: any cell is clickable, JSON shown pretty ---- */
function ValueDialog({ value, onClose }: { value: any; onClose: () => void }) {
  const pretty =
    value !== null && typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Braces className="size-4 text-gold" /> Value
          </DialogTitle>
        </DialogHeader>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(pretty).then(
              () => toast.success("Copied"),
              () => {},
            );
          }}
          className="self-start text-[10px] font-semibold text-muted-foreground underline"
        >
          copy
        </button>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-foreground">
          {pretty}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

/* ---- the shared results grid ---- */
function ResultsGrid({
  data,
  sort,
  onSort,
}: {
  data: any;
  sort?: { col: string | null; dir: "asc" | "desc" };
  onSort?: (c: string) => void;
}) {
  const [peek, setPeek] = useState<any>(undefined);
  if (!data) return null;
  return (
    <>
      <div className="no-scrollbar overflow-x-auto">
        <table className="min-w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/10">
              {data.columns.map((c: string) => (
                <th
                  key={c}
                  onClick={() => onSort?.(c)}
                  className={cn(
                    "whitespace-nowrap px-2 py-2 font-mono font-bold text-muted-foreground",
                    onSort && "cursor-pointer active:opacity-70",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c}
                    {sort?.col === c &&
                      (sort.dir === "desc" ? (
                        <ArrowDown className="size-3 text-gold" />
                      ) : (
                        <ArrowUp className="size-3 text-gold" />
                      ))}
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
                  const complex = isComplex(v);
                  return (
                    <td
                      key={c}
                      onClick={() => setPeek({ v })}
                      className={cn(
                        "max-w-[200px] cursor-pointer truncate whitespace-nowrap px-2 py-1.5 font-mono active:bg-white/5",
                        complex && "text-[#7cc4ff]",
                      )}
                      title="Tap to view"
                    >
                      {fmtCell(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td
                  colSpan={data.columns.length || 1}
                  className="px-2 py-6 text-center text-muted-foreground"
                >
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {peek !== undefined && (
        <ValueDialog value={peek.v} onClose={() => setPeek(undefined)} />
      )}
    </>
  );
}

/* ---- save-as-card dialog ---- */
function SaveDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setDesc("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save question</DialogTitle>
        </DialogHeader>
        <Input placeholder="Question name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Button
          disabled={!name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(name.trim(), desc.trim());
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save card"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ main ============================ */
export function AdminData() {
  const [view, setView] = useState<"home" | "browse" | "build" | "native">("home");
  const [meta, setMeta] = useState<any>(null);
  const [cards, setCards] = useState<any[] | null>(null);

  const loadCards = useCallback(
    () => api.explorerCards().then((r: any) => setCards(r.cards)).catch(() => setCards([])),
    [],
  );
  useEffect(() => {
    api.explorerTables().then(setMeta).catch(() => {});
    loadCards();
  }, [loadCards]);

  if (!meta) return <Loader2 className="mx-auto mt-8 size-6 animate-spin text-gold" />;

  if (view === "browse") return <Browse meta={meta} onBack={() => setView("home")} />;
  if (view === "build")
    return (
      <Builder
        meta={meta}
        onBack={() => setView("home")}
        onSaved={() => {
          loadCards();
          setView("home");
        }}
      />
    );
  if (view === "native")
    return (
      <Native
        meta={meta}
        onBack={() => setView("home")}
        onSaved={() => {
          loadCards();
          setView("home");
        }}
      />
    );

  // ---- home: actions + saved cards ----
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <ActionTile icon={Sigma} label="New question" onClick={() => setView("build")} />
        <ActionTile icon={Code} label="Native SQL" onClick={() => setView("native")} />
        <ActionTile icon={Database} label="Browse data" onClick={() => setView("browse")} />
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-extrabold">Saved questions</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {cards?.length ?? 0}
        </span>
      </div>
      {!cards ? (
        <Loader2 className="mx-auto mt-4 size-5 animate-spin text-gold" />
      ) : cards.length === 0 ? (
        <Card className="items-center gap-1 p-6 text-center">
          <Sigma className="size-6 text-muted-foreground" />
          <div className="text-sm font-semibold">No saved questions yet</div>
          <div className="text-xs text-muted-foreground">
            Build one or write SQL, then save it as a card.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <SavedCard key={c.id} card={c} onDeleted={loadCards} />
          ))}
        </div>
      )}
    </>
  );
}

function ActionTile({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="active:scale-[0.97]">
      <Card className="items-center gap-1.5 p-3 text-center">
        <Icon className="size-6 text-gold" />
        <span className="text-[11px] font-bold leading-tight">{label}</span>
      </Card>
    </button>
  );
}

/* ---- a saved card: expand to run it inline ---- */
function SavedCard({ card, onDeleted }: { card: any; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setOpen(true);
    if (data) return;
    setBusy(true);
    try {
      setData(await api.explorerCardRun(card.id));
    } catch (e) {
      toast.error((e as Error).message);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-2 p-3">
        <button onClick={run} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {card.kind === "native" ? (
            <Code className="size-4 shrink-0 text-[#7cc4ff]" />
          ) : (
            <Sigma className="size-4 shrink-0 text-gold" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{card.name}</div>
            {card.description ? (
              <div className="truncate text-[11px] text-muted-foreground">{card.description}</div>
            ) : (
              <div className="truncate text-[11px] text-muted-foreground">
                {card.kind === "native" ? "native SQL" : card.spec?.table}
              </div>
            )}
          </div>
        </button>
        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={run}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        </Button>
        <button
          onClick={async () => {
            await api.explorerCardDelete(card.id);
            onDeleted();
          }}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground active:bg-white/5"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {open && data && (
        <div className="border-t border-white/10">
          <ResultsGrid data={data} />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
            {data.rows.length} rows{data.total > data.rows.length ? ` of ${data.total}` : ""}
          </div>
        </div>
      )}
    </Card>
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
    try {
      setData(await api.explorerQuery({
        table: t, filters: f.filter((x) => x.col), sort: s.col, dir: s.dir, limit: PAGE, offset: off,
      }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  function openTable(name: string) {
    setTable(name); setFilters([]); setSort({ col: null, dir: "desc" }); setOffset(0);
    setData(null); run(name, [], { col: null, dir: "desc" }, 0);
  }
  function toggleSort(col: string) {
    const next = sort.col === col ? { col, dir: sort.dir === "desc" ? "asc" : "desc" } as const : { col, dir: "desc" } as const;
    setSort(next);
    if (table) run(table, filters, next, offset);
  }
  function page(dir: number) {
    if (!table || !data) return;
    const next = Math.max(0, offset + dir * PAGE);
    if (next >= data.total) return;
    setOffset(next); run(table, filters, sort, next);
  }

  if (!table) {
    const list = meta.tables.filter((t: any) => t.name.includes(tableSearch.toLowerCase()));
    return (
      <>
        <BackBar onBack={onBack} title="Browse data" note={`${meta.tables.length} tables`} />
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Find a table" className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {list.map((t: any) => (
            <button key={t.name} onClick={() => openTable(t.name)} className="text-left">
              <Card className="gap-1 p-3 active:scale-[0.98]">
                <div className="flex items-center gap-1.5">
                  <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs font-bold">{t.name}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t.rows < 0 ? "—" : t.rows.toLocaleString()} rows · {t.columns.length} cols
                </div>
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
      <FilterBuilder cols={cols} operators={meta.operators} filters={filters} setFilters={setFilters}
        busy={busy} onRun={() => { setOffset(0); run(table, filters, sort, 0); }} />
      {!data ? (
        <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <ResultsGrid data={data} sort={sort} onSort={toggleSort} />
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">{from}–{to} of {data.total.toLocaleString()}</span>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={offset <= 0 || busy} onClick={() => page(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={to >= data.total || busy} onClick={() => page(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

/* ============================ builder ============================ */
function Builder({ meta, onBack, onSaved }: { meta: any; onBack: () => void; onSaved: () => void }) {
  const [table, setTable] = useState<string>("");
  const [filters, setFilters] = useState<any[]>([]);
  const [summarize, setSummarize] = useState(false);
  const [aggs, setAggs] = useState<any[]>([{ fn: "count", col: "" }]);
  const [groups, setGroups] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const cur = meta.tables.find((t: any) => t.name === table);
  const cols: any[] = cur?.columns ?? [];

  function spec() {
    return {
      table,
      filters: filters.filter((x) => x.col),
      aggregations: summarize ? aggs.filter((a) => a.fn) : [],
      group_by: summarize ? groups : [],
      limit: 200,
    };
  }

  async function run() {
    if (!table) return;
    setBusy(true);
    try {
      setData(await api.explorerQuery(spec()));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackBar onBack={onBack} title="New question" />

      <Card className="mb-2 gap-2 p-3">
        {/* data source */}
        <label className="text-[11px] font-bold uppercase text-muted-foreground">Data</label>
        <select
          value={table}
          onChange={(e) => { setTable(e.target.value); setFilters([]); setGroups([]); setData(null); }}
          className="rounded-lg border border-white/10 bg-secondary px-2 py-2 text-xs"
        >
          <option value="">choose a table…</option>
          {meta.tables.map((t: any) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>

        {table && (
          <>
            {/* filters */}
            <FilterBuilder cols={cols} operators={meta.operators} filters={filters} setFilters={setFilters} inline />

            {/* summarise */}
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setSummarize((v) => !v)}
                className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold",
                  summarize ? "bg-gold text-black" : "bg-secondary text-muted-foreground")}
              >
                <Sigma className="size-3.5" /> Summarize
              </button>
              <span className="text-[10px] text-muted-foreground">
                {summarize ? "aggregate + group" : "raw rows"}
              </span>
            </div>

            {summarize && (
              <div className="space-y-2 rounded-lg bg-black/20 p-2">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Metrics</div>
                {aggs.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select
                      value={a.fn}
                      onChange={(e) => setAggs((xs) => xs.map((x, j) => j === i ? { ...x, fn: e.target.value } : x))}
                      className="rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs"
                    >
                      {meta.aggregations.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    {a.fn !== "count" || a.col ? (
                      <select
                        value={a.col}
                        onChange={(e) => setAggs((xs) => xs.map((x, j) => j === i ? { ...x, col: e.target.value } : x))}
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs"
                      >
                        <option value="">{a.fn === "count" ? "all rows" : "column…"}</option>
                        {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    ) : (
                      <span className="flex-1 text-[11px] text-muted-foreground">of all rows</span>
                    )}
                    <button onClick={() => setAggs((xs) => xs.filter((_, j) => j !== i))}
                      className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="h-7" onClick={() => setAggs((xs) => [...xs, { fn: "sum", col: "" }])}>
                  <Plus className="size-3.5" /> Metric
                </Button>

                <div className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">Group by</div>
                <div className="flex flex-wrap gap-1">
                  {cols.map((c) => {
                    const on = groups.includes(c.name);
                    return (
                      <button key={c.name}
                        onClick={() => setGroups((g) => on ? g.filter((x) => x !== c.name) : [...g, c.name])}
                        className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          on ? "bg-gold text-black" : "bg-secondary text-muted-foreground")}>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-1 flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={run}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <><Play className="size-4" /> Run</>}
              </Button>
              {data && (
                <Button variant="outline" onClick={() => setSaveOpen(true)}>
                  <Save className="size-4" /> Save
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      {data && (
        <Card className="gap-0 overflow-hidden p-0">
          <ResultsGrid data={data} />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground">{data.rows.length} rows</div>
        </Card>
      )}

      <SaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={async (name, description) => {
          await api.explorerCardCreate({ name, description, kind: "builder", spec: spec() });
          toast.success("Saved");
          onSaved();
        }}
      />
    </>
  );
}

/* ============================ native SQL ============================ */
function Native({ meta, onBack, onSaved }: { meta: any; onBack: () => void; onSaved: () => void }) {
  const [sql, setSql] = useState("select * from dim_user limit 20");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [schema, setSchema] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setData(await api.explorerSql(sql));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackBar onBack={onBack} title="Native SQL" />
      <Card className="mb-2 gap-2 p-3">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={5}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[12px] text-foreground outline-none focus:border-gold/40"
          placeholder="select ... — read-only SELECT / WITH only"
        />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={run}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <><Play className="size-4" /> Run</>}
          </Button>
          {data && (
            <Button variant="outline" onClick={() => setSaveOpen(true)}>
              <Save className="size-4" /> Save
            </Button>
          )}
        </div>
        <button onClick={() => setSchema((v) => !v)} className="self-start text-[10px] font-semibold text-muted-foreground underline">
          {schema ? "hide" : "show"} tables & columns
        </button>
        {schema && (
          <div className="no-scrollbar max-h-40 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-2 text-[10px]">
            {meta.tables.map((t: any) => (
              <div key={t.name}>
                <span className="font-mono font-bold text-gold">{t.name}</span>
                <span className="ml-1 text-muted-foreground">{t.columns.map((c: any) => c.name).join(", ")}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data && (
        <Card className="gap-0 overflow-hidden p-0">
          <ResultsGrid data={data} />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
            {data.rows.length} rows{data.capped ? " (capped)" : ""}
          </div>
        </Card>
      )}

      <SaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={async (name, description) => {
          await api.explorerCardCreate({ name, description, kind: "native", sql });
          toast.success("Saved");
          onSaved();
        }}
      />
    </>
  );
}

/* ---- shared bits ---- */
function BackBar({ onBack, title, note, mono }: { onBack: () => void; title: string; note?: string; mono?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <ChevronLeft className="size-4" /> Back
      </button>
      <span className={cn("ml-1 text-sm font-extrabold", mono && "font-mono")}>{title}</span>
      {note && <span className="ml-auto text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function FilterBuilder({
  cols, operators, filters, setFilters, busy, onRun, inline,
}: {
  cols: any[]; operators: string[]; filters: any[]; setFilters: (f: any) => void;
  busy?: boolean; onRun?: () => void; inline?: boolean;
}) {
  const body = (
    <>
      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select value={f.col}
            onChange={(e) => setFilters((fs: any[]) => fs.map((x, j) => j === i ? { ...x, col: e.target.value } : x))}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
            <option value="">column…</option>
            {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select value={f.op}
            onChange={(e) => setFilters((fs: any[]) => fs.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}
            className="rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs">
            {operators.map((o) => <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>)}
          </select>
          {!["null", "notnull"].includes(f.op) && (
            <Input value={f.val ?? ""} onChange={(e) => setFilters((fs: any[]) => fs.map((x, j) => j === i ? { ...x, val: e.target.value } : x))}
              placeholder="value" className="h-8 w-24 text-xs" />
          )}
          <button onClick={() => setFilters((fs: any[]) => fs.filter((_: any, j: number) => j !== i))}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8" onClick={() => setFilters((fs: any[]) => [...fs, { col: "", op: "=", val: "" }])}>
          <Plus className="size-3.5" /> Filter
        </Button>
        {onRun && (
          <Button size="sm" className="h-8 flex-1" disabled={busy} onClick={onRun}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Run"}
          </Button>
        )}
      </div>
    </>
  );
  if (inline) return <div className="space-y-2">{body}</div>;
  return <Card className="mb-2 gap-2 p-3">{body}</Card>;
}
