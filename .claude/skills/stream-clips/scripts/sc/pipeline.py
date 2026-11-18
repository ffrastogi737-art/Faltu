"""Everything that happens to one stream, start to finish."""

import datetime
import hashlib

from . import highlights, listen, media, produce
from .common import CACHE, DATA, Stopwatch, clock, human, parse_clock, probe, read_json, say, slug, tag, write_json


def work_dir(url):
    key = hashlib.sha1(url.strip().encode()).hexdigest()[:10]
    tail = slug(url.split("://")[-1], 40)
    path = CACHE / f"{tail}_{key}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def section_bounds(opts, total, work):
    lo, hi = 0.0, total
    if opts.section:
        a, _, b = opts.section.replace(" ", "").lstrip("*").partition("-")
        lo = parse_clock(a) if a else 0.0
        hi = min(parse_clock(b), total) if b else total
    elif opts.new_only:
        done = (read_json(work / "progress.json") or {}).get("done_until", 0.0)
        lo = max(0.0, done - 60)
    if hi - lo < 60:
        raise RuntimeError(f"nothing new to clip ({clock(lo)}-{clock(hi)} is under a minute)")
    return lo, hi


def process(url, opts, cfg):
    watch = Stopwatch()
    args = media.ytdlp_args(url, opts.cookies)
    work = work_dir(url)
    with watch.lap("look up"):
        meta = media.metadata(url, args, work)
    tag(meta["name"][:18])
    live = meta.get("live_status") == "is_live"
    if live:
        say("this stream is live: clipping what has been streamed so far", "warn")

    with watch.lap("download audio"):
        audio = media.audio(url, args, work, live=live)
    total = probe(audio)["duration"] or float(meta.get("duration") or 0)
    lo, hi = section_bounds(opts, total, work)
    say(f"{meta['title'][:70]}  ({human(total)}"
        + (f", clipping {clock(lo)}-{clock(hi)})" if (lo, hi) != (0.0, total) else ")"), "good")

    with watch.lap("listen"):
        heard = listen.scan(audio, total, lo, hi, work, cfg, live=live)
        spike_db = listen.spikes(heard["volume"])
        chat = listen.chat_speed(url, args, work, meta, cfg)

    video = {"title": meta["title"], "name": meta["name"], "url": url,
             "topic": opts.topic or "this video", "focus": opts.focus}
    with watch.lap("pick"):
        picks = highlights.pick(heard, spike_db, chat, lo, hi, work, cfg, video,
                                opts.brain_resolved, opts.model, redo=opts.repick)

    day = datetime.date.today().isoformat()
    outdir = (DATA / day / slug(opts.topic or "clips", 30)
              / f"{slug(meta['name'], 24)}__{slug(meta['title'], 40)}")
    memory = read_json(work / "cam.json", {}) or {}
    ctx = {"url": url, "args": args, "audio": audio, "work": work, "outdir": outdir,
           "language": cfg["language"], "fast": opts.fast, "cam": opts.cam_box}
    made = []
    with watch.lap("make clips"):
        for i, pick in enumerate(picks, 1):
            try:
                made.append(produce.make(i, pick, ctx, cfg, memory))
            except Exception as exc:  # noqa: BLE001 - one bad clip must not stop the rest
                say(f"clip {i} failed: {str(exc)[:300]}", "bad")
    write_json(work / "cam.json", memory)

    summary = (f"{human(hi - lo)} of stream -> {len(made)} clip(s) in {human(watch.total())} ("
               + ", ".join(f"{k} {human(v)}" for k, v in watch.parts.items()) + ")")
    if made:
        posting_sheet(outdir, video, made, summary, lo, hi)
        write_json(work / "progress.json", {"done_until": hi, "at": datetime.datetime.now().isoformat()})
        if not opts.keep_audio and not live:
            audio.unlink(missing_ok=True)
    say(summary, "good")
    tag("")
    return {"name": meta["name"], "title": meta["title"], "outdir": outdir, "clips": made,
            "summary": summary}


def posting_sheet(outdir, video, clips, summary, lo, hi):
    lines = [f"# {video['name']}: {video['title']}", "",
             f"Source: {video['url']}  ",
             f"Covered: {clock(lo)} to {clock(hi)}  ",
             summary, "",
             "Watch every clip before posting. Only clip creators who allow it "
             "(many run paid clipping programs).", ""]
    for c in clips:
        lines += [f"## {c['file']}", "",
                  f"**{c['title'] or ''}**  ",
                  f"{c['type']} · {c['seconds']:.0f}s · score {c['score']} · from {clock(c['start'])} "
                  f"· look: {c['look']}", "",
                  "Caption to paste:", "", "```", (c.get("caption") or "") + "\n"
                  + " ".join(c.get("hashtags") or []), "```", "",
                  f"_Why it should work: {c.get('why') or ''}_", "", "---", ""]
    (outdir / "POSTING.md").write_text("\n".join(lines), encoding="utf-8")
    write_json(outdir / "clips.json", {"source": video, "covered": [lo, hi], "clips": clips})
