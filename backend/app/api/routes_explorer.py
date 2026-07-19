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

ANALYTICS_VIEWS = ["dim_user", "fact_transaction", "fact_hand", "fact_trade"]
_reflected: dict[str, sa.Table] = {}

MAX_LIMIT = 500


async def _all_tables(session: AsyncSession) -> dict:
    if not _reflected:
        md = sa.MetaData()

        def _reflect(conn):
            for v in ANALYTICS_VIEWS:
                try:
                    _reflected[v] = sa.Table(v, md, autoload_with=conn, views=True)
                except Exception:  # noqa: BLE001
                    pass

        await session.run_sync(lambda s: _reflect(s.connection()))
    return {**TABLES, **_reflected}


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
    "contains": (True, lambda c, v: c.cast(sa.String).ilike(f"%{v}%")),
    "starts": (True, lambda c, v: c.cast(sa.String).ilike(f"{v}%")),
    "in": (True, lambda c, v: c.in_(v if isinstance(v, list) else [v])),
    "null": (False, lambda c, v: c.is_(None)),
    "notnull": (False, lambda c, v: c.is_not(None)),
}

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
        spec = _OPS.get(f.get("op"))
        if not spec:
            raise HTTPException(400, f"Unknown operator {f.get('op')}")
        needs_val, build = spec
        if needs_val:
            val = f.get("val")
            if val is None or val == "":
                continue
            out.append(build(col, _coerce(_coltype(col), val)))
        else:
            out.append(build(col, None))
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
        "aggregations": list(_AGG_FNS.keys()),
    }


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
    group_by: list[str] = []
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
    groups = [g for g in (spec.get("group_by", []) or []) if resolve(g) is not None]
    limit = min(MAX_LIMIT, max(1, int(spec.get("limit", 50) or 50)))
    offset = max(0, int(spec.get("offset", 0) or 0))
    sort, dir_ = spec.get("sort"), spec.get("dir", "desc")

    if aggs:
        # --- summarised: group_by dims + aggregate measures ---
        select_cols, out_cols, expr_by_name = [], [], {}
        for g in groups:
            c = resolve(g).label(g)
            select_cols.append(c)
            out_cols.append(g)
            expr_by_name[g] = c
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
        if groups:
            q = q.group_by(*[resolve(g) for g in groups])

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
