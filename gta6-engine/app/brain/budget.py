"""Budget guard. DAILY_BUDGET_USD=0 (default) means NO paid call is ever made —
the engine uses free/offline fallbacks. You must raise it yourself to allow spend."""
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..db import SessionLocal, Spend
from sqlalchemy import func


class BudgetExceeded(Exception):
    pass


def spent_today():
    start = datetime.now(timezone.utc).replace(tzinfo=None).replace(hour=0, minute=0, second=0, microsecond=0)
    with SessionLocal() as s:
        return float(s.query(func.coalesce(func.sum(Spend.usd), 0)).filter(Spend.created_at >= start).scalar())


def can_spend(usd):
    return spent_today() + usd <= settings.daily_budget_usd


def charge(service, usd, note=""):
    if not can_spend(usd):
        raise BudgetExceeded(f"{service}: ${usd:.4f} would exceed daily budget ${settings.daily_budget_usd}")
    with SessionLocal() as s:
        s.add(Spend(service=service, usd=usd, note=note))
        s.commit()


def last_7_days():
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)
    with SessionLocal() as s:
        return float(s.query(func.coalesce(func.sum(Spend.usd), 0)).filter(Spend.created_at >= since).scalar())
