"""Read API for the dashboard. The only writes are the watchlist, guarded by API_KEY when set."""
import os
from datetime import timedelta

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from . import DISCLAIMER, db
from .indicators import add_all
from .pipeline import Agent


class WatchItem(BaseModel):
    symbol: str = Field(pattern=r"^[A-Za-z0-9&\-\.\^=]{1,20}$")
    note: str = Field(default="", max_length=200)


def create_app(agent=None, static_dir=None):
    agent = agent or Agent()
    eng, app = agent.eng, FastAPI(title="Market Intelligence Agent", description=DISCLAIMER)

    def guard(x_api_key: str = Header(default="")):
        if agent.cfg.api_key and x_api_key != agent.cfg.api_key:
            raise HTTPException(401, "invalid or missing X-API-Key")

    @app.get("/api/health")
    def health():
        rep = db.latest_report(eng)
        return {"ok": True, "now": db.now(), "trading_day": agent.is_trading_day(), "expected_last_session": str(agent.expected_last()),
                "latest_report": rep and {"as_of": rep["as_of"], "kind": rep["kind"], "generated_at": rep["generated_at"]}}

    @app.get("/api/report/latest")
    def report(kind: str | None = None):
        rep = db.latest_report(eng, kind)
        if not rep:
            raise HTTPException(404, "no report yet")
        # a report older than the latest completed session is stale and must say so
        rep["stale"] = rep["as_of"] < str(agent.expected_last())
        return rep

    @app.get("/api/performance")
    def performance():
        return agent.performance()

    @app.get("/api/predictions")
    def predictions(limit: int = 200, direction: str | None = None):
        P, O = db.predictions, db.outcomes
        q = select(P, O.c.label, O.c.ret, O.c.outcome, O.c.exit_price, O.c.exit_date, O.c.mfe, O.c.mae, O.c.bench_ret).join(
            O, O.c.prediction_id == P.c.id, isouter=True).order_by(P.c.as_of.desc(), P.c.id.desc()).limit(min(limit, 2000))
        return db.rows(eng, q.where(P.c.direction == direction) if direction else q)

    @app.get("/api/notifications")
    def notes(limit: int = 50):
        return db.rows(eng, select(db.notifications).order_by(db.notifications.c.created_at.desc()).limit(min(limit, 500)))

    @app.get("/api/stock/{symbol}")
    def stock(symbol: str, bars: int = 250):
        d = agent.load_prices([symbol]).get(symbol)
        if d is None:
            raise HTTPException(404, "no price data for this symbol")
        a = add_all(d).tail(min(bars, 1000)).reset_index()
        a["date"] = a["date"].dt.strftime("%Y-%m-%d")
        return {"symbol": symbol, "source": d.attrs["source"], "fetched_at": d.attrs["fetched_at"],
                "bars": a.astype(object).where(a.notna(), None).to_dict("records")}

    @app.get("/api/watchlist")
    def watch():
        return db.rows(eng, select(db.watchlist).order_by(db.watchlist.c.symbol))

    @app.post("/api/watchlist", dependencies=[Depends(guard)])
    def watch_add(item: WatchItem):
        db.replace_rows(eng, db.watchlist, [{"symbol": item.symbol.upper(), "note": item.note, "added_at": db.now()}], ["symbol"])
        return watch()

    @app.delete("/api/watchlist/{symbol}", dependencies=[Depends(guard)])
    def watch_del(symbol: str):
        with eng.begin() as c:
            c.execute(delete(db.watchlist).where(db.watchlist.c.symbol == symbol.upper()))
        return watch()

    static_dir = static_dir or os.path.join(os.path.dirname(__file__), "..", "dashboard", "dist")
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="dashboard")
    return app
