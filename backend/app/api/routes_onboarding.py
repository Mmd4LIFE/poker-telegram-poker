"""Onboarding endpoints: the client's unlock state + the admin testing sandbox."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.database import get_session
from app.models import User
from app.services import onboarding as OB

router = APIRouter(prefix="/api", tags=["onboarding"])


@router.get("/onboarding")
async def get_onboarding(user: User = Depends(get_current_user)):
    """What's unlocked, what's next, and which reveals still owe a one-time spotlight."""
    return OB.payload(user)


class SeenIn(BaseModel):
    feature: str


@router.post("/onboarding/seen")
async def mark_reveal_seen(
    body: SeenIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Record that a feature's reveal spotlight was shown, so it never fires twice."""
    OB.mark_seen(user, body.feature)
    await session.commit()
    return OB.payload(user)


# ---------------------------------------------------------------- admin sandbox

class SandboxIn(BaseModel):
    effective_level: int | None = None  # view the app AS this level
    reset_reveals: bool = False         # replay the reveal spotlights from scratch
    exit: bool = False                  # leave the sandbox → back to full admin bypass


@router.post("/admin/onboarding/sandbox")
async def set_sandbox(
    body: SandboxIn,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Drive the onboarding sandbox for THIS admin only (never touches other players).

    • view-as-new  → {effective_level: 1, reset_reveals: true}
    • jump-to-level→ {effective_level: N}
    • reset        → {reset_reveals: true}
    • exit         → {exit: true}   (back to seeing everything)
    """
    ob = dict(admin.onboarding or {})
    if body.exit:
        ob.pop("sandbox", None)
    elif body.effective_level is not None:
        ob["sandbox"] = {"effective_level": max(1, int(body.effective_level))}
    if body.reset_reveals:
        ob["seen_reveals"] = []
    admin.onboarding = ob
    await session.commit()
    return OB.payload(admin)
