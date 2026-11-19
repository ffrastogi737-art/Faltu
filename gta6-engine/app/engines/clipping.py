"""Engine 3: Stream clipping & campaign engine.

Hard gate: a source is only processed for a campaign when that campaign has
rules_verified, payout_verified and content_rights_confirmed all TRUE, the deadline
hasn't passed, and the source channel is in allowed_sources (if listed).
These flags are set by YOU after reading the campaign page — never assumed."""
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from ..brain.queue import handler, NoRetry
from ..config import settings
from ..db import SessionLocal, Campaign, Video, Submission, log, limit, now
from .. import render, storage

EXPORT_PRESETS = {"shorts": 59, "tiktok": 60, "reels": 60, "short_hook": 20}
HYPE_WORDS = ["no way", "oh my god", "what", "bro", "insane", "let's go", "lets go", "crazy", "wtf", "run", "clip that", "yo"]


class NotEligible(NoRetry):
    pass


def check_eligibility(campaign, source_channel=None):
    reasons = []
    if not campaign.rules_verified:
        reasons.append("campaign rules not verified")
    if not campaign.payout_verified:
        reasons.append("payout not verified")
    if not campaign.content_rights_confirmed:
        reasons.append("content rights not confirmed")
    if campaign.deadline and campaign.deadline < datetime.now(timezone.utc).replace(tzinfo=None):
        reasons.append("deadline passed")
    if campaign.allowed_sources and source_channel not in campaign.allowed_sources:
        reasons.append(f"source '{source_channel}' not in allowed sources")
    return {"eligible": not reasons, "reasons": reasons}


# ---------- analysis ----------
def loudness_curve(path):
    """Per-second RMS level (dB) using ffmpeg astats."""
    p = subprocess.run(["ffmpeg", "-v", "info", "-i", str(path), "-vn", "-af",
                        "asetnsamples=n=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
                        "-f", "null", "-"], capture_output=True, text=True).stderr
    vals = []
    for m in re.findall(r"RMS_level=(-?[\d.]+|-inf)", p):
        vals.append(-90.0 if m == "-inf" else float(m))
    return vals


def scene_changes(path):
    p = subprocess.run(["ffmpeg", "-v", "info", "-i", str(path), "-vf", "select='gt(scene,0.35)',showinfo",
                        "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
    return [float(x) for x in re.findall(r"pts_time:([\d.]+)", p)]


def transcribe(path):
    """faster-whisper if installed (free, CPU); otherwise empty transcript."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return []
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(path), vad_filter=True)
    return [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segs]


def detect_moments(loud, scenes, transcript, clip_len=30, top_n=5):
    """Score every window; return non-overlapping best ones."""
    n = len(loud)
    if n == 0:
        return []
    base = sorted(loud)[n // 2]
    clip_len = min(clip_len, n)
    windows = []
    for start in range(0, max(n - clip_len, 0) + 1, 2):
        end = start + clip_len
        w = loud[start:end]
        peak = max(w) - base
        spikes = sum(1 for v in w if v - base > 8)
        cuts = sum(1 for t in scenes if start <= t < end)
        words = " ".join(s["text"].lower() for s in transcript if start <= s["start"] < end)
        hype = sum(words.count(k) for k in HYPE_WORDS)
        # peak early = better hook
        first_peak = w.index(max(w)) / max(len(w), 1)
        score = peak * 2 + spikes * 3 + cuts * 1.5 + hype * 6 + (1 - first_peak) * 5
        windows.append({"start": start, "end": end, "score": round(score, 2),
                        "why": {"peak_db": round(peak, 1), "spikes": spikes, "cuts": cuts, "hype_words": hype}})
    windows.sort(key=lambda x: -x["score"])
    picked = []
    for wdw in windows:
        if all(wdw["end"] <= p["start"] or wdw["start"] >= p["end"] for p in picked):
            picked.append(wdw)
        if len(picked) >= top_n:
            break
    return picked


def make_hook(moment, transcript):
    lines = [s["text"] for s in transcript if moment["start"] <= s["start"] < moment["end"]]
    for l in lines:
        if any(k in l.lower() for k in HYPE_WORDS):
            return l[:60]
    w = moment["why"]
    if w["hype_words"] or w["spikes"] > 3:
        return "THIS WENT WRONG FAST"
    return "WAIT FOR IT..."


def export_clip(src, moment, hook, transcript, out, preset="shorts"):
    w, h = 1080, 1920
    dur = min(moment["end"] - moment["start"], EXPORT_PRESETS[preset])
    segs = [(hook, 0, min(2.5, dur))]
    for s in transcript:
        if moment["start"] <= s["start"] < moment["start"] + dur:
            segs.append((s["text"], s["start"] - moment["start"], min(s["end"], moment["start"] + dur) - moment["start"]))
    ass = render.build_ass(segs, w, h, Path(out).with_suffix(".ass"))
    # vertical: blurred fill background + sharp centered gameplay
    fc = (f"[0:v]split[a][b];[a]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=20:2[bg];"
          f"[b]scale={w}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          f"ass='{Path(ass).as_posix()}':fontsdir=/usr/share/fonts[v];"
          f"[0:a]loudnorm=I=-14:TP=-1.5[a]")
    render.run(["ffmpeg", "-y", "-v", "error", "-ss", str(moment["start"]), "-t", f"{dur:.2f}", "-i", str(src),
                "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast",
                "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(out)])
    return str(out)


@handler("clipping.process")
def process_source(p):
    """payload: {campaign_id, source_path, source_channel, top_n, preset}"""
    with SessionLocal() as s:
        c = s.get(Campaign, p["campaign_id"])
        if not c:
            raise ValueError("campaign not found")
        e = check_eligibility(c, p.get("source_channel"))
        if not e["eligible"]:
            raise NotEligible("; ".join(e["reasons"]))
    src = Path(storage.ensure_local(p["source_path"]))
    root = settings.media_dir.resolve()
    if not src.resolve().is_relative_to(root):
        raise NoRetry("source must live inside MEDIA_DIR")  # defence in depth; the API only accepts files in sources/
    if not src.exists():
        raise NoRetry(f"source file not found: {src.name} (upload it to R2 under sources/)")
    start = now().replace(hour=0, minute=0, second=0, microsecond=0)
    with SessionLocal() as s:
        left = limit("max_clips_per_day") - s.query(Video).filter(Video.engine == "clipping", Video.created_at >= start).count()
    if left <= 0:
        raise NoRetry(f"daily clip cap {limit('max_clips_per_day')} reached")
    p = {**p, "top_n": min(p.get("top_n", 5), left)}
    transcript = transcribe(src)
    moments = detect_moments(loudness_curve(src), scene_changes(src), transcript,
                             clip_len=p.get("clip_len", 30), top_n=p.get("top_n", 5))
    out_dir = settings.media_dir / "clipping" / f"c{p['campaign_id']}_{src.stem}"
    out_dir.mkdir(parents=True, exist_ok=True)
    ids = []
    for i, m in enumerate(moments):
        hook = make_hook(m, transcript)
        path = export_clip(src, m, hook, transcript, out_dir / f"clip{i + 1}.mp4", p.get("preset", "shorts"))
        qc = render.quality_check(path, "clip")
        storage.push(path)
        with SessionLocal() as s:
            v = Video(engine="clipping", title=hook[:100], description=f"Clip from {p.get('source_channel', 'source')}",
                      tags=["GTA 6", "gaming clips"], script=hook, file_path=path, duration=qc["duration"],
                      qc={**qc, "moment": m}, approval="pending" if qc["passed"] else "rejected")
            s.add(v)
            s.flush()
            s.add(Submission(campaign_id=p["campaign_id"], video_id=v.id, status="draft"))
            s.commit()
            ids.append(v.id)
    log("info", "clipping", f"{len(ids)} clips from {src.name} for campaign {p['campaign_id']}")
    return {"video_ids": ids, "moments": moments}


def discover_from_text(text, url="", platform="whop"):
    """Campaign discovery: paste a campaign page's text (Whop Content Rewards etc. have no
    public API). Extracts rate / min views / deadline into an UNVERIFIED campaign.
    You then confirm rules, payout and rights on the dashboard before any processing."""
    rate = re.search(r"\$\s?(\d+(?:\.\d+)?)\s*(?:/|per)\s*(?:1k|1,000|1000|thousand)", text, re.I)
    minv = re.search(r"min(?:imum)?\.?\s*(?:of\s*)?([\d,]+)\s*(?:k\s*)?views", text, re.I)
    dl = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    name = (text.strip().splitlines() or ["Untitled campaign"])[0][:200]
    mv = 0
    if minv:
        mv = int(minv.group(1).replace(",", ""))
        if re.search(rf"{re.escape(minv.group(1))}\s*k", text, re.I):
            mv *= 1000
    with SessionLocal() as s:
        c = Campaign(name=name, platform=platform, url=url, rate_per_1k=float(rate.group(1)) if rate else 0,
                     min_views=mv, rules=text[:5000],
                     deadline=datetime.fromisoformat(dl.group(1)) if dl else None, status="unverified")
        s.add(c)
        s.commit()
        return c.id


def ingest(campaign_id, filename, source_channel="", **kw):
    """Queue a source file already uploaded to R2/library under sources/. Name only: no paths, no URLs
    (no downloader on purpose: no SSRF, no ripping other people's streams)."""
    from ..brain.queue import enqueue
    if not re.fullmatch(r"[\w.\- ]{1,120}\.(mp4|mov|mkv|webm)", filename) or ".." in filename:
        raise ValueError("filename must be a plain video file name (mp4/mov/mkv/webm)")
    with SessionLocal() as s:
        c = s.get(Campaign, campaign_id)
        if not c:
            raise ValueError("campaign not found")
        e = check_eligibility(c, source_channel)
        if not e["eligible"]:
            raise NotEligible("; ".join(e["reasons"]))
    return enqueue("clipping", "clipping.process", {"campaign_id": campaign_id, "source_channel": source_channel,
                   "source_path": str(settings.media_dir / "sources" / filename), **kw})


def record_stats(submission_id, views, post_url=None):
    """Manual/API stat update. Payout estimated only from verified rate."""
    with SessionLocal() as s:
        sub = s.get(Submission, submission_id)
        c = s.get(Campaign, sub.campaign_id)
        sub.views = views
        if post_url:
            sub.post_url, sub.status = post_url, "submitted"
        sub.payout_usd = round(views / 1000 * c.rate_per_1k, 2) if c.payout_verified and views >= (c.min_views or 0) else 0
        s.commit()
        return sub.payout_usd
