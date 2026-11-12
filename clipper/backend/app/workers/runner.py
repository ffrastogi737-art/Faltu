"""Single background worker. One job runs at a time, so two jobs can never write the same project files."""
import threading
import time
import traceback
import urllib.request
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlparse

from sqlalchemy import select

from .. import models as m
from ..ai import highlight, transcription
from ..core import config
from ..database.db import SessionLocal
from ..services import get_settings, ingest_file, replace_transcript, seed_subtitles
from ..video import faces, ffmpeg, render
from . import events


class JobCancelled(Exception):
    pass


class Ctx:
    """What a handler gets: the job row, a DB session, and progress/log/cancel helpers."""

    def __init__(self, db, job: m.AnalysisJob):
        self.db, self.job = db, job
        self._last = 0.0

    def progress(self, fraction: float, stage: Optional[str] = None) -> None:
        pct = round(max(0.0, min(1.0, fraction)) * 100, 1)
        if stage is None and pct - self.job.progress < 1 and time.monotonic() - self._last < 1:
            return  # throttle database writes
        self._last = time.monotonic()
        self.job.progress = pct
        if stage and stage != self.job.stage:
            self.job.stage = stage
            self.job.log += f"[{time.strftime('%H:%M:%S')}] {stage}\n"
        self.db.commit()
        events.publish({"type": "job", "job": job_dict(self.job)})

    def log(self, text: str) -> None:
        self.job.log += f"[{time.strftime('%H:%M:%S')}] {text}\n"
        self.db.commit()

    def cancelled(self) -> bool:
        self.db.refresh(self.job, ["cancel_requested"])
        return self.job.cancel_requested

    def check(self) -> None:
        if self.cancelled():
            raise JobCancelled()


def job_dict(job: m.AnalysisJob) -> dict:
    d = job.to_dict()
    d.pop("log")
    return d


def enqueue(db, type_: str, *, project_id: Optional[int] = None, source_video_id: Optional[int] = None,
            clip_id: Optional[int] = None, params: Optional[dict] = None) -> m.AnalysisJob:
    job = m.AnalysisJob(type=type_, project_id=project_id, source_video_id=source_video_id, clip_id=clip_id, params=params or {})
    db.add(job)
    db.commit()
    events.publish({"type": "job", "job": job_dict(job)})
    wake.set()
    return job


# ---- handlers -------------------------------------------------------------------------------

def _video(ctx: Ctx) -> tuple[m.SourceVideo, Path]:
    video = ctx.db.get(m.SourceVideo, ctx.job.source_video_id)
    if not video:
        raise RuntimeError("The source video for this job no longer exists")
    path = config.inside(config.STORAGE, config.STORAGE / video.path)
    if not path.is_file():
        raise RuntimeError(f"Source file is missing on disk: {video.path}")
    return video, path


def h_video_import(ctx: Ctx) -> None:
    """Download a direct media URL. Only plain http(s) links to a video file are supported."""
    url = ctx.job.params["url"]
    parsed = urlparse(url)
    name = config.safe_name(Path(parsed.path).name or "download.mp4")
    tmp = config.fresh_path(config.DIRS["temp"], f"download-{ctx.job.id}", Path(name).suffix)
    limit = int(get_settings(ctx.db)["max_upload_mb"]) * 1024 * 1024
    ctx.progress(0.01, "Connecting")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "personal-ai-clipper"})
        with urllib.request.urlopen(req, timeout=30) as resp, open(tmp, "wb") as f:
            ctype = resp.headers.get("Content-Type", "")
            if ctype.startswith("text/") or "html" in ctype:
                raise RuntimeError(
                    "Unsupported source: this link is a web page, not a video file. Only direct links to video files "
                    "you are authorised to use can be imported. Download from platforms like YouTube, Instagram or "
                    "TikTok is not supported; export the file from the platform's own tools and upload it instead.")
            total = int(resp.headers.get("Content-Length") or 0)
            if total > limit:
                raise RuntimeError(f"File is larger than the {limit // 1048576} MB import limit (change it in Settings)")
            done = 0
            while chunk := resp.read(1024 * 1024):
                ctx.check()
                done += len(chunk)
                if done > limit:
                    raise RuntimeError(f"File is larger than the {limit // 1048576} MB import limit (change it in Settings)")
                f.write(chunk)
                ctx.progress(0.95 * done / total if total else 0.5, "Downloading")
        ctx.progress(0.96, "Reading metadata")
        video = ingest_file(ctx.db, ctx.job.project_id, tmp, name, source_url=url)
        ctx.job.source_video_id = video.id
    finally:
        tmp.unlink(missing_ok=True)


def h_audio_extraction(ctx: Ctx) -> None:
    video, path = _video(ctx)
    if not video.audio_streams:
        raise RuntimeError("This video has no audio track, so there is nothing to transcribe. "
                           "You can still create clips by hand in the editor.")
    out = config.DIRS["temp"] / f"audio-{video.id}.wav"
    out.unlink(missing_ok=True)  # derived file, safe to rebuild
    ctx.progress(0.02, "Extracting audio")
    ffmpeg.extract_audio(path, out, int(ctx.job.params.get("audio_stream", 0)), duration=video.duration,
                         on_progress=lambda p: ctx.progress(0.02 + 0.8 * p), should_cancel=ctx.cancelled,
                         log_path=config.DIRS["logs"] / f"job-{ctx.job.id}.log")
    ctx.progress(0.85, "Measuring silence")
    video.silences = ffmpeg.detect_silences(out, cwd=config.DIRS["temp"])
    video.audio_path = str(out.relative_to(config.STORAGE))
    video.status = "audio_ready"


def h_transcription(ctx: Ctx) -> None:
    video, _ = _video(ctx)
    if not video.audio_path or not (config.STORAGE / video.audio_path).is_file():
        raise RuntimeError("Audio has not been extracted yet. Run the analysis again.")
    s, p = get_settings(ctx.db), ctx.job.params
    size = p.get("model") or s["whisper_model"]
    ctx.progress(0.02, f"Loading Whisper model '{size}'")
    try:
        result = transcription.transcribe(
            config.STORAGE / video.audio_path, size=size, device=s["whisper_device"],
            language=p.get("language") or s["whisper_language"], threads=int(s["threads"]), duration=video.duration,
            on_progress=lambda f, stage=None: ctx.progress(0.05 + 0.93 * f, stage or "Transcribing speech"), should_cancel=ctx.cancelled)
    except InterruptedError:
        raise JobCancelled()
    if not result["segments"]:
        raise RuntimeError("No speech was recognised in this video.")
    replace_transcript(ctx.db, video, result["segments"], result["language"], result["model"], "whisper")
    ctx.log(f"{len(result['segments'])} segments, language {result['language']}")
    (config.STORAGE / video.audio_path).unlink(missing_ok=True)  # temp cleanup: the WAV is no longer needed
    video.audio_path = None
    video.status = "transcribed"


def h_highlight_detection(ctx: Ctx) -> None:
    from ..video.subtitles import words_from_segments

    video, path = _video(ctx)
    tr = ctx.db.scalar(select(m.Transcript).where(m.Transcript.source_video_id == video.id))
    if not tr or not tr.segments:
        raise RuntimeError("This video has no transcript yet. Transcribe it or import a transcript first.")
    s, p = get_settings(ctx.db), ctx.job.params
    if video.scene_cuts is None:
        ctx.progress(0.05, "Detecting scene changes")
        video.scene_cuts = ffmpeg.detect_scenes(path, cwd=config.DIRS["temp"], duration=video.duration, should_cancel=ctx.cancelled,
                                                on_progress=lambda f: ctx.progress(0.05 + 0.45 * f))
    if video.faces is None:
        ctx.progress(0.5, "Sampling frames for faces")
        n = max(1, min(int(s["frame_samples"]), int(video.duration / 2) or 1))
        video.faces = faces.sample_faces(path, [video.duration * (i + 0.5) / n for i in range(n)])
    ctx.db.commit()
    ctx.check()
    ctx.progress(0.8, "Scoring candidate clips")
    words = words_from_segments([seg.to_dict() for seg in tr.segments])
    found = highlight.find_candidates(
        words, durations=[float(d) for d in (p.get("durations") or s["clip_durations"])],
        weights=p.get("weights") or s["scoring_weights"], max_candidates=int(s["max_candidates"]),
        silences=video.silences, scene_cuts=video.scene_cuts, faces=video.faces)
    # regenerate replaces untouched suggestions; accepted and rejected ones are the user's decisions and stay
    for old in ctx.db.scalars(select(m.ClipCandidate).where(
            m.ClipCandidate.source_video_id == video.id, m.ClipCandidate.status == "new")):
        ctx.db.delete(old)
    for c in found:
        ctx.db.add(m.ClipCandidate(project_id=video.project_id, source_video_id=video.id, **c))
    video.status = "analyzed"
    ctx.log(f"{len(found)} candidates")


def h_video_render(ctx: Ctx) -> None:
    clip = ctx.db.get(m.Clip, ctx.job.clip_id)
    if not clip:
        raise RuntimeError("The clip for this job no longer exists")
    ctx.job.source_video_id = clip.source_video_id
    video, path = _video(ctx)
    preset = ctx.db.get(m.RenderPreset, ctx.job.params.get("preset_id") or 0) or \
        ctx.db.scalar(select(m.RenderPreset).order_by(m.RenderPreset.id))
    track = ctx.db.scalar(select(m.SubtitleTrack).where(m.SubtitleTrack.clip_id == clip.id))
    out = config.fresh_path(config.DIRS["exports"], f"clip-{clip.id}-{config.safe_name(clip.title).replace(' ', '_')[:40]}", ".mp4")
    log_path = config.DIRS["logs"] / f"render-job-{ctx.job.id}.log"
    rj = m.RenderJob(job_id=ctx.job.id, clip_id=clip.id, preset_id=preset.id if preset else None,
                     settings=clip.settings, log_path=str(log_path.relative_to(config.STORAGE)))
    ctx.db.add(rj)
    clip.status = "rendering"
    ctx.db.commit()
    try:
        info = render.render_clip(
            src=path, out=out, start=clip.start, end=clip.end, settings=clip.settings,
            preset=preset.to_dict() if preset else {}, words=track.words if track else [],
            has_audio=video.audio_streams > 0, src_fps=video.fps, log_path=log_path,
            on_progress=ctx.progress, should_cancel=ctx.cancelled)
    except BaseException:
        clip.status = "failed" if not clip.output_path else "rendered"  # an earlier good export stays usable
        ctx.db.commit()
        raise
    if info["face_found"] is False:
        ctx.log("No face found; used the manual crop position instead")
    if info["silence_removed"]:
        ctx.log(f"Removed {info['silence_removed']}s of silence")
    rj.output_path = clip.output_path = str(out.relative_to(config.STORAGE))
    clip.status = "rendered"


HANDLERS: dict[str, Callable[[Ctx], None]] = {
    "video_import": h_video_import, "audio_extraction": h_audio_extraction, "transcription": h_transcription,
    "highlight_detection": h_highlight_detection, "video_render": h_video_render,
}
NEXT = {"audio_extraction": "transcription", "transcription": "highlight_detection"}  # the "analyze" chain

# ---- loop -----------------------------------------------------------------------------------

wake = threading.Event()
_stop = threading.Event()
_thread: Optional[threading.Thread] = None


def run_job(job_id: int) -> None:
    with SessionLocal() as db:
        job = db.get(m.AnalysisJob, job_id)
        if job.cancel_requested:
            job.status, job.stage, job.finished_at = "cancelled", "Cancelled", m.now()
            db.commit()
            events.publish({"type": "job", "job": job_dict(job)})
            return
        job.status, job.started_at, job.error, job.progress = "running", m.now(), None, 0.0
        db.commit()
        ctx = Ctx(db, job)
        try:
            HANDLERS[job.type](ctx)
            job.status, job.progress, job.stage = "completed", 100.0, "Done"
        except (JobCancelled, ffmpeg.Cancelled):
            db.rollback()
            job.status, job.stage = "cancelled", "Cancelled"
        except Exception as e:
            db.rollback()
            job.status, job.stage, job.error = "failed", "Failed", str(e)
            job.log += traceback.format_exc()
        job.finished_at = m.now()
        db.commit()
        events.publish({"type": "job", "job": job_dict(job)})
        if job.status == "completed" and job.params.get("chain") and job.type in NEXT:
            enqueue(db, NEXT[job.type], project_id=job.project_id, source_video_id=job.source_video_id, params=job.params)


def recover() -> None:
    """Jobs that were running when the app stopped are marked failed so they can be retried."""
    with SessionLocal() as db:
        for job in db.scalars(select(m.AnalysisJob).where(m.AnalysisJob.status == "running")):
            job.status, job.stage, job.finished_at = "failed", "Failed", m.now()
            job.error = "The app stopped while this job was running. Retry to run it again."
        for clip in db.scalars(select(m.Clip).where(m.Clip.status == "rendering")):
            clip.status = "rendered" if clip.output_path else "draft"
        db.commit()
    for f in config.DIRS["temp"].glob("render-*"):  # leftovers from an interrupted render
        import shutil
        shutil.rmtree(f, ignore_errors=True)


def _loop() -> None:
    while not _stop.is_set():
        with SessionLocal() as db:
            job_id = db.scalar(select(m.AnalysisJob.id).where(m.AnalysisJob.status == "queued").order_by(m.AnalysisJob.id))
        if job_id is None:
            wake.wait(timeout=2)
            wake.clear()
            continue
        run_job(job_id)


def start() -> None:
    global _thread
    recover()
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="clipper-worker", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
    wake.set()
    if _thread:
        _thread.join(timeout=5)
