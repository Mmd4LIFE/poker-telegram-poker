"""Currency ledger operations. Every balance change goes through here."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Transaction, User


class InsufficientFunds(Exception):
    pass


async def adjust_balance(
    session: AsyncSession,
    user: User,
    amount: int,
    kind: str,
    currency: str = "coins",
    ref: str | None = None,
    meta: dict | None = None,
    allow_negative: bool = False,
) -> Transaction:
    """Apply a signed balance change and write a ledger row.

    Raises InsufficientFunds if the balance would go negative.
    """
    current = user.coins if currency == "coins" else user.gems
    new_balance = current + amount
    if new_balance < 0 and not allow_negative:
        raise InsufficientFunds(
            f"Need {-amount} {currency}, have {current}"
        )
    if currency == "coins":
        user.coins = new_balance
    else:
        user.gems = new_balance

    tx = Transaction(
        user_id=user.id,
        currency=currency,
        amount=amount,
        balance_after=new_balance,
        kind=kind,
        ref=ref,
        meta=meta or {},
    )
    session.add(tx)
    return tx


async def credit(session: AsyncSession, user: User, amount: int, kind: str, **kw) -> Transaction:
    return await adjust_balance(session, user, abs(amount), kind, **kw)


async def debit(session: AsyncSession, user: User, amount: int, kind: str, **kw) -> Transaction:
    return await adjust_balance(session, user, -abs(amount), kind, **kw)
