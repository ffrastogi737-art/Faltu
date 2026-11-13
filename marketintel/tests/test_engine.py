import numpy as np
import pandas as pd
import pytest

from marketintel import engine as E
from marketintel.config import Settings
from marketintel.models import fundamental_view, regime, sentiment
from marketintel.tradingdays import is_trading_day, last_session, sessions_between
from marketintel.validate import validate_ohlcv
from datetime import date


def bars(rows):
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"], index=pd.bdate_range("2025-01-01", periods=len(rows)))


def test_calibrator_recovers_frequencies_and_refuses_thin_buckets():
    rng = np.random.default_rng(0)
    score = rng.uniform(-1, 1, 20000)
    p_up = 0.2 + 0.3 * (score > 0)  # 50% up when score > 0, else 20%
    u = rng.uniform(size=20000)
    label = np.where(u < p_up, 1, np.where(u < p_up + 0.3, -1, 0))
    cal = E.Calibrator(score, label, label * 0.02)
    hi, lo = cal.predict(0.9), cal.predict(-0.9)
    assert hi["p_bull"] == pytest.approx(0.5, abs=0.04) and lo["p_bull"] == pytest.approx(0.2, abs=0.04)
    assert hi["p_bull"] + hi["p_bear"] + hi["p_neutral"] == pytest.approx(1)
    assert hi["ret_q25"] <= hi["ret_median"] <= hi["ret_q75"]
    assert E.Calibrator(score[:200], label[:200], label[:200]).predict(0.9, min_bin=100) is None
    assert E.Calibrator([], [], []).predict(0.1) is None and cal.predict(float("nan")) is None


def test_calibrator_only_sees_finished_outcomes(market):
    prices, bench, _ = market
    reg, _ = regime(bench)
    d = E.prepare(prices["SYN01"], reg, 5)
    t = d.index[600]
    cal = E.fit_calibrator({"SYN01": d}, t)
    assert cal.n_total == int(((d.known <= t) & d.score.notna() & d.label.notna()).sum())
    assert cal.n_total < int((d.index <= t).sum())  # the last 5 days before t are not usable yet


def test_decide_thresholds_and_conflicts():
    cfg = Settings()
    up = {"p_bull": 0.5, "p_bear": 0.2, "p_neutral": 0.3}
    assert E.decide(up, cfg)[0] == "BUY"
    assert E.decide({"p_bull": 0.2, "p_bear": 0.5, "p_neutral": 0.3}, cfg)[0] == "SELL"
    assert E.decide({"p_bull": 0.41, "p_bear": 0.38, "p_neutral": 0.21}, cfg)[0] == "WAIT"  # edge too small
    assert E.decide(None, cfg)[0] == "WAIT"
    d, notes = E.decide(up, cfg, fundamental={"label": "weak"})
    assert d == "WAIT" and "conflict" in notes[0]
    assert E.decide(up, cfg, news_score=-0.8)[0] == "WAIT"
    assert E.decide(up, cfg, fundamental={"label": "strong"}, news_score=0.5)[0] == "BUY"


def test_setup_levels():
    b, s = E.setup("BUY", 100, 2), E.setup("SELL", 100, 2)
    assert (b["stop"], b["target1"], b["target2"]) == (97, 104, 106) and b["rr1"] == 1.33 and b["rr2"] == 2
    assert (s["stop"], s["target1"], s["target2"]) == (103, 96, 94)


def test_simulate_all_exits():
    # target hit on day 2
    r = E.simulate(bars([(100, 101, 99, 100), (100, 105, 99.5, 104)]), "BUY", 97, 104, 5)
    assert r["outcome"] == "target" and r["ret"] == pytest.approx(0.04) and r["mfe"] == pytest.approx(0.05) and r["mae"] == pytest.approx(-0.01)
    # stop and target inside the same bar: stop wins
    assert E.simulate(bars([(100, 106, 96, 100)]), "BUY", 97, 104, 5)["outcome"] == "stop"
    # gap below the stop fills at the open, not at the stop
    r = E.simulate(bars([(100, 101, 99, 100), (94, 95, 93, 94)]), "BUY", 97, 104, 5)
    assert r["outcome"] == "stop" and r["exit_price"] == 94
    # time exit, with costs
    r = E.simulate(bars([(100, 101, 99, 100)] * 3), "BUY", 90, 110, 3, cost_bps=20)
    assert r["outcome"] == "time" and r["ret"] == pytest.approx(-0.002)
    # short: price falls to the target
    r = E.simulate(bars([(100, 100.5, 95, 96)]), "SELL", 103, 96, 5)
    assert r["outcome"] == "target" and r["ret"] == pytest.approx(0.04) and r["mfe"] == pytest.approx(0.05)
    # horizon not finished and nothing hit: still open
    assert E.simulate(bars([(100, 101, 99, 100)] * 2), "BUY", 90, 110, 5) is None
    assert E.simulate(bars([]), "BUY", 90, 110, 5) is None


def test_metrics_and_brier():
    t = pd.DataFrame({"date": pd.to_datetime(["2025-01-06", "2025-01-06", "2025-01-13", "2025-01-20"]),
                      "direction": ["BUY", "SELL", "BUY", "BUY"], "ret": [0.04, -0.02, -0.03, 0.06],
                      "sector": ["IT", "IT", None, "Energy"], "bench_ret": [0.01, 0.01, -0.01, 0.02]})
    m = E.metrics(t)
    assert m["trades"] == 4 and m["win_rate"] == 0.5 and m["avg_return"] == pytest.approx(0.0125)
    assert m["profit_factor"] == pytest.approx(2.0)
    assert m["total_return"] == pytest.approx(1.01 * 0.97 * 1.06 - 1)
    assert m["max_drawdown"] == pytest.approx(-0.03)
    assert m["benchmark_return"] == pytest.approx(1.01 * 0.99 * 1.02 - 1)
    assert m["bullish_accuracy"] == pytest.approx(2 / 3) and m["bearish_accuracy"] == 0
    assert m["by_sector"]["IT"]["trades"] == 2 and "Unknown" in m["by_sector"]
    assert E.metrics(t.iloc[:0]) == {"trades": 0}
    assert E.brier([[1, 0, 0], [0, 1, 0]], [1, -1]) == 0
    assert E.brier([[1 / 3] * 3], [0]) == pytest.approx(2 / 3)


def test_backtest_runs_and_cannot_see_the_future(market):
    prices, bench, inst = market
    cfg = Settings()
    sectors = {s: i["sector"] for s, i in inst.items()}
    res, trades = E.backtest(prices, bench, cfg, sectors)
    assert res["trades"] > 20 and res["predictions_scored"] > 1000
    assert 0 < res["brier"] < 0.75 and res["survivorship_warning"]
    assert set(res["by_sector"]) <= set(sectors.values())
    assert (trades.exit_date > trades.date).all()  # nothing fills on the decision day itself
    # rerun with the last 100 sessions deleted: every trade that had finished by then must be identical
    cut = bench.index[-100]
    res2, trades2 = E.backtest({s: d.loc[:cut] for s, d in prices.items()}, bench.loc[:cut], cfg, sectors)
    old = trades[trades.exit_date <= cut].reset_index(drop=True)
    pd.testing.assert_frame_equal(old, trades2[trades2.date.isin(old.date)].reset_index(drop=True))


def test_analyze_never_calls_on_bad_or_short_data(market):
    prices, bench, inst = market
    cfg = Settings()
    q = {"SYN00": {"ok": True, "stale": True, "issues": ["stale: last bar old"]}}
    rep = E.analyze({**prices, "SHORT": prices["SYN01"].tail(50)}, bench, cfg, bench.index[-1], inst, quality=q)
    skipped = {s["symbol"]: s["reason"] for s in rep["skipped"]}
    assert "stale" in skipped["SYN00"] and "bars" in skipped["SHORT"]
    assert all(s["symbol"] not in skipped for s in rep["stocks"])
    for lst in rep["rankings"].values():
        assert len(lst["items"]) <= 10 and lst["rule"]
    assert rep["rankings"]["long_term"]["items"] == []  # no fundamentals supplied, so nothing is invented
    for s in rep["setups"]:
        assert s["direction"] in ("BUY", "SELL") and s["samples"] >= cfg.min_bin
        assert (s["stop"] < s["price"] < s["target1"] < s["target2"]) if s["direction"] == "BUY" else (s["stop"] > s["price"] > s["target1"])
        assert bool(s["short_selling_note"]) == (s["direction"] == "SELL")
        assert "No fundamentals" in s["fundamental_reasoning"] and "missing input: fundamentals" in s["risks"]


def test_fundamental_view():
    good = dict(revenue_growth=20, profit_growth=25, roe=22, roce=24, debt_to_equity=0.1, operating_margin=25,
                promoter_holding=60, pledged_pct=0, pe=15, as_of="2026-09-30", source="test")
    peers = pd.DataFrame({"pe": [30, 32, 28, 35]})
    v = fundamental_view(good, peers)
    assert v["label"] == "strong" and any(r["rule"] == "pe_vs_peers" and r["signal"] == "cheap" for r in v["reasons"])
    bad = dict(revenue_growth=-5, profit_growth=-30, roe=3, roce=4, debt_to_equity=2.5, operating_margin=2, pledged_pct=45)
    assert fundamental_view(bad)["label"] == "weak"
    assert fundamental_view({"roe": 30, "pe": 10}) is None  # too few fields to judge


def test_sentiment_and_regime(market):
    assert sentiment("Company profit surges, wins record order")[1] == "positive"
    assert sentiment("Regulator probe after fraud, shares plunge")[1] == "negative"
    assert sentiment("Board meeting scheduled for Friday")[1] == "neutral"
    up = pd.DataFrame({"close": np.linspace(100, 200, 400)}, index=pd.bdate_range("2024-01-01", periods=400))
    assert regime(up)[1]["label"] == "bull" and regime(up[::-1].set_axis(up.index))[1]["label"] == "bear"
    assert regime(up.iloc[:50])[1]["label"] == "unknown"


def test_trading_days_and_validation():
    hol = frozenset({date(2026, 1, 26)})
    assert not is_trading_day(date(2026, 1, 24)) and not is_trading_day(date(2026, 1, 26), hol) and is_trading_day(date(2026, 1, 27), hol)
    assert last_session(date(2026, 1, 26), hol) == date(2026, 1, 23)
    assert sessions_between(date(2026, 1, 23), date(2026, 1, 28), hol) == [date(2026, 1, 27), date(2026, 1, 28)]
    idx = pd.to_datetime(["2026-01-20", "2026-01-21", "2026-01-21", "2026-01-22", "2026-01-23"])
    df = pd.DataFrame({"open": [10, 10, 10, 10, 10.0], "high": [11, 11, 11, 9, 11.0], "low": [9, 9, 9, 9.5, 9.0],
                       "close": [10, 10, 10, 10, 10.0], "volume": [5, 5, 5, 5, 5.0]}, index=idx)
    clean, q = validate_ohlcv(df, date(2026, 1, 23), hol)
    assert len(clean) == 3 and q["ok"] and not q["stale"] and len(q["issues"]) == 2
    _, q = validate_ohlcv(df, date(2026, 1, 27), hol)  # the 26th is a holiday, so only the 27th is missing
    assert q["stale"] and "1 sessions behind" in q["issues"][-1]
    _, q = validate_ohlcv(None, date(2026, 1, 23))
    assert not q["ok"]
    df2 = df.iloc[[0, 1, 4]].copy()
    df2.iloc[2] = [20, 22, 18, 20, 5]  # +100% in a day: likely an unadjusted corporate action
    assert not validate_ohlcv(df2, date(2026, 1, 23))[1]["ok"]


def test_negative_control_no_signal_means_no_edge():
    """Pure random walks carry no information: the model must not manufacture skill or a flood of calls."""
    from marketintel import synthetic
    prices, bench, _ = synthetic.market(date(2026, 11, 11), momentum=0.0)
    for d in prices.values():  # remove the per-stock drift too
        d.attrs.clear()
    flat = {s: synthetic.series(i + 1, date(2026, 11, 11), drift=0.0) for i, s in enumerate(prices)}
    res, trades = E.backtest(flat, bench, Settings())
    assert res["brier"] >= res["brier_base_rate"] - 0.003
    assert res["trades"] == 0 or abs(res["avg_return"]) < 0.01
