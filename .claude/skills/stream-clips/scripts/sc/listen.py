"""Listen to the stream locally: Whisper transcript, a per-second volume curve and (on
YouTube replays) how fast chat moved. The audio is handled in fixed blocks aligned to
stream time, each cached on disk, so re-runs and --section runs reuse earlier work."""

import json
import os
import threading

import numpy as np

from .common import MODELS, Problem, decode, read_json, run, say, write_json

os.environ.setdefault("HF_HUB_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

_models = {}
_models_lock = threading.Lock()
RATE = 16000


def whisper(name):
    """One shared model per size; num_workers lets parallel streams transcribe together."""
    with _models_lock:
        if name not in _models:
            from faster_whisper import WhisperModel
            say(f"loading Whisper '{name}'...", "step")
            _models[name] = WhisperModel(name, device="cpu", compute_type="int8", num_workers=2,
                                         download_root=str(MODELS / "whisper"))
        return _models[name]


def transcribe(model_name, samples, language=None, offset=0.0):
    """[{s, e, w}] word timings (seconds + offset) and the detected language."""
    np.seterr(all="ignore")
    segments, info = whisper(model_name).transcribe(
        samples, language=language, word_timestamps=True, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        beam_size=1 if model_name == "tiny" else 4, condition_on_previous_text=False)
    words = []
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"s": round(w.start + offset, 2), "e": round(w.end + offset, 2),
                              "w": text})
    return words, info.language


def _volume(samples):
    """dB per whole second."""
    n = len(samples) // RATE
    if not n:
        return []
    sec = samples[: n * RATE].reshape(n, RATE)
    return (20 * np.log10(np.sqrt(np.mean(sec ** 2, axis=1)) + 1e-5)).round(1).tolist()


def scan(audio, total, lo, hi, work, cfg, live=False):
    """Words and per-second volume for [lo, hi) of the stream."""
    size = cfg["block_minutes"] * 60
    folder = work / "blocks"
    folder.mkdir(exist_ok=True)
    first, last = int(lo // size), int(max(lo, hi - 0.01) // size)
    # Language is detected per block unless the user set one: streamers switch languages,
    # and locking the first detection onto the whole stream garbles everything after it.
    language = cfg["language"]
    words, volume = [], {}
    count = last - first + 1
    say(f"listening to {(hi - lo) / 60:.0f} min of audio ({count} block(s) of "
        f"{cfg['block_minutes']} min)...", "step")
    for n, b in enumerate(range(first, last + 1), 1):
        path = folder / f"{b:04d}.json"
        start = b * size
        length = min(size, total - start)
        if length <= 1:
            continue
        block = read_json(path)
        if not block or (block.get("length", 0) + 1 < length):
            samples = decode(audio, RATE, start, length)
            got, lang = transcribe(cfg["scan_model"], samples, language, offset=start)
            block = {"length": length, "words": got, "volume": _volume(samples), "language": lang}
            if not (live and length < size):
                write_json(path, block)
        words += [w for w in block["words"] if lo <= w["s"] < hi]
        for i, db in enumerate(block["volume"]):
            volume[start + i] = db
        say(f"  heard {n}/{count}", "info")
    if not words:
        raise Problem("no speech was found in this part of the stream")
    secs = int(np.ceil(total))
    # seconds outside the scanned part get the typical level, so the edges of a --section
    # don't look like huge volume jumps
    typical = float(np.median(list(volume.values()))) if volume else -40.0
    curve = np.full(secs, typical, dtype=np.float32)
    for t, db in volume.items():
        if t < secs:
            curve[t] = db
    return {"words": words, "language": language, "volume": curve}


def spikes(curve, window=180):
    """How many dB each second sits above the typical level of the minutes around it."""
    v = np.asarray(curve, dtype=np.float32)
    if len(v) < 10:
        return np.zeros_like(v)
    step = 5
    coarse = v[::step]
    half = max(1, window // step // 2)
    pad = np.pad(coarse, half, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(pad, 2 * half + 1)
    base = np.repeat(np.percentile(windows, 60, axis=1), step)[: len(v)]
    return np.clip(v - base, 0, None)


def chat_speed(url, args, work, meta, cfg):
    """Chat messages per 10 s from a YouTube live replay, or None."""
    if not cfg["chat_replay"] or "youtube" not in str(meta.get("extractor_key", "")).lower():
        return None
    if meta.get("live_status") not in ("was_live", "post_live"):
        return None
    cached = work / "chat.json"
    if cached.exists():
        return read_json(cached)
    say("reading the chat replay (shows where the audience reacted)...", "step")
    try:
        run(["yt-dlp", *args, "--skip-download", "--write-subs", "--sub-langs", "live_chat",
             "-o", str(work / "chat"), url], timeout=cfg["chat_timeout"])
    except Problem as exc:
        say(f"chat replay skipped ({str(exc)[:80]})", "warn")
    files = sorted(work.glob("chat*.live_chat.json*"))
    if not files:
        write_json(cached, None)
        return None
    counts = {}
    with open(files[0], encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                item = json.loads(line)["replayChatItemAction"]
                bucket = int(item.get("videoOffsetTimeMsec", 0)) // 10000
            except (ValueError, KeyError, TypeError):
                continue
            counts[bucket] = counts.get(bucket, 0) + len(item.get("actions") or [1])
    for f in files:
        f.unlink(missing_ok=True)
    if not counts:
        write_json(cached, None)
        return None
    rate = [0] * (max(counts) + 1)
    for k, n in counts.items():
        rate[k] = n
    write_json(cached, rate)
    say(f"chat replay: {sum(rate):,} messages", "good")
    return rate
