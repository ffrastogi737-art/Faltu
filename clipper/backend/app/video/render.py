"""Builds and runs the ffmpeg filter graph that turns a source range into a finished clip."""
import shutil
import tempfile
from pathlib import Path
from typing import Callable, Optional

from ..core import config
from . import faces, ffmpeg, subtitles

ASPECTS = {"9:16": (9, 16), "1:1": (1, 1), "16:9": (16, 9), "4:5": (4, 5)}
DEFAULT_CLIP_SETTINGS: dict = {
    "aspect": "9:16",
    "crop_mode": "center",  # center | face | blur
    "crop_x": 0.5, "crop_y": 0.5,  # where the crop window sits, 0..1
    "zoom": 1.0, "dynamic_zoom": False,
    "remove_silence": False, "silence_db": -35, "silence_min": 0.6,
    "normalize_audio": True, "volume": 1.0,
    "captions": True, "template": "bold_impact", "style": {},
    "watermark": None, "watermark_pos": "top-right",
    "intro": None, "outro": None,
}
DEFAULT_PRESET = {"short_side": 1080, "fps": None, "crf": 20, "x264_preset": "medium", "audio_kbps": 160}


def merged_settings(settings: Optional[dict]) -> dict:
    return {**DEFAULT_CLIP_SETTINGS, **{k: v for k, v in (settings or {}).items() if k in DEFAULT_CLIP_SETTINGS}}


def output_size(aspect: str, short_side: int) -> tuple[int, int]:
    a, b = ASPECTS.get(aspect, (9, 16))
    even = lambda v: int(round(v / 2)) * 2
    return (even(short_side), even(short_side * b / a)) if a <= b else (even(short_side * a / b), even(short_side))


def keep_ranges(silences: list[list[float]], duration: float, pad: float = 0.12) -> list[list[float]]:
    """The parts of [0, duration] to keep once silences are cut, leaving a little air around speech."""
    keeps, t = [], 0.0
    for s, e in sorted(silences):
        s, e = s + pad, e - pad
        if e - s < 0.2:
            continue
        if s > t:
            keeps.append([t, min(s, duration)])
        t = max(t, e)
    if t < duration:
        keeps.append([t, duration])
    return [k for k in keeps if k[1] - k[0] > 0.05] or [[0.0, duration]]


def make_remap(keeps: list[list[float]]) -> Callable[[float], Optional[float]]:
    """Clip time -> output time after the cut. None for a moment that was removed."""
    def remap(t: float) -> Optional[float]:
        offset = 0.0
        for s, e in keeps:
            if s <= t <= e:
                return offset + (t - s)
            offset += e - s
        return None
    return remap


def build_command(src: Path, out: Path, *, start: float, end: float, settings: dict, preset: dict,
                  has_audio: bool, src_fps: float, ass_name: Optional[str] = None,
                  keeps: Optional[list[list[float]]] = None, watermark: Optional[Path] = None,
                  intro: Optional[tuple[Path, dict]] = None, outro: Optional[tuple[Path, dict]] = None) -> tuple[list[str], float]:
    """Returns (ffmpeg args, expected output duration). Pure: touches no files."""
    s = settings
    W, H = output_size(s["aspect"], int(preset["short_side"]))
    dur = end - start
    out_dur = sum(e - b for b, e in keeps) if keeps else dur
    fps = int(preset.get("fps") or min(60, max(1, round(src_fps or 30))))
    zoom = min(3.0, max(1.0, float(s["zoom"])))
    even = lambda v: int(round(v / 2)) * 2
    zw, zh = even(W * zoom), even(H * zoom)
    cx, cy = (min(1.0, max(0.0, float(s[k]))) for k in ("crop_x", "crop_y"))

    inputs = ["-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(src)]
    n_in = 1
    v = "[0:v]"
    chain: list[str] = []
    if keeps:
        sel = "+".join(f"between(t,{b:.3f},{e:.3f})" for b, e in keeps)
        chain.append(f"{v}select='{sel}',setpts=N/FRAME_RATE/TB[vsel]")
        v = "[vsel]"
    if s["crop_mode"] == "blur":
        chain.append(f"{v}split[bg0][fg0]")
        chain.append(f"[bg0]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=24:4[bg]")
        chain.append(f"[fg0]scale={zw}:{zh}:force_original_aspect_ratio=decrease[fg]")
        chain.append(f"[bg][fg]overlay=(W-w)/2:(H-h)/2[vbase]")
    else:
        if s.get("_face"):  # centre the window on the face, clamped to the frame
            fx, fy = s["_face"]
            pos = f"'max(0,min(iw-{W},iw*{fx:.4f}-{W}/2))':'max(0,min(ih-{H},ih*{fy:.4f}-{H}/2))'"
        else:  # manual: 0 = left/top edge, 1 = right/bottom edge
            pos = f"(iw-{W})*{cx:.4f}:(ih-{H})*{cy:.4f}"
        chain.append(f"{v}scale={zw}:{zh}:force_original_aspect_ratio=increase,crop={W}:{H}:{pos}[vbase]")
    post = [f"fps={fps}"]
    if s["dynamic_zoom"]:  # slow 8% push-in over the clip
        g = f"(1+0.08*t/{max(out_dur, 0.1):.3f})"
        post.append(f"scale=w='2*trunc({W}*{g}/2)':h='2*trunc({H}*{g}/2)':eval=frame,crop={W}:{H}")
    post.append("setsar=1")
    if ass_name:
        post.append(f"ass={ass_name}")
    chain.append(f"[vbase]{','.join(post)}[vsub]")
    v = "[vsub]"
    if watermark:
        inputs += ["-i", str(watermark)]
        m = round(W * 0.04)
        x = {"top-left": m, "bottom-left": m}.get(s["watermark_pos"], f"W-w-{m}")
        y = f"H-h-{m}" if str(s["watermark_pos"]).startswith("bottom") else m
        chain.append(f"[{n_in}:v]scale={round(W * 0.2)}:-1[wm]")
        chain.append(f"{v}[wm]overlay={x}:{y}[vwm]")
        v, n_in = "[vwm]", n_in + 1

    if has_audio:
        af = []
        if keeps:
            af.append("aselect='" + "+".join(f"between(t,{b:.3f},{e:.3f})" for b, e in keeps) + "',asetpts=N/SR/TB")
        if abs(float(s["volume"]) - 1.0) > 1e-3:
            af.append(f"volume={min(4.0, max(0.0, float(s['volume']))):.2f}")
        if s["normalize_audio"]:
            af.append("loudnorm=I=-14:TP=-1.5:LRA=11")
        af.append("aresample=48000,aformat=channel_layouts=stereo")
        chain.append(f"[0:a:0]{','.join(af)}[amain]")
    else:  # silent track so every export has the same stream layout
        chain.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={out_dur:.3f}[amain]")
    a = "[amain]"

    parts = [(v, a)]
    total = out_dur
    for tag, extra in (("in", intro), ("out", outro)):
        if not extra:
            continue
        path, meta = extra
        inputs += ["-i", str(path)]
        chain.append(f"[{n_in}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
                     f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={fps},setsar=1[v{tag}]")
        if meta["audio_streams"]:
            chain.append(f"[{n_in}:a:0]aresample=48000,aformat=channel_layouts=stereo[a{tag}]")
        else:
            chain.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={meta['duration']:.3f}[a{tag}]")
        pair = (f"[v{tag}]", f"[a{tag}]")
        parts = [pair] + parts if tag == "in" else parts + [pair]
        total += meta["duration"]
        n_in += 1
    if len(parts) > 1:
        chain.append("".join(pv + pa for pv, pa in parts) + f"concat=n={len(parts)}:v=1:a=1[vout][aout]")
        v, a = "[vout]", "[aout]"

    args = [*inputs, "-filter_complex", ";".join(chain), "-map", v, "-map", a,
            "-c:v", "libx264", "-preset", str(preset["x264_preset"]), "-crf", str(int(preset["crf"])),
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", f"{int(preset['audio_kbps'])}k",
            "-movflags", "+faststart", "-t", f"{total:.3f}", str(out)]
    return args, total


def render_clip(*, src: Path, out: Path, start: float, end: float, settings: dict, preset: dict,
                words: list[dict], has_audio: bool, src_fps: float, log_path: Path,
                on_progress: Optional[Callable[[float, str], None]] = None,
                should_cancel: Optional[Callable[[], bool]] = None) -> dict:
    """Render one clip. The source is only ever read. Returns details about what was done."""
    s = merged_settings(settings)
    preset = {**DEFAULT_PRESET, **preset}
    note = on_progress or (lambda p, stage: None)
    free = shutil.disk_usage(out.parent).free
    if free < 200 * 1024 * 1024:
        raise ffmpeg.FFmpegError(f"Only {free // 1048576} MB free on the export disk; at least 200 MB is needed to render.")
    info: dict = {"face_found": None, "silence_removed": 0.0}
    work = Path(tempfile.mkdtemp(prefix="render-", dir=config.DIRS["temp"]))
    try:
        if s["crop_mode"] == "face":
            note(0.02, "Finding faces")
            n = min(30, max(5, int(end - start)))
            centre = faces.face_centre(faces.sample_faces(src, [start + (end - start) * (i + 0.5) / n for i in range(n)]))
            info["face_found"] = centre is not None
            if centre:  # no face -> the user's manual crop position is kept
                s["_face"] = centre
        keeps = None
        if s["remove_silence"] and has_audio:
            note(0.05, "Detecting silence")
            sil = ffmpeg.detect_silences(src, float(s["silence_db"]), float(s["silence_min"]), start, end - start, cwd=work)
            keeps = keep_ranges(sil, end - start)
            info["silence_removed"] = round((end - start) - sum(e - b for b, e in keeps), 2)
            if len(keeps) == 1 and info["silence_removed"] < 0.05:
                keeps = None
        ass_name = None
        if s["captions"] and words:
            style = subtitles.resolve_style(s["template"], s["style"])
            W, H = output_size(s["aspect"], int(preset["short_side"]))
            cues = subtitles.build_cues(words, style, start, end, make_remap(keeps) if keeps else None)
            if cues:
                ass_name = "captions.ass"  # ffmpeg runs inside `work`, so no path escaping is needed in the filter
                (work / ass_name).write_text(subtitles.build_ass(cues, style, W, H), encoding="utf-8")

        def asset(name: Optional[str], exts: set[str]) -> Optional[Path]:
            if not name:
                return None
            p = config.inside(config.DIRS["assets"], config.DIRS["assets"] / config.safe_name(name))
            if not p.is_file() or p.suffix.lower() not in exts:
                raise ffmpeg.FFmpegError(f"Asset not found or wrong type: {name}")
            return p

        extras = {}
        for key in ("intro", "outro"):
            p = asset(s[key], config.VIDEO_EXTS)
            extras[key] = (p, ffmpeg.probe(p)) if p else None
        args, total = build_command(
            src, out, start=start, end=end, settings=s, preset=preset, has_audio=has_audio, src_fps=src_fps,
            ass_name=ass_name, keeps=keeps, watermark=asset(s["watermark"], config.IMAGE_EXTS), **extras)
        note(0.08, "Rendering video")
        ffmpeg.run(args, duration=total, cwd=work, log_path=log_path, should_cancel=should_cancel,
                   on_progress=lambda p: note(0.08 + 0.9 * p, "Rendering video"))
        info.update(duration=round(total, 2), settings=s)
        return info
    except BaseException:
        out.unlink(missing_ok=True)  # never leave a half-written export behind
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)
