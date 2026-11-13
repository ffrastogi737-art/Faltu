"""Checks every price series before any model sees it. Bad rows are dropped and reported, never repaired."""
from dataclasses import asdict, dataclass, field

import pandas as pd

from .tradingdays import last_session, sessions_between


@dataclass
class Quality:
    ok: bool = True
    stale: bool = False
    last_date: str | None = None
    bars: int = 0
    issues: list = field(default_factory=list)


def validate_ohlcv(df, expected_last, holidays=frozenset(), max_stale_sessions=0):
    """Returns (clean df, Quality dict). expected_last: the latest completed trading session."""
    q = Quality()
    if df is None or len(df) == 0:
        return df, asdict(Quality(ok=False, issues=["no data returned"]))
    df = df.sort_index()
    dup = int(df.index.duplicated().sum())
    if dup:
        q.issues.append(f"{dup} duplicate dates dropped")
        df = df[~df.index.duplicated(keep="last")]
    cols = ["open", "high", "low", "close"]
    bad = df[cols].isna().any(axis=1) | (df[cols] <= 0).any(axis=1) | (df.high < df[cols].max(axis=1)) \
        | (df.low > df[cols].min(axis=1)) | (df.volume < 0)
    if bad.any():
        q.issues.append(f"{int(bad.sum())} rows with missing or impossible OHLC dropped")
        df = df[~bad]
    if len(df) == 0:
        return df, asdict(Quality(ok=False, issues=q.issues + ["no valid rows"]))
    last = df.index[-1].date()
    missed = sessions_between(last, last_session(expected_last, holidays), holidays)
    if len(missed) > max_stale_sessions:
        q.stale = True
        q.issues.append(f"stale: last bar {last}, expected {expected_last} ({len(missed)} sessions behind)")
    # a jump of more than 10 calendar days between bars means missing sessions (or a long suspension)
    gaps = int((pd.Series(df.index).diff().dt.days > 10).sum())
    if gaps:
        q.issues.append(f"{gaps} gaps longer than 10 days in history")
    jumps = int((df.close.pct_change().abs() > 0.4).sum())
    if jumps:
        q.issues.append(f"{jumps} daily moves over 40% (unadjusted split/bonus or bad tick?)")
        q.ok = False  # do not trade a series that may contain an unadjusted corporate action
    q.last_date, q.bars = str(last), len(df)
    return df, asdict(q)
