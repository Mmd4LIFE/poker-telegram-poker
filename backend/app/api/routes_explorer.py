"""Admin data explorer — an in-app Metabase over the live DB.

Two ways to ask a question:
  • the visual builder — pick a table, filter, and summarise (group by + aggregate).
    Tables are whitelisted from the ORM metadata, every column is validated, and the
    query is built with SQLAlchemy Core (bound parameters). No raw SQL reaches the DB.
  • native SQL — a read-only SELECT for power users. Guarded hard: SELECT/WITH only, a
    single statement, a keyword denylist that blocks every write/DDL and file access,
    a statement timeout, and the result wrapped in a row-capped subquery.

Either can be saved as a "card" and re-run later. Admin-only throughout.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import Base, get_session
from app.models import ExplorerCard, User  # noqa: F401 — registers models

router = APIRouter(prefix="/api/admin/explorer", tags=["admin"])

TABLES = Base.metadata.tables  # name -> sa.Table

ANALYTICS_VIEWS = ["dim_user", "fact_transaction", "fact_hand", "fact_trade", "fact_league"]
_reflected: dict[str, sa.Table] = {}

MAX_LIMIT = 500


async def _all_tables(session: AsyncSession) -> dict:
    """Every browsable relation keyed by its plain name (unique across schemas here).
    The derived views + fact_daily live in the `analytics` schema; SQLAlchemy qualifies
    the schema in generated SQL automatically."""
    if not _reflected:
        md = sa.MetaData()

        def _reflect(conn):
            for v in ANALYTICS_VIEWS:
                try:
                    # autoload reflects a VIEW's columns fine; `views=True` is a
                    # MetaData.reflect() flag, NOT a Table() arg (it used to error here
                    # silently, so the analytics views never showed up).
                    _reflected[v] = sa.Table(v, md, schema="analytics", autoload_with=conn)
                except Exception:  # noqa: BLE001
                    pass

        await session.run_sync(lambda s: _reflect(s.connection()))
    out: dict[str, sa.Table] = {}
    for tbl in TABLES.values():   # Base.metadata.tables (some carry schema="analytics")
        out[tbl.name] = tbl
    for tbl in _reflected.values():
        out[tbl.name] = tbl
    return out


# Curated relations for relations that naming heuristics + FKs can't see — chiefly the
# analytics VIEWS (views carry no FK constraints). from_table.from_col -> to_table.to_col.
_CURATED_RELATIONS: list[tuple[str, str, str, str]] = [
    ("dim_user", "user_id", "users", "id"),
    ("fact_transaction", "user_id", "users", "id"),
    ("fact_hand", "user_id", "users", "id"),
    ("fact_trade", "user_id", "users", "id"),
    ("fact_league", "user_id", "users", "id"),
    ("fact_league", "cohort_id", "cohorts", "id"),
]

# Common column-name → table-name irregulars for the naming heuristic.
_HEURISTIC_ALIASES = {
    "user": "users",
    "referrer": "users",
    "referred": "users",
    "opponent": "users",
    "dealer": "users",
    "winner": "users",
    "host": "users",
    "club": "clubs",
    "squad": "clubs",
    "room": "rooms",
    "hand": "hands",
    "cohort": "cohorts",
    "season": "league_seasons",
}


def _pk_name(tbl: sa.Table) -> str | None:
    pk = list(tbl.primary_key.columns)
    return pk[0].name if len(pk) == 1 else None


def _relations(all_tbls: dict[str, sa.Table]) -> list[dict]:
    """Derive a join-relationship graph so the UI can auto-suggest join keys.

    Three sources, most-trusted first (a stronger edge for the same from-column wins):
      1. real FOREIGN KEY constraints in the ORM metadata (confidence = fk),
      2. naming heuristics — a `<thing>_id` column pointing at `<things>.id`,
      3. a small curated map for the analytics views, which have no FK constraints.

    Each edge is directed from the FK-holder to the referenced PK; the UI treats a match
    in either direction as a valid join between two tables already in the query.
    """
    edges: dict[tuple[str, str], dict] = {}   # (from_table, from_col) -> edge (best wins)
    rank = {"fk": 3, "curated": 2, "heuristic": 1}

    def add(ft: str, fc: str, tt: str, tc: str, kind: str) -> None:
        if ft not in all_tbls or tt not in all_tbls:
            return
        if fc not in all_tbls[ft].columns or tc not in all_tbls[tt].columns:
            return
        if ft == tt:
            return
        key = (ft, fc)
        prev = edges.get(key)
        if prev is None or rank[kind] > rank[prev["kind"]]:
            edges[key] = {"from_table": ft, "from_col": fc, "to_table": tt,
                          "to_col": tc, "kind": kind}

    # 1) real foreign keys
    for tbl in all_tbls.values():
        for col in tbl.columns:
            for fk in col.foreign_keys:
                tgt = fk.column
                add(tbl.name, col.name, tgt.table.name, tgt.name, "fk")

    # 2) naming heuristics: `<base>_id` -> a table named like <base>
    pk_by_table = {n: _pk_name(t) for n, t in all_tbls.items()}
    for tbl in all_tbls.values():
        for col in tbl.columns:
            name = col.name
            if not name.endswith("_id") or name == "id":
                continue
            base = name[:-3]
            candidates = [
                _HEURISTIC_ALIASES.get(base),
                base, base + "s", base + "es",
                base[:-1] + "ies" if base.endswith("y") else None,
            ]
            for cand in candidates:
                if not cand or cand not in all_tbls:
                    continue
                pk = pk_by_table.get(cand)
                if pk:
                    add(tbl.name, name, cand, pk, "heuristic")
                    break

    # 3) curated overrides (analytics views etc.)
    for ft, fc, tt, tc in _CURATED_RELATIONS:
        add(ft, fc, tt, tc, "curated")

    return sorted(edges.values(), key=lambda e: (e["from_table"], e["from_col"]))


def _coltype(col: sa.Column) -> str:
    t = str(col.type).lower()
    if "bool" in t:
        return "bool"
    if any(x in t for x in ("timestamp", "date")):
        return "datetime"
    if "json" in t:
        return "json"
    if any(x in t for x in ("int", "serial", "numeric", "float", "double", "real")):
        return "number"
    return "text"


def _serialize(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


_OPS = {
    "=": (True, lambda c, v: c == v),
    "!=": (True, lambda c, v: c != v),
    ">": (True, lambda c, v: c > v),
    ">=": (True, lambda c, v: c >= v),
    "<": (True, lambda c, v: c < v),
    "<=": (True, lambda c, v: c <= v),
    "between": (True, lambda c, v: c.between(v[0], v[1])),
    "contains": (True, lambda c, v: c.cast(sa.String).ilike(f"%{v}%")),
    "starts": (True, lambda c, v: c.cast(sa.String).ilike(f"{v}%")),
    "in": (True, lambda c, v: c.in_(v if isinstance(v, list) else [v])),
    "null": (False, lambda c, v: c.is_(None)),
    "notnull": (False, lambda c, v: c.is_not(None)),
}

# Which operators make sense for each column type — the UI renders only these, and picks a
# type-appropriate value editor (date range, number range, enum picker, true/false…).
OPS_BY_TYPE: dict[str, list[str]] = {
    "text":     ["=", "!=", "contains", "starts", "in", "null", "notnull"],
    "number":   ["=", "!=", ">", ">=", "<", "<=", "between", "in", "null", "notnull"],
    "datetime": ["=", "between", ">", ">=", "<", "<=", "null", "notnull"],
    "bool":     ["=", "null", "notnull"],
    "json":     ["null", "notnull"],
}

_TEMPORAL = ("minute", "hour", "day", "week", "month", "quarter", "year")


def _bucket_expr(col, bucket: str | None):
    """Apply a Metabase-style temporal bucket or numeric bin to a group-by column."""
    if not bucket:
        return col
    b = str(bucket).lower()
    if b in ("minute", "hour"):
        return sa.func.date_trunc(b, col)
    if b in ("day", "week", "month", "quarter", "year"):
        return sa.cast(sa.func.date_trunc(b, col), sa.Date)
    if b == "date":
        return sa.cast(col, sa.Date)
    if b.startswith("bin:"):
        try:
            size = float(b.split(":", 1)[1])
        except (ValueError, IndexError):
            return col
        if size <= 0:
            return col
        return sa.func.floor(col / size) * size
    return col


# aggregate fn -> builds a labelled column expression from (table, column_name_or_None)
_AGG_FNS = {
    "count": lambda t, c: sa.func.count() if not c else sa.func.count(t.columns[c]),
    "distinct": lambda t, c: sa.func.count(sa.distinct(t.columns[c])),
    "sum": lambda t, c: sa.func.sum(t.columns[c]),
    "avg": lambda t, c: sa.func.avg(t.columns[c]),
    "min": lambda t, c: sa.func.min(t.columns[c]),
    "max": lambda t, c: sa.func.max(t.columns[c]),
}


def _coerce(coltype: str, raw: Any) -> Any:
    if isinstance(raw, list):
        return [_coerce(coltype, x) for x in raw]
    if coltype == "number":
        try:
            f = float(raw)
            return int(f) if f.is_integer() else f
        except (TypeError, ValueError):
            return raw
    if coltype == "bool":
        return str(raw).lower() in ("1", "true", "yes", "t")
    return raw


def _conds(resolve, filters: list[dict]) -> list:
    out = []
    for f in filters:
        col = resolve(f.get("col"))
        if col is None:
            raise HTTPException(400, f"Unknown column {f.get('col')}")
        op = f.get("op")
        spec = _OPS.get(op)
        if not spec:
            raise HTTPException(400, f"Unknown operator {op}")
        needs_val, build = spec
        if not needs_val:
            out.append(build(col, None))
            continue
        ctype = _coltype(col)
        val = f.get("val")
        if op == "between":
            # expects a two-element [lo, hi]; skip unless both bounds are given
            if not isinstance(val, (list, tuple)) or len(val) != 2:
                continue
            lo, hi = val
            if lo in (None, "") or hi in (None, ""):
                continue
            out.append(build(col, [_coerce(ctype, lo), _coerce(ctype, hi)]))
            continue
        if op == "in":
            # accept an array, or a convenience "a, b, c" string
            if isinstance(val, str):
                val = [x.strip() for x in val.split(",") if x.strip()]
            if not val:
                continue
            out.append(build(col, _coerce(ctype, val)))
            continue
        if val is None or val == "":
            continue
        out.append(build(col, _coerce(ctype, val)))
    return out


# --------------------------------------------------------------------- browse

@router.get("/tables")
async def tables(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    all_tables = await _all_tables(session)
    out = []
    for name, tbl in sorted(all_tables.items()):
        try:
            n = int(await session.scalar(sa.select(sa.func.count()).select_from(tbl)) or 0)
        except Exception:  # noqa: BLE001
            n = -1
        out.append(
            {
                "name": name,
                "schema": tbl.schema or "public",
                "rows": n,
                "columns": [
                    {"name": c.name, "type": _coltype(c), "pk": c.primary_key,
                     "nullable": c.nullable}
                    for c in tbl.columns
                ],
            }
        )
    return {
        "tables": out,
        "operators": list(_OPS.keys()),
        "ops_by_type": OPS_BY_TYPE,
        "aggregations": list(_AGG_FNS.keys()),
        "buckets": list(_TEMPORAL),
        "relations": _relations(all_tables),
    }


class ProfileIn(BaseModel):
    table: str
    col: str


# A column with at most this many distinct values is treated as an enum: the filter UI
# offers its actual values as a pick-list instead of a free-text box.
ENUM_MAX = 50


@router.post("/column-profile")
async def column_profile(
    body: ProfileIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Profile one column so the filter UI can adapt: is it a small enum (return its
    values as a pick-list), and what is its range (min/max for number/date pickers)."""
    all_tbls = await _all_tables(session)
    tbl = all_tbls.get(body.table)
    if tbl is None:
        raise HTTPException(404, "Unknown table")
    col = tbl.columns.get(body.col)
    if col is None:
        raise HTTPException(400, f"Unknown column {body.col}")
    ctype = _coltype(col)
    out: dict[str, Any] = {"type": ctype, "enum": False}
    if ctype == "json":
        return out
    try:
        await session.execute(sa.text("SET LOCAL statement_timeout = '8000'"))
        # one distinct row past the cap tells us "too many to enumerate"
        distinct_q = (
            sa.select(col).select_from(tbl).where(col.is_not(None))
            .distinct().limit(ENUM_MAX + 1)
        )
        vals = [r[0] for r in (await session.execute(distinct_q)).all()]
        if len(vals) <= ENUM_MAX:
            out["enum"] = True
            out["distinct_count"] = len(vals)
            out["values"] = sorted(
                (_serialize(v) for v in vals), key=lambda x: (x is None, str(x))
            )
        if ctype in ("number", "datetime"):
            mn, mx = (
                await session.execute(sa.select(sa.func.min(col), sa.func.max(col)))
            ).one()
            out["min"] = _serialize(mn)
            out["max"] = _serialize(mx)
    except Exception:  # noqa: BLE001 — profiling is best-effort; fall back to a text box
        return {"type": ctype, "enum": False}
    return out


# --------------------------------------------------------------- builder query

class Filter(BaseModel):
    col: str
    op: str
    val: Any = None


class Aggregation(BaseModel):
    fn: str
    col: str | None = None


class Join(BaseModel):
    table: str
    type: str = "left"  # left | inner
    left: str            # column on an already-joined table (qualified or base)
    right: str           # column on the joined table
    alias: str | None = None  # so the SAME table can be joined more than once


class QueryIn(BaseModel):
    table: str
    joins: list[Join] = []
    filters: list[Filter] = []
    aggregations: list[Aggregation] = []
    group_by: list[Any] = []  # "col" or {"col","bucket"}
    sort: str | None = None
    dir: str = "desc"
    limit: int = 50
    offset: int = 0


async def _run_builder(session: AsyncSession, spec: dict) -> dict:
    all_tbls = await _all_tables(session)
    base_name = spec.get("table")
    tbl = all_tbls.get(base_name)
    if tbl is None:
        raise HTTPException(404, "Unknown table")

    # --- assemble the FROM (base + joins) and a column resolver ---
    joins = spec.get("joins", []) or []
    used: dict[str, sa.Table] = {base_name: tbl}
    frm: Any = tbl

    def resolve(name: str | None):
        if not name:
            return None
        if "." in name:
            t, _, c = name.partition(".")
            table = used.get(t)
            return table.columns.get(c) if table is not None else None
        if name in tbl.columns:
            return tbl.columns[name]
        for t in used.values():
            if name in t.columns:
                return t.columns[name]
        return None

    for j in joins:
        tname = j.get("table")
        jt_base = all_tbls.get(tname)
        if jt_base is None:
            raise HTTPException(400, f"Unknown join table {tname}")
        # a table can be joined more than once (e.g. friendships → users twice), so
        # each join gets a unique alias; columns then qualify as alias.column.
        alias = j.get("alias") or tname
        if alias in used:
            k = 2
            while f"{tname}_{k}" in used:
                k += 1
            alias = f"{tname}_{k}"
        jt = jt_base if alias == tname else jt_base.alias(alias)
        used[alias] = jt
        left = resolve(j.get("left"))
        right = jt.columns.get(j.get("right"))
        if left is None or right is None:
            raise HTTPException(400, "Bad join column")
        frm = frm.join(jt, left == right, isouter=(j.get("type") != "inner"))

    def label_of(t_name: str, c) -> str:
        return f"{t_name}.{c.name}" if joins else c.name

    conds = _conds(resolve, spec.get("filters", []))
    aggs = spec.get("aggregations", []) or []
    # group_by items are either "col" or {"col","bucket"} (bucket = day/week/month/… or bin:N)
    norm_groups = []
    for g in (spec.get("group_by", []) or []):
        gc = g.get("col") if isinstance(g, dict) else g
        gb = g.get("bucket") if isinstance(g, dict) else None
        if resolve(gc) is not None:
            norm_groups.append({"col": gc, "bucket": gb})
    groups = [g["col"] for g in norm_groups]
    limit = min(MAX_LIMIT, max(1, int(spec.get("limit", 50) or 50)))
    offset = max(0, int(spec.get("offset", 0) or 0))
    sort, dir_ = spec.get("sort"), spec.get("dir", "desc")

    if aggs:
        # --- summarised: group_by dims (optionally bucketed) + aggregate measures ---
        select_cols, out_cols, expr_by_name, group_exprs = [], [], {}, []
        for g in norm_groups:
            bexpr = _bucket_expr(resolve(g["col"]), g["bucket"])
            select_cols.append(bexpr.label(g["col"]))
            out_cols.append(g["col"])
            expr_by_name[g["col"]] = bexpr
            group_exprs.append(bexpr)
        for a in aggs:
            fn = a.get("fn")
            if fn not in _AGG_FNS:
                raise HTTPException(400, f"Unknown aggregation {fn}")
            col = a.get("col")
            colobj = resolve(col) if col else None
            if col and colobj is None:
                raise HTTPException(400, f"Unknown column {col}")
            alias = fn if (fn == "count" and not col) else f"{fn}_{(col or '').replace('.', '_')}"
            if fn == "count" and not col:
                expr = sa.func.count().label(alias)
            elif fn == "distinct":
                expr = sa.func.count(sa.distinct(colobj)).label(alias)
            else:
                expr = getattr(sa.func, fn)(colobj).label(alias)
            select_cols.append(expr)
            out_cols.append(alias)
            expr_by_name[alias] = expr

        q = sa.select(*select_cols).select_from(frm)
        if conds:
            q = q.where(sa.and_(*conds))
        if group_exprs:
            q = q.group_by(*group_exprs)

        total = int(
            await session.scalar(sa.select(sa.func.count()).select_from(q.subquery())) or 0
        )
        scol = expr_by_name.get(sort)
        if scol is None:
            scol = select_cols[-1] if select_cols else None
        if scol is not None:
            q = q.order_by(scol.desc() if dir_ == "desc" else scol.asc())
        q = q.limit(limit).offset(offset)
        rows = (await session.execute(q)).mappings().all()
        data = [{k: _serialize(v) for k, v in r.items()} for r in rows]
        return {"columns": out_cols, "coltypes": {}, "rows": data, "total": total,
                "limit": limit, "offset": offset, "aggregated": True, "group_by": groups}

    # --- raw rows ---
    select_cols, out_cols, coltypes = [], [], {}
    for t_name, t in used.items():
        for c in t.columns:
            lbl = label_of(t_name, c)
            select_cols.append(c.label(lbl))
            out_cols.append(lbl)
            coltypes[lbl] = _coltype(c)
    base = sa.select(*select_cols).select_from(frm)
    if conds:
        base = base.where(sa.and_(*conds))
    total = int(
        await session.scalar(sa.select(sa.func.count()).select_from(base.subquery())) or 0
    )
    scol = resolve(sort)
    if scol is None:
        pk = list(tbl.primary_key.columns)
        scol = pk[0] if pk else list(tbl.columns)[0]
    base = base.order_by(scol.desc() if dir_ == "desc" else scol.asc())
    base = base.limit(limit).offset(offset)
    rows = (await session.execute(base)).mappings().all()
    data = [{k: _serialize(v) for k, v in r.items()} for r in rows]
    return {"columns": out_cols, "coltypes": coltypes, "rows": data, "total": total,
            "limit": limit, "offset": offset, "aggregated": False}


@router.post("/query")
async def query(
    body: QueryIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await _run_builder(session, body.model_dump())


# ------------------------------------------------------------------ native SQL

# Blocks every write/DDL and file/network access. Data-modifying CTEs are caught too,
# because the write keyword still appears in the text.
_BANNED = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|"
    r"reindex|cluster|comment|into|call|do|merge|lock|attach|listen|notify|"
    r"pg_read_file|pg_ls_dir|pg_read_binary_file|lo_import|lo_export|dblink|"
    r"pg_sleep|pg_terminate_backend|pg_cancel_backend)\b",
    re.I,
)


async def _run_native(session: AsyncSession, sql: str) -> dict:
    q = (sql or "").strip().rstrip(";").strip()
    if not q:
        raise HTTPException(400, "Empty query")
    low = q.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise HTTPException(400, "Only SELECT / WITH queries are allowed")
    if ";" in q:
        raise HTTPException(400, "One statement at a time")
    if _BANNED.search(q):
        raise HTTPException(400, "Read-only queries only — no writes, DDL, or file access")
    try:
        await session.execute(sa.text("SET LOCAL statement_timeout = '10000'"))
        # both schemas visible, so analytics views resolve unqualified (dim_user, …)
        await session.execute(sa.text("SET LOCAL search_path = public, analytics"))
        wrapped = sa.text(f"SELECT * FROM (\n{q}\n) AS _explorer_q LIMIT {MAX_LIMIT}")
        res = await session.execute(wrapped)
        cols = list(res.keys())
        rows = res.mappings().all()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — surface the DB error to the admin
        raise HTTPException(400, f"SQL error: {str(e).splitlines()[0][:300]}") from e
    data = [{k: _serialize(v) for k, v in r.items()} for r in rows]
    return {"columns": cols, "coltypes": {}, "rows": data, "total": len(data),
            "native": True, "capped": len(data) >= MAX_LIMIT}


class NativeIn(BaseModel):
    sql: str


@router.post("/sql")
async def native_sql(
    body: NativeIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await _run_native(session, body.sql)


# -------------------------------------------------------- send to Telegram

def _safe_name(name: str, ext: str) -> str:
    base = re.sub(r"[^a-z0-9_-]+", "_", (name or "").lower()).strip("_")[:40] or "export"
    return f"{base}.{ext}"


class SendCsvIn(BaseModel):
    name: str = "export"
    csv: str


@router.post("/send-csv")
async def send_csv(
    body: SendCsvIn,
    user: User = Depends(require_admin),
):
    """Deliver a result as a CSV document to the admin's bot chat."""
    if not user.telegram_id:
        raise HTTPException(400, "Open the bot chat first")
    from aiogram.types import BufferedInputFile
    from app.bot.instance import get_bot
    doc = BufferedInputFile(body.csv.encode("utf-8"), _safe_name(body.name, "csv"))
    await get_bot().send_document(user.telegram_id, doc, caption=f"📄 {body.name}")
    return {"ok": True}


class SendImageIn(BaseModel):
    name: str = "chart"
    png: str  # base64, no data: prefix


@router.post("/send-image")
async def send_image(
    body: SendImageIn,
    user: User = Depends(require_admin),
):
    """Deliver a chart as a PNG photo to the admin's bot chat."""
    if not user.telegram_id:
        raise HTTPException(400, "Open the bot chat first")
    import base64
    try:
        raw = base64.b64decode(body.png)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, "Bad image data") from e
    from aiogram.exceptions import TelegramBadRequest
    from aiogram.types import BufferedInputFile
    from app.bot.instance import get_bot
    fname = _safe_name(body.name, "png")
    bot = get_bot()
    try:
        await bot.send_photo(user.telegram_id, BufferedInputFile(raw, fname), caption=f"📊 {body.name}")
    except TelegramBadRequest:
        # odd dimensions can trip Telegram's photo processing — send the PNG as a file
        await bot.send_document(user.telegram_id, BufferedInputFile(raw, fname), caption=f"📊 {body.name}")
    return {"ok": True}


# --------------------------------------------------------------------- cards

class CardIn(BaseModel):
    name: str
    description: str = ""
    kind: str = "builder"  # builder | native
    spec: dict = {}
    sql: str | None = None
    viz: dict = {}


def _card_out(c: ExplorerCard) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description or "",
        "kind": c.kind,
        "spec": c.spec or {},
        "sql": c.sql,
        "viz": c.viz or {},
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/cards")
async def list_cards(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.scalars(
        sa.select(ExplorerCard).order_by(ExplorerCard.updated_at.desc())
    )).all()
    return {"cards": [_card_out(c) for c in rows]}


@router.post("/cards")
async def create_card(
    body: CardIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    if not body.name.strip():
        raise HTTPException(400, "Give the question a name")
    if body.kind not in ("builder", "native"):
        raise HTTPException(400, "kind must be builder or native")
    if body.kind == "native" and not (body.sql or "").strip():
        raise HTTPException(400, "Native card needs SQL")
    card = ExplorerCard(
        name=body.name.strip()[:120],
        description=(body.description or "")[:400],
        kind=body.kind,
        spec=body.spec or {},
        sql=body.sql,
        viz=body.viz or {},
    )
    session.add(card)
    await session.commit()
    return _card_out(card)


class CardPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    spec: dict | None = None
    sql: str | None = None
    viz: dict | None = None


@router.patch("/cards/{card_id}")
async def update_card(
    card_id: int,
    body: CardPatch,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    card = await session.get(ExplorerCard, card_id)
    if card is None:
        raise HTTPException(404, "Card not found")
    if body.name is not None:
        card.name = body.name.strip()[:120] or card.name
    if body.description is not None:
        card.description = body.description[:400]
    if body.spec is not None:
        card.spec = body.spec
    if body.sql is not None:
        card.sql = body.sql
    if body.viz is not None:
        card.viz = body.viz
    await session.commit()
    return _card_out(card)


@router.delete("/cards/{card_id}")
async def delete_card(
    card_id: int,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    card = await session.get(ExplorerCard, card_id)
    if card:
        await session.delete(card)
        await session.commit()
    return {"ok": True}


@router.post("/cards/{card_id}/run")
async def run_card(
    card_id: int,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    card = await session.get(ExplorerCard, card_id)
    if card is None:
        raise HTTPException(404, "Card not found")
    if card.kind == "native":
        result = await _run_native(session, card.sql or "")
    else:
        result = await _run_builder(session, card.spec or {})
    result["card"] = _card_out(card)
    return result
