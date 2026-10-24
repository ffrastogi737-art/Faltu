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
CREATE TABLE IF NOT EXISTS cooldowns (
  lane TEXT PRIMARY KEY,       -- "provider", "provider#key" or "provider/model"
  until REAL NOT NULL,         -- unix time
  reason TEXT,
  strikes INTEGER NOT NULL DEFAULT 1
);
"""

# Columns added after the first release. Each runs once; existing rows get NULL/defaults.
MIGRATIONS = [
    "ALTER TABLE models ADD COLUMN price_in REAL",    # USD per 1M input tokens, NULL = unknown
    "ALTER TABLE models ADD COLUMN price_out REAL",
    "ALTER TABLE calls ADD COLUMN key_idx INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE calls ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0",
    "ALTER TABLE calls ADD COLUMN why TEXT",
]


def default_path():
    home = os.environ.get("EDITH_HOME") or os.path.join(os.path.expanduser("~"), ".edith")
    os.makedirs(home, exist_ok=True)
    return os.path.join(home, "state.db")


def connect(path=None):
    con = sqlite3.connect(path or default_path())
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    have = {(t, r[1]) for t in ("models", "calls") for r in con.execute(f"PRAGMA table_info({t})")}
    for sql in MIGRATIONS:
        table, col = sql.split()[2], sql.split()[5]
        if (table, col) not in have:
            con.execute(sql)
    con.commit()
    return con
