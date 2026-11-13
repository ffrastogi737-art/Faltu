"""The agent: collects data, runs the analysis, records predictions, scores them later."""
import json
import logging
import os
import re
from datetime import datetime, time, timedelta

import pandas as pd
from sqlalchemy import delete, insert, select

from . import DISCLAIMER, db, sources, synthetic
from .config import IST, Settings
from .delivery import notify, summary_text, write_pdf
from .engine import analyze, brier, metrics, simulate
from .models import fundamental_view, sentiment
from .tradingdays import calendar_warning, is_trading_day, last_session
from .validate import validate_ohlcv

log = logging.getLogger("marketintel")
NUMERIC = ("revenue_growth profit_growth qoq_profit_growth eps roe roce debt_to_equity operating_margin "
           "operating_cash_flow pe pb promoter_holding pledged_pct").split()


class Agent:
    def __init__(self, cfg=None, eng=None, http=None, clock=None):
        self.cfg = cfg or Settings()
        self.eng = eng or db.connect(self.cfg.database_url)
        self.http = http or sources.Http(self.cfg.requests_per_sec)
        self.clock = clock or (lambda: datetime.now(IST))
        self.failures = []  # connector errors of this run, shown in the report

    # ----- calendar -----
    def holidays(self):
        return frozenset(r["date"] for r in db.rows(self.eng, select(db.holidays.c.date)))

    def is_trading_day(self):
        return is_trading_day(self.clock().date(), self.holidays())

    def expected_last(self):
        """Latest session whose closing data should exist right now."""
        n, hol = self.clock(), self.holidays()
        if is_trading_day(n.date(), hol) and n.time() >= time(15, 45):
            return n.date()
        return last_session(n.date() - timedelta(days=1), hol)

    def _try(self, what, fn, *a):
        try:
            return fn(*a)
        except (sources.SourceError, OSError, KeyError, ValueError) as e:
            self.failures.append(f"{what}: {e}")
            log.warning("source failed: %s: %s", what, e)

    # ----- collection -----
    def load_files(self):
        """Optional CSVs in DATA_DIR that you supply from a source you are licensed to use."""
        p = lambda n: os.path.join(self.cfg.data_dir, n)
        if os.path.exists(p("holidays.csv")):
            rs = self._try("holidays.csv", sources.read_csv_rows, p("holidays.csv"), ["date"]) or []
            db.replace_rows(self.eng, db.holidays, [{"date": pd.Timestamp(r["date"]).date(), "description": r.get("description", ""),
                                                     "source": "holidays.csv"} for r in rs], ["date"])
        if os.path.exists(p("fundamentals.csv")):
            rs = self._try("fundamentals.csv", sources.read_csv_rows, p("fundamentals.csv"), ["symbol", "as_of", "source"]) or []
            db.replace_rows(self.eng, db.fundamentals, [
                {"symbol": r["symbol"].strip().upper(), "as_of": r["as_of"], "source": r["source"], "fetched_at": db.now(),
                 "data": json.dumps({k: float(r[k]) for k in NUMERIC if (r.get(k) or "").strip() not in ("", "NA", "-")})}
                for r in rs], ["symbol"])
        if os.path.exists(p("events.csv")):
            rs = self._try("events.csv", sources.read_csv_rows, p("events.csv"), ["date", "type", "title", "source"]) or []
            db.replace_rows(self.eng, db.events, [
                {"id": sources.news_id(r["date"] + r["type"] + r.get("symbol", "") + r["title"]), "date": pd.Timestamp(r["date"]).date(),
                 "type": r["type"], "symbol": r.get("symbol", "").upper(), "title": r["title"], "url": r.get("url", ""),
                 "source": r["source"], "fetched_at": db.now()} for r in rs], ["id"])

    def refresh_universe(self):
        merged = {}
        if self.cfg.enable_nse_lists:
            for index in self.cfg.indices:
                for r in self._try(f"NSE list {index}", sources.nse_index_list, self.http, index.strip()) or []:
                    merged.setdefault(r["symbol"], {**r, "indices": []})["indices"].append(index.strip())
        fno_path, fno = os.path.join(self.cfg.data_dir, "fno.csv"), set()
        if os.path.exists(fno_path):
            fno = {r["symbol"].strip().upper() for r in self._try("fno.csv", sources.read_csv_rows, fno_path, ["symbol"]) or []}
        db.replace_rows(self.eng, db.instruments, [
            {"symbol": s, "name": r["name"], "sector": r["sector"], "indices": ",".join(r["indices"]), "fno": s in fno,
             "source": "nsearchives.nseindia.com", "fetched_at": db.now()} for s, r in merged.items()], ["symbol"])
        return len(merged)

    def store_prices(self, symbol, df):
        with self.eng.begin() as c:
            c.execute(delete(db.prices).where(db.prices.c.symbol == symbol))
            c.execute(insert(db.prices), [{"symbol": symbol, "date": i.date(), **{k: float(r[k]) for k in ("open", "high", "low", "close", "volume")},
                                          "source": df.attrs["source"], "fetched_at": df.attrs["fetched_at"]}
                                         for i, r in df.fillna({"volume": 0}).iterrows()])

    def refresh_prices(self, symbols=None, rng=None):
        if not self.cfg.enable_yahoo:
            self.failures.append("prices: no price source enabled (ENABLE_YAHOO=false and no licensed connector)")
            return 0
        symbols = symbols or [r["symbol"] for r in db.rows(self.eng, select(db.instruments.c.symbol))] + [self.cfg.benchmark]
        ok = 0
        for s in symbols:
            df = self._try(f"prices {s}", sources.yahoo_history, self.http, sources.yahoo_symbol(s, self.cfg.exchange), rng or self.cfg.history_range)
            if df is not None and len(df):
                self.store_prices(s, df)
                ok += 1
        return ok

    def refresh_macro(self):
        return self.refresh_prices(list(self.cfg.macro.values()), "1mo") if self.cfg.macro else 0

    def refresh_flows(self):
        if self.cfg.enable_nse_api:
            db.replace_rows(self.eng, db.flows, self._try("FII/DII", sources.nse_fii_dii, self.http) or [], ["date", "category"])
            db.replace_rows(self.eng, db.holidays, self._try("NSE holidays", sources.nse_holidays, self.http) or [], ["date"])

    def refresh_news(self):
        """Fetch feeds, drop old and already-seen headlines, tag sentiment and the stocks mentioned."""
        cutoff = self.clock() - timedelta(days=self.cfg.news_max_age_days)
        inst = db.rows(self.eng, select(db.instruments.c.symbol, db.instruments.c.name))
        # ticker must appear in capitals as a whole word; company name may appear in any case
        pats = [(i["symbol"], re.compile(r"\b" + re.escape(i["symbol"]) + r"\b" + (
            "|(?i:\\b" + re.escape(_short(i["name"])) + "\\b)" if len(_short(i["name"])) >= 5 else ""))) for i in inst]
        seen = {r["id"] for r in db.rows(self.eng, select(db.news.c.id))}
        new = []
        for url in self.cfg.news_feeds:
            for it in self._try(f"news {url}", sources.rss_items, self.http, url) or []:
                nid = sources.news_id(it["title"])
                if nid in seen or datetime.fromisoformat(it["published_at"]) < cutoff:
                    continue
                seen.add(nid)
                score, label = sentiment(it["title"])
                new.append({**it, "id": nid, "score": score, "sentiment": label, "fetched_at": db.now(),
                            "symbols": ",".join(s for s, p in pats if p.search(it["title"]))})
        if new:
            with self.eng.begin() as c:
                c.execute(insert(db.news), new)
        return new

    # ----- reading back -----
    def load_prices(self, symbols=None, upto=None):
        q = select(db.prices).order_by(db.prices.c.symbol, db.prices.c.date)
        if symbols is not None:
            q = q.where(db.prices.c.symbol.in_(symbols))
        if upto is not None:
            q = q.where(db.prices.c.date <= upto)  # never read a bar from a session still in progress
        df = pd.DataFrame(db.rows(self.eng, q))
        out = {}
        if len(df):
            df["date"] = pd.to_datetime(df["date"])
            for s, g in df.groupby("symbol"):
                out[s] = g.set_index("date")[["open", "high", "low", "close", "volume"]]
                out[s].attrs.update(source=g.source.iloc[-1], fetched_at=g.fetched_at.iloc[-1])
        return out

    def macro_summary(self, as_of):
        px, out = self.load_prices(list(self.cfg.macro.values())), []
        for name, sym in self.cfg.macro.items():
            d = px.get(sym)
            if d is None or len(d) < 2:
                out.append({"name": name, "symbol": sym, "last": None, "change": None, "date": None, "stale": True, "source": None})
                continue
            out.append({"name": name, "symbol": sym, "last": float(d.close.iloc[-1]), "change": float(d.close.iloc[-1] / d.close.iloc[-2] - 1),
                        "date": str(d.index[-1].date()), "stale": (pd.Timestamp(as_of) - d.index[-1]).days > 4, "source": d.attrs["source"]})
        return out

    def recent_news(self, limit=40):
        cutoff = (self.clock() - timedelta(days=self.cfg.news_max_age_days)).isoformat()
        return db.rows(self.eng, select(db.news).where(db.news.c.published_at >= cutoff).order_by(db.news.c.published_at.desc()).limit(limit))

    # ----- analysis -----
    def scan(self, kind="preliminary"):
        cfg, as_of, hol = self.cfg, self.expected_last(), self.holidays()
        inst = {r["symbol"]: {**r, "indices": [x for x in (r["indices"] or "").split(",") if x]} for r in db.rows(self.eng, select(db.instruments))}
        raw = self.load_prices(upto=as_of)
        bench = raw.get(cfg.benchmark)
        if bench is None:
            raise RuntimeError(f"benchmark {cfg.benchmark} has no price data; refusing to produce a report")
        bench, bq = validate_ohlcv(bench, as_of, hol, cfg.max_stale_sessions)
        prices, quality = {}, {}
        for s in inst:
            prices[s], quality[s] = validate_ohlcv(raw.get(s), as_of, hol, cfg.max_stale_sessions)
        prices = {s: d for s, d in prices.items() if d is not None and len(d)}
        frows = {r["symbol"]: {**json.loads(r["data"]), "as_of": r["as_of"], "source": r["source"]} for r in db.rows(self.eng, select(db.fundamentals))}
        fdf = pd.DataFrame([{**v, "symbol": s, "sector": inst.get(s, {}).get("sector")} for s, v in frows.items()])
        fund = {}
        for s, row in frows.items():
            peers = fdf[(fdf.sector == inst.get(s, {}).get("sector")) & (fdf.symbol != s)] if len(fdf) else None
            v = fundamental_view(row, peers)
            if v:
                fund[s] = v
        items, by = self.recent_news(500), {}
        for n in items:
            for s in filter(None, n["symbols"].split(",")):
                by.setdefault(s, []).append(n["score"])
        news = {s: sum(v) / len(v) for s, v in by.items()}
        rep = analyze(prices, bench, cfg, pd.Timestamp(as_of), inst, fund, news, quality)
        srcs = sorted({d.attrs.get("source", "?") for d in prices.values()} | {f["source"] for f in fund.values()} | {n["source"] for n in items})
        warnings = [w for w in (calendar_warning(as_of.year, hol), "; ".join(bq["issues"]) and f"benchmark: {'; '.join(bq['issues'])}") if w]
        if any(synthetic.SOURCE in s for s in srcs):
            warnings.insert(0, "SYNTHETIC DEMO DATA: these are not real prices or companies.")
        if not fund:
            warnings.append("No fundamentals loaded: long-term and avoid lists are empty, setups rest on price evidence only.")
        if bq["stale"] or not bq["ok"]:
            warnings.append("Benchmark data failed checks: all directions forced to WAIT.")
            for s in rep["stocks"]:
                s["direction"] = "WAIT"
            rep["setups"], rep["rankings"]["bullish"]["items"], rep["rankings"]["bearish"]["items"] = [], [], []
        rep.update({"kind": kind, "generated_at": db.now(), "sources": srcs, "warnings": warnings, "failures": self.failures[-50:],
                    "macro": self.macro_summary(as_of), "news": items[:40], "disclaimer": DISCLAIMER,
                    "flows": db.rows(self.eng, select(db.flows).order_by(db.flows.c.date.desc()).limit(6)),
                    "events": db.rows(self.eng, select(db.events).where(db.events.c.date >= as_of).order_by(db.events.c.date).limit(30)),
                    "strategies": {"positional": "calibrated setups below",
                                   "delivery": "long-term fundamental list; no calibrated probability, so no BUY/SELL call",
                                   "intraday": "not produced: no licensed intraday feed is connected"}})
        self.record_predictions(rep)
        if kind == "final":
            self.resolve_outcomes()
            rep["performance"] = self.performance()
        db.save_report(self.eng, as_of, kind, rep)
        return rep

    # ----- prediction ledger -----
    def record_predictions(self, rep):
        """Insert-only. A second run for the same date adds nothing and changes nothing."""
        as_of = pd.Timestamp(rep["as_of"]).date()
        done = {r["symbol"] for r in db.rows(self.eng, select(db.predictions.c.symbol).where(db.predictions.c.as_of == as_of))}
        setups = {s["symbol"]: s for s in rep["setups"]}
        new = []
        for s in rep["stocks"]:
            if s["symbol"] in done or not s["prob"]:
                continue
            st = setups.get(s["symbol"], {})
            new.append({"created_at": rep.get("generated_at") or db.now(), "as_of": as_of, "symbol": s["symbol"], "strategy": "positional",
                        "sector": s["sector"], "direction": s["direction"], "p_bull": s["prob"]["p_bull"], "p_bear": s["prob"]["p_bear"],
                        "p_neutral": s["prob"]["p_neutral"], "confidence": s["confidence"], "score": s["score"], "entry_ref": s["price"],
                        "target1": st.get("target1"), "target2": st.get("target2"), "stop": st.get("stop"),
                        "horizon": self.cfg.horizon, "label_thr": s["label_thr"], "source": ", ".join(rep.get("sources", []))})
        if new:
            with self.eng.begin() as c:
                c.execute(insert(db.predictions), new)
        return len(new)

    def resolve_outcomes(self):
        """Score predictions whose horizon has fully passed, using prices that arrived after them."""
        P, O = db.predictions, db.outcomes
        pending = db.rows(self.eng, select(P).where(P.c.id.not_in(select(O.c.prediction_id))))
        if not pending:
            return 0
        px = self.load_prices({p["symbol"] for p in pending} | {self.cfg.benchmark}, upto=self.expected_last())
        out = []
        for p in pending:
            d, b, h = px.get(p["symbol"]), px.get(self.cfg.benchmark), p["horizon"]
            after = d.loc[d.index > pd.Timestamp(p["as_of"])].iloc[:h] if d is not None else []
            if len(after) < h:
                continue
            fwd = float(after.close.iloc[-1] / after.open.iloc[0] - 1)
            thr = p["label_thr"] or 0.0
            o = {"prediction_id": p["id"], "resolved_at": db.now(), "fwd_ret": fwd, "label": 1 if fwd > thr else -1 if fwd < -thr else 0}
            ba = b.loc[b.index > pd.Timestamp(p["as_of"])].iloc[:h] if b is not None else []
            o["bench_ret"] = float(ba.close.iloc[-1] / ba.open.iloc[0] - 1) if len(ba) == h else None
            if p["direction"] in ("BUY", "SELL"):
                r = simulate(after, p["direction"], p["stop"], p["target1"], h, self.cfg.cost_bps)
                o.update({k: r[k] for k in ("entry", "exit_price", "outcome", "ret", "mfe", "mae")}, exit_date=r["exit_date"].date())
            out.append(o)
        if out:
            keys = ["prediction_id", "resolved_at", "label", "fwd_ret", "entry", "exit_price", "exit_date", "outcome", "ret", "mfe", "mae", "bench_ret"]
            with self.eng.begin() as c:
                c.execute(insert(db.outcomes), [{k: o.get(k) for k in keys} for o in out])
        return len(out)

    def performance(self):
        P, O = db.predictions, db.outcomes
        res = pd.DataFrame(db.rows(self.eng, select(P, O).join(O, O.c.prediction_id == P.c.id)))
        total = len(db.rows(self.eng, select(P.c.id)))
        if not len(res):
            return {"trades": 0, "predictions": total, "resolved": 0, "pending": total}
        trades = res[res.direction.isin(["BUY", "SELL"])].rename(columns={"as_of": "date"})
        m = metrics(trades, 252 / self.cfg.horizon)
        m.update({"predictions": total, "resolved": len(res), "pending": total - len(res),
                  "brier": brier(res[["p_bull", "p_bear", "p_neutral"]].to_numpy(), res.label.to_numpy()),
                  "prediction_accuracy": float(((res.direction == "BUY") & (res.label == 1) | (res.direction == "SELL") & (res.label == -1)
                                                | (res.direction == "WAIT") & (res.label == 0)).mean())})
        return m

    # ----- alerts -----
    def monitor(self):
        """Intraday check on shortlisted and watchlist stocks, using delayed quotes."""
        rep = db.latest_report(self.eng)
        setups = {s["symbol"]: s for s in (rep or {}).get("setups", [])}
        watch = {r["symbol"] for r in db.rows(self.eng, select(db.watchlist.c.symbol))}
        today, n = self.clock().date(), 0
        for s in sorted(set(setups) | watch):
            d = self._try(f"quote {s}", sources.yahoo_history, self.http, sources.yahoo_symbol(s, self.cfg.exchange), "5d")
            if d is None or len(d) < 2 or d.index[-1].date() != today:
                continue  # no quote for today: say nothing rather than alert on an old price
            last, chg, src = float(d.close.iloc[-1]), float(d.close.iloc[-1] / d.close.iloc[-2] - 1), d.attrs["source"]
            st = setups.get(s)
            if st:
                sign = 1 if st["direction"] == "BUY" else -1
                for lvl, word in ((st["stop"], "stop-loss"), (st["target1"], "target 1")):
                    hit = (last - lvl) * sign <= 0 if word == "stop-loss" else (last - lvl) * sign >= 0
                    if hit:
                        n += notify(self.eng, self.cfg, f"{today}:{s}:{word}", "ALERT", f"{s} {st['direction']} setup: {word} {lvl} reached, last {last:.2f}", src)
            if abs(chg) >= 0.03:
                n += notify(self.eng, self.cfg, f"{today}:{s}:move", "BULLISH MOVE" if chg > 0 else "BEARISH MOVE", f"{s} {chg * 100:+.1f}% today, last {last:.2f}", src)
        return n

    # ----- scheduled jobs -----
    def job_collect(self):       # 07:00
        self.load_files(); self.refresh_universe(); self.refresh_macro(); self.refresh_flows()
        for n in self.refresh_news():
            if n["symbols"] and n["sentiment"] != "neutral":
                notify(self.eng, self.cfg, "news:" + n["id"], f"NEWS {n['sentiment'].upper()}", f"{n['title']} ({n['symbols']})\n{n['url']}\npublished {n['published_at']}", n["source"])

    def job_premarket(self):     # 08:00
        self.refresh_macro()
        m = [x for x in self.macro_summary(self.clock().date()) if x["last"] is not None and not x["stale"]]
        if m:
            notify(self.eng, self.cfg, f"{self.clock().date()}:premarket", "PRE-MARKET",
                   "\n".join(f"{x['name']}: {x['last']:.2f} ({x['change'] * 100:+.2f}%, {x['date']})" for x in m), m[0]["source"])

    def job_scan(self):          # 08:30
        self.refresh_prices()

    def job_report(self, kind="preliminary"):  # 09:00 and 16:00
        rep = self.scan(kind)
        pdf = write_pdf(rep, os.path.join(self.cfg.report_dir, f"{rep['as_of']}-{kind}.pdf"))
        notify(self.eng, self.cfg, f"{rep['as_of']}:{kind}", "REPORT", summary_text(rep) + f"\nPDF: {pdf}", ", ".join(rep["sources"]) or "none")
        return rep

    def job_close(self):         # 15:45
        self.refresh_prices(); self.refresh_macro()

    def run_job(self, name, *a):
        """Wrapper used by the scheduler: trading days only, and an error becomes an alert instead of a crash."""
        if not self.is_trading_day():
            log.info("%s skipped: not an NSE trading day", name)
            return None
        self.failures = []
        try:
            return getattr(self, name)(*a)
        except Exception as e:  # the scheduler must survive any single job failing
            log.exception("job %s failed", name)
            notify(self.eng, self.cfg, f"{self.clock().isoformat()}:{name}", "ERROR", f"job {name} failed: {type(e).__name__}: {e}", "system")


def _short(name):
    return re.sub(r"\b(ltd|limited|the|india|industries|corporation|company)\b\.?", "", name or "", flags=re.I).strip(" .&")
