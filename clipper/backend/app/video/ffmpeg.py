"""Thin, safe wrappers around ffmpeg/ffprobe. Commands are always argument lists, never shell strings."""
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Callable, Optional


class FFmpegError(RuntimeError):
    pass


class Cancelled(Exception):
    pass


def available() -> dict:
    out = {}
    for tool in ("ffmpeg", "ffprobe"):
        path = shutil.which(tool)
        out[tool] = subprocess.run([tool, "-version"], capture_output=True, text=True).stdout.split("\n")[0] if path else None
    return out


def probe(path: Path) -> dict:
    """Metadata for a media file. Raises FFmpegError when it is not a usable video."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise FFmpegError(f"Not a readable media file: {r.stderr.strip()[:300]}")
    data = json.loads(r.stdout)
    streams = data.get("streams", [])
    # attached cover art is reported as a video stream; it is not a video
    video = next((s for s in streams if s["codec_type"] == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    audio = [s for s in streams if s["codec_type"] == "audio"]
    if not video:
        raise FFmpegError("File has no video stream")
    num, _, den = (video.get("avg_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    if duration <= 0:
        raise FFmpegError("Could not determine video duration")
    w, h = int(video["width"]), int(video["height"])
    rotate = abs(int(float(next((sd.get("rotation", 0) for sd in video.get("side_data_list", []) if "rotation" in sd), 0))))
    if rotate in (90, 270):  # phones store portrait video rotated; ffmpeg auto-rotates on decode
        w, h = h, w
    return {
        "duration": duration, "width": w, "height": h, "fps": round(fps, 3),
        "video_codec": video.get("codec_name", ""), "audio_codec": audio[0].get("codec_name") if audio else None,
        "audio_streams": len(audio),
    }


def run(args: list[str], *, duration: float = 0, on_progress: Optional[Callable[[float], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None, log_path: Optional[Path] = None,
        cwd: Optional[Path] = None) -> str:
    """Run ffmpeg with progress reporting and cancellation. Returns stderr text; raises on failure.

    -n means ffmpeg refuses to overwrite: callers always pass a fresh output path."""
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-n", "-progress", "pipe:1", "-nostats", *args]
    log_path = log_path or Path(cwd or ".") / "ffmpeg.log"
    with open(log_path, "w+", encoding="utf-8", errors="replace") as log:
        log.write(" ".join(cmd) + "\n\n")
        log.flush()
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=log, text=True, cwd=cwd)
        try:
            for line in proc.stdout:  # one key=value per line, a block roughly every 0.5 s
                if should_cancel and should_cancel():
                    proc.kill()
                    raise Cancelled()
                if on_progress and duration > 0 and line.startswith("out_time_us="):
                    val = line.split("=")[1].strip()
                    if val.isdigit():
                        on_progress(min(1.0, int(val) / 1e6 / duration))
        finally:
            proc.stdout.close()
            proc.wait()
        log.seek(0)
        text = log.read()
    if "already exists. Exiting" in text:  # -n refused to overwrite, but ffmpeg still exits 0
        raise FFmpegError("Output file already exists; refusing to overwrite it")
    if proc.returncode != 0:
        raise FFmpegError(f"ffmpeg failed (exit {proc.returncode}): {text.strip()[-600:]}")
    return text


def extract_audio(src: Path, dst: Path, stream: int = 0, **kw) -> None:
    """16 kHz mono WAV for speech recognition. first_pts=0 pads a late-starting track so times match the video."""
    run(["-i", str(src), "-map", f"0:a:{stream}", "-vn", "-ac", "1", "-ar", "16000",
         "-af", "aresample=async=1:first_pts=0", "-c:a", "pcm_s16le", str(dst)], **kw)


def detect_silences(src: Path, noise_db: float = -35, min_len: float = 0.6,
                    start: Optional[float] = None, length: Optional[float] = None, cwd: Optional[Path] = None) -> list[list[float]]:
    """[[start, end], ...] of silent stretches, in seconds from the start of the examined range."""
    seek = ["-ss", f"{start:.3f}", "-t", f"{length:.3f}"] if start is not None and length is not None else []
    text = run([*seek, "-i", str(src), "-vn", "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"], cwd=cwd)
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", text)]
    ends = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", text)]
    if len(starts) > len(ends):  # silence runs to the end of the range
        ends.append(length if length is not None else starts[-1])
    return [[max(0.0, s), e] for s, e in zip(starts, ends) if e > s]


def detect_scenes(src: Path, threshold: float = 0.35, cwd: Optional[Path] = None, **kw) -> list[float]:
    """Scene-change times. Looks at 4 small frames per second rather than every frame."""
    text = run(["-i", str(src), "-an", "-vf",
                f"fps=4,scale=320:-2,select='gt(scene,{threshold})',showinfo", "-f", "null", "-"], cwd=cwd, **kw)
    return [round(float(x), 2) for x in re.findall(r"pts_time:([\d.]+)", text)]
