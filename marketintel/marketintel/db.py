"""Storage. SQLite for tests/dev, PostgreSQL in production (same schema through SQLAlchemy).

predictions and outcomes are append-only, enforced by database triggers: once a prediction is
written nothing in this system (or a stray SQL client) can edit or delete it.
"""
import json
from datetime import datetime

from sqlalchemy import (Boolean, Column, Date, Float, Integer, MetaData, String, Table, Text, UniqueConstraint,
                        create_engine, delete, insert, select, text)

from .config import IST

md = MetaData()
S, F = String, Float

prices = Table("prices", md, Column("symbol", S, primary_key=True), Column("date", Date, primary_key=True),
               Column("open", F), Column("high", F), Column("low", F), Column("close", F), Column("volume", F),
               Column("source", S, nullable=False), Column("fetched_at", S, nullable=False))
instruments = Table("instruments", md, Column("symbol", S, primary_key=True), Column("name", S), Column("sector", S),
                    Column("indices", S), Column("fno", Boolean), Column("source", S), Column("fetched_at", S))
fundamentals = Table("fundamentals", md, Column("symbol", S, primary_key=True), Column("as_of", S),
                     Column("data", Text), Column("source", S), Column("fetched_at", S))
news = Table("news", md, Column("id", S, primary_key=True), Column("title", Text), Column("url", Text),
             Column("published_at", S), Column("source", S), Column("symbols", S), Column("sentiment", S),
             Column("score", F), Column("fetched_at", S))
flows = Table("flows", md, Column("date", Date, primary_key=True), Column("category", S, primary_key=True),
              Column("buy", F), Column("sell", F), Column("net", F), Column("source", S), Column("fetched_at", S))
events = Table("events", md, Column("id", S, primary_key=True), Column("date", Date), Column("type", S),
               Column("symbol", S), Column("title", Text), Column("url", Text), Column("source", S), Column("fetched_at", S))
holidays = Table("holidays", md, Column("date", Date, primary_key=True), Column("description", S), Column("source", S))
predictions = Table("predictions", md, Column("id", Integer, primary_key=True, autoincrement=True),
                    Column("created_at", S, nullable=False), Column("as_of", Date, nullable=False),
                    Column("symbol", S, nullable=False), Column("strategy", S, nullable=False), Column("sector", S),
                    Column("direction", S, nullable=False), Column("p_bull", F), Column("p_bear", F), Column("p_neutral", F),
                    Column("confidence", F), Column("score", F), Column("entry_ref", F), Column("target1", F),
                    Column("target2", F), Column("stop", F), Column("horizon", Integer), Column("label_thr", F),
                    Column("source", S), UniqueConstraint("as_of", "symbol", "strategy"))
outcomes = Table("outcomes", md, Column("prediction_id", Integer, primary_key=True), Column("resolved_at", S),
                 Column("label", Integer), Column("fwd_ret", F), Column("entry", F), Column("exit_price", F),
                 Column("exit_date", Date), Column("outcome", S), Column("ret", F), Column("mfe", F), Column("mae", F),
                 Column("bench_ret", F))
reports = Table("reports", md, Column("date", Date, primary_key=True), Column("kind", S, primary_key=True),
                Column("payload", Text), Column("created_at", S))
watchlist = Table("watchlist", md, Column("symbol", S, primary_key=True), Column("note", S), Column("added_at", S))
notifications = Table("notifications", md, Column("key", S, primary_key=True), Column("created_at", S), Column("kind", S),
                      Column("text", Text), Column("sent", Boolean))

APPEND_ONLY = ("predictions", "outcomes")


def now():
    return datetime.now(IST).isoformat(timespec="seconds")


def connect(url):
    eng = create_engine(url)
    md.create_all(eng)
    with eng.begin() as c:
        for t in APPEND_ONLY:
            if eng.dialect.name == "sqlite":
                for op in ("UPDATE", "DELETE"):
                    c.execute(text(f"CREATE TRIGGER IF NOT EXISTS {t}_no_{op.lower()} BEFORE {op} ON {t} "
                                   f"BEGIN SELECT RAISE(ABORT, '{t} is append-only'); END"))
            elif eng.dialect.name == "postgresql":
                c.execute(text("CREATE OR REPLACE FUNCTION mi_append_only() RETURNS trigger AS $$ BEGIN "
                               "RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$ LANGUAGE plpgsql"))
                c.execute(text(f"DROP TRIGGER IF EXISTS mi_append_only ON {t}"))
                c.execute(text(f"CREATE TRIGGER mi_append_only BEFORE UPDATE OR DELETE ON {t} "
                               "FOR EACH ROW EXECUTE FUNCTION mi_append_only()"))
    return eng


def replace_rows(eng, table, rows, keys):
    """Upsert that works on both databases: delete the matching keys, then insert."""
    if not rows:
        return
    with eng.begin() as c:
        for r in rows:
            c.execute(delete(table).where(*[table.c[k] == r[k] for k in keys]))
        c.execute(insert(table), rows)


def rows(eng, stmt):
    with eng.connect() as c:
        return [dict(r._mapping) for r in c.execute(stmt)]


def save_report(eng, date, kind, payload):
    replace_rows(eng, reports, [{"date": date, "kind": kind, "payload": json.dumps(payload, default=str), "created_at": now()}], ["date", "kind"])


def latest_report(eng, kind=None):
    q = select(reports).order_by(reports.c.date.desc(), reports.c.created_at.desc()).limit(1)
    r = rows(eng, q.where(reports.c.kind == kind) if kind else q)
    return json.loads(r[0]["payload"]) | {"kind": r[0]["kind"], "created_at": r[0]["created_at"]} if r else None
