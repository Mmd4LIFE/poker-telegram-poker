"""Admin data explorer — a Metabase-style browse-and-filter over the live DB.

SAFETY: there is no raw SQL. Tables are whitelisted from the ORM metadata, every
filter column is validated against the real columns of the chosen table, and queries
are built with SQLAlchemy Core (bound parameters). The worst an admin can do is read
their own data — which is the point.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import Base, get_session
from app.models import User  # noqa: F401 — ensures models are imported/registered

router = APIRouter(prefix="/api/admin/explorer", tags=["admin"])

TABLES = Base.metadata.tables  # name -> sa.Table

MAX_LIMIT = 200


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
    return v  # ints, strings, bools, dicts/lists (JSONB) pass straight to JSON


# op -> (needs_value, builder). Builders take (column, coerced_value).
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


@router.get("/tables")
async def tables(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Every table with its columns and a live row count — the 'Browse Data' list."""
    out = []
    for name, tbl in sorted(TABLES.items()):
        try:
            n = int(await session.scalar(sa.select(sa.func.count()).select_from(tbl)) or 0)
        except Exception:  # noqa: BLE001
            n = -1
        out.append(
            {
                "name": name,
                "rows": n,
                "columns": [
                    {
                        "name": c.name,
                        "type": _coltype(c),
                        "pk": c.primary_key,
                        "nullable": c.nullable,
                    }
                    for c in tbl.columns
                ],
            }
        )
    return {"tables": out, "operators": list(_OPS.keys())}


class Filter(BaseModel):
    col: str
    op: str
    val: Any = None


class QueryIn(BaseModel):
    table: str
    filters: list[Filter] = []
    sort: str | None = None
    dir: str = "desc"
    limit: int = 50
    offset: int = 0


@router.post("/query")
async def query(
    body: QueryIn,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    tbl = TABLES.get(body.table)
    if tbl is None:
        raise HTTPException(404, "Unknown table")

    coltypes = {c.name: _coltype(c) for c in tbl.columns}

    conds = []
    for f in body.filters:
        if f.col not in tbl.columns:
            raise HTTPException(400, f"Unknown column {f.col}")
        spec = _OPS.get(f.op)
        if not spec:
            raise HTTPException(400, f"Unknown operator {f.op}")
        needs_val, build = spec
        col = tbl.columns[f.col]
        if needs_val:
            if f.val is None or f.val == "":
                continue  # skip an empty filter rather than erroring
            conds.append(build(col, _coerce(coltypes[f.col], f.val)))
        else:
            conds.append(build(col, None))

    base = sa.select(tbl)
    if conds:
        base = base.where(sa.and_(*conds))

    total = int(
        await session.scalar(sa.select(sa.func.count()).select_from(base.subquery())) or 0
    )

    # sort: chosen column, else primary key desc, else first column
    if body.sort and body.sort in tbl.columns:
        scol = tbl.columns[body.sort]
    else:
        pk = list(tbl.primary_key.columns)
        scol = pk[0] if pk else list(tbl.columns)[0]
    base = base.order_by(scol.desc() if body.dir == "desc" else scol.asc())

    limit = min(MAX_LIMIT, max(1, body.limit))
    base = base.limit(limit).offset(max(0, body.offset))

    rows = (await session.execute(base)).mappings().all()
    data = [{k: _serialize(v) for k, v in r.items()} for r in rows]

    return {
        "table": body.table,
        "columns": [c.name for c in tbl.columns],
        "coltypes": coltypes,
        "rows": data,
        "total": total,
        "limit": limit,
        "offset": body.offset,
    }
