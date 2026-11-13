import json

import httpx
import pytest

from marketintel import sources as S


def http(handler, **kw):
    waits = []
    h = S.Http(transport=httpx.MockTransport(handler), sleep=waits.append, **kw)
    h.waits = waits
    return h


def test_retries_then_succeeds_and_rate_limits():
    calls = []
    def handler(req):
        calls.append(req)
        return httpx.Response(500 if len(calls) < 3 else 200, text="ok")
    h = http(handler, per_sec=2)
    assert h.get("https://x.test/a").text == "ok" and len(calls) == 3
    assert 1 in h.waits and 2 in h.waits          # exponential backoff between retries
    h.get("https://x.test/b")
    assert any(0 < w <= 0.5 for w in h.waits)     # second call waited for the rate limit


def test_gives_up_with_source_error():
    with pytest.raises(S.SourceError, match="HTTP 404"):
        http(lambda r: httpx.Response(404)).get("https://x.test/a?token=secret")
    def boom(req): raise httpx.ConnectError("down")
    with pytest.raises(S.SourceError, match="ConnectError"):
        http(boom).get("https://x.test/a")


YAHOO = {"chart": {"result": [{"meta": {"exchangeTimezoneName": "Asia/Kolkata"},
         "timestamp": [1762832700, 1762919100],  # 11 and 12 Nov 2025, 09:15 IST
         "indicators": {"quote": [{"open": [100, 102], "high": [103, 104], "low": [99, 101], "close": [102, None], "volume": [1000, 0]}]}}]}}


def test_yahoo_history_parses_and_never_fills_missing_closes():
    df = S.yahoo_history(http(lambda r: httpx.Response(200, json=YAHOO)), "RELIANCE.NS")
    assert list(df.index.strftime("%Y-%m-%d")) == ["2025-11-11"]  # the row with no close is dropped, not filled
    assert df.close.iloc[0] == 102 and "yahoo" in df.attrs["source"] and df.attrs["fetched_at"]
    with pytest.raises(S.SourceError, match="unexpected payload"):
        S.yahoo_history(http(lambda r: httpx.Response(200, json={"chart": {"result": None}})), "X.NS")
    assert S.yahoo_symbol("TCS") == "TCS.NS" and S.yahoo_symbol("TCS", "BSE") == "TCS.BO" and S.yahoo_symbol("^NSEI") == "^NSEI"


def test_nse_index_list():
    csv = "Company Name,Industry,Symbol,Series,ISIN Code\nReliance Industries Ltd.,Oil Gas & Consumable Fuels,RELIANCE,EQ,INE002A01018\n"
    rows = S.nse_index_list(http(lambda r: httpx.Response(200, text=csv)), "NIFTY 50")
    assert rows == [{"symbol": "RELIANCE", "name": "Reliance Industries Ltd.", "sector": "Oil Gas & Consumable Fuels"}]
    with pytest.raises(S.SourceError):
        S.nse_index_list(http(lambda r: httpx.Response(200, text="<html>blocked</html>")), "NIFTY 50")


def test_nse_api_parsers():
    def handler(req):
        if req.url.path == "/": return httpx.Response(200, text="home")
        if "holiday" in req.url.path: return httpx.Response(200, json={"CM": [{"tradingDate": "26-Jan-2026", "description": "Republic Day"}]})
        return httpx.Response(200, json=[{"category": "FII/FPI", "date": "11-Nov-2026", "buyValue": "100.5", "sellValue": "90", "netValue": "10.5"}])
    assert str(S.nse_holidays(http(handler))[0]["date"]) == "2026-01-26"
    f = S.nse_fii_dii(http(handler))[0]
    assert f["net"] == 10.5 and f["source"] == "nseindia.com"


RSS = """<rss><channel>
<item><title>Infosys  profit surges</title><link>https://n.test/1</link><pubDate>Wed, 11 Nov 2026 03:30:00 GMT</pubDate></item>
<item><title>No date item</title><link>https://n.test/2</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Wed, 11 Nov 2026 03:30:00 GMT</pubDate></item>
</channel></rss>"""


def test_rss_keeps_link_and_timestamp_and_skips_undated():
    items = S.rss_items(http(lambda r: httpx.Response(200, text=RSS)), "https://n.test/feed")
    assert items == [{"title": "Infosys profit surges", "url": "https://n.test/1", "source": "n.test",
                      "published_at": "2026-11-11T09:00:00+05:30"}]
    with pytest.raises(S.SourceError):
        S.rss_items(http(lambda r: httpx.Response(200, text="not xml")), "https://n.test/feed")
    assert S.news_id("Infosys profit surges!") == S.news_id("infosys  PROFIT surges")
