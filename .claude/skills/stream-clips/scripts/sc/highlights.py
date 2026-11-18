"""Turn the transcript + signals into a short list of clip-worthy moments.

The transcript is split into overlapping windows. Each window becomes one prompt for the
chosen brain (see brains.py). Answers are cached per window, so a stopped run resumes and
agent mode can answer the windows one by one."""

import json
import re
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import brains
from .common import Problem, read_json, say, write_json

PROMPT = """You are an editor who cuts short vertical clips (TikTok, Instagram Reels, YouTube \
Shorts) out of long videos. You are paid by views, so you only pick moments that grab a \
stranger in the first second and keep them to the end.

Video: "<<TITLE>>" by <<CREATOR>>
Topic: <<TOPIC>><<FOCUS>>

Below is part of the transcript. Each line starts with its time in seconds. Some lines \
carry signals:
  <<VOLUME +N dB>>  the audio got N dB louder than the minutes around it (shouting, laughing, hype)
  <<CHAT Nx>>       the live chat moved N times faster than usual right then (the audience reacted)
Signals are hints, not proof: gunshots, music and explosions are loud too. The transcript \
can include other voices (game characters, a video being watched), so judge who is talking \
from context.

Moment types that do well for <<TOPIC>>:
  reaction  a big emotional reaction: shock, rage, screaming, laughing fit, speechless
  skill     an impressive play, clutch, outplay or win, together with the reaction to it
  funny     a fail, a chaotic accident, a joke or roast people send to a friend
  reveal    seeing, finding or learning something new or surprising for the first time
  take      a bold opinion or prediction people will argue about in the comments
  tip       a specific, useful tip or insight a viewer can use right away
  story     a short story with a clear punchline

Pick at most <<K>> moments from this part. Each moment must:
  - start just before its hook, never on filler ("uh", "anyway", "so yeah", "okay so")
  - make sense with zero context and pay off before it ends
  - be <<MIN>>-<<MAX>> seconds long, lie inside <<LO>>-<<HI>>, and not overlap another pick
Skip sponsor reads, reading donations or subs, menus, loading screens, silence, and \
anything whose payoff falls outside this part. An empty list [] is a fine answer when \
nothing is strong.

Reply with a JSON array and nothing else (no prose, no markdown fence). Example shape:
[{"start": 1204.0, "end": 1239.5, "type": "reaction", "title": "...", "caption": "...", \
"hashtags": ["#..."], "score": 72, "why": "..."}]

title: the text bar shown over the clip. 3-10 words, names the creator, CAPITALS on the 1-3 \
words that carry the drama, teases the payoff without giving it away, at most one emoji.
caption: the post text, under 140 characters, ending with a question or a nudge to comment.
hashtags: 3-6 tags: the topic, the creator, one broad tag.
score: 1-100, how likely a viewer watches to the end. Be strict: 80+ only for clips you \
would bet money on.
why: one short sentence.

TRANSCRIPT <<LO>>-<<HI>>:
<<TEXT>>
"""


def _fill(**values):
    text = PROMPT
    for key, value in values.items():
        text = text.replace(f"<<{key}>>", str(value))
    return text


def transcript_lines(words, spike_db, chat, cfg):
    """Group words into short lines (~7 s, broken at pauses) and attach signals."""
    chat_base = float(np.median([c for c in chat if c > 0])) if chat and any(chat) else 0.0
    lines, cur = [], []

    def close():
        if not cur:
            return
        t0, t1 = cur[0]["s"], cur[-1]["e"]
        marks = []
        if len(spike_db):
            a = min(int(t0), len(spike_db) - 1)
            b = max(a + 1, min(int(np.ceil(t1)) + 1, len(spike_db)))
            peak = float(np.max(spike_db[a:b]))
            if peak >= cfg["volume_jump_db"]:
                marks.append(f"<<VOLUME +{peak:.0f} dB>>")
        if chat_base:
            seg = chat[int(t0 // 10): int(t1 // 10) + 2]  # chat trails the moment
            if seg and max(seg) / chat_base >= cfg["chat_jump"]:
                marks.append(f"<<CHAT {max(seg) / chat_base:.0f}x>>")
        text = " ".join(w["w"] for w in cur)
        lines.append((t0, (" ".join(marks) + " " if marks else "") + text))
        cur.clear()

    for i, w in enumerate(words):
        cur.append(w)
        gap = words[i + 1]["s"] - w["e"] if i + 1 < len(words) else 99
        span = w["e"] - cur[0]["s"]
        if span >= 7 or (gap > 1.2 and span >= 2) or gap > 3:
            close()
    close()
    return lines


def windows(lines, lo, hi, cfg):
    size, overlap = cfg["part_minutes"] * 60, cfg["part_overlap"]
    out, start = [], lo
    while start < hi:
        end = min(hi, start + size)
        if hi - end < 120:          # don't leave a tiny leftover window at the end
            end = hi
        body = [f"[{t:.1f}] {text}" for t, text in lines if start <= t < end]
        if sum(len(b.split()) for b in body) >= 40:
            out.append((start, end, "\n".join(body)))
        if end >= hi:
            break
        start = end - overlap
    return out


def parse_reply(raw):
    text = (raw or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("["):
        found = re.search(r"\[\s*(?:\{.*\})?\s*\]", text, re.S)
        if not found:
            return None
        text = found.group(0)
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, list) else None


def tidy(pick, words, cfg):
    """Move the AI's times onto clean word boundaries and keep the length in range."""
    try:
        s, e = float(pick["start"]), float(pick["end"])
    except (KeyError, TypeError, ValueError):
        return None
    if e <= s:
        return None
    pool = [w for w in words if s - 4 <= w["s"] <= e + 4]
    if not pool:
        return None

    where = {id(w): i for i, w in enumerate(words)}

    def gap_before(w):
        i = where[id(w)]
        return w["s"] - words[i - 1]["e"] if i else 9.0

    def gap_after(w):
        i = where[id(w)]
        return words[i + 1]["s"] - w["e"] if i + 1 < len(words) else 9.0

    # start: the nearest word within 2 s, preferring one that follows a pause
    near = [w for w in pool if abs(w["s"] - s) <= 2.0] or [min(pool, key=lambda w: abs(w["s"] - s))]
    first = min(near, key=lambda w: abs(w["s"] - s) - (0.8 if gap_before(w) > 0.35 else 0))
    # end: the nearest word end within 2.5 s, preferring a sentence end or a pause
    tail = [w for w in pool if w["s"] >= first["s"] and abs(w["e"] - e) <= 2.5]
    if not tail:
        tail = [w for w in pool if w["s"] >= first["s"]]
    last = min(tail, key=lambda w: abs(w["e"] - e)
               - (0.9 if w["w"].endswith((".", "!", "?")) else 0)
               - (0.6 if gap_after(w) > 0.5 else 0))
    lo_len, hi_len = cfg["min_len"], cfg["max_len"]
    if last["e"] - first["s"] > hi_len:
        fits = [w for w in words if first["s"] <= w["s"] and w["e"] - first["s"] <= hi_len - 1]
        if not fits:
            return None
        enders = [w for w in fits if w["w"].endswith((".", "!", "?"))
                  and w["e"] - first["s"] >= lo_len]
        last = enders[-1] if enders else fits[-1]
    if last["e"] - first["s"] < lo_len:
        more = [w for w in words if w["e"] > last["e"] and lo_len <= w["e"] - first["s"] <= hi_len - 1]
        if not more:
            return None
        last = more[0]
    out = dict(pick)
    out["start"] = round(max(0.0, first["s"] - 0.35), 2)
    out["end"] = round(min(last["e"] + 0.55, out["start"] + hi_len), 2)
    try:
        out["score"] = int(float(pick.get("score", 50)))
    except (TypeError, ValueError):
        out["score"] = 50
    out["type"] = str(pick.get("type") or "moment")
    out["title"] = str(pick.get("title") or "").strip()
    out["caption"] = str(pick.get("caption") or "").strip()
    tags = pick.get("hashtags") or []
    out["hashtags"] = [t if str(t).startswith("#") else f"#{t}" for t in tags if str(t).strip()][:6]
    return out


def best(cands, n, min_score):
    """Highest scores first; no two picks share more than a sliver of time."""
    chosen = []
    for c in sorted(cands, key=lambda c: -c["score"]):
        if c["score"] < min_score:
            continue
        if all(min(c["end"], k["end"]) - max(c["start"], k["start"]) < 2.0 for k in chosen):
            chosen.append(c)
        if len(chosen) >= n:
            break
    return sorted(chosen, key=lambda c: c["start"])


def pick(heard, spike_db, chat, lo, hi, work, cfg, video, brain, model=None, redo=False):
    folder = work / "picks"
    folder.mkdir(exist_ok=True)
    final = folder / f"chosen_{int(lo)}_{int(hi)}.json"
    if redo:
        for f in folder.glob("*"):
            if f.suffix == ".json" or f.name.endswith(".prompt.txt"):
                f.unlink(missing_ok=True)
    if final.exists():
        chosen = read_json(final, [])
        say(f"reusing {len(chosen)} picked moment(s)", "good")
        return chosen

    words = heard["words"]
    parts = windows(transcript_lines(words, spike_db, chat, cfg), lo, hi, cfg)
    if not parts:
        raise Problem("there's not enough talking in this stream to clip")

    def prompt_for(a, b, body):
        return _fill(TITLE=video["title"], CREATOR=video["name"], TOPIC=video["topic"],
                     FOCUS=f"\nWhat the clipper wants: {video['focus']}" if video.get("focus") else "",
                     K=cfg["picks_per_part"], MIN=cfg["min_len"], MAX=cfg["max_len"],
                     LO=f"{a:.0f}", HI=f"{b:.0f}", TEXT=body)

    def answer_file(a):
        return folder / f"part_{int(a):06d}.answer.json"

    if brain == "agent":
        waiting = []
        for a, b, body in parts:
            ans = answer_file(a)
            if not ans.exists():
                q = folder / f"part_{int(a):06d}.prompt.txt"
                q.write_text(prompt_for(a, b, body), encoding="utf-8")
                waiting.append((q, ans))
        if waiting:
            raise brains.NeedAgent(waiting)
    else:
        say(f"{brain} is reading {len(parts)} part(s) of the transcript, "
            f"{cfg['brain_parallel']} at a time...", "step")

    def work_on(part):
        a, b, body = part
        ans = answer_file(a)
        got = read_json(ans) if ans.exists() else None
        if got is None and brain != "agent":
            reply = None
            for attempt in range(2):
                try:
                    reply = parse_reply(brains.ask(brain, prompt_for(a, b, body), model, folder))
                except brains.SignedOut:
                    raise
                except Problem as exc:
                    say(f"  part at {a / 60:.0f} min: {str(exc)[:160]}", "warn")
                    reply = None
                if reply is not None:
                    break
            if reply is None:
                return []
            got = reply
            write_json(ans, got)
        if not isinstance(got, list):
            return []
        good = []
        for m in got:
            if isinstance(m, dict):
                t = tidy(m, words, cfg)
                if t and a - 5 <= t["start"] < b + 5:
                    good.append(t)
        return good

    cands = []
    with ThreadPoolExecutor(max_workers=max(1, int(cfg["brain_parallel"]))) as pool:
        for got in pool.map(work_on, parts):
            cands += got
    chosen = best(cands, cfg["clips"], cfg["min_score"])
    write_json(folder / f"candidates_{int(lo)}_{int(hi)}.json", cands)
    if not chosen:
        raise Problem("the AI found nothing strong enough to clip in this stream "
                      "(try another stream, or lower min_score in settings.json)")
    write_json(final, chosen)
    say(f"picked {len(chosen)} of {len(cands)} candidate moments", "good")
    return chosen
