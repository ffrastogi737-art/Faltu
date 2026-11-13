import os
from datetime import datetime

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError

from marketintel import db, sources, synthetic
from marketintel.__main__ import build_scheduler, monitor_window
from marketintel.api import create_app
from marketintel.config import IST
from marketintel.delivery import notify, write_pdf
from tests.conftest import WED, Clock
from tests.test_sources import RSS, http


def test_scan_builds_report_and_ledger(agent):
    rep = agent.scan()
    assert rep["as_of"] == "2026-11-11" and rep["kind"] == "preliminary"
    assert "SYNTHETIC" in rep["warnings"][0] and any("holiday" in w for w in rep["warnings"])
    assert rep["sources"] == [synthetic.SOURCE] and rep["strategies"]["intraday"].startswith("not produced")
    assert len(rep["stocks"]) == 40 and rep["setups"], "synthetic market has planted momentum, so some setups must appear"
    n = len(db.rows(agent.eng, select(db.predictions.c.id)))
    assert n == sum(1 for s in rep["stocks"] if s["prob"])
    agent.scan()  # same day again: ledger unchanged
    assert len(db.rows(agent.eng, select(db.predictions.c.id))) == n
    assert db.latest_report(agent.eng)["as_of"] == "2026-11-11"


def test_ledger_is_append_only_in_the_database(agent):
    agent.scan()
    for stmt in (update(db.predictions).values(direction="BUY", p_bull=0.99), delete(db.predictions)):
        with pytest.raises(DBAPIError, match="append-only"):
            with agent.eng.begin() as c:
                c.execute(stmt)


def test_outcomes_are_scored_only_after_the_horizon(agent):
    rep = agent.scan()
    assert agent.resolve_outcomes() == 0 and agent.performance()["pending"] > 0
    # six more sessions arrive
    prices, bench, _ = synthetic.market(WED + pd.Timedelta(days=8), n=906)
    for s, d in {**prices, agent.cfg.benchmark: bench}.items():
        agent.store_prices(s, d)
    agent.clock.now = datetime(2026, 11, 19, 16, 5, tzinfo=IST)
    n = agent.resolve_outcomes()
    assert n == len(db.rows(agent.eng, select(db.predictions.c.id)))
    perf = agent.performance()
    assert perf["pending"] == 0 and perf["trades"] == len(rep["setups"]) and 0 <= perf["brier"] <= 2
    assert perf["benchmark_return"] is not None and 0 <= perf["prediction_accuracy"] <= 1
    o = db.rows(agent.eng, select(db.outcomes).where(db.outcomes.c.ret.is_not(None)))[0]
    assert o["mfe"] >= 0 >= o["mae"] and o["outcome"] in ("stop", "target", "time") and o["exit_date"] > WED
    assert agent.resolve_outcomes() == 0  # nothing is scored twice
    assert agent.scan("final")["performance"]["trades"] == perf["trades"]


def test_stale_or_missing_data_never_produces_a_call(agent):
    agent.clock.now = datetime(2026, 11, 16, 8, 30, tzinfo=IST)  # Monday: data now ends two sessions back
    rep = agent.scan()
    assert rep["stocks"] == [] and rep["setups"] == [] and len(rep["skipped"]) == 40
    assert "stale" in rep["skipped"][0]["reason"] and any("forced to WAIT" in w for w in rep["warnings"])
    with agent.eng.begin() as c:
        c.execute(delete(db.prices).where(db.prices.c.symbol == agent.cfg.benchmark))
    with pytest.raises(RuntimeError, match="benchmark"):
        agent.scan()


def test_partial_bar_of_a_running_session_is_ignored(agent):
    agent.clock.now = datetime(2026, 11, 11, 11, 0, tzinfo=IST)  # Wednesday mid-session: its bar is not final
    assert str(agent.expected_last()) == "2026-11-10"
    rep = agent.scan()
    assert rep["as_of"] == "2026-11-10" and {s["price_date"] for s in rep["stocks"]} == {"2026-11-10"}


def test_fundamentals_csv_feeds_long_term_and_avoid_lists(agent):
    os.makedirs(agent.cfg.data_dir)
    with open(os.path.join(agent.cfg.data_dir, "fundamentals.csv"), "w") as f:
        f.write("symbol,as_of,source,revenue_growth,profit_growth,roe,roce,debt_to_equity,operating_margin,pledged_pct\n"
                "SYN01,2026-09-30,test-file,20,25,22,24,0.1,25,0\nSYN02,2026-09-30,test-file,-5,-30,3,4,2.5,2,45\nSYN03,2026-09-30,test-file,,,30,,,,\n")
    with open(os.path.join(agent.cfg.data_dir, "holidays.csv"), "w") as f:
        f.write("date,description\n2026-11-12,Test holiday\n")
    agent.load_files()
    assert not agent.is_trading_day() and agent.run_job("job_report") is None  # Thursday is now a holiday
    rep = agent.scan()
    assert [x["symbol"] for x in rep["rankings"]["long_term"]["items"]] == ["SYN01"]
    assert [x["symbol"] for x in rep["rankings"]["avoid"]["items"]][0] == "SYN02"
    by = {s["symbol"]: s for s in rep["stocks"]}
    assert by["SYN03"]["fundamental"] is None and "fundamentals" in by["SYN03"]["missing"]
    assert by["SYN02"]["direction"] != "BUY" and "test-file" in rep["sources"]


def test_news_is_deduplicated_dated_and_linked(agent):
    db.replace_rows(agent.eng, db.instruments, [{"symbol": "INFY", "name": "Infosys Ltd.", "sector": "IT", "indices": "", "fno": True,
                                                 "source": "t", "fetched_at": "t"}], ["symbol"])
    agent.cfg.news_feeds = ["https://n.test/a", "https://n.test/b"]  # two feeds carrying the same headline
    agent.http = http(lambda r: httpx.Response(200, text=RSS))
    new = agent.refresh_news()
    assert len(new) == 1 and new[0]["symbols"] == "INFY" and new[0]["sentiment"] == "positive" and new[0]["url"] == "https://n.test/1"
    assert agent.refresh_news() == []
    agent.clock.now = datetime(2026, 11, 20, 8, 0, tzinfo=IST)
    assert agent.recent_news() == []  # nine days later it is outdated


def test_connector_failure_is_recorded_not_fatal(agent):
    agent.http = http(lambda r: httpx.Response(503))
    assert agent.refresh_prices(["SYN00"]) == 0 and "prices SYN00" in agent.failures[0]
    assert len(agent.load_prices(["SYN00"])["SYN00"]) == 900  # old rows are kept, not wiped
    assert agent.scan()["failures"]


def test_notify_once_with_timestamp_and_source(agent):
    sent = []
    agent.cfg.telegram_token, agent.cfg.telegram_chat = "T", "C"
    t = httpx.MockTransport(lambda r: sent.append(r) or httpx.Response(200, json={"ok": True}))
    assert notify(agent.eng, agent.cfg, "k1", "ALERT", "hello", "yahoo", t) and not notify(agent.eng, agent.cfg, "k1", "ALERT", "hello", "yahoo", t)
    assert len(sent) == 1 and b"source: yahoo" in sent[0].content and b"IST" in sent[0].content
    assert db.rows(agent.eng, select(db.notifications))[0]["sent"] is True


def test_monitor_alerts_on_stop_and_big_move(agent):
    rep = agent.scan()
    st = rep["setups"][0]
    sym, hit = st["symbol"], st["stop"] * (0.9 if st["direction"] == "BUY" else 1.1)
    def quote(req):
        day = ["2026-11-11", "2026-11-12"] if sym in str(req.url) else ["2026-11-10", "2026-11-11"]  # others: no quote today
        ts = [int(pd.Timestamp(d + " 09:15", tz=IST).timestamp()) for d in day]
        return httpx.Response(200, json={"chart": {"result": [{"meta": {}, "timestamp": ts, "indicators": {"quote": [
            {"open": [st["price"], hit], "high": [st["price"], hit], "low": [st["price"], hit], "close": [st["price"], hit], "volume": [1, 1]}]}}]}})
    agent.http = http(quote)
    agent.clock.now = datetime(2026, 11, 12, 10, 0, tzinfo=IST)
    assert agent.monitor() == 2 and agent.monitor() == 0  # stop-loss + big move, each sent once
    kinds = {n["kind"] for n in db.rows(agent.eng, select(db.notifications))}
    assert "ALERT" in kinds and kinds & {"BULLISH MOVE", "BEARISH MOVE"}


def test_report_job_writes_pdf_and_survives_errors(agent):
    rep = agent.run_job("job_report", "final")
    pdf = os.path.join(agent.cfg.report_dir, "2026-11-11-final.pdf")
    assert rep["kind"] == "final" and open(pdf, "rb").read(5) == b"%PDF-" and os.path.getsize(pdf) > 3000
    with agent.eng.begin() as c:
        c.execute(delete(db.prices))
    assert agent.run_job("job_report") is None
    assert any(n["kind"] == "ERROR" for n in db.rows(agent.eng, select(db.notifications)))


def test_schedule_times(agent):
    from apscheduler.schedulers.background import BackgroundScheduler
    sch = build_scheduler(agent, BackgroundScheduler(timezone=IST))
    jobs = {j.id: str(j.trigger) for j in sch.get_jobs()}
    assert set(jobs) == {"job_collect-7", "job_premarket-8", "job_scan-8", "job_report-9", "monitor-9-15", "job_close-15", "job_report-16"}
    assert all("day_of_week='mon-fri'" in t for t in jobs.values()) and "minute='45'" in jobs["job_close-15"]
    assert [j for j in sch.get_jobs() if j.id == "job_report-16"][0].args == ("job_report", "final")
    at = lambda h, m: datetime(2026, 11, 12, h, m, tzinfo=IST)
    assert monitor_window(at(9, 15)) and monitor_window(at(15, 30)) and not monitor_window(at(9, 0)) and not monitor_window(at(15, 45))


def test_api(agent):
    agent.cfg.api_key = "secret"
    c = TestClient(create_app(agent, static_dir="/nonexistent"))
    assert c.get("/api/report/latest").status_code == 404
    agent.scan()
    h = c.get("/api/health").json()
    assert h["trading_day"] and h["expected_last_session"] == "2026-11-11" and h["latest_report"]["kind"] == "preliminary"
    rep = c.get("/api/report/latest").json()
    assert rep["stale"] is False and rep["disclaimer"] and len(rep["rankings"]) == 7
    agent.clock.now = datetime(2026, 11, 13, 8, 30, tzinfo=IST)
    assert c.get("/api/report/latest").json()["stale"] is True  # yesterday's report is flagged, not passed off as current
    assert len(c.get("/api/predictions?limit=5").json()) == 5 and c.get("/api/performance").json()["resolved"] == 0
    s = c.get("/api/stock/SYN00?bars=10").json()
    assert len(s["bars"]) == 10 and s["source"] == synthetic.SOURCE and s["bars"][-1]["rsi"] is not None
    assert c.get("/api/stock/NOPE").status_code == 404
    assert c.post("/api/watchlist", json={"symbol": "SYN00"}).status_code == 401
    k = {"X-API-Key": "secret"}
    assert c.post("/api/watchlist", json={"symbol": "x; drop table"}, headers=k).status_code == 422
    assert c.post("/api/watchlist", json={"symbol": "syn00", "note": "n"}, headers=k).json()[0]["symbol"] == "SYN00"
    assert c.delete("/api/watchlist/SYN00", headers=k).json() == [] and c.get("/api/notifications").status_code == 200


def test_ledger_survives_a_stateless_runner(agent, cfg, tmp_path):
    """Export on one machine, import into an empty database on the next: same rows, same performance."""
    agent.scan()
    prices, bench, _ = synthetic.market(WED + pd.Timedelta(days=8), n=906)
    for s, d in {**prices, agent.cfg.benchmark: bench}.items():
        agent.store_prices(s, d)
    agent.clock.now = datetime(2026, 11, 19, 16, 5, tzinfo=IST)
    agent.resolve_outcomes()
    out = str(tmp_path / "out" / "ledger")
    agent.export_ledger(out)
    assert sorted(os.listdir(out)) == ["outcomes-2026-11.csv", "predictions-2026-11.csv"]
    from marketintel.pipeline import Agent
    cfg.database_url = f"sqlite:///{tmp_path / 'second.db'}"
    b = Agent(cfg, None, agent.http, agent.clock)
    n = b.import_ledger(out)
    assert n == 80 and b.import_ledger(out) == 0  # never imported on top of existing rows
    for t in (db.predictions, db.outcomes):
        assert db.rows(b.eng, select(t).order_by(t.c[t.primary_key.columns.keys()[0]])) == \
               db.rows(agent.eng, select(t).order_by(t.c[t.primary_key.columns.keys()[0]]))
    for s, d in {**prices, agent.cfg.benchmark: bench}.items():
        b.store_prices(s, d)
    pa, pb = agent.performance(), b.performance()
    assert pa["trades"] > 0 and pa == pb
