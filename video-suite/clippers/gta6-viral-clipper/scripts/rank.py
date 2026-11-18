"""Signals -> 20-30 candidate clips -> score (0-100) -> VIP marking + metadata draft.

Heuristic scoring hai. Final hook/title polish Claude karta hai (SKILL.md Step 5).
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import load_json, save_json, duration_of  # noqa: E402

# (regex, weight, category)
KEYWORDS = [
    (r"\bno no no+\b|\bnah nah\b", 9, "rage"),
    (r"\boh my god\b|\bomg\b|\bholy\b", 8, "reaction"),
    (r"\bwtf\b|\bwhat the (f|hell)\b|\bwhat is (this|that)\b", 8, "reaction"),
    (r"\blet'?s go+\b|\bletsgo\b", 8, "clutch"),
    (r"\bwatch this\b|\bhold on\b|\bwait for it\b|\bwait wait\b", 7, "twist"),
    (r"\bcrash(ed|es)?\b|\bexplo(de|sion|ded)\b|\bboom\b", 8, "crash"),
    (r"\bpolice\b|\bcops?\b|\bchase\b|\bwanted\b|\bbusted\b", 6, "chase"),
    (r"\bfail(ed|s)?\b|\bdied\b|\bdead\b|\bwasted\b|\brip\b", 7, "fail"),
    (r"\binsane\b|\bcrazy\b|\bimpossible\b|\bunbelievable\b", 7, "reaction"),
    (r"\bjump\b|\bstunt\b|\bdrift\b|\bnear miss\b|\bhelicopter\b|\bplane\b", 6, "stunt"),
    (r"\bclutch\b|\bescape[d]?\b|\bnarrow\b", 6, "clutch"),
    (r"\blag\b|\bglitch\b|\bbug\b", 5, "glitch"),
    (r"\bfunny\b|\blol\b|\bhaha+\b|\blmao\b", 6, "funny"),
    (r"\brage\b|\bstupid\b|\bidiot\b|\bi hate\b", 6, "rage"),
    # Hinglish
    (r"\bare+ (yaar|bhai)\b|\bbhai\b|\byaar\b", 3, "reaction"),
    (r"\bkya (baat|scene)\b|\bpagal\b|\bmaar (diya|dala)\b|\bgaya\b", 6, "reaction"),
    (r"\bgadi\b|\bbhaag\b|\bpolice (aa|aayi)\b", 5, "chase"),
]
KW = [(re.compile(p, re.I), w, c) for p, w, c in KEYWORDS]

HOOKS = {
    "crash": "WAIT FOR THE CRASH 💀", "chase": "Isse bachna impossible tha...",
    "fail": "He did NOT expect this 😭", "rage": "Rage level: MAX 🤬",
    "funny": "Bro said one line and everything went wrong 💀", "stunt": "Ye stunt dekho...",
    "clutch": "Ye escape INSANE tha", "twist": "Wait for it...",
    "reaction": "Reaction hi sab kuch keh deta hai", "glitch": "GTA physics ne chhodi nahi 😭",
    "cinematic": "Is shot ko dekho...", "dialogue": "Ye dialogue yaad rahega",
}


def z(a):
    a = np.asarray(a, dtype=float)
    if a.size == 0 or a.std() < 1e-9:
        return np.zeros_like(a)
    return (a - a.mean()) / a.std()


def build_signals(duration, energy, scenes, silence, transcript):
    n = int(np.ceil(duration))
    e = np.zeros(n)
    peak = np.zeros(n)
    for b in energy:
        i = int(b["t"])
        if i < n:
            e[i] = b["db"]
            peak[i] = b["peak"]
    audio = np.clip(z(e), 0, 4) / 4 * 100                          # loudness
    spike = np.clip(z(np.diff(e, prepend=e[0])), 0, 4) / 4 * 100   # sudden jumps (crash, shout)
    cuts = np.zeros(n)
    for t in scenes:
        if int(t) < n:
            cuts[int(t)] += 1
    cut_density = np.clip(np.convolve(cuts, np.ones(5), mode="same") / 3, 0, 1) * 100

    kw = np.zeros(n)
    speech = np.zeros(n)
    cats = [dict() for _ in range(n)]
    for seg in transcript or []:
        text = seg["text"]
        s, en = int(seg["start"]), min(int(seg["end"]) + 1, n)
        words = len(text.split())
        for i in range(s, en):
            speech[i] += words / max(en - s, 1)
        for rx, w, cat in KW:
            if rx.search(text):
                for i in range(max(0, s - 1), en):
                    kw[i] += w
                    cats[i][cat] = cats[i].get(cat, 0) + w
        if text.count("!") + text.count("?") >= 2:
            kw[s:en] += 3
    kw = np.clip(kw / 12, 0, 1) * 100
    speech = np.clip(speech / 4, 0, 1) * 100

    sil = np.zeros(n)
    for s in silence:
        sil[int(s["start"]): min(int(s["end"]) + 1, n)] = 1

    score = (0.30 * kw + 0.25 * audio + 0.15 * spike + 0.10 * cut_density + 0.10 * speech)
    score = score * (1 - 0.6 * sil)           # silence penalty
    return {"score": score, "kw": kw, "audio": audio, "spike": spike, "cuts": cut_density,
            "speech": speech, "sil": sil, "cats": cats, "n": n}


def snap(t, transcript, direction):
    """Sentence ke beech me cut na ho: window ko nearest segment boundary pe snap karo."""
    if not transcript:
        return t
    if direction == "start":
        c = [s["start"] for s in transcript if s["start"] <= t + 0.2 and t - s["start"] <= 4]
        return max(c) if c else t
    c = [s["end"] for s in transcript if s["end"] >= t - 0.2 and s["end"] - t <= 4]
    return min(c) if c else t


def overlap(a, b):
    inter = max(0, min(a["end"], b["end"]) - max(a["start"], b["start"]))
    return inter / max(1e-6, min(a["end"] - a["start"], b["end"] - b["start"]))


def category_of(sig, s, e, transcript_text):
    tally = {}
    for i in range(int(s), min(int(e), sig["n"])):
        for c, w in sig["cats"][i].items():
            tally[c] = tally.get(c, 0) + w
    if tally:
        return max(tally, key=tally.get)
    if sig["spike"][int(s):int(e)].max(initial=0) > 60:
        return "reaction"
    return "cinematic" if sig["cuts"][int(s):int(e)].mean() > 40 else "dialogue"


def make_candidates(duration, sig, transcript, n_clips, min_len, max_len, lead, payoff):
    score = sig["score"]
    smooth = np.convolve(score, np.ones(3) / 3, mode="same")
    order = np.argsort(-smooth)
    cands = []
    for p in map(int, order):
        if len(cands) >= n_clips * 3:          # extra lo, baad me dedup + trim
            break
        s = max(0.0, p - lead)
        e = min(duration, p + payoff)
        s, e = snap(s, transcript, "start"), snap(e, transcript, "end")
        if e - s < min_len:
            e = min(duration, s + min_len)
        if e - s > max_len:
            e = s + max_len
        if e - s < min_len * 0.7:
            continue
        c = {"start": round(s, 2), "end": round(e, 2), "peak": float(p)}
        if any(overlap(c, o) > 0.25 or abs(c["peak"] - o["peak"]) < 8 for o in cands):
            continue
        cands.append(c)
    return cands


def score_clip(sig, c, transcript):
    s, e = int(c["start"]), min(int(c["end"]) + 1, sig["n"])
    seg = slice(s, e)
    first2 = slice(s, min(s + 3, sig["n"]))
    dur = max(e - s, 1)
    hook = 0.5 * sig["kw"][first2].mean() + 0.3 * sig["spike"][first2].mean() + 0.2 * sig["audio"][first2].mean()
    emotion = 0.6 * sig["kw"][seg].max(initial=0) + 0.4 * sig["audio"][seg].max(initial=0)
    action = 0.5 * sig["spike"][seg].max(initial=0) + 0.5 * sig["cuts"][seg].mean()
    clarity = sig["speech"][seg].mean() * 0.7 + 30
    dead = sig["sil"][seg].mean()
    peak_rel = (c["peak"] - c["start"]) / dur
    payoff_fast = 100 if peak_rel < 0.6 else 60               # payoff jaldi aana chahiye
    loop = 100 if abs(dur - 25) < 10 else 70
    total = (0.25 * hook + 0.20 * emotion + 0.20 * action + 0.15 * clarity
             + 0.10 * payoff_fast + 0.10 * loop) * (1 - 0.7 * dead)
    return round(float(np.clip(total, 0, 100)), 1), {
        "hook": round(float(hook), 1), "emotion": round(float(emotion), 1),
        "action": round(float(action), 1), "clarity": round(float(clarity), 1),
        "dead_air": round(float(dead), 2)}


def text_in(transcript, s, e):
    return " ".join(x["text"] for x in transcript or [] if x["end"] > s and x["start"] < e).strip()


def rank(video, workdir, n_clips=30, top=4, min_len=15, max_len=45, lead=6, payoff=14):
    wd = Path(workdir)
    duration = duration_of(video)
    energy = load_json(wd / "energy.json", [])
    scenes = load_json(wd / "scenes.json", [])
    silence = load_json(wd / "silence.json", [])
    transcript = load_json(wd / "transcript.json", [])

    sig = build_signals(duration, energy, scenes, silence, transcript)
    cands = make_candidates(duration, sig, transcript, n_clips, min_len, max_len, lead, payoff)

    clips = []
    for c in cands:
        sc, parts = score_clip(sig, c, transcript)
        cat = category_of(sig, c["start"], c["end"], "")
        clips.append({**c, "duration": round(c["end"] - c["start"], 2), "score": sc,
                      "score_parts": parts, "category": cat,
                      "transcript": text_in(transcript, c["start"], c["end"])[:400]})

    clips.sort(key=lambda x: -x["score"])
    clips = clips[:n_clips]
    # relative 0-100 (best clip = 100); raw score bhi rakho
    best = max((c["score"] for c in clips), default=1) or 1
    for c in clips:
        c["raw_score"], c["score"] = c["score"], round(100 * c["score"] / best, 1)

    # VIP: top score, par category diversity ka dhyan (ek category se max 2)
    vip, seen = [], {}
    for c in clips:
        if len(vip) >= top:
            break
        if seen.get(c["category"], 0) < 2:
            vip.append(c)
            seen[c["category"]] = seen.get(c["category"], 0) + 1
            c["_vip"] = True

    for i, c in enumerate(clips, 1):
        c["id"] = f"clip_{i:03d}"
        c["vip"] = bool(c.pop("_vip", False))
        c["hook_text"] = HOOKS.get(c["category"], HOOKS["reaction"])
        c["title"] = f"GTA 6 {c['category']} moment 😭" if c["category"] != "cinematic" else "GTA 6 cinematic moment"
        c["hashtags"] = ["GTA6", "Gaming", c["category"].capitalize(), "Shorts"]
        c["reason"] = (f"hook {c['score_parts']['hook']}, emotion {c['score_parts']['emotion']}, "
                       f"action {c['score_parts']['action']}; dead-air {c['score_parts']['dead_air']}")
        c["why_claude_should_review"] = "hook_text/title heuristic hain — transcript padh ke rewrite karo"
    save_json({"duration": duration, "clips": clips}, wd / "ranked.json")
    print(f"✓ {len(clips)} clips ranked, {sum(c['vip'] for c in clips)} VIP")
    return clips


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("workdir")
    ap.add_argument("--clips", type=int, default=30)
    ap.add_argument("--top", type=int, default=4)
    ap.add_argument("--min-len", type=float, default=15)
    ap.add_argument("--max-len", type=float, default=45)
    a = ap.parse_args()
    rank(a.video, a.workdir, a.clips, a.top, a.min_len, a.max_len)
