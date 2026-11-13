import os
from datetime import datetime

import pytest

from marketintel import db, synthetic
from marketintel.__main__ import seed_demo
from marketintel.config import IST, Settings
from marketintel.pipeline import Agent

WED = datetime(2026, 11, 11).date()


class Clock:
    def __init__(self, *a): self.now = datetime(*a, tzinfo=IST)
    def __call__(self): return self.now


class NoNet:
    """Any network use in a test that did not ask for it is a bug."""
    def get(self, url, **kw): raise AssertionError(f"unexpected network call: {url}")


@pytest.fixture(scope="session")
def market():
    return synthetic.market(WED)


@pytest.fixture
def cfg(tmp_path):
    c = Settings()
    c.database_url = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 't.db'}"
    c.data_dir, c.report_dir = str(tmp_path / "data"), str(tmp_path / "reports")
    c.telegram_token = c.telegram_chat = c.api_key = ""
    c.news_feeds, c.enable_nse_lists, c.enable_nse_api, c.macro = [], False, False, {}
    return c


@pytest.fixture
def agent(cfg):
    eng = db.connect(cfg.database_url)
    if eng.dialect.name == "postgresql":  # shared server: start every test from empty tables
        with eng.begin() as c:
            c.exec_driver_sql("TRUNCATE " + ", ".join(t.name for t in db.md.sorted_tables) + " RESTART IDENTITY")
    a = Agent(cfg, eng, NoNet(), Clock(2026, 11, 12, 8, 30))  # Thursday pre-open: last session is Wed 11 Nov
    seed_demo(a, WED)
    return a
