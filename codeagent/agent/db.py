"""SQLite state: discovered models, probe results and per-call stats.
Rows are never deleted when a provider is removed, so re-enabling it
brings its history back."""
import os
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS models (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  context INTEGER,             -- input tokens, NULL = unknown
  max_output INTEGER,
  tools INTEGER,               -- 1 yes, 0 no, NULL unknown until probed
  vision INTEGER,
  json_mode INTEGER,
  free INTEGER,
  status TEXT NOT NULL DEFAULT 'probation',  -- probation | active | failing | gone | disabled
  quality REAL,                -- probe score 0..1
  probe_runs INTEGER NOT NULL DEFAULT 0,
  probe_fails INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, model)
);
CREATE INDEX IF NOT EXISTS models_status ON models(status, tools, context);
CREATE TABLE IF NOT EXISTS discovery (
  provider TEXT PRIMARY KEY,
  refreshed_at TEXT,
  ok INTEGER,
  error TEXT,
  model_count INTEGER
);
CREATE TABLE IF NOT EXISTS calls (
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  provider TEXT, model TEXT, task_type TEXT,
  ok INTEGER, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS calls_pm ON calls(provider, model, ts);
"""


def default_path():
    home = os.environ.get("EDITH_HOME") or os.path.join(os.path.expanduser("~"), ".edith")
    os.makedirs(home, exist_ok=True)
    return os.path.join(home, "state.db")


def connect(path=None):
    con = sqlite3.connect(path or default_path())
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    return con
