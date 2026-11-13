"""The five scoring models. Each returns a score in [-1, 1] and plain-language reasons.

technical / quant / regime are computed for every historical date, so they can be calibrated
out-of-sample. fundamental / news have no point-in-time history here, so they are overlays:
they can veto or flag a call but never change a published probability.
"""
import re
import numpy as np
import pandas as pd

from .indicators import sma

# ---------- 1. technical ----------

def technical_votes(d):
    """d: output of indicators.add_all. One column per rule, values -1/0/+1. Score = plain average."""
    c = d.close
    v = pd.DataFrame(index=d.index)
    v["trend_50_200"] = np.where((c > d.ema50) & (d.ema50 > d.ema200), 1, np.where((c < d.ema50) & (d.ema50 < d.ema200), -1, 0))
    v["ema_9_20"] = np.sign(d.ema9 - d.ema20)
    v["macd"] = np.where((d.macd_hist > 0) & (d.macd > 0), 1, np.where((d.macd_hist < 0) & (d.macd < 0), -1, 0))
    v["rsi"] = np.where(d.rsi.between(55, 75), 1, np.where(d.rsi.between(25, 45), -1, 0))
    v["supertrend"] = d.st_dir
    v["adx_di"] = np.where(d.adx > 20, np.sign(d.pdi - d.mdi), 0)
    v["vwap20"] = np.sign(c - d.vwap20).fillna(0)
    v["breakout"] = np.where((c > d.hi20) & (d.rvol > 1.5), 1, np.where((c < d.lo20) & (d.rvol > 1.5), -1, 0))
    v["gap"] = np.where(d.gap_pct > 0.02, 1, np.where(d.gap_pct < -0.02, -1, 0))
    v[d.ema200.isna() | d.adx.isna()] = np.nan  # not enough history: no score at all
    return v


def technical_score(d):
    return technical_votes(d).mean(axis=1)


def technical_reasons(d):
    r, v = d.iloc[-1], technical_votes(d).iloc[-1]
    word = {1: "bullish", -1: "bearish", 0: "neutral"}
    text = {
        "trend_50_200": f"close {r.close:.2f} vs EMA50 {r.ema50:.2f} / EMA200 {r.ema200:.2f}",
        "ema_9_20": f"EMA9 {r.ema9:.2f} vs EMA20 {r.ema20:.2f}",
        "macd": f"MACD {r.macd:.2f}, histogram {r.macd_hist:.2f}",
        "rsi": f"RSI {r.rsi:.0f}" + (" (stretched)" if r.rsi > 75 or r.rsi < 25 else ""),
        "supertrend": f"Supertrend line {r.st_line:.2f}",
        "adx_di": f"ADX {r.adx:.0f}, +DI {r.pdi:.0f} / -DI {r.mdi:.0f}",
        "vwap20": "20-session VWAP " + (f"{r.vwap20:.2f}" if pd.notna(r.vwap20) else "n/a"),
        "breakout": f"20-day range {r.lo20:.2f}-{r.hi20:.2f}, relative volume " + (f"{r.rvol:.1f}x" if pd.notna(r.rvol) else "n/a"),
        "gap": f"opening gap {r.gap_pct * 100:+.1f}%",
    }
    return [{"rule": k, "signal": word[int(v[k])], "detail": text[k]} for k in v.index]

# ---------- 5. quantitative statistical ----------

def quant_score(d):
    """12-1 month momentum, 3-month trend and 1-week reversal, each divided by volatility."""
    c, vol = d.close, d.ret.rolling(63).std()
    mom = (c.shift(21) / c.shift(252) - 1) / (vol * np.sqrt(231))
    trend = (c / c.shift(63) - 1) / (vol * np.sqrt(63))
    rev = -(c / c.shift(5) - 1) / (d.ret.rolling(20).std() * np.sqrt(5))
    return 0.45 * np.tanh(mom / 2) + 0.35 * np.tanh(trend / 2) + 0.20 * np.tanh(rev / 2)

# ---------- 4. market regime ----------

def regime(bench):
    """bench: benchmark OHLCV. Returns (score series, description of the latest day)."""
    c = bench.close
    s50, s200 = sma(c, 50), sma(c, 200)
    trend = pd.Series(np.where((c > s200) & (s50 > s200), 1.0, np.where((c < s200) & (s50 < s200), -1.0, 0.0)), c.index)
    vol = c.pct_change().rolling(20).std()
    volpct = vol.rolling(252).rank(pct=True)
    score = trend.where(~((trend > 0) & (volpct > 0.8)), 0.5)  # an uptrend with spiking volatility counts half
    score[s200.isna()] = np.nan
    t, hv = trend.iloc[-1], bool(volpct.iloc[-1] > 0.8) if pd.notna(volpct.iloc[-1]) else None
    label = {1.0: "bull", -1.0: "bear", 0.0: "sideways"}[t] if pd.notna(s200.iloc[-1]) else "unknown"
    return score, {"label": label, "high_volatility": hv, "close": float(c.iloc[-1]),
                   "sma50": _f(s50.iloc[-1]), "sma200": _f(s200.iloc[-1]),
                   "volatility_percentile_1y": _f(volpct.iloc[-1])}


def core_score(d, regime_score):
    """The score that gets calibrated. Weights are fixed and published, never tuned on outcomes."""
    reg = regime_score.reindex(d.index).ffill()
    return 0.5 * technical_score(d) + 0.3 * quant_score(d) + 0.2 * reg

# ---------- 2. fundamental ----------

# field: (good if value is ">" or "<" than strong threshold, strong, weak)
FUND_RULES = {
    "revenue_growth": (">", 12, 0), "profit_growth": (">", 15, 0), "qoq_profit_growth": (">", 5, -10),
    "roe": (">", 15, 8), "roce": (">", 15, 8), "debt_to_equity": ("<", 0.5, 1.5),
    "operating_margin": (">", 15, 5), "operating_cash_flow": (">", 0, 0), "eps": (">", 0, 0),
    "promoter_holding": (">", 50, 25), "pledged_pct": ("<", 1, 20),
}


def fundamental_view(row, peers=None):
    """row: dict of one company's metrics (percent values as numbers). peers: DataFrame of same-sector rows."""
    pts, reasons = [], []
    for k, (op, strong, weak) in FUND_RULES.items():
        x = row.get(k)
        if x is None or pd.isna(x):
            continue
        good, bad = (x >= strong, x < weak) if op == ">" else (x <= strong, x > weak)
        p = 1 if good else -1 if bad else 0
        pts.append(p)
        reasons.append({"rule": k, "value": float(x), "signal": {1: "strong", -1: "weak", 0: "average"}[p]})
    for k in ("pe", "pb"):  # valuation is judged against sector peers only
        x = row.get(k)
        if peers is not None and x is not None and pd.notna(x) and k in peers and peers[k].notna().sum() >= 3:
            med = float(peers[k].median())
            p = 1 if 0 < x < 0.8 * med else -1 if (x > 1.5 * med or x <= 0) else 0
            pts.append(p)
            reasons.append({"rule": f"{k}_vs_peers", "value": float(x), "peer_median": med,
                            "signal": {1: "cheap", -1: "expensive", 0: "in line"}[p]})
    if len(pts) < 6:
        return None  # too little data to call a company strong or weak
    score = float(np.mean(pts))
    return {"score": score, "label": "strong" if score >= 0.4 else "weak" if score <= -0.2 else "average",
            "reasons": reasons, "fields_used": len(pts), "as_of": str(row.get("as_of", "")), "source": row.get("source", "")}

# ---------- 3. news sentiment ----------

POS = set("""surge surges soar soars jump jumps gain gains rally rallies beat beats record profit profits upgrade upgrades
upgraded wins win bags order orders growth strong boost boosts approval approves approved expansion dividend buyback
outperform rises rise up higher bullish recovery raises""".split())
NEG = set("""fall falls plunge plunges slump slumps drop drops loss losses miss misses downgrade downgrades downgraded
probe fraud default defaults penalty fine fined resign resigns resignation weak cut cuts decline declines lawsuit
ban raid raids crash crashes lower bearish slowdown warns warning sell-off selloff pledge pledged insolvency""".split())


def sentiment(text):
    words = re.findall(r"[a-z\-]+", text.lower())
    p, n = sum(w in POS for w in words), sum(w in NEG for w in words)
    s = 0.0 if p + n == 0 else (p - n) / (p + n)
    return s, "positive" if s > 0.2 else "negative" if s < -0.2 else "neutral"


def _f(x):
    return None if pd.isna(x) else float(x)
