from datetime import datetime, timezone, timedelta

import pytest

from app.brain.scoring import score_topic
from app.brain.verify import verify
from app.brain import trends, queue, planner, budget
from app.config import settings
from app.db import SessionLocal, Topic, Job


def test_scoring_factors_and_freshness():
    hot, total_hot = score_topic("GTA 6 trailer 2 secret map leak", {"views_per_hour": 50000, "search_volume": 900000, "competing_videos": 5},
                                 datetime.now(timezone.utc))
    cold, total_cold = score_topic("random thing", {"views_per_hour": 5, "search_volume": 50, "competing_videos": 500},
                                   datetime.now(timezone.utc) - timedelta(days=10))
    assert set(hot) == {"search_demand", "trend_velocity", "competition", "viral_potential", "freshness", "monetization"}
    assert total_hot > 70 > total_cold
    assert cold["freshness"] == 0


def test_verification_rules():
    assert verify("GTA 6 release date", ["https://www.rockstargames.com/newswire/1"])["verified"]
    assert verify("GTA 6 delayed", ["https://ign.com/a", "https://gamespot.com/b"])["verified"]
    r = verify("GTA 6 leak shows map", ["https://ign.com/a", "https://gamespot.com/b"])
    assert not r["verified"] and r["kind"] == "rumor"  # leak words never auto-verified
    assert not verify("GTA 6 thing", ["https://x.com/randomguy/status/1"])["verified"]
    assert verify("GTA 6 trailer", ["https://x.com/RockstarGames/status/1"])["verified"]


RSS = """<rss><channel>
<item><title>GTA 6 trailer 3 announced</title><link>https://ign.com/x</link><pubDate>Wed, 18 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>GTA 6 Trailer 3 Announced!</title><link>https://gamespot.com/y</link></item>
<item><title>Zelda news</title><link>https://ign.com/z</link></item>
</channel></rss>"""


def test_rss_merge_verify_and_dedupe():
    items = trends.parse_rss(RSS)
    assert len(items) == 2  # non-GTA filtered
    assert trends.ingest(items) == 1  # same story from 2 outlets merged
    with SessionLocal() as s:
        t = s.query(Topic).one()
        assert t.verified and len(t.source_urls) == 2
    assert trends.ingest(items) == 0  # dedupe on re-run


def test_queue_retry_backoff_and_fail(monkeypatch):
    calls = []

    @queue.handler("test.flaky")
    def flaky(p):
        calls.append(1)
        raise RuntimeError("boom")

    jid = queue.enqueue("shorts", "test.flaky")
    for _ in range(settings.max_job_attempts):
        with SessionLocal() as s:  # skip backoff wait
            s.get(Job, jid).run_after = datetime(2000, 1, 1)
            s.commit()
        queue.run_one()
    with SessionLocal() as s:
        j = s.get(Job, jid)
        assert j.status == "failed" and j.attempts == settings.max_job_attempts and "boom" in j.last_error
    assert queue.retry_job(jid)
    with SessionLocal() as s:
        assert s.get(Job, jid).status == "queued"


def test_pause_resume_stop():
    @queue.handler("test.ok")
    def ok(p):
        return {"ok": 1}

    queue.enqueue("shorts", "test.ok")
    queue.set_engine_state("shorts", "paused")
    assert queue.run_one() is None
    queue.set_engine_state("shorts", "running")
    assert queue.run_one()[1] == "done"
    jid = queue.enqueue("shorts", "test.ok")
    queue.set_engine_state("shorts", "stopped")
    with SessionLocal() as s:
        assert s.get(Job, jid).status == "stopped"


def test_budget_zero_blocks_spend():
    settings.daily_budget_usd = 0
    assert not budget.can_spend(0.001)
    with pytest.raises(budget.BudgetExceeded):
        budget.charge("anthropic", 0.01)
    settings.daily_budget_usd = 1
    budget.charge("anthropic", 0.5)
    assert budget.spent_today() == 0.5 and not budget.can_spend(0.6)
    settings.daily_budget_usd = 0


def test_planner_caps_and_queues():
    trends.ingest(trends.from_evergreen())
    plan = planner.plan_day()
    assert len([p for p in plan if p[0] == "longform"]) == 1
    assert len([p for p in plan if p[0] == "shorts"]) == 3  # default limit, editable from dashboard
    assert len({p[1] for p in plan}) == len(plan)  # never same topic twice
    assert planner.plan_day() == []  # idempotent per day
    with SessionLocal() as s:
        assert s.query(Job).count() == len(plan)


def test_limits_editable_and_stale_job_recovery():
    from datetime import timedelta
    from app.db import set_setting, limit, now
    set_setting("limit.max_shorts_per_day", 1)
    assert limit("max_shorts_per_day") == 1 and limit("max_clips_per_day") == 10
    trends.ingest(trends.from_evergreen())
    assert len([p for p in planner.plan_day() if p[0] == "shorts"]) == 1
    # killed worker leaves status=running: must be requeued
    with SessionLocal() as s:
        j = Job(engine="shorts", kind="x", status="running")
        s.add(j); s.commit()
        s.query(Job).filter_by(id=j.id).update({"updated_at": now() - timedelta(minutes=45)})
        s.commit()
    assert queue.recover_stale() == 1


def test_secrets_redacted_in_logs():
    from app.db import redact, log, Log
    log("error", "x", "403 for url https://y/v3/search?q=GTA&key=AIzaSECRET123&maxResults=1 Bearer abc.def")
    with SessionLocal() as s:
        m = s.query(Log).order_by(Log.id.desc()).first().message
    assert "AIzaSECRET123" not in m and "abc.def" not in m and "maxResults=1" in m
    assert "SECRET" not in redact("refresh_token=SECRET&x=1")


def test_permanent_errors_are_not_retried():
    from app.engines.common import DuplicateContent
    @queue.handler("t.perm")
    def h(p):
        raise DuplicateContent("dup")
    queue.enqueue("shorts", "t.perm")
    assert queue.run_one()[1] == "failed"  # first attempt, no backoff retries


def test_sql_migrations_match_models():
    """Postgres only: 001+002 applied to an empty schema must create every table/column the ORM expects."""
    import glob, sqlalchemy as sa
    from app.db import Base, engine as eng
    if eng.dialect.name != "postgresql":
        pytest.skip("needs DATABASE_URL=postgresql")
    schema = "migtest"
    with eng.begin() as c:
        c.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        c.execute(sa.text(f"CREATE SCHEMA {schema}"))
        c.execute(sa.text(f"SET LOCAL search_path TO {schema}"))
        for f in sorted(glob.glob("migrations/*.sql")):
            c.exec_driver_sql(open(f).read())
        insp = sa.inspect(c)
        for t in Base.metadata.sorted_tables:
            have = {col["name"] for col in insp.get_columns(t.name, schema=schema)}
            assert have, f"table {t.name} missing from migrations"
            assert {col.name for col in t.columns} <= have, f"{t.name}: missing {({col.name for col in t.columns} - have)}"
        c.execute(sa.text(f"DROP SCHEMA {schema} CASCADE"))
