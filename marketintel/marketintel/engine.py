"""Calibration, decision rules, trade setups, trade simulation, metrics and the walk-forward backtest.

Probabilities here are frequencies observed in past, already-finished predictions with a similar
score. They are never an opinion and never an LLM's confidence.
"""
import numpy as np
import pandas as pd

from .indicators import add_all, levels
from .models import core_score, regime, technical_reasons, technical_score, quant_score

SHORT_NOTE = ("Short selling in the NSE/BSE cash market is intraday only: the position must be squared off the same "
              "day, and stocks in the T2T/BE series cannot be shorted at all. An overnight bearish position needs "
              "futures or options (F&O stocks only) or SLB. For holders, SELL here means consider exiting or avoiding.")


def prepare(df, regime_score, horizon):
    """Indicators + calibrated-score inputs + forward outcome of every past date.

    Outcome of date t: buy at the open of t+1, sell at the close of t+horizon. `known` is the date
    on which that outcome became observable; a calibrator may only use rows with known <= today.
    """
    d = add_all(df)
    d["score"] = core_score(d, regime_score)
    d["fwd"] = d.close.shift(-horizon) / d.open.shift(-1) - 1
    d["thr"] = 0.5 * d.ret.rolling(20).std() * np.sqrt(horizon)  # move needed to count as up/down
    d["label"] = np.where(d.fwd > d.thr, 1.0, np.where(d.fwd < -d.thr, -1.0, 0.0))
    d.loc[d.fwd.isna() | d.thr.isna(), "label"] = np.nan
    d["known"] = pd.Series(d.index, d.index).shift(-horizon)
    return d


class Calibrator:
    """Score -> (bullish, bearish, neutral) frequency, from equal-count score buckets."""

    def __init__(self, scores, labels, fwd, bins=10):
        scores, labels, fwd = map(np.asarray, (scores, labels, fwd))
        self.n_total = len(scores)
        self.edges = np.unique(np.quantile(scores, np.linspace(0, 1, bins + 1)[1:-1])) if len(scores) else np.array([])
        idx = np.searchsorted(self.edges, scores)
        self.base = [float((labels == k).mean()) if len(labels) else 1 / 3 for k in (1, -1, 0)]
        self.bins = []
        for b in range(len(self.edges) + 1):
            m = idx == b
            n = int(m.sum())
            lab = labels[m]
            # Laplace smoothing keeps a small bucket from claiming 0% or 100%
            p = [float(((lab == k).sum() + 1) / (n + 3)) for k in (1, -1, 0)]
            q = [float(x) for x in np.quantile(fwd[m], [0.25, 0.5, 0.75])] if n else [None] * 3
            self.bins.append({"n": n, "p": p, "q": q})

    def predict(self, score, min_bin=100):
        if not self.bins or pd.isna(score):
            return None
        b = self.bins[int(np.searchsorted(self.edges, score))]
        if b["n"] < min_bin:
            return None
        return {"p_bull": b["p"][0], "p_bear": b["p"][1], "p_neutral": b["p"][2], "samples": b["n"],
                "ret_q25": b["q"][0], "ret_median": b["q"][1], "ret_q75": b["q"][2]}


def fit_calibrator(frames, as_of):
    """Pool every symbol's rows whose outcome was already known on `as_of`."""
    parts = [d.loc[(d.known <= as_of) & d.score.notna() & d.label.notna(), ["score", "label", "fwd"]] for d in frames.values()]
    pool = pd.concat(parts) if parts else pd.DataFrame(columns=["score", "label", "fwd"])
    return Calibrator(pool.score, pool.label, pool.fwd)


def decide(prob, cfg, fundamental=None, news_score=None):
    """BUY/SELL only when the calibrated edge clears both thresholds and no overlay contradicts it."""
    if prob is None:
        return "WAIT", ["no calibrated probability for this score (too little history)"]
    notes, d = [], "WAIT"
    if prob["p_bull"] >= cfg.min_prob and prob["p_bull"] - prob["p_bear"] >= cfg.min_edge: d = "BUY"
    elif prob["p_bear"] >= cfg.min_prob and prob["p_bear"] - prob["p_bull"] >= cfg.min_edge: d = "SELL"
    sign = {"BUY": 1, "SELL": -1, "WAIT": 0}[d]
    if sign and fundamental and fundamental["label"] == ("weak" if sign > 0 else "strong"):
        notes.append(f"conflict: fundamentals are {fundamental['label']} against a {d} signal")
    if sign and news_score is not None and news_score * sign <= -0.5:
        notes.append(f"conflict: recent news sentiment ({news_score:+.2f}) opposes a {d} signal")
    return ("WAIT" if notes else d), notes


def setup(direction, close, atr):
    """ATR-based levels around the last verified close. Same rule in live use and in the backtest."""
    s = 1 if direction == "BUY" else -1
    return {"entry_low": round(close - 0.25 * atr, 2), "entry_high": round(close + 0.25 * atr, 2),
            "stop": round(close - s * 1.5 * atr, 2), "target1": round(close + s * 2.0 * atr, 2),
            "target2": round(close + s * 3.0 * atr, 2), "rr1": round(2.0 / 1.5, 2), "rr2": round(3.0 / 1.5, 2)}


def simulate(bars, direction, stop, target, horizon, cost_bps=0.0):
    """bars: sessions strictly after the prediction date. Entry at the first open.

    If stop and target are both inside one bar, the stop is assumed to hit first.
    Returns None while fewer than `horizon` bars exist and neither level was hit.
    """
    if len(bars) == 0:
        return None
    s = 1 if direction == "BUY" else -1
    entry = float(bars.open.iloc[0])
    exit_price = outcome = exit_date = None
    for i, (dt, b) in enumerate(bars.iloc[:horizon].iterrows()):
        adverse, favor = (b.low, b.high) if s > 0 else (b.high, b.low)
        if (adverse - stop) * s <= 0:
            exit_price, outcome = (min(stop, b.open) if s > 0 else max(stop, b.open)), "stop"
        elif (favor - target) * s >= 0:
            exit_price, outcome = (max(target, b.open) if s > 0 else min(target, b.open)), "target"
        elif i == horizon - 1:
            exit_price, outcome = b.close, "time"
        if outcome:
            exit_date, held = dt, bars.iloc[: i + 1]
            break
    if not outcome:
        return None
    hi, lo = float(held.high.max()) / entry - 1, float(held.low.min()) / entry - 1
    return {"entry": entry, "exit_price": float(exit_price), "exit_date": exit_date, "outcome": outcome,
            "ret": s * (float(exit_price) / entry - 1) - cost_bps / 1e4,
            "mfe": hi if s > 0 else -lo, "mae": lo if s > 0 else -hi}


def brier(probs, labels):
    """Three-class Brier score (0 = perfect, 0.667 = always saying one third each)."""
    p = np.asarray(probs, float).reshape(-1, 3)
    lab = np.asarray(labels)
    o = np.stack([lab == 1, lab == -1, lab == 0], axis=1).astype(float)
    return float(((p - o) ** 2).sum(axis=1).mean()) if len(p) else None


def metrics(trades, periods_per_year=252 / 5):
    """trades: DataFrame with date, direction, ret, sector, bench_ret. One portfolio return per date (equal weight)."""
    if len(trades) == 0:
        return {"trades": 0}
    r = trades.ret
    wins, losses = r[r > 0].sum(), -r[r <= 0].sum()
    per = trades.groupby("date").ret.mean().sort_index()
    eq = (1 + per).cumprod()
    bench = trades.groupby("date").bench_ret.first().sort_index()
    side = lambda d: _n(trades.ret[trades.direction == d].gt(0).mean())
    return {
        "trades": int(len(r)), "win_rate": float((r > 0).mean()), "avg_return": float(r.mean()),
        "profit_factor": float(wins / losses) if losses > 0 else None,
        "max_drawdown": float((eq / eq.cummax() - 1).min()),
        "sharpe": float(per.mean() / per.std() * np.sqrt(periods_per_year)) if len(per) > 1 and per.std() > 0 else None,
        "total_return": float(eq.iloc[-1] - 1), "benchmark_return": _n((1 + bench.dropna()).prod() - 1),
        "bullish_accuracy": side("BUY"), "bearish_accuracy": side("SELL"),
        "by_sector": {k: {"trades": int(len(g)), "win_rate": float((g > 0).mean()), "avg_return": float(g.mean())}
                      for k, g in trades.groupby(trades.sector.fillna("Unknown")).ret},
        "equity": [{"date": str(pd.Timestamp(k).date()), "value": float(v)} for k, v in eq.items()],
    }


def backtest(prices, bench, cfg, sectors=None, warmup=250):
    """Walk-forward test. On each decision date only data up to that date is visible:
    indicators are causal, the calibrator sees only finished outcomes, entry is the NEXT open.

    Limit that code cannot remove: `prices` holds whichever symbols you pass in. If that is today's
    index membership, delisted and dropped companies are missing (survivorship bias) and the
    result is optimistic. Pass point-in-time constituents to avoid it.
    """
    h, sectors = cfg.horizon, sectors or {}
    reg, _ = regime(bench)
    frames = {s: prepare(df, reg, h) for s, df in prices.items() if len(df) >= cfg.min_bars}
    dates = bench.index[cfg.min_bars + warmup:: h]
    trades, probs, labels = [], [], []
    for t in dates:
        cal = fit_calibrator(frames, t)
        picks = []
        for s, d in frames.items():
            if t not in d.index:
                continue
            row = d.loc[t]
            p = cal.predict(row.score, cfg.min_bin)
            if p is None:
                continue
            if pd.notna(row.label):
                probs.append([p["p_bull"], p["p_bear"], p["p_neutral"]]); labels.append(row.label)
            direction, _ = decide(p, cfg)
            if direction != "WAIT" and pd.notna(row.atr):
                picks.append((p["p_bull"] if direction == "BUY" else p["p_bear"], s, direction, row))
        after_b = bench.loc[bench.index > t].iloc[:h]
        bench_ret = float(after_b.close.iloc[-1] / after_b.open.iloc[0] - 1) if len(after_b) == h else None
        for side in ("BUY", "SELL"):
            for _, s, direction, row in sorted((x for x in picks if x[2] == side), key=lambda x: -x[0])[: cfg.top_n]:
                lv = setup(direction, row.close, row.atr)
                d = frames[s]
                res = simulate(d.loc[d.index > t], direction, lv["stop"], lv["target1"], h, cfg.cost_bps)
                if res:
                    trades.append({"date": t, "symbol": s, "direction": direction, "sector": sectors.get(s),
                                   "bench_ret": bench_ret, **res})
    tdf = pd.DataFrame(trades, columns=["date", "symbol", "direction", "sector", "bench_ret", "entry", "exit_price",
                                        "exit_date", "outcome", "ret", "mfe", "mae"])
    out = metrics(tdf, 252 / h)
    lab = np.asarray(labels)
    base = [float((lab == k).mean()) for k in (1, -1, 0)] if len(lab) else None
    out.update({"decision_dates": len(dates), "predictions_scored": len(labels), "brier": brier(probs, labels),
                "brier_base_rate": brier([base] * len(lab), lab) if base else None, "horizon_days": h,
                "cost_bps": cfg.cost_bps, "symbols": len(frames),
                "survivorship_warning": "Universe is whatever was supplied; current index members only => optimistic."})
    return out, tdf


def analyze(prices, bench, cfg, as_of, instruments=None, fundamentals=None, news=None, quality=None):
    """Pure function: validated data in, the full daily research report out. No I/O.

    prices: {symbol: OHLCV df}; instruments: {symbol: {name, sector, fno, indices}};
    fundamentals: {symbol: fundamental_view dict}; news: {symbol: mean sentiment};
    quality: {symbol: validate.Quality as dict}. Anything with failed/stale quality is skipped.
    """
    instruments, fundamentals, news, quality = instruments or {}, fundamentals or {}, news or {}, quality or {}
    reg_score, reg_info = regime(bench)
    frames, skipped = {}, []
    for s, df in prices.items():
        q = quality.get(s, {"ok": True, "stale": False, "issues": []})
        if not q["ok"] or q["stale"] or len(df) < cfg.min_bars:
            skipped.append({"symbol": s, "reason": "; ".join(q["issues"]) or f"only {len(df)} bars, need {cfg.min_bars}"})
            continue
        frames[s] = prepare(df, reg_score, cfg.horizon)
    cal = fit_calibrator(frames, as_of)
    stocks = []
    for s, d in frames.items():
        r = d.iloc[-1]
        if pd.isna(r.score) or pd.isna(r.atr):
            skipped.append({"symbol": s, "reason": "indicators not computable"}); continue
        prob = cal.predict(r.score, cfg.min_bin)
        fund, ns, ins = fundamentals.get(s), news.get(s), instruments.get(s, {})
        direction, notes = decide(prob, cfg, fund, ns)
        missing = [n for n, x in (("fundamentals", fund), ("news", ns)) if x is None]
        atr_pct = float(r.atr / r.close)
        risk = "high" if atr_pct > 0.03 or reg_info["high_volatility"] else "medium" if atr_pct > 0.015 else "low"
        p_dir = max(prob["p_bull"], prob["p_bear"]) if prob else None
        st = {
            "symbol": s, "name": ins.get("name", s), "sector": ins.get("sector"), "fno": bool(ins.get("fno")),
            "indices": ins.get("indices", []), "price": float(r.close), "price_date": str(d.index[-1].date()),
            "direction": direction, "score": float(r.score), "technical_score": float(technical_score(d).iloc[-1]),
            "quant_score": _n(quant_score(d).iloc[-1]), "prob": prob, "notes": notes, "missing": missing,
            # evidence-strength index 0-100, NOT a probability: edge over a coin-toss third, shrunk for thin samples
            "confidence": round(100 * max(0.0, (p_dir - 1 / 3) / (2 / 3)) * min(1, prob["samples"] / 500)) if prob else 0,
            "risk": risk, "atr": float(r.atr), "atr_pct": atr_pct, "rsi": _n(r.rsi), "adx": _n(r.adx), "rvol": _n(r.rvol),
            "hi20": _n(r.hi20), "lo20": _n(r.lo20), "hi252": _n(r.hi252), "lo252": _n(r.lo252),
            "label_thr": _n(r.thr), "fundamental": fund, "news_score": ns,
            "technical": technical_reasons(d), "levels": levels(d),
        }
        stocks.append(st)
    return {"as_of": str(pd.Timestamp(as_of).date()), "regime": reg_info, "stocks": stocks, "skipped": skipped,
            "calibration": {"samples": cal.n_total, "base_rates": dict(zip(("bull", "bear", "neutral"), cal.base)),
                            "buckets": [{"n": b["n"], "p_bull": b["p"][0], "p_bear": b["p"][1]} for b in cal.bins]},
            "rankings": rankings(stocks, cfg), "setups": [trade_setup(s, cfg) for s in stocks if s["direction"] != "WAIT"]}


def rankings(stocks, cfg):
    """Each list has an entry rule and a sort key. A list is shorter than 10, or empty, when few stocks qualify."""
    n = cfg.top_n
    top = lambda rows, key: [_brief(s) for s in sorted(rows, key=key)[:n]]
    has = lambda s, *ks: all(s.get(k) is not None for k in ks)
    fs = lambda s: (s["fundamental"] or {}).get("score")
    return {
        "bullish": {"rule": f"direction BUY: P(up) >= {cfg.min_prob} and P(up)-P(down) >= {cfg.min_edge}; sorted by P(up)",
                    "items": top([s for s in stocks if s["direction"] == "BUY"], lambda s: -s["prob"]["p_bull"])},
        "bearish": {"rule": f"direction SELL: P(down) >= {cfg.min_prob} and P(down)-P(up) >= {cfg.min_edge}; sorted by P(down)",
                    "items": top([s for s in stocks if s["direction"] == "SELL"], lambda s: -s["prob"]["p_bear"])},
        "breakout": {"rule": "close within 3% below (or above) the 20-day high, ADX > 20, technical score > 0; sorted by relative volume",
                     "items": top([s for s in stocks if has(s, "hi20", "adx", "rvol") and s["price"] >= 0.97 * s["hi20"]
                                   and s["adx"] > 20 and s["technical_score"] > 0], lambda s: -s["rvol"])},
        "breakdown": {"rule": "close within 3% above (or below) the 20-day low, ADX > 20, technical score < 0; sorted by relative volume",
                      "items": top([s for s in stocks if has(s, "lo20", "adx", "rvol") and s["price"] <= 1.03 * s["lo20"]
                                    and s["adx"] > 20 and s["technical_score"] < 0], lambda s: -s["rvol"])},
        "momentum": {"rule": "quant score > 0.3, ADX > 25, technical score > 0; sorted by quant score",
                     "items": top([s for s in stocks if has(s, "quant_score", "adx") and s["quant_score"] > 0.3
                                   and s["adx"] > 25 and s["technical_score"] > 0], lambda s: -s["quant_score"])},
        "long_term": {"rule": "fundamental label 'strong' (score >= 0.4 on at least 6 metrics); sorted by fundamental score. Needs fundamentals data.",
                      "items": top([s for s in stocks if fs(s) is not None and s["fundamental"]["label"] == "strong"], lambda s: -fs(s))},
        "avoid": {"rule": "fundamental label 'weak', or SELL signal with negative news; sorted by fundamental score then P(down)",
                  "items": top([s for s in stocks if (s["fundamental"] or {}).get("label") == "weak"
                                or (s["direction"] == "SELL" and (s["news_score"] or 0) < -0.2)],
                               lambda s: (fs(s) if fs(s) is not None else 0, -(s["prob"] or {}).get("p_bear", 0)))},
    }


def trade_setup(s, cfg):
    d, p = s["direction"], s["prob"]
    lv = setup(d, s["price"], s["atr"])
    f = s["fundamental"]
    return {
        "symbol": s["symbol"], "name": s["name"], "strategy": "positional", "direction": d,
        "price": s["price"], "price_date": s["price_date"], **lv,
        "holding_period": f"up to {cfg.horizon} trading sessions", "horizon_days": cfg.horizon,
        "p_bull": p["p_bull"], "p_bear": p["p_bear"], "p_neutral": p["p_neutral"], "samples": p["samples"],
        "expected_return_range": [p["ret_q25"], p["ret_q75"]], "confidence": s["confidence"], "risk": s["risk"],
        "technical_reasoning": [f"{t['rule']}: {t['signal']} ({t['detail']})" for t in s["technical"] if t["signal"] != "neutral"],
        "fundamental_reasoning": (f"{f['label']} (score {f['score']:+.2f} on {f['fields_used']} metrics, as of {f['as_of']})"
                                  if f else "No fundamentals data loaded: this setup rests on price evidence only."),
        "news": (f"mean recent sentiment {s['news_score']:+.2f}" if s["news_score"] is not None else "No recent news matched."),
        "risks": [f"risk level {s['risk']} (ATR {s['atr_pct'] * 100:.1f}% of price)",
                  f"P(opposite move) {(p['p_bear'] if d == 'BUY' else p['p_bull']) * 100:.0f}%, P(no clear move) {p['p_neutral'] * 100:.0f}%"]
                 + [f"missing input: {m}" for m in s["missing"]],
        "invalidation": [f"close beyond stop {lv['stop']}", f"not triggered inside the entry zone within 1 session",
                         f"{cfg.horizon} sessions pass without target 1", "market regime flips"],
        "short_selling_note": SHORT_NOTE if d == "SELL" else None, "fno": s["fno"],
    }


def _brief(s):
    p = s["prob"] or {}
    return {k: s[k] for k in ("symbol", "name", "sector", "price", "direction", "score", "confidence", "risk", "rvol", "quant_score", "fno")} | {
        "p_bull": p.get("p_bull"), "p_bear": p.get("p_bear"), "fundamental_score": (s["fundamental"] or {}).get("score")}


def _n(x):
    return None if x is None or pd.isna(x) else float(x)
