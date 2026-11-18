#!/usr/bin/env python3
"""GTA 6 Viral Clip Factory — one-command pipeline.

  python scripts/auto_clip.py --source ./gta6.mp4 --output ./output/gta6 --clips 30 --top 4
  python scripts/auto_clip.py --source "https://youtube.com/watch?v=..." --confirm-rights --output ./output/gta6
"""
import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import need, run, save_json, load_json, duration_of  # noqa: E402
from analyze import analyze  # noqa: E402
from rank import rank  # noqa: E402
from render import render_all  # noqa: E402


def get_source(source, workdir, confirm_rights):
    p = Path(source)
    if p.exists():
        return p.resolve()
    if not source.startswith(("http://", "https://")):
        sys.exit(f"ERROR: '{source}' na file hai na URL.")
    if not confirm_rights:
        sys.exit("STOP: URL se download tabhi hoga jab tumhare paas video ka right/permission ho. "
                 "Confirm ho to --confirm-rights lagao, warna local file do.")
    need("yt-dlp")
    out = Path(workdir) / "input.mp4"
    if not out.exists():
        run(["yt-dlp", "-f", "bv*[height<=1080]+ba/b", "--merge-output-format", "mp4",
             "-o", out, source])
    return out.resolve()


def write_reports(out, ranked):
    clips = ranked["clips"]
    vip = sorted([c for c in clips if c["vip"]], key=lambda c: -c["score"])
    save_json({"source_duration": ranked["duration"], "total_clips": len(clips),
               "vip_clips": len(vip), "clips": clips}, out / "metadata.json")
    save_json({"vip_clips": [{"id": c["id"], "score": c["score"], "upload_priority": i + 1,
                              "category": c["category"], "reason": c["reason"], "hook": c["hook_text"],
                              "file": c.get("file")} for i, c in enumerate(vip)]}, out / "top_clips.json")
    with open(out / "upload_plan.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["priority", "file", "title", "hook", "hashtags", "score", "vip"])
        order = vip + [c for c in clips if not c["vip"]]
        for i, c in enumerate(order, 1):
            w.writerow([i, c.get("file", ""), c["title"], c["hook_text"],
                        " ".join("#" + h for h in c["hashtags"]), c["score"], c["vip"]])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True)
    ap.add_argument("--output", default="./output/gta6_project")
    ap.add_argument("--clips", type=int, default=30)
    ap.add_argument("--top", type=int, default=4)
    ap.add_argument("--min-len", type=float, default=15)
    ap.add_argument("--max-len", type=float, default=45)
    ap.add_argument("--effects", default="zoom,fade,subs,hook")
    ap.add_argument("--whisper-model", default="small")
    ap.add_argument("--language", default=None)
    ap.add_argument("--transcript", default=None, help="ready transcript.json (whisper skip)")
    ap.add_argument("--confirm-rights", action="store_true")
    ap.add_argument("--vip-only", action="store_true", help="sirf VIP clips render karo (fast preview)")
    ap.add_argument("--analyze-only", action="store_true", help="render se pehle ruko, Claude hook/title polish kare")
    ap.add_argument("--preset", default="veryfast", help="x264 preset (best quality: medium/slow)")
    ap.add_argument("--render-only", action="store_true", help="existing work/ranked.json se render (polish ke baad)")
    a = ap.parse_args()

    need("ffmpeg"); need("ffprobe")
    out = Path(a.output)
    work = out / "work"
    work.mkdir(parents=True, exist_ok=True)

    video = get_source(a.source, work, a.confirm_rights)
    print(f"Source: {video}  ({duration_of(video) / 60:.1f} min)")

    if a.render_only:
        clips = load_json(work / "ranked.json", {}).get("clips", [])
    else:
        analyze(video, work, a.whisper_model, a.language, a.transcript)
        clips = rank(video, work, a.clips, a.top, a.min_len, a.max_len)
    if not clips:
        sys.exit("Koi candidate nahi mila — video bahut silent/short ho sakta hai.")
    if a.analyze_only:
        print(f"→ {work/'ranked.json'} ready. Hook/title polish karke `render.py` chalao.")
        return

    only = [c["id"] for c in clips if c["vip"]] if a.vip_only else None
    render_all(video, work, out, only, tuple(a.effects.split(",")), a.preset)
    ranked = load_json(work / "ranked.json")
    write_reports(out, ranked)
    print(f"\nDone → {out}\n  clips/  subtitles/  thumbnails/  metadata.json  top_clips.json  upload_plan.csv")


if __name__ == "__main__":
    main()
