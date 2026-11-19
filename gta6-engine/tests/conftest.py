import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["MEDIA_DIR"] = f"{_tmp}/media"
os.environ["DASHBOARD_TOKEN"] = "test-token-0123456789"
for k in ("ANTHROPIC_API_KEY", "YOUTUBE_API_KEY", "YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"):
    os.environ.pop(k, None)

import pytest  # noqa: E402
from app.db import init_db, Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    init_db()
    yield
