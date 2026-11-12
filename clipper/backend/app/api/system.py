import shutil
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .. import models as m
from ..ai import highlight, llm, transcription
from ..core import config
from ..database.db import get_db
from ..services import get_settings
from ..video import ffmpeg
from ..workers import runner
from .campaigns import earnings_summary

router = APIRouter(prefix="/api")


@router.get("/health")
def health(db: Session = Depends(get_db)):
    tools = ffmpeg.available()
    db.execute(text("SELECT 1"))
    disk = shutil.disk_usage(config.STORAGE)
    return {"status": "ok" if all(tools.values()) else "degraded", **tools, "database": "ok",
            "whisper": transcription.status(), "llm": llm.model(), "storage": str(config.STORAGE),
            "disk_free_gb": round(disk.free / 1e9, 1)}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    count = lambda model, *where: db.scalar(select(func.count()).select_from(model).where(*where))
    earn = earnings_summary(db)["totals"]
    recent = db.scalars(select(m.Project).order_by(m.Project.updated_at.desc()).limit(5))
    jobs = db.scalars(select(m.AnalysisJob).order_by(m.AnalysisJob.id.desc()).limit(8))
    return {
        "projects": count(m.Project),
        "videos_processed": count(m.SourceVideo, m.SourceVideo.status.in_(["transcribed", "analyzed"])),
        "clips": count(m.Clip),
        "exported_clips": count(m.Clip, m.Clip.output_path.is_not(None)),
        "campaigns": count(m.Campaign),
        "self_reported_views": earn["self_reported_views"], "verified_views": earn["verified_views"],
        "estimated_earnings": earn["estimated"], "received_earnings": earn["received"],
        "recent_projects": [p.to_dict() for p in recent],
        "recent_jobs": [runner.job_dict(j) for j in jobs],
    }


@router.get("/settings")
def read_settings(db: Session = Depends(get_db)):
    return {**get_settings(db), "_whisper_models": transcription.MODEL_SIZES}


@router.put("/settings")
def write_settings(body: dict[str, Any], db: Session = Depends(get_db)):
    s = {**get_settings(db), **{k: v for k, v in body.items() if k in config.DEFAULT_SETTINGS}}
    try:
        w = {k: float(s["scoring_weights"][k]) for k in highlight.WEIGHT_KEYS}
        durations = [float(d) for d in s["clip_durations"]]
        ok = (s["whisper_model"] in transcription.MODEL_SIZES and s["whisper_device"] in ("auto", "cpu", "cuda")
              and s["whisper_language"] in ("auto", "en", "hi") and 0 <= int(s["threads"]) <= 64
              and 1 <= int(s["max_upload_mb"]) <= 200000 and durations and all(5 <= d <= 600 for d in durations)
              and 1 <= int(s["max_candidates"]) <= 50 and 10 <= int(s["frame_samples"]) <= 1000
              and all(v >= 0 for v in w.values()) and sum(w.values()) > 0)
    except (KeyError, TypeError, ValueError):
        ok = False
    if not ok:
        raise HTTPException(400, "One or more settings are out of range")
    s["scoring_weights"], s["clip_durations"] = w, durations
    for k, v in s.items():
        db.merge(m.ApplicationSetting(key=k, value=v))
    db.commit()
    return read_settings(db)


@router.post("/settings/backup")
def backup_database():
    """Consistent copy of the SQLite database using SQLite's online backup, safe while the app is running."""
    dest = config.fresh_path(config.DIRS["backups"], f"clipper-{time.strftime('%Y%m%d-%H%M%S')}", ".db")
    src, dst = sqlite3.connect(config.DB_PATH), sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        src.close()
        dst.close()
    return {"path": str(dest), "size": dest.stat().st_size}


@router.get("/settings/backups")
def list_backups():
    return [{"name": p.name, "size": p.stat().st_size} for p in sorted(config.DIRS["backups"].glob("*.db"), reverse=True)]
