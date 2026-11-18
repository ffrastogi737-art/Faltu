"""Ranked clips -> 1080x1920 vertical MP4 (subtitles burn, punch-in zoom, fade, loudnorm) + thumbnail."""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import load_json, run, save_json, duration_of  # noqa: E402

PUNCH_RX = re.compile(r"no no|oh my god|omg|wtf|let'?s go|crash|boom|explo|insane|watch this|wait|fail|dead|bhai|gaya", re.I)


def ass_time(t):
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def build_ass(transcript, start, end, path, max_words=4):
    """Word timestamps se 3-4 word ke bold chunks. Word times na ho to segment split karta hai."""
    chunks = []
    for seg in transcript or []:
        if seg["end"] <= start or seg["start"] >= end:
            continue
        words = seg.get("words") or []
        if not words:
            toks = seg["text"].split()
            if not toks:
                continue
            step = (seg["end"] - seg["start"]) / len(toks)
            words = [{"start": seg["start"] + i * step, "end": seg["start"] + (i + 1) * step, "word": t}
                     for i, t in enumerate(toks)]
        for i in range(0, len(words), max_words):
            g = words[i:i + max_words]
            chunks.append((max(g[0]["start"], start) - start, min(g[-1]["end"], end) - start,
                           " ".join(w["word"] for w in g).upper()))
    if not chunks:
        return None
    header = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
              "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,"
              "Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,"
              "MarginL,MarginR,MarginV,Encoding\n"
              "Style: Default,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,6,2,2,60,60,420,1\n"
              "Style: Hook,Arial,92,&H0000E6FF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,7,3,8,60,60,260,1\n\n"
              "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n")
    lines = [header]
    for s, e, txt in chunks:
        lines.append(f"Dialogue: 0,{ass_time(s)},{ass_time(max(e, s + 0.25))},Default,,0,0,0,,"
                     f"{{\\fad(40,40)}}{txt.replace(chr(10), ' ')}\n")
    Path(path).write_text("".join(lines), encoding="utf-8")
    return path


def hook_line(path, text, secs=2.5):
    esc = text.replace("{", "").replace("}", "")
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"Dialogue: 1,{ass_time(0)},{ass_time(secs)},Hook,,0,0,0,,{{\\fad(80,150)\\t(0,200,\\fscx115\\fscy115)}}{esc}\n")


def punch_times(transcript, start, end, limit=4):
    """Strong words ke timestamps (clip-relative)."""
    out = []
    for seg in transcript or []:
        for w in (seg.get("words") or []):
            if start <= w["start"] < end and PUNCH_RX.search(w["word"]):
                out.append(round(w["start"] - start, 2))
    # kam se kam 2.5s ka gap
    res = []
    for t in sorted(out):
        if not res or t - res[-1] > 2.5:
            res.append(t)
    return res[:limit]


def zoom_expr(dur, punches, vip):
    amp = 0.16 if vip else 0.10
    p = "+".join(f"{amp}*between(t,{t},{t + 0.7})" for t in punches) or "0"
    drift = 0.05 if vip else 0.03
    return f"(1+{drift}*t/{dur:.2f}+{p})"


def render_clip(video, clip, transcript, outdir, effects=("zoom", "fade", "subs", "hook"), preset="veryfast"):
    outdir = Path(outdir)
    (outdir / "clips").mkdir(parents=True, exist_ok=True)
    (outdir / "subtitles").mkdir(exist_ok=True)
    (outdir / "thumbnails").mkdir(exist_ok=True)
    cid, s, e = clip["id"], clip["start"], clip["end"]
    dur = round(e - s, 2)
    out_rel = f"clips/{cid}.mp4"

    ass_rel = None
    if "subs" in effects or "hook" in effects:
        ass = build_ass(transcript, s, e, outdir / "subtitles" / f"{cid}.ass") if "subs" in effects else None
        if ass is None and "hook" in effects:     # transcript nahi: sirf hook overlay
            ass = outdir / "subtitles" / f"{cid}.ass"
            ass.write_text(
                "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
                "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,"
                "Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
                "Style: Hook,Arial,92,&H0000E6FF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,7,3,8,60,60,260,1\n\n"
                "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n", encoding="utf-8")
        if ass is not None:
            if "hook" in effects and clip.get("hook_text"):
                hook_line(ass, clip["hook_text"])
            ass_rel = f"subtitles/{cid}.ass"

    vf = ["crop=ih*9/16:ih", "scale=1080:1920", "setsar=1"]
    if "zoom" in effects:
        z = zoom_expr(dur, punch_times(transcript, s, e), clip.get("vip"))
        vf += [f"scale=w='trunc(1080*{z}/2)*2':h='trunc(1920*{z}/2)*2':eval=frame", "crop=1080:1920"]
    vf.append("fps=30")
    if ass_rel:
        vf.append(f"ass={ass_rel}")
    if "fade" in effects:
        vf += ["fade=t=in:st=0:d=0.25", f"fade=t=out:st={max(0, dur - 0.5)}:d=0.5"]
    af = f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.2,afade=t=out:st={max(0, dur - 0.5)}:d=0.5"

    # cwd=outdir taaki ass= path me escaping ka jhanjhat na ho
    import subprocess
    cmd = ["ffmpeg", "-y", "-v", "error", "-ss", str(s), "-t", str(dur), "-i", str(Path(video).resolve()),
           "-vf", ",".join(vf), "-af", af, "-c:v", "libx264", "-preset", preset, "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_rel]
    print("→", " ".join(cmd[:12]), "...")
    subprocess.run(cmd, check=True, cwd=outdir)

    # thumbnail: peak frame
    thumb = f"thumbnails/{cid}.jpg"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(clip.get("peak", s + dur / 2)),
                    "-i", str(Path(video).resolve()), "-frames:v", "1", "-vf",
                    "crop=ih*9/16:ih,scale=720:1280", "-q:v", "2", thumb], check=True, cwd=outdir)
    clip["file"], clip["thumbnail"] = out_rel, thumb
    return clip


def qa(outdir, clip):
    """Basic QA: file hai, duration match, black-frame ratio kam."""
    import subprocess
    f = Path(outdir) / clip["file"]
    issues = []
    if not f.exists() or f.stat().st_size < 50_000:
        return ["file missing/too small"]
    d = duration_of(f)
    if abs(d - clip["duration"]) > 1.0:
        issues.append(f"duration mismatch {d:.1f}s vs {clip['duration']}s")
    r = subprocess.run(["ffmpeg", "-i", str(f), "-vf", "blackdetect=d=0.8:pic_th=0.98", "-an", "-f", "null", "-"],
                       capture_output=True, text=True)
    if "black_start" in r.stderr:
        issues.append("black frames detected")
    return issues


def render_all(video, workdir, outdir, only_ids=None, effects=("zoom", "fade", "subs", "hook"), preset="veryfast"):
    ranked = load_json(Path(workdir) / "ranked.json")
    transcript = load_json(Path(workdir) / "transcript.json", [])
    clips = ranked["clips"]
    for c in clips:
        if only_ids and c["id"] not in only_ids:
            continue
        render_clip(video, c, transcript, outdir, effects, preset)
        c["qa_issues"] = qa(outdir, c)
        print(f"✓ {c['id']} {'⭐VIP ' if c['vip'] else ''}{c['category']} score={c['score']} "
              f"{'QA: ' + '; '.join(c['qa_issues']) if c['qa_issues'] else ''}")
    save_json(ranked, Path(workdir) / "ranked.json")
    return clips


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("workdir")
    ap.add_argument("outdir")
    ap.add_argument("--only", nargs="*", help="sirf ye clip ids render karo")
    ap.add_argument("--effects", default="zoom,fade,subs,hook")
    ap.add_argument("--preset", default="veryfast")
    a = ap.parse_args()
    render_all(a.video, a.workdir, a.outdir, a.only, tuple(a.effects.split(",")), a.preset)
