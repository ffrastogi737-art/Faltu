"""NSE trading-day logic. Weekends are closed; holidays come from the `holidays` table
(loaded from NSE's published list or a CSV you provide). Special sessions (Muhurat, a
Saturday session) are not modelled."""
from datetime import date, timedelta


def is_trading_day(d: date, holidays=frozenset()):
    return d.weekday() < 5 and d not in holidays


def last_session(on_or_before: date, holidays=frozenset()):
    d = on_or_before
    while not is_trading_day(d, holidays):
        d -= timedelta(days=1)
    return d


def sessions_between(a: date, b: date, holidays=frozenset()):
    """Trading days in (a, b]."""
    return [a + timedelta(days=i) for i in range(1, (b - a).days + 1) if is_trading_day(a + timedelta(days=i), holidays)]


def calendar_warning(year, holidays):
    if not any(h.year == year for h in holidays):
        return f"No NSE holiday list loaded for {year}: every weekday is treated as a trading day."
