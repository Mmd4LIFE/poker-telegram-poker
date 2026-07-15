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
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* A Metabase-style data explorer: browse any table, filter, sort, page. Read-only,
   admin-only, structured queries — no raw SQL. The first of the admin dashboards. */

const OP_LABEL: Record<string, string> = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  contains: "contains",
  starts: "starts with",
  in: "in (a,b,c)",
  null: "is empty",
  notnull: "is not empty",
};

const PAGE = 25;

export function AdminData() {
  const [meta, setMeta] = useState<any>(null); // {tables, operators}
  const [table, setTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const [filters, setFilters] = useState<any[]>([]);
  const [sort, setSort] = useState<{ col: string | null; dir: "asc" | "desc" }>({
    col: null,
    dir: "desc",
  });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.explorerTables().then(setMeta).catch(() => {});
  }, []);

  const cur = meta?.tables?.find((t: any) => t.name === table);

  const run = useCallback(
    async (t: string, f: any[], s: any, off: number) => {
      setBusy(true);
      try {
        const r = await api.explorerQuery({
          table: t,
          filters: f.filter((x) => x.col),
          sort: s.col,
          dir: s.dir,
          limit: PAGE,
          offset: off,
        });
        setData(r);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  function openTable(name: string) {
    setTable(name);
    setFilters([]);
    setSort({ col: null, dir: "desc" });
    setOffset(0);
    setData(null);
    run(name, [], { col: null, dir: "desc" }, 0);
  }

  function apply() {
    if (table) {
      setOffset(0);
      run(table, filters, sort, 0);
    }
  }

  function toggleSort(col: string) {
    const next: { col: string; dir: "asc" | "desc" } =
      sort.col === col
        ? { col, dir: sort.dir === "desc" ? "asc" : "desc" }
        : { col, dir: "desc" };
    setSort(next);
    if (table) run(table, filters, next, offset);
  }

  function page(dir: number) {
    if (!table || !data) return;
    const next = Math.max(0, offset + dir * PAGE);
    if (next >= data.total) return;
    setOffset(next);
    run(table, filters, sort, next);
  }

  if (!meta) return <p className="text-sm text-muted-foreground">Loading…</p>;

  // --- table picker ---
  if (!table) {
    const list = meta.tables.filter((t: any) =>
      t.name.includes(tableSearch.toLowerCase()),
    );
    return (
      <>
        <div className="mb-3 flex items-center gap-2">
          <Database className="size-5 text-gold" />
          <span className="text-sm font-extrabold">Browse data</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {meta.tables.length} tables
          </span>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Find a table"
            className="pl-9"
          />
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
                  {t.rows < 0 ? "—" : t.rows.toLocaleString()} rows ·{" "}
                  {t.columns.length} cols
                </div>
              </Card>
            </button>
          ))}
        </div>
      </>
    );
  }

  // --- table view ---
  const cols: any[] = cur?.columns ?? [];
  const from = data ? offset + 1 : 0;
  const to = data ? Math.min(offset + PAGE, data.total) : 0;

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setTable(null)}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Tables
        </button>
        <span className="ml-1 font-mono text-sm font-extrabold">{table}</span>
        {data && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {data.total.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* filter builder */}
      <Card className="mb-2 gap-2 p-3">
        {filters.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={f.col}
              onChange={(e) =>
                setFilters((fs) =>
                  fs.map((x, j) => (j === i ? { ...x, col: e.target.value } : x)),
                )
              }
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs"
            >
              <option value="">column…</option>
              {cols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) =>
                setFilters((fs) =>
                  fs.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)),
                )
              }
              className="rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs"
            >
              {meta.operators.map((o: string) => (
                <option key={o} value={o}>
                  {OP_LABEL[o] ?? o}
                </option>
              ))}
            </select>
            {!["null", "notnull"].includes(f.op) && (
              <Input
                value={f.val}
                onChange={(e) =>
                  setFilters((fs) =>
                    fs.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)),
                  )
                }
                placeholder="value"
                className="h-8 w-24 text-xs"
              />
            )}
            <button
              onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              setFilters((fs) => [...fs, { col: "", op: "=", val: "" }])
            }
          >
            <Plus className="size-3.5" /> Filter
          </Button>
          <Button size="sm" className="h-8 flex-1" disabled={busy} onClick={apply}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Run"}
          </Button>
        </div>
      </Card>

      {/* grid */}
      {!data ? (
        <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="no-scrollbar overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/10">
                  {data.columns.map((c: string) => (
                    <th
                      key={c}
                      onClick={() => toggleSort(c)}
                      className="cursor-pointer whitespace-nowrap px-2 py-2 font-mono font-bold text-muted-foreground active:opacity-70"
                    >
                      <span className="inline-flex items-center gap-1">
                        {c}
                        {sort.col === c &&
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
                    {data.columns.map((c: string) => (
                      <td
                        key={c}
                        className="max-w-[200px] truncate whitespace-nowrap px-2 py-1.5 font-mono"
                        title={fmtCell(row[c])}
                      >
                        {fmtCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={data.columns.length}
                      className="px-2 py-6 text-center text-muted-foreground"
                    >
                      No rows match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              {from}–{to} of {data.total.toLocaleString()}
            </span>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={offset <= 0 || busy}
                onClick={() => page(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={to >= data.total || busy}
                onClick={() => page(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function fmtCell(v: any): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
