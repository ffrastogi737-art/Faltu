"""Database-touching helpers shared by the API and the worker."""
import hashlib
import shutil
from pathlib import Path
from typing import Optional

from sqlalchemy import select

from . import models as m
from .core import config
from .video import ffmpeg
from .video.render import merged_settings
from .video.subtitles import words_from_segments


class Duplicate(Exception):
    def __init__(self, video: m.SourceVideo):
        self.video = video
        super().__init__(f"This file was already imported as \"{video.filename}\" (project {video.project_id}).")


def get_settings(db) -> dict:
    stored = {s.key: s.value for s in db.scalars(select(m.ApplicationSetting))}
    return {**config.DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if k in config.DEFAULT_SETTINGS}}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def ingest_file(db, project_id: int, tmp: Path, original_name: str, *, source_url: Optional[str] = None,
                sha256: Optional[str] = None) -> m.SourceVideo:
    """Validate a file sitting in temp storage and adopt it as a project's source video.
    The user's own file is never touched: we work on this stored copy."""
    name = config.safe_name(original_name)
    if Path(name).suffix.lower() not in config.VIDEO_EXTS:
        raise ValueError(f"Unsupported file type '{Path(name).suffix}'. Supported: {', '.join(sorted(config.VIDEO_EXTS))}")
    digest = sha256 or sha256_file(tmp)
    existing = db.scalar(select(m.SourceVideo).where(m.SourceVideo.sha256 == digest))
    if existing:
        raise Duplicate(existing)
    meta = ffmpeg.probe(tmp)  # raises FFmpegError for files that are not real videos
    dest = config.fresh_path(config.DIRS["source_videos"], f"{digest[:12]}-{Path(name).stem}", Path(name).suffix.lower())
    shutil.move(str(tmp), dest)
    video = m.SourceVideo(project_id=project_id, filename=name, path=str(dest.relative_to(config.STORAGE)),
                          sha256=digest, size_bytes=dest.stat().st_size, source_url=source_url, **meta)
    db.add(video)
    db.commit()
    return video


def replace_transcript(db, video: m.SourceVideo, segments: list[dict], language: str, model: str, origin: str) -> m.Transcript:
    old = db.scalar(select(m.Transcript).where(m.Transcript.source_video_id == video.id))
    if old:
        db.delete(old)
        db.flush()
    tr = m.Transcript(source_video_id=video.id, language=language or "", model=model, origin=origin)
    tr.segments = [m.TranscriptSegment(idx=i, start=float(s["start"]), end=float(s["end"]), text=s["text"],
                                       words=s.get("words") or []) for i, s in enumerate(segments)]
    db.add(tr)
    db.flush()
    return tr


def transcript_words(db, video_id: int, start: float, end: float) -> tuple[list[dict], str]:
    tr = db.scalar(select(m.Transcript).where(m.Transcript.source_video_id == video_id))
    if not tr:
        return [], ""
    segs = [s.to_dict() for s in tr.segments if s.end > start and s.start < end]
    return [w for w in words_from_segments(segs) if w["end"] > start and w["start"] < end], tr.language


def seed_subtitles(db, clip: m.Clip, old_range: Optional[tuple[float, float]] = None) -> m.SubtitleTrack:
    """Create the clip's caption track from the transcript. When the clip was re-trimmed (old_range given),
    the user's corrected words are kept and only newly exposed time is filled from the transcript."""
    track = db.scalar(select(m.SubtitleTrack).where(m.SubtitleTrack.clip_id == clip.id))
    words, lang = transcript_words(db, clip.source_video_id, clip.start, clip.end)
    if track is None:
        track = m.SubtitleTrack(clip_id=clip.id, language=lang, words=words)
        db.add(track)
    elif old_range:
        a, b = old_range
        fresh = [w for w in words if w["end"] <= a or w["start"] >= b]
        track.words = sorted(track.words + fresh, key=lambda w: w["start"])
    else:
        track.words = words
    return track


def new_clip(db, *, video: m.SourceVideo, start: float, end: float, title: str, candidate_id: Optional[int] = None) -> m.Clip:
    clip = m.Clip(project_id=video.project_id, source_video_id=video.id, candidate_id=candidate_id,
                  title=title[:200] or "Untitled clip", start=start, end=end, settings=merged_settings(None))
    db.add(clip)
    db.flush()
    seed_subtitles(db, clip)
    db.commit()
    return clip
