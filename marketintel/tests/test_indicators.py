import numpy as np
import pandas as pd
import pytest

from marketintel import indicators as ind
from marketintel.engine import prepare
from marketintel.models import regime, technical_votes


def frame(close, spread=1.0, volume=1000.0):
    close = pd.Series(np.asarray(close, float), index=pd.bdate_range("2024-01-01", periods=len(close)))
    return pd.DataFrame({"open": close.shift(1).fillna(close.iloc[0]), "high": close + spread, "low": close - spread,
                         "close": close, "volume": volume})


def test_sma_ema_exact():
    s = pd.Series([1.0, 2, 3, 4, 5])
    assert ind.sma(s, 3).iloc[-1] == 4
    # EMA(3): alpha 0.5, seeded with the first value
    assert ind.ema(s, 3).iloc[-1] == pytest.approx(4.0625)


def test_rsi_extremes_and_midpoint():
    up = pd.Series(np.arange(1, 60, dtype=float))
    assert ind.rsi(up).iloc[-1] == 100
    assert ind.rsi(up[::-1].reset_index(drop=True)).iloc[-1] == 0
    zig = pd.Series([10.0, 11] * 40)
    assert 45 < ind.rsi(zig).iloc[-1] < 55


def test_atr_of_constant_range():
    df = frame([100] * 40, spread=2)
    assert ind.atr(df).iloc[-1] == pytest.approx(4)


def test_macd_bollinger_adx_supertrend_follow_the_trend():
    up, down = ind.add_all(frame(np.linspace(100, 300, 300))), ind.add_all(frame(np.linspace(300, 100, 300)))
    assert up.macd.iloc[-1] > 0 > down.macd.iloc[-1]
    assert up.st_dir.iloc[-1] == 1 and down.st_dir.iloc[-1] == -1
    assert up.st_line.iloc[-1] < up.close.iloc[-1] and down.st_line.iloc[-1] > down.close.iloc[-1]
    assert up.adx.iloc[-1] > 40 and up.pdi.iloc[-1] > up.mdi.iloc[-1]
    assert (up.bb_up > up.sma20).iloc[-1] and (up.bb_lo < up.sma20).iloc[-1]
    assert technical_votes(up).iloc[-1].mean() > 0.5 and technical_votes(down).iloc[-1].mean() < -0.5


def test_vwap_rvol_gap_breakout():
    df = frame([100.0] * 60)
    df.iloc[-1, df.columns.get_loc("volume")] = 3000
    df.iloc[-1, df.columns.get_loc("open")] = 105
    df.iloc[-1, df.columns.get_loc("close")] = 106
    df.iloc[-1, df.columns.get_loc("high")] = 107
    a = ind.add_all(df)
    assert a.rvol.iloc[-1] == pytest.approx(3)
    assert a.gap_pct.iloc[-1] == pytest.approx(0.05)
    assert a.hi20.iloc[-1] == 101 and a.close.iloc[-1] > a.hi20.iloc[-1]
    assert 100 < a.vwap20.iloc[-1] < 102


def test_levels():
    x = np.r_[np.linspace(100, 120, 20), np.linspace(120, 105, 20), np.linspace(105, 112, 10)]
    lv = ind.levels(frame(x, spread=0.5))
    assert lv["resistance"] and lv["resistance"][0] == pytest.approx(120.5)
    assert lv["range_high"] == pytest.approx(120.5) and lv["range_low"] == pytest.approx(99.5)
    assert lv["fib"]["0.5"] == pytest.approx(110)


def test_no_look_ahead(market):
    """Every indicator, score and regime value at day t must be identical when later days are deleted."""
    prices, bench, _ = market
    df = prices["SYN03"]
    cut = 700
    reg_full, _ = regime(bench)
    reg_cut, _ = regime(bench.iloc[:cut])
    pd.testing.assert_series_equal(reg_full.iloc[:cut], reg_cut)
    full, part = prepare(df, reg_full, 5), prepare(df.iloc[:cut], reg_cut, 5)
    causal = [c for c in full.columns if c not in ("fwd", "label", "known")]
    pd.testing.assert_frame_equal(full[causal].iloc[:cut], part[causal])
    # the forward-looking columns are the ones a calibrator must gate with `known`
    assert part.label.iloc[-5:].isna().all() and part.known.iloc[-5:].isna().all()
