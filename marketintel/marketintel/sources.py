"""Data connectors. Every result carries its source name and fetch time. A connector that
fails raises SourceError; callers record the gap. Nothing here ever invents a value.

Licensing: Yahoo Finance and nseindia.com are not licensed exchange feeds. They are optional,
for personal research only, and can be switched off (ENABLE_YAHOO, ENABLE_NSE_API,
ENABLE_NSE_LISTS). For anything commercial or redistributed, plug a licensed vendor in here.
"""
import csv
import hashlib
import io
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx
import pandas as pd

from .config import IST
from .db import now

UA = {"User-Agent": "Mozilla/5.0 (research client)", "Accept": "*/*"}
NSE_LISTS = {
    "NIFTY 50": "ind_nifty50list.csv", "NIFTY NEXT 50": "ind_niftynext50list.csv", "NIFTY 500": "ind_nifty500list.csv",
    "NIFTY MIDCAP 150": "ind_niftymidcap150list.csv", "NIFTY SMALLCAP 250": "ind_niftysmallcap250list.csv",
}


class SourceError(Exception):
    pass


class Http:
    """Shared client: global rate limit, retries with backoff, hard response-size cap."""

    def __init__(self, per_sec=2.0, retries=3, transport=None, sleep=time.sleep):
        self.c = httpx.Client(headers=UA, timeout=20, follow_redirects=True, transport=transport)
        self.gap, self.retries, self.sleep, self.last = 1 / per_sec, retries, sleep, 0.0

    def get(self, url, **kw):
        err = None
        for attempt in range(self.retries):
            wait = self.gap - (time.monotonic() - self.last)
            if wait > 0:
                self.sleep(wait)
            self.last = time.monotonic()
            try:
                r = self.c.get(url, **kw)
                if r.status_code == 200 and len(r.content) < 20_000_000:
                    return r
                err = f"HTTP {r.status_code}"
                if r.status_code in (400, 401, 403, 404):
                    break  # retrying will not help
            except httpx.HTTPError as e:
                err = type(e).__name__
            self.sleep(2 ** attempt)
        raise SourceError(f"{url.split('?')[0]}: {err}")


def yahoo_symbol(symbol, exchange="NSE"):
    return symbol if symbol.startswith("^") or "=" in symbol else f"{symbol}.{'BO' if exchange == 'BSE' else 'NS'}"


def yahoo_history(http, ysym, rng="5y"):
    """Daily OHLCV, split-adjusted by Yahoo. Date index (IST calendar date of the session)."""
    r = http.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{ysym}", params={"range": rng, "interval": "1d"})
    try:
        res = r.json()["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        tz = res["meta"].get("exchangeTimezoneName", "Asia/Kolkata")
        idx = pd.to_datetime(res["timestamp"], unit="s", utc=True).tz_convert(tz).tz_localize(None).normalize()
        df = pd.DataFrame({k: q[k] for k in ("open", "high", "low", "close", "volume")}, index=idx, dtype=float)
    except (KeyError, IndexError, TypeError, ValueError) as e:
        raise SourceError(f"yahoo {ysym}: unexpected payload ({type(e).__name__})")
    df.index.name = "date"
    df.attrs.update(source="yahoo-finance (unofficial, delayed)", fetched_at=now())
    return df.dropna(subset=["close"])


def nse_index_list(http, index):
    """Index members with sector, from the constituent CSVs NSE publishes."""
    r = http.get(f"https://nsearchives.nseindia.com/content/indices/{NSE_LISTS[index]}")
    out = [{"symbol": row["Symbol"].strip(), "name": row["Company Name"].strip(), "sector": row["Industry"].strip()}
           for row in csv.DictReader(io.StringIO(r.text)) if row.get("Symbol")]
    if not out:
        raise SourceError(f"nse list {index}: empty or changed format")
    return out


def _nse_api(http, path):
    http.get("https://www.nseindia.com/")  # the API needs the cookies set by the home page
    return http.get(f"https://www.nseindia.com/api/{path}").json()


def nse_holidays(http):
    out = []
    for h in _nse_api(http, "holiday-master?type=trading").get("CM", []):
        out.append({"date": datetime.strptime(h["tradingDate"], "%d-%b-%Y").date(),
                    "description": h.get("description", ""), "source": "nseindia.com"})
    return out


def nse_fii_dii(http):
    out = []
    for r in _nse_api(http, "fiidiiTradeReact"):
        out.append({"date": datetime.strptime(r["date"], "%d-%b-%Y").date(), "category": r["category"],
                    "buy": float(r["buyValue"]), "sell": float(r["sellValue"]), "net": float(r["netValue"]),
                    "source": "nseindia.com", "fetched_at": now()})
    return out


def rss_items(http, url):
    """Headlines from one RSS feed: title, link, published time (IST). Items without a date are skipped."""
    try:
        root = ET.fromstring(http.get(url).content)
    except ET.ParseError:
        raise SourceError(f"{url}: not valid RSS")
    host = httpx.URL(url).host
    out = []
    for it in root.iter("item"):
        title, link, pub = (it.findtext(k) or "" for k in ("title", "link", "pubDate"))
        try:
            when = parsedate_to_datetime(pub.strip())
        except (TypeError, ValueError):
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if title.strip() and link.strip().startswith("http"):
            out.append({"title": " ".join(title.split()), "url": link.strip(), "source": host,
                        "published_at": when.astimezone(IST).isoformat(timespec="seconds")})
    return out


def news_id(title):
    """Same headline from two feeds (or with different punctuation) gets one id."""
    return hashlib.sha1(re.sub(r"[^a-z0-9]+", " ", title.lower()).strip().encode()).hexdigest()[:16]


def read_csv_rows(path, required):
    """Loader for data you are licensed to use (fundamentals, events, holidays, F&O list)."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    missing = set(required) - set(rows[0].keys() if rows else [])
    if missing:
        raise SourceError(f"{path}: missing columns {sorted(missing)}")
    return rows
