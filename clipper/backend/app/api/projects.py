import hashlib
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..core import config
from ..database.db import get_db
from ..services import Duplicate, get_settings, ingest_file, new_clip, replace_transcript
from ..video import ffmpeg
from ..video.subtitles import parse_transcript_file
from ..workers import runner
from .deps import apply, get_or_404

router = APIRouter(prefix="/api")


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class ProjectPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(active|archived)$")


def project_summary(db: Session, p: m.Project) -> dict:
    count = lambda model: db.scalar(select(func.count()).select_from(model).where(model.project_id == p.id))
    return {**p.to_dict(), "videos": [v.to_dict() | {"faces": None} for v in p.videos],
            "candidate_count": count(m.ClipCandidate), "clip_count": count(m.Clip)}


@router.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    return [project_summary(db, p) for p in db.scalars(select(m.Project).order_by(m.Project.updated_at.desc()))]


@router.post("/projects", status_code=201)
def create_project(body: ProjectIn, db: Session = Depends(get_db)):
    p = m.Project(**body.model_dump())
    db.add(p)
    db.commit()
    return project_summary(db, p)


@router.get("/projects/{pid}")
def get_project(pid: int, db: Session = Depends(get_db)):
    return project_summary(db, get_or_404(db, m.Project, pid))


@router.patch("/projects/{pid}")
def patch_project(pid: int, body: ProjectPatch, db: Session = Depends(get_db)):
    p = get_or_404(db, m.Project, pid)
    apply(p, body)
    db.commit()
    return project_summary(db, p)


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int, db: Session = Depends(get_db)):
    """Removes the project, its records and the app's stored copies of its source videos.
    Rendered exports stay in the exports folder. The files you originally imported from are never touched."""
    p = get_or_404(db, m.Project, pid)
    if db.scalar(select(func.count()).select_from(m.AnalysisJob).where(
            m.AnalysisJob.project_id == pid, m.AnalysisJob.status.in_(["queued", "running"]))):
        raise HTTPException(409, "This project has jobs in progress. Cancel them first.")
    paths = [v.path for v in p.videos] + [v.audio_path for v in p.videos if v.audio_path]
    db.delete(p)
    db.commit()
    for rel in paths:
        config.inside(config.STORAGE, config.STORAGE / rel).unlink(missing_ok=True)


@router.post("/projects/{pid}/videos", status_code=201)
def upload_video(pid: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    get_or_404(db, m.Project, pid)
    name = config.safe_name(file.filename or "video")
    limit = int(get_settings(db)["max_upload_mb"]) * 1024 * 1024
    tmp = config.fresh_path(config.DIRS["temp"], "upload", ".part")
    digest, size = hashlib.sha256(), 0
    try:
        with open(tmp, "wb") as out:  # streamed in 1 MB chunks: the video is never held in memory
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"File is larger than the {limit // 1048576} MB limit (change it in Settings)")
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "The uploaded file is empty")
        return ingest_file(db, pid, tmp, name, sha256=digest.hexdigest()).to_dict()
    except Duplicate as e:
        raise HTTPException(409, {"message": str(e), "project_id": e.video.project_id, "video_id": e.video.id})
    except (ValueError, ffmpeg.FFmpegError) as e:
        raise HTTPException(400, str(e))
    finally:
        tmp.unlink(missing_ok=True)


class UrlIn(BaseModel):
    url: str = Field(max_length=1000)
    confirm_rights: bool = False


@router.post("/projects/{pid}/videos/url", status_code=202)
def import_url(pid: int, body: UrlIn, db: Session = Depends(get_db)):
    get_or_404(db, m.Project, pid)
    u = urlparse(body.url)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise HTTPException(400, "Enter a full http(s) link to a video file")
    if not body.confirm_rights:
        raise HTTPException(400, "Confirm that you own this video or are authorised to use it")
    return runner.job_dict(runner.enqueue(db, "video_import", project_id=pid, params={"url": body.url}))


def _file(rel: Optional[str], filename: Optional[str] = None) -> FileResponse:
    if not rel:
        raise HTTPException(404, "No file")
    path = config.inside(config.STORAGE, config.STORAGE / rel)
    if not path.is_file():
        raise HTTPException(404, "File is missing on disk")
    return FileResponse(path, filename=filename)  # FileResponse honours Range requests, so seeking works


@router.get("/videos/{vid}/file")
def video_file(vid: int, db: Session = Depends(get_db)):
    return _file(get_or_404(db, m.SourceVideo, vid).path)


@router.get("/videos/{vid}/transcript")
def get_transcript(vid: int, db: Session = Depends(get_db)):
    get_or_404(db, m.SourceVideo, vid)
    tr = db.scalar(select(m.Transcript).where(m.Transcript.source_video_id == vid))
    if not tr:
        return None
    return {**tr.to_dict(), "segments": [s.to_dict() for s in tr.segments]}


@router.post("/videos/{vid}/transcript/import")
def import_transcript(vid: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    video = get_or_404(db, m.SourceVideo, vid)
    raw = file.file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "Transcript file is larger than 5 MB")
    try:
        segs = parse_transcript_file(file.filename or "file", raw.decode("utf-8-sig", errors="replace"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    replace_transcript(db, video, segs, "", "", "import")
    video.status = "transcribed"
    db.commit()
    return {"segments": len(segs)}


class AnalyzeIn(BaseModel):
    language: Optional[str] = Field(None, pattern="^(auto|en|hi)$")
    model: Optional[str] = None
    durations: Optional[list[float]] = None
    weights: Optional[dict[str, float]] = None
    audio_stream: int = Field(0, ge=0)


def _check_durations(d: Optional[list[float]]) -> None:
    if d is not None and (not d or any(x < 5 or x > 600 for x in d)):
        raise HTTPException(400, "Clip durations must be between 5 and 600 seconds")


@router.post("/videos/{vid}/analyze", status_code=202)
def analyze(vid: int, body: AnalyzeIn, db: Session = Depends(get_db)):
    """Full pipeline: extract audio -> transcribe -> find highlights. Each stage is its own job."""
    video = get_or_404(db, m.SourceVideo, vid)
    _check_durations(body.durations)
    if body.audio_stream >= max(video.audio_streams, 1):
        raise HTTPException(400, f"This video has {video.audio_streams} audio track(s)")
    params = {**body.model_dump(exclude_none=True), "chain": True}
    return runner.job_dict(runner.enqueue(db, "audio_extraction", project_id=video.project_id, source_video_id=vid, params=params))


@router.post("/videos/{vid}/candidates/regenerate", status_code=202)
def regenerate(vid: int, body: AnalyzeIn, db: Session = Depends(get_db)):
    video = get_or_404(db, m.SourceVideo, vid)
    _check_durations(body.durations)
    return runner.job_dict(runner.enqueue(db, "highlight_detection", project_id=video.project_id, source_video_id=vid,
                                          params=body.model_dump(exclude_none=True)))


@router.get("/candidates")
def list_candidates(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = select(m.ClipCandidate).order_by(m.ClipCandidate.score.desc())
    if project_id is not None:
        q = q.where(m.ClipCandidate.project_id == project_id)
    return [c.to_dict() for c in db.scalars(q)]


class CandidatePatch(BaseModel):
    start: Optional[float] = Field(None, ge=0)
    end: Optional[float] = Field(None, gt=0)
    status: Optional[str] = Field(None, pattern="^(new|rejected)$")


def check_range(start: float, end: float, video: m.SourceVideo) -> None:
    if end - start < 1:
        raise HTTPException(400, "A clip must be at least 1 second long")
    if start < 0 or end > video.duration + 0.05:
        raise HTTPException(400, f"Timestamps must be inside the video (0 to {video.duration:.2f}s)")


@router.patch("/candidates/{cid}")
def patch_candidate(cid: int, body: CandidatePatch, db: Session = Depends(get_db)):
    c = get_or_404(db, m.ClipCandidate, cid)
    apply(c, body)
    check_range(c.start, c.end, db.get(m.SourceVideo, c.source_video_id))
    db.commit()
    return c.to_dict()


@router.post("/candidates/{cid}/accept", status_code=201)
def accept_candidate(cid: int, db: Session = Depends(get_db)):
    c = get_or_404(db, m.ClipCandidate, cid)
    existing = db.scalar(select(m.Clip).where(m.Clip.candidate_id == cid))
    if existing:
        return existing.to_dict()
    c.status = "accepted"
    return new_clip(db, video=db.get(m.SourceVideo, c.source_video_id), start=c.start, end=c.end,
                    title=c.title, candidate_id=c.id).to_dict()
