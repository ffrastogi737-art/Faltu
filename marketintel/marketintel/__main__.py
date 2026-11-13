"""python -m marketintel <command>

  serve      API + dashboard on :8000
  schedule   run the daily IST schedule forever (NSE trading days only)
  run JOB    run one job now: job_collect | job_premarket | job_scan | job_report | job_close | monitor
  backtest   walk-forward test on the prices already in the database
  demo       fill the database with clearly-labelled SYNTHETIC data so the dashboard has something to show
"""
import json
import logging
import sys
from datetime import datetime

import pandas as pd
from sqlalchemy import select

from . import db, synthetic
from .config import IST
from .engine import backtest
from .pipeline import Agent

# (job, cron fields) in Asia/Kolkata. Monitoring runs every 15 minutes while the market is open.
SCHEDULE = [("job_collect", {"hour": 7, "minute": 0}), ("job_premarket", {"hour": 8, "minute": 0}),
            ("job_scan", {"hour": 8, "minute": 30}), ("job_report", {"hour": 9, "minute": 0}),
            ("monitor", {"hour": "9-15", "minute": "*/15"}), ("job_close", {"hour": 15, "minute": 45}),
            ("job_report", {"hour": 16, "minute": 0})]


def monitor_window(now):
    return now.replace(hour=9, minute=15) <= now <= now.replace(hour=15, minute=30)


def build_scheduler(agent, scheduler=None):
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
    sch = scheduler or BlockingScheduler(timezone=IST)
    for name, when in SCHEDULE:
        args = ["final"] if (name, when.get("hour")) == ("job_report", 16) else []
        fn = (lambda: monitor_window(agent.clock()) and agent.run_job("monitor")) if name == "monitor" else agent.run_job
        sch.add_job(fn, CronTrigger(day_of_week="mon-fri", timezone=IST, **when), args=[] if name == "monitor" else [name, *args],
                    id=f"{name}-{when['hour']}", misfire_grace_time=600, coalesce=True)
    return sch


def seed_demo(agent, end=None):
    end = end or agent.expected_last()
    prices, bench, inst = synthetic.market(end)
    db.replace_rows(agent.eng, db.instruments, [{"symbol": s, "name": i["name"], "sector": i["sector"], "indices": "SYNTHETIC", "fno": i["fno"],
                                                 "source": synthetic.SOURCE, "fetched_at": db.now()} for s, i in inst.items()], ["symbol"])
    for s, d in {**prices, agent.cfg.benchmark: bench}.items():
        agent.store_prices(s, d)


def main(argv=None):
    argv = argv or sys.argv[1:]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    cmd = argv[0] if argv else "help"
    if cmd == "serve":
        import uvicorn
        from .api import create_app
        uvicorn.run(create_app(), host=argv[1] if len(argv) > 1 else "127.0.0.1", port=8000)
    elif cmd == "schedule":
        build_scheduler(Agent()).start()
    elif cmd == "run":
        out = getattr(Agent(), argv[1])(*argv[2:])
        print(json.dumps({"job": argv[1], "result": out if isinstance(out, (int, type(None))) else "done"}))
    elif cmd == "backtest":
        a = Agent()
        px = a.load_prices()
        bench = px.pop(a.cfg.benchmark)
        sectors = {r["symbol"]: r["sector"] for r in db.rows(a.eng, select(db.instruments))}
        res, _ = backtest({s: d for s, d in px.items() if s in sectors}, bench, a.cfg, sectors)
        res.pop("equity", None)
        print(json.dumps(res, indent=2, default=str))
    elif cmd == "demo":
        a = Agent()
        seed_demo(a)
        rep = a.scan("final" if datetime.now(IST).hour >= 16 else "preliminary")
        print(f"SYNTHETIC demo report for {rep['as_of']}: {len(rep['stocks'])} stocks, {len(rep['setups'])} setups")
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
