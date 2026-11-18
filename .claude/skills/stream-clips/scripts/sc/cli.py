"""Command line: find / clip / doctor."""

import argparse
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor

from . import brains, discover, pipeline, settings
from .common import DATA, MODELS, Problem, keywords_for, need, say

AGENT_EXIT = 3


def _common(p):
    p.add_argument("--topic", help='what the clips are about, e.g. "GTA 6", "Valorant", "chess"')
    p.add_argument("--keywords", help="comma-separated words a title must contain (default: the topic)")
    p.add_argument("--cookies", choices=["chrome", "edge", "firefox", "brave", "safari", "opera", "vivaldi"],
                   help="use this browser's login (age-restricted YouTube, Kick, sub-only VODs)")


def parser():
    p = argparse.ArgumentParser(prog="streamclips", description="Long streams in, vertical clips out.")
    sub = p.add_subparsers(dest="command", required=True)

    f = sub.add_parser("find", help="list the biggest recent streams for a topic")
    _common(f)
    f.add_argument("--count", type=int, default=8)
    f.add_argument("--when", choices=["hour", "today", "week", "month"])
    f.add_argument("--search", help="exact YouTube search words (default: '<topic> stream')")

    c = sub.add_parser("clip", help="make clips from streams")
    _common(c)
    c.add_argument("urls", nargs="*", help="stream / video links (YouTube, Twitch, Kick, ...)")
    c.add_argument("--find", action="store_true", help="find streams for --topic and clip them")
    c.add_argument("--count", type=int, default=5, help="with --find: how many streams")
    c.add_argument("--when", choices=["hour", "today", "week", "month"])
    c.add_argument("--search", help="with --find: exact YouTube search words")
    c.add_argument("--clips", type=int, help="clips per stream (default 3)")
    c.add_argument("--focus", help='extra direction for the picker, e.g. "clutch rounds and rage"')
    c.add_argument("--brain", default="auto",
                   choices=["auto", "claude", "codex", "gemini", "opencode", "agent"],
                   help="who picks the moments (default: the agent CLI that is running this)")
    c.add_argument("--model", help="model name for the brain CLI, e.g. sonnet")
    c.add_argument("--section", help='only part of the stream, "1:00:00-2:30:00"')
    c.add_argument("--new-only", action="store_true",
                   help="only the part after the previous run (for live streams)")
    c.add_argument("--layout", choices=["auto", "stack", "crop", "blur"])
    c.add_argument("--cam", help="facecam box as fractions x,y,w,h (e.g. 0.75,0.0,0.25,0.3)")
    c.add_argument("--min", dest="min_len", type=int, help="shortest clip, seconds")
    c.add_argument("--max", dest="max_len", type=int, help="longest clip, seconds")
    c.add_argument("--language", help="speech language code, e.g. en, hi, es (default: detect)")
    c.add_argument("--parallel", type=int, default=2, help="streams processed at once")
    c.add_argument("--fast", action="store_true", help="hardware video encoding if available")
    c.add_argument("--repick", action="store_true", help="pick moments again (keeps downloads)")
    c.add_argument("--keep-audio", action="store_true", help="keep the stream audio afterwards")

    sub.add_parser("doctor", help="check the install")
    return p


def doctor():
    ok = True
    for tool in ("ffmpeg", "ffprobe", "yt-dlp"):
        found = shutil.which(tool)
        print(f"  {'ok ' if found else 'MISSING'} {tool}")
        ok &= bool(found)
    js = shutil.which("deno") or shutil.which("node")
    print(f"  {'ok ' if js else 'MISSING'} JavaScript runtime (deno/node) for YouTube")
    for b in brains.ORDER:
        print(f"  {'ok ' if shutil.which(b) else ' - '} {b} CLI")
    print(f"  brain chosen with --brain auto: {brains.choose('auto')}")
    print(f"  {'ok ' if (MODELS / 'face_yunet.onnx').exists() else ' - '} face model")
    print(f"  output folder: {DATA}")
    return 0 if ok else 1


def print_found(found):
    print()
    for i, s in enumerate(found, 1):
        live = " LIVE" if s["live"] else ""
        views = f"{s['views']:,}" if s["views"] else "?"
        length = f"{s['seconds'] // 3600}h{s['seconds'] // 60 % 60:02d}m" if s["seconds"] else ""
        print(f"  {i}. {s['name'][:24]:24} {views:>11} views {length:>6}{live}  {s['title'][:60]}")
        print(f"     {s['url']}   ({s['from']})")
    print()


def main(argv):
    opts = parser().parse_args(argv)
    try:
        if opts.command == "doctor":
            return doctor()
        need("yt-dlp", "Run setup first.")
        need("ffmpeg", "Install ffmpeg (macOS: brew install ffmpeg, Windows: winget install Gyan.FFmpeg).")
        cfg = settings.load({
            "search_when": getattr(opts, "when", None), "clips": getattr(opts, "clips", None),
            "layout": getattr(opts, "layout", None), "min_len": getattr(opts, "min_len", None),
            "max_len": getattr(opts, "max_len", None), "language": getattr(opts, "language", None)})
        words = keywords_for(opts.topic, opts.keywords)

        if opts.command == "find":
            if not opts.topic and not opts.search:
                raise Problem("give a --topic (or --search words)")
            found = discover.find(opts.topic, words, cfg, opts.count, opts.search, opts.cookies)
            if not found:
                raise Problem("nothing found. Try --when week, other --keywords, or add creators "
                              f"to {DATA / 'watchlist.txt'}")
            print_found(found)
            return 0

        urls = list(opts.urls)
        if opts.find:
            if not opts.topic:
                raise Problem("--find needs a --topic")
            found = discover.find(opts.topic, words, cfg, opts.count, opts.search, opts.cookies)
            print_found(found)
            urls += [s["url"] for s in found]
        if not urls:
            raise Problem("give one or more links, or use --find --topic \"...\"")
        opts.cam_box = None
        if opts.cam:
            try:
                opts.cam_box = tuple(float(v) for v in opts.cam.split(","))
                assert len(opts.cam_box) == 4
            except (ValueError, AssertionError):
                raise Problem("--cam needs four numbers: x,y,w,h") from None
        opts.brain_resolved = brains.choose(opts.brain)
        say(f"moments will be picked by: {opts.brain_resolved}", "info")

        results, waiting, failed = [], [], []

        def one(url):
            try:
                try:
                    return pipeline.process(url, opts, cfg)
                except brains.SignedOut as exc:
                    if opts.brain != "auto":
                        raise
                    say(f"{exc} Switching to agent mode.", "warn")
                    opts.brain_resolved = "agent"
                    return pipeline.process(url, opts, cfg)
            except brains.NeedAgent as need_more:
                waiting.extend(need_more.waiting)
            except Exception as exc:  # noqa: BLE001
                failed.append((url, str(exc)))
                say(f"{url}: {str(exc)[:400]}", "bad")
            return None

        with ThreadPoolExecutor(max_workers=max(1, opts.parallel)) as pool:
            results = [r for r in pool.map(one, urls) if r]

        print()
        total = sum(len(r["clips"]) for r in results)
        if results:
            say(f"done: {total} clip(s) from {len(results)} stream(s)", "good")
        for r in results:
            print(f"\n  {r['name']}: {r['title'][:64]}\n  {r['summary']}\n  folder: {r['outdir']}")
            for c in r["clips"]:
                print(f"    [{c['score']}] {c['seconds']:>3.0f}s  {c['file']}  {c['title'] or ''}")
        if waiting:
            print("\nAGENT MODE: answer these transcript parts, then run the SAME command again.")
            print("For each prompt file, read it and write its JSON answer (just the array) to the")
            print("answer file next to it:\n")
            for q, a in waiting:
                print(f"  {q}\n    -> {a}")
            return AGENT_EXIT
        if failed and not results:
            return 1
        return 0
    except Problem as exc:
        say(str(exc), "bad")
        return 1
    except KeyboardInterrupt:
        print("\nstopped. Run the same command again to resume.", file=sys.stderr)
        return 130
