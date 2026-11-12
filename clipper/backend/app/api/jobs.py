import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..database.db import get_db
from ..workers import events, runner
from .deps import get_or_404

router = APIRouter()


@router.get("/api/jobs")
def list_jobs(project_id: Optional[int] = None, limit: int = 50, db: Session = Depends(get_db)):
    q = select(m.AnalysisJob).order_by(m.AnalysisJob.id.desc()).limit(min(limit, 200))
    if project_id is not None:
        q = q.where(m.AnalysisJob.project_id == project_id)
    return [runner.job_dict(j) for j in db.scalars(q)]


@router.get("/api/jobs/{jid}")
def get_job(jid: int, db: Session = Depends(get_db)):
    return get_or_404(db, m.AnalysisJob, jid).to_dict()  # includes the processing log


@router.post("/api/jobs/{jid}/cancel")
def cancel_job(jid: int, db: Session = Depends(get_db)):
    job = get_or_404(db, m.AnalysisJob, jid)
    if job.status not in ("queued", "running"):
        raise HTTPException(409, f"Job is already {job.status}")
    job.cancel_requested = True
    if job.status == "queued":
        job.status, job.stage, job.finished_at = "cancelled", "Cancelled", m.now()
    db.commit()
    events.publish({"type": "job", "job": runner.job_dict(job)})
    return runner.job_dict(job)


@router.post("/api/jobs/{jid}/retry")
def retry_job(jid: int, db: Session = Depends(get_db)):
    job = get_or_404(db, m.AnalysisJob, jid)
    if job.status not in ("failed", "cancelled"):
        raise HTTPException(409, "Only failed or cancelled jobs can be retried")
    job.status, job.stage, job.progress, job.error = "queued", "Queued", 0.0, None
    job.cancel_requested, job.started_at, job.finished_at = False, None, None
    job.log += "--- retry ---\n"
    db.commit()
    events.publish({"type": "job", "job": runner.job_dict(job)})
    runner.wake.set()
    return runner.job_dict(job)


@router.websocket("/ws/jobs")
async def jobs_ws(ws: WebSocket):
    await ws.accept()
    q: asyncio.Queue = asyncio.Queue()
    events.subscribers.add(q)
    try:
        while True:
            await ws.send_json(await q.get())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        events.subscribers.discard(q)
