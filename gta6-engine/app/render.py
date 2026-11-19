"""FFmpeg rendering: 9:16 shorts, 16:9 long-form, thumbnails, captions,
sound design, quality checks and duplicate detection.

Visuals: footage YOU own/have rights to from MEDIA_DIR/library (your own gameplay
captures, licensed stock), otherwise generated motion backgrounds. Nothing is
scraped from other channels or trailers."""
import hashlib
import json
import random
import re
import subprocess
from pathlib import Path

from .config import settings
from . import tts

PRESETS = {  # name: (width, height, min_s, max_s)
    "short15": (1080, 1920, 8, 20),
    "short30": (1080, 1920, 15, 40),
    "short58": (1080, 1920, 30, 59),
    "short_any": (1080, 1920, 8, 59),  # QC range for any short
    "long": (1920, 1080, 120, 3600),
    "clip": (1080, 1920, 10, 60),
}
PALETTES = [("0xff2bd6", "0x1b0033"), ("0x00e5ff", "0x001a33"), ("0xffb000", "0x2a0a00"),
            ("0x7cff00", "0x002211"), ("0xff4d4d", "0x1a0010")]


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {' '.join(cmd[:6])}...\n{p.stderr[-1500:]}")
    return p


def font():
    try:
        return subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""


def probe(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
               "-of", "json", str(path)]).stdout
    return json.loads(out)


# ---------- captions ----------
def _ts(t):
    h, m = int(t // 3600), int(t % 3600 // 60)
    return f"{h}:{m:02d}:{t % 60:05.2f}"


def _esc(text):
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_ass(segments, w, h, path, words_per_chunk=3):
    """segments: [(text, start, end)]. Chunks words into punchy 3-word captions."""
    size = int(h * 0.06)
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
        f"Style: Cap,Inter,{size},&H00FFFFFF,&H00000000,&H80000000,1,6,2,2,70,70,{int(h * 0.28)}",
        f"Style: Hook,Inter,{int(size * 0.9)},&H0000F0FF,&H00000000,&H80000000,1,7,2,8,70,70,{int(h * 0.12)}",
        "", "[Events]", "Format: Layer, Start, End, Style, Text",
    ]
    for i, (text, start, end) in enumerate(segments):
        words = text.split()
        if not words:
            continue
        if i == 0:  # hook stays on top for the whole first segment
            lines.append(f"Dialogue: 1,{_ts(start)},{_ts(end)},Hook,{{\\fad(150,100)}}{_esc(text.upper())}")
            continue
        chunks = [words[k:k + words_per_chunk] for k in range(0, len(words), words_per_chunk)]
        dur = (end - start) / len(chunks)
        for k, c in enumerate(chunks):
            a, b = start + k * dur, start + (k + 1) * dur
            lines.append(f"Dialogue: 0,{_ts(a)},{_ts(b)},Cap,{{\\fscx110\\fscy110\\t(0,120,\\fscx100\\fscy100)}}{_esc(' '.join(c).upper())}")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


# ---------- visuals ----------
def library_clips():
    lib = settings.media_dir / "library"
    return sorted(p for p in lib.glob("*") if p.suffix.lower() in (".mp4", ".mov", ".mkv", ".webm")) if lib.exists() else []


def segment_visual(i, secs, w, h, out, clips):
    secs = f"{secs:.3f}"
    vf_fit = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    if clips:
        src = clips[i % len(clips)]
        total = float(probe(src)["format"]["duration"])
        start = random.uniform(0, max(total - float(secs) - 0.1, 0))
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-i", str(src), "-t", secs, "-an",
             "-vf", f"{vf_fit},zoompan=z='min(zoom+0.0008,1.12)':d=1:s={w}x{h}:fps=30,eq=saturation=1.15",
             "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", str(out)])
    else:
        c0, c1 = PALETTES[i % len(PALETTES)]
        run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
             "-i", f"gradients=s={w // 2}x{h // 2}:c0={c0}:c1={c1}:x0=0:y0=0:x1={w // 2}:y1={h // 2}:speed=0.02:rate=30",
             "-t", secs, "-vf", f"scale={w}:{h},noise=alls=6:allf=t,vignette",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", str(out)])
    return out


def render_video(script, preset, out_path, work_dir):
    """script: dict with hook, beats, cta. Returns dict(path, duration, segments)."""
    w, h, _, max_s = PRESETS[preset]
    work = Path(work_dir)
    work.mkdir(parents=True, exist_ok=True)
    texts = [script["hook"], *script["beats"], script["cta"]]
    clips = library_clips()
    segs, t = [], 0.0
    concat_v, concat_a = [], []
    for i, text in enumerate(texts):
        apath, secs = tts.synth(text, work / f"v{i}.mp3")
        secs = min(secs, max_s)  # hard cap
        segs.append((text, t, t + secs))
        concat_a.append(apath)
        concat_v.append(segment_visual(i, secs, w, h, work / f"s{i}.mp4", clips))
        t += secs
    (work / "v.txt").write_text("".join(f"file '{Path(p).resolve()}'\n" for p in concat_v))
    (work / "a.txt").write_text("".join(f"file '{Path(p).resolve()}'\n" for p in concat_a))
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(work / "v.txt"), "-c", "copy", str(work / "video.mp4")])
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(work / "a.txt"), "-c:a", "libmp3lame", str(work / "voice.mp3")])
    ass = build_ass(segs, w, h, work / "caps.ass")
    # sound design: soft synth bed + whoosh on every scene change
    cuts = [s[1] for s in segs[1:]]
    whoosh = "".join(
        f"anoisesrc=d=0.35:c=pink:a=0.25,highpass=f=800,afade=t=in:d=0.15,afade=t=out:st=0.15:d=0.2,adelay={int(c * 1000)}|{int(c * 1000)}[w{k}];"
        for k, c in enumerate(cuts))
    wl = "".join(f"[w{k}]" for k in range(len(cuts)))
    fc = (f"{whoosh}aevalsrc='0.04*sin(2*PI*110*t)+0.03*sin(2*PI*164.8*t)+0.02*sin(2*PI*220*t)':s=44100:d={t:.2f}[bed];"
          f"[1:a]aformat=channel_layouts=stereo,loudnorm=I=-14:TP=-1.5[vo];"
          f"[vo][bed]{wl}amix=inputs={2 + len(cuts)}:normalize=0:duration=first[a];"
          f"[0:v]ass='{ass.as_posix()}':fontsdir=/usr/share/fonts[v]")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(work / "video.mp4"), "-i", str(work / "voice.mp3"),
         "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
         "-t", f"{t:.2f}", str(out_path)])
    return {"path": str(out_path), "duration": t, "segments": segs}


def thumbnail(title, out_path, bg_video=None, w=1280, h=720):
    f = font()
    words = re.sub(r"[^\w\s:'!?-]", "", title).upper().split()[:6]
    line1, line2 = " ".join(words[:3]), " ".join(words[3:])
    txt = lambda t, y, col: (f"drawtext=fontfile='{f}':text='{t.replace(':', ' ')}':fontsize={h // 7}:fontcolor={col}:"
                             f"borderw=8:bordercolor=black:x=(w-text_w)/2:y={y}")
    vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},eq=saturation=1.4:contrast=1.1," + \
         txt(line1, f"h*0.25", "0xffdd00") + ("," + txt(line2, "h*0.5", "white") if line2 else "")
    src = ["-ss", "1", "-i", str(bg_video)] if bg_video else ["-f", "lavfi", "-i", f"gradients=s={w}x{h}:c0=0xff2bd6:c1=0x00e5ff"]
    run(["ffmpeg", "-y", "-v", "error", *src, "-frames:v", "1", "-vf", vf, str(out_path)])
    return str(out_path)


# ---------- QC + duplicates ----------
def quality_check(path, preset):
    w, h, lo, hi = PRESETS[preset]
    info = probe(path)
    streams = info.get("streams", [])
    v = next((s for s in streams if s["codec_type"] == "video"), None)
    a = next((s for s in streams if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    bd = subprocess.run(["ffmpeg", "-v", "info", "-i", str(path), "-vf", "blackdetect=d=0.5:pix_th=0.05", "-an", "-f", "null", "-"],
                        capture_output=True, text=True).stderr
    black = sum(float(x) for x in re.findall(r"black_duration:([\d.]+)", bd))
    checks = {
        "resolution": bool(v and v["width"] == w and v["height"] == h),
        "has_audio": a is not None,
        "duration_in_range": lo <= dur <= hi,
        "not_mostly_black": black < dur * 0.2,
        "file_size_ok": Path(path).stat().st_size > 50_000,
    }
    return {"passed": all(checks.values()), "checks": checks, "duration": round(dur, 2), "black_seconds": round(black, 2)}


def script_hash(script):
    text = " ".join([script.get("hook", ""), *script.get("beats", [])]).lower()
    norm = " ".join(re.sub(r"[^a-z0-9 ]", " ", text).split())
    return hashlib.sha256(norm.encode()).hexdigest()


def frame_hash(path, n=4):
    """Average-hash of n frames -> hex string; similar videos give close hashes."""
    dur = float(probe(path)["format"]["duration"])
    bits = ""
    for k in range(n):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{dur * (k + 1) / (n + 1):.2f}", "-i", str(path),
                              "-frames:v", "1", "-vf", "scale=8:8,format=gray", "-f", "rawvideo", "-"],
                             capture_output=True).stdout
        px = list(raw[:64]) or [0] * 64
        avg = sum(px) / len(px)
        bits += "".join("1" if p > avg else "0" for p in px)
    return f"{int(bits, 2):0{len(bits) // 4}x}"


def hamming(a, b):
    if not a or not b or len(a) != len(b):
        return 999
    return bin(int(a, 16) ^ int(b, 16)).count("1")
