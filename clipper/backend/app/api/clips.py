import shutil
import subprocess
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..core import config
from ..database.db import get_db
from ..services import new_clip, seed_subtitles
from ..video import render, subtitles
from ..workers import runner
from .deps import apply, get_or_404
from .projects import _file, check_range

router = APIRouter(prefix="/api")


def clip_detail(db: Session, clip: m.Clip) -> dict:
    track = db.scalar(select(m.SubtitleTrack).where(m.SubtitleTrack.clip_id == clip.id))
    video = db.get(m.SourceVideo, clip.source_video_id)
    s = render.merged_settings(clip.settings)
    words = track.words if track else []
    cues = subtitles.build_cues(words, subtitles.resolve_style(s["template"], s["style"]), clip.start, clip.end) if s["captions"] else []
    return {**clip.to_dict(), "settings": s, "words": words, "cues": cues,
            "style": subtitles.resolve_style(s["template"], s["style"]),
            "video": {k: getattr(video, k) for k in ("id", "filename", "duration", "width", "height", "fps", "audio_streams")}}


@router.get("/clips")
def list_clips(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = select(m.Clip).order_by(m.Clip.updated_at.desc())
    if project_id is not None:
        q = q.where(m.Clip.project_id == project_id)
    return [c.to_dict() for c in db.scalars(q)]


class ClipIn(BaseModel):
    source_video_id: int
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    title: str = Field("Untitled clip", max_length=200)


@router.post("/clips", status_code=201)
def create_clip(body: ClipIn, db: Session = Depends(get_db)):
    video = get_or_404(db, m.SourceVideo, body.source_video_id)
    check_range(body.start, body.end, video)
    return clip_detail(db, new_clip(db, video=video, start=body.start, end=body.end, title=body.title))


@router.get("/clips/{cid}")
def get_clip(cid: int, db: Session = Depends(get_db)):
    return clip_detail(db, get_or_404(db, m.Clip, cid))


class ClipPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    start: Optional[float] = Field(None, ge=0)
    end: Optional[float] = Field(None, gt=0)
    campaign_id: Optional[int] = None
    settings: Optional[dict[str, Any]] = None


def validate_settings(s: dict) -> dict:
    s = render.merged_settings(s)
    ok = (s["aspect"] in render.ASPECTS and s["crop_mode"] in ("center", "face", "blur")
          and s["template"] in subtitles.TEMPLATES and isinstance(s["style"], dict)
          and s["watermark_pos"] in ("top-left", "top-right", "bottom-left", "bottom-right"))
    try:
        ok = ok and 1 <= float(s["zoom"]) <= 3 and 0 <= float(s["volume"]) <= 4 and -80 <= float(s["silence_db"]) <= -10 \
            and 0.2 <= float(s["silence_min"]) <= 5 and all(0 <= float(s[k]) <= 1 for k in ("crop_x", "crop_y"))
    except (TypeError, ValueError):
        ok = False
    if not ok:
        raise HTTPException(400, "Invalid clip settings")
    for key in ("watermark", "intro", "outro"):
        if s[key] and not (config.DIRS["assets"] / config.safe_name(str(s[key]))).is_file():
            raise HTTPException(400, f"Asset '{s[key]}' does not exist")
    return s


@router.patch("/clips/{cid}")
def patch_clip(cid: int, body: ClipPatch, db: Session = Depends(get_db)):
    clip = get_or_404(db, m.Clip, cid)
    old = (clip.start, clip.end)
    data = body.model_dump(exclude_unset=True)
    if data.get("campaign_id") is not None:
        get_or_404(db, m.Campaign, data["campaign_id"])
    if "settings" in data:
        data["settings"] = validate_settings(data["settings"])
    for k, v in data.items():
        setattr(clip, k, v)
    check_range(clip.start, clip.end, db.get(m.SourceVideo, clip.source_video_id))
    if (clip.start, clip.end) != old:
        seed_subtitles(db, clip, old_range=old)
    db.commit()
    return clip_detail(db, clip)


@router.delete("/clips/{cid}", status_code=204)
def delete_clip(cid: int, db: Session = Depends(get_db)):
    """Deletes the clip record. An exported MP4 is left in the exports folder."""
    db.delete(get_or_404(db, m.Clip, cid))
    db.commit()


class Word(BaseModel):
    text: str = Field(max_length=200)
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class WordsIn(BaseModel):
    words: list[Word] = Field(max_length=20000)


@router.put("/clips/{cid}/subtitles")
def put_subtitles(cid: int, body: WordsIn, db: Session = Depends(get_db)):
    clip = get_or_404(db, m.Clip, cid)
    if any(w.end <= w.start for w in body.words):
        raise HTTPException(400, "Every word must end after it starts")
    track = seed_subtitles(db, clip, old_range=(clip.start, clip.end))
    track.words = sorted((w.model_dump() for w in body.words if w.text.strip()), key=lambda w: w["start"])
    db.commit()
    return clip_detail(db, clip)


@router.post("/clips/{cid}/subtitles/reset")
def reset_subtitles(cid: int, db: Session = Depends(get_db)):
    clip = get_or_404(db, m.Clip, cid)
    seed_subtitles(db, clip)
    db.commit()
    return clip_detail(db, clip)


class RenderIn(BaseModel):
    preset_id: Optional[int] = None


@router.post("/clips/{cid}/render", status_code=202)
def render_clip(cid: int, body: RenderIn, db: Session = Depends(get_db)):
    clip = get_or_404(db, m.Clip, cid)
    if body.preset_id is not None:
        get_or_404(db, m.RenderPreset, body.preset_id)
    busy = db.scalar(select(m.AnalysisJob).where(m.AnalysisJob.clip_id == cid, m.AnalysisJob.type == "video_render",
                                                 m.AnalysisJob.status.in_(["queued", "running"])))
    if busy:
        raise HTTPException(409, "This clip is already rendering")
    return runner.job_dict(runner.enqueue(db, "video_render", project_id=clip.project_id, clip_id=cid,
                                          params={"preset_id": body.preset_id}))


@router.get("/clips/{cid}/file")
def clip_file(cid: int, download: bool = False, db: Session = Depends(get_db)):
    clip = get_or_404(db, m.Clip, cid)
    return _file(clip.output_path, filename=f"{config.safe_name(clip.title)}.mp4" if download else None)


# ---- presets, caption templates, fonts, assets ------------------------------------------------

class PresetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    short_side: int = Field(1080, ge=240, le=2160)
    fps: Optional[int] = Field(None, ge=10, le=60)
    crf: int = Field(20, ge=10, le=40)
    x264_preset: str = Field("medium", pattern="^(ultrafast|superfast|veryfast|faster|fast|medium|slow|slower)$")
    audio_kbps: int = Field(160, ge=64, le=320)


@router.get("/presets")
def list_presets(db: Session = Depends(get_db)):
    return [p.to_dict() for p in db.scalars(select(m.RenderPreset).order_by(m.RenderPreset.id))]


@router.post("/presets", status_code=201)
def create_preset(body: PresetIn, db: Session = Depends(get_db)):
    if db.scalar(select(m.RenderPreset).where(m.RenderPreset.name == body.name)):
        raise HTTPException(409, "A preset with this name already exists")
    p = m.RenderPreset(**body.model_dump())
    db.add(p)
    db.commit()
    return p.to_dict()


@router.put("/presets/{pid}")
def update_preset(pid: int, body: PresetIn, db: Session = Depends(get_db)):
    p = get_or_404(db, m.RenderPreset, pid)
    clash = db.scalar(select(m.RenderPreset).where(m.RenderPreset.name == body.name, m.RenderPreset.id != pid))
    if clash:
        raise HTTPException(409, "A preset with this name already exists")
    apply(p, body)
    db.commit()
    return p.to_dict()


@router.delete("/presets/{pid}", status_code=204)
def delete_preset(pid: int, db: Session = Depends(get_db)):
    p = get_or_404(db, m.RenderPreset, pid)
    if p.builtin:
        raise HTTPException(400, "Built-in presets cannot be deleted")
    db.delete(p)
    db.commit()


@router.get("/caption-templates")
def caption_templates():
    return [{"id": k, **v} for k, v in subtitles.TEMPLATES.items()]


@router.get("/fonts")
def fonts():
    """Font families installed on this computer (via fontconfig), for the caption font picker."""
    if not shutil.which("fc-list"):
        return []
    out = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout
    return sorted({line.split(",")[0].strip() for line in out.splitlines() if line.strip()})


@router.get("/assets")
def list_assets():
    return [{"name": p.name, "kind": "image" if p.suffix.lower() in config.IMAGE_EXTS else "video", "size": p.stat().st_size}
            for p in sorted(config.DIRS["assets"].iterdir()) if p.is_file()]


@router.post("/assets", status_code=201)
def upload_asset(file: UploadFile = File(...)):
    """A logo image (watermark) or a short intro/outro video."""
    from ..video import ffmpeg
    name = config.safe_name(file.filename or "asset")
    ext = name[name.rfind("."):].lower() if "." in name else ""
    if ext not in config.IMAGE_EXTS | config.VIDEO_EXTS:
        raise HTTPException(400, "Assets must be an image (png, jpg, webp) or a video file")
    dest = config.fresh_path(config.DIRS["assets"], name[: -len(ext)], ext)
    size = 0
    with open(dest, "wb") as out:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > 500 * 1024 * 1024:
                out.close()
                dest.unlink()
                raise HTTPException(413, "Assets are limited to 500 MB")
            out.write(chunk)
    try:
        if ext in config.VIDEO_EXTS:
            ffmpeg.probe(dest)
        elif subprocess.run(["ffprobe", "-v", "error", str(dest)], capture_output=True).returncode != 0:
            raise ffmpeg.FFmpegError("not a readable image")
    except ffmpeg.FFmpegError as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Could not read this file: {e}")
    return {"name": dest.name}


@router.delete("/assets/{name}", status_code=204)
def delete_asset(name: str):
    p = config.inside(config.DIRS["assets"], config.DIRS["assets"] / config.safe_name(name))
    if not p.is_file():
        raise HTTPException(404, "Asset not found")
    p.unlink()
