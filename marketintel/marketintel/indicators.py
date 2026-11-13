"""Technical indicators in plain pandas. Every column at row t uses bars <= t only (no look-ahead)."""
import numpy as np
import pandas as pd


def ema(s, n): return s.ewm(span=n, adjust=False, min_periods=n).mean()
def sma(s, n): return s.rolling(n).mean()
def wilder(s, n): return s.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def rsi(close, n=14):
    d = close.diff()
    up, dn = wilder(d.clip(lower=0), n), wilder(-d.clip(upper=0), n)
    return 100 - 100 / (1 + up / dn)


def true_range(df):
    pc = df.close.shift()
    return pd.concat([df.high - df.low, (df.high - pc).abs(), (df.low - pc).abs()], axis=1).max(axis=1)


def atr(df, n=14): return wilder(true_range(df), n)


def adx(df, n=14):
    up, dn = df.high.diff(), -df.low.diff()
    plus = up.where((up > dn) & (up > 0), 0.0)
    minus = dn.where((dn > up) & (dn > 0), 0.0)
    a = atr(df, n)
    pdi, mdi = 100 * wilder(plus, n) / a, 100 * wilder(minus, n) / a
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi)
    return wilder(dx, n), pdi, mdi


def supertrend(df, n=10, mult=3.0):
    a = atr(df, n).to_numpy()
    hl2 = ((df.high + df.low) / 2).to_numpy()
    c = df.close.to_numpy()
    line, dirn = np.full(len(c), np.nan), np.full(len(c), np.nan)
    fu = fl = d = None
    for i in range(len(c)):
        if np.isnan(a[i]):
            continue
        ub, lb = hl2[i] + mult * a[i], hl2[i] - mult * a[i]
        if d is None:
            fu, fl, d = ub, lb, 1 if c[i] >= hl2[i] else -1
        else:
            nfu = ub if (ub < fu or c[i - 1] > fu) else fu
            nfl = lb if (lb > fl or c[i - 1] < fl) else fl
            if d == -1 and c[i] > fu: d = 1
            elif d == 1 and c[i] < fl: d = -1
            fu, fl = nfu, nfl
        line[i], dirn[i] = (fl if d == 1 else fu), d
    return pd.Series(line, df.index), pd.Series(dirn, df.index)


def add_all(df):
    """df: date-indexed open/high/low/close/volume. Returns a copy with indicator columns."""
    o = df.copy()
    c = o.close
    o["ret"] = c.pct_change()
    o["rsi"] = rsi(c)
    o["macd"] = ema(c, 12) - ema(c, 26)
    o["macd_signal"] = ema(o.macd, 9)
    o["macd_hist"] = o.macd - o.macd_signal
    for n in (9, 20, 50, 200): o[f"ema{n}"] = ema(c, n)
    for n in (20, 50, 200): o[f"sma{n}"] = sma(c, n)
    tp = (o.high + o.low + c) / 3
    # daily bars cannot give a session VWAP; this is the 20-session volume-weighted typical price
    o["vwap20"] = (tp * o.volume).rolling(20).sum() / o.volume.rolling(20).sum().replace(0, np.nan)
    o["st_line"], o["st_dir"] = supertrend(o)
    o["atr"] = atr(o)
    o["adx"], o["pdi"], o["mdi"] = adx(o)
    sd = c.rolling(20).std()
    o["bb_up"], o["bb_lo"] = o.sma20 + 2 * sd, o.sma20 - 2 * sd
    o["rvol"] = o.volume / o.volume.rolling(20).mean().shift(1).replace(0, np.nan)
    o["gap_pct"] = o.open / c.shift(1) - 1
    o["hi20"], o["lo20"] = o.high.rolling(20).max().shift(1), o.low.rolling(20).min().shift(1)
    o["hi252"], o["lo252"] = o.high.rolling(252).max().shift(1), o.low.rolling(252).min().shift(1)
    return o


def levels(df, lookback=120, wing=5):
    """Support/resistance from confirmed swing pivots, plus Fibonacci retracements of the lookback range."""
    w = df.tail(lookback)
    last = float(w.close.iloc[-1])
    win = 2 * wing + 1
    hi = w.high[(w.high == w.high.rolling(win, center=True).max())].dropna()
    lo = w.low[(w.low == w.low.rolling(win, center=True).min())].dropna()
    H, L = float(w.high.max()), float(w.low.min())
    return {
        "resistance": sorted({round(float(x), 2) for x in hi if x > last})[:3],
        "support": sorted({round(float(x), 2) for x in lo if x < last}, reverse=True)[:3],
        "fib": {str(r): round(H - (H - L) * r, 2) for r in (0.236, 0.382, 0.5, 0.618, 0.786)},
        "range_high": H, "range_low": L,
    }
