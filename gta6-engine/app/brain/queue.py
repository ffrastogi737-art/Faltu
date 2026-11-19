"""DB-backed job queue with retries + exponential backoff and engine controls
(start/pause/resume/stop). Works on SQLite and Postgres, no Redis needed."""
from datetime import timedelta
import traceback

from ..config import settings
from ..db import SessionLocal, Job, EngineState, log, now, redact

HANDLERS = {}
STALE_MINUTES = 30


class NoRetry(Exception):
    """Permanent failure (duplicate, not eligible, blocked by a gate): retrying cannot help."""


def recover_stale():
    """A worker killed mid-job (Actions timeout, crash) leaves status=running forever: requeue it."""
    with SessionLocal() as s:
        n = s.query(Job).filter(Job.status == "running", Job.updated_at < now() - timedelta(minutes=STALE_MINUTES)) \
            .update({"status": "queued"})
        s.commit()
    if n:
        log("warn", "queue", f"Recovered {n} stale running job(s)")
    return n


def handler(kind):
    def deco(fn):
        HANDLERS[kind] = fn
        return fn
    return deco


def enqueue(engine, kind, payload=None, delay_s=0):
    with SessionLocal() as s:
        j = Job(engine=engine, kind=kind, payload=payload or {}, run_after=now() + timedelta(seconds=delay_s))
        s.add(j)
        s.commit()
        return j.id


def engine_state(engine):
    with SessionLocal() as s:
        st = s.get(EngineState, engine)
        return st.state if st else "running"


def set_engine_state(engine, state):
    assert state in ("running", "paused", "stopped")
    with SessionLocal() as s:
        st = s.get(EngineState, engine) or EngineState(engine=engine)
        st.state = state
        s.merge(st)
        if state == "stopped":  # stop = cancel everything queued for that engine
            s.query(Job).filter(Job.engine == engine, Job.status == "queued").update({"status": "stopped"})
        s.commit()
    log("info", engine, f"Engine -> {state}")


def retry_job(job_id):
    with SessionLocal() as s:
        j = s.get(Job, job_id)
        if j and j.status in ("failed", "stopped", "paused"):
            j.status, j.attempts, j.run_after, j.last_error = "queued", 0, now(), ""
            s.commit()
            return True
    return False


def claim_next():
    with SessionLocal() as s:
        running = [e.engine for e in s.query(EngineState).filter_by(state="running")]
        q = (s.query(Job).filter(Job.status == "queued", Job.run_after <= now(), Job.engine.in_(running))
             .order_by(Job.id))
        if s.bind.dialect.name == "postgresql":
            q = q.with_for_update(skip_locked=True)
        j = q.first()
        if not j:
            return None
        j.status, j.attempts, j.updated_at = "running", j.attempts + 1, now()
        s.commit()
        return j


def run_one():
    j = claim_next()
    if not j:
        return None
    fn = HANDLERS.get(j.kind)
    try:
        if not fn:
            raise RuntimeError(f"No handler for job kind '{j.kind}'")
        result = fn(j.payload or {}) or {}
        status, err = "done", ""
    except Exception as e:
        result, err = {}, f"{e}\n{traceback.format_exc(limit=3)}"
        status = "failed" if isinstance(e, NoRetry) or j.attempts >= settings.max_job_attempts else "queued"
        log("error", j.engine, f"Job {j.id} ({j.kind}) attempt {j.attempts}: {e}")
    with SessionLocal() as s:
        db = s.get(Job, j.id)
        db.status, db.last_error, db.result = status, redact(err)[:4000], result
        if status == "queued":
            db.run_after = now() + timedelta(seconds=30 * 2 ** db.attempts)
        s.commit()
    return j.id, status


def drain(max_jobs=50):
    """Process jobs until the queue is empty (what a cloud worker run does)."""
    recover_stale()
    done = []
    for _ in range(max_jobs):
        r = run_one()
        if r is None:
            break
        done.append(r)
    return done
