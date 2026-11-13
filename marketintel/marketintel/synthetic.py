"""Seeded random-walk prices for tests and `demo` mode. Every row is tagged source=SYNTHETIC
so it can never be mistaken for market data."""
import numpy as np
import pandas as pd

SOURCE = "SYNTHETIC (not market data)"
SECTORS = ["Financial Services", "Information Technology", "Energy", "Healthcare", "Consumer Goods"]


def series(seed, end, n=900, drift=0.0003, vol=0.015, momentum=0.0):
    """momentum > 0 makes returns autocorrelated, so trend signals carry real information."""
    rng = np.random.default_rng(seed)
    eps = rng.normal(0, vol, n)
    r = np.zeros(n)
    for i in range(1, n):
        r[i] = drift + eps[i] + (momentum * r[i - 20:i].mean() if i >= 20 else 0)
    close = 100 * (1 + seed % 7) * np.exp(np.cumsum(r))
    open_ = np.r_[close[0], close[:-1]] * (1 + rng.normal(0, vol / 4, n))
    hi = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, vol / 2, n)))
    lo = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, vol / 2, n)))
    df = pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close,
                       "volume": rng.lognormal(13, 0.5, n).round()}, index=pd.bdate_range(end=end, periods=n, name="date"))
    df.attrs.update(source=SOURCE, fetched_at="synthetic")
    return df


def market(end, symbols=40, n=900, momentum=0.6):
    prices = {f"SYN{i:02d}": series(i + 1, end, n, drift=0.0006 * ((i % 5) - 2) / 2, momentum=momentum) for i in range(symbols)}
    bench = series(999, end, n, drift=0.0004, vol=0.009)
    instruments = {s: {"name": f"Synthetic Co {s[3:]}", "sector": SECTORS[i % 5], "fno": i % 3 == 0, "indices": ["SYNTHETIC"]}
                   for i, s in enumerate(prices)}
    return prices, bench, instruments
