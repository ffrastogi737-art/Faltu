"""Paths and defaults. Storage location comes from CLIPPER_STORAGE."""
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # clipper/
STORAGE = Path(os.environ.get("CLIPPER_STORAGE", ROOT / "storage")).resolve()
DIRS = {n: STORAGE / n for n in ("source_videos", "exports", "temp", "backups", "assets", "logs")}
DB_PATH = STORAGE / "clipper.db"
DB_URL = f"sqlite:///{DB_PATH}"
WHISPER_DIR = os.environ.get("CLIPPER_WHISPER_DIR") or None

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg", ".ts", ".flv", ".wmv"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

DEFAULT_SETTINGS: dict = {
    "whisper_model": "small",
    "whisper_device": "auto",  # auto | cpu | cuda
    "whisper_language": "auto",  # auto | en | hi
    "threads": 0,  # 0 = let the libraries decide
    "max_upload_mb": 8192,
    "clip_durations": [15, 30, 45, 60],
    "max_candidates": 12,
    "scoring_weights": {
        "hook": 25, "emotion": 20, "curiosity": 15,
        "information": 15, "completeness": 15, "av_quality": 10,
    },
    # Optional AI rating of the top candidates: any OpenAI-compatible chat service. Empty key = off.
    "llm_url": "", "llm_model": "", "llm_key": "",
    "frame_samples": 120,  # upper bound on frames read for visual analysis
}


def ensure_dirs() -> None:
    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)


def safe_name(name: str) -> str:
    """Strip any directory part and anything that is not a plain filename character."""
    name = Path(name.replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")
    return name[:120] or "file"


def inside(base: Path, candidate: Path) -> Path:
    """Resolve candidate and refuse anything outside base (path traversal guard)."""
    p = candidate.resolve()
    if not p.is_relative_to(base.resolve()):
        raise ValueError("path escapes storage directory")
    return p


def fresh_path(directory: Path, stem: str, ext: str) -> Path:
    """A path in directory that does not exist yet, so nothing is ever overwritten."""
    p, n = directory / f"{stem}{ext}", 1
    while p.exists():
        p, n = directory / f"{stem}-{n}{ext}", n + 1
    return p
