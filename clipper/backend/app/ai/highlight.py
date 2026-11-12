"""Highlight Intelligence Engine: sentence-safe candidate windows, an explainable 0-100 quality score,
and duplicate removal. Fully local and deterministic - a heuristic estimate, not a prediction of views."""
import re
from typing import Optional

WEIGHT_KEYS = ["hook", "emotion", "curiosity", "information", "completeness", "av_quality"]

# Small English + Hindi/Hinglish lexicons. Matching is on lowercase word tokens.
EMOTION = set("""love hate afraid fear scared angry cry cried tears happy sad amazing incredible terrible awful
 shocking shocked heartbreaking beautiful proud ashamed painful pain dream hope lost died death alive crazy insane
 unbelievable struggle failed failure broke lonely grateful regret never forever pyaar nafrat dard khushi dukh
 sapna himmat zindagi mushkil pagal dil प्यार डर दर्द खुशी सपना ज़िंदगी मुश्किल दिल""".split())
CURIOSITY = set("""why how what secret truth nobody surprising actually turns mistake hidden reveal real reason
 imagine guess believe myth wrong unless until kyun kaise kya raaz sach galti socho क्यों कैसे क्या राज़ सच गलती""".split())
INFO = set("""because means therefore example percent study research data step first second third rule lesson tip
 method works learn understand reason result number million billion thousand kyunki matlab isliye tarika seekho
 क्योंकि मतलब इसलिए तरीका""".split())
HOOK = set("""you your never always stop secret biggest worst best most nobody everyone truth mistake how why
 tum aap kabhi sabse तुम आप कभी सबसे""".split())
DANGLING = set("""and but so because or then also which that it this these those he she they its and, well
 aur lekin toh phir kyunki और लेकिन तो फिर""".split())
CONCLUSION = set("""so therefore finally remember lesson conclusion ultimately point matters toh isliye yaad इसलिए""".split())
SENT_END = re.compile(r"[.!?।…]+[\"')\]]*$")


def _tokens(text: str) -> list[str]:
    return re.findall(r"[^\W_]+", text.lower())


def build_sentences(words: list[dict], pause: float = 0.9) -> list[dict]:
    """Group words into sentences on end punctuation, or on a long pause when punctuation is missing."""
    sents, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        ended = SENT_END.search(w["text"]) is not None
        if nxt is None or ended or nxt["start"] - w["end"] >= pause or len(cur) >= 60:
            sents.append({"start": cur[0]["start"], "end": cur[-1]["end"],
                          "text": " ".join(x["text"] for x in cur), "punctuated": ended})
            cur = []
    return sents


def generate_windows(sents: list[dict], durations: list[float], tolerance: float = 0.3) -> list[tuple[int, int, float]]:
    """(first sentence, last sentence, target) spans. Every span starts and ends on a sentence boundary,
    so no sentence is ever cut in half."""
    spans = set()
    for target in durations:
        lo, hi = target * (1 - tolerance), target * (1 + tolerance)
        for i in range(len(sents)):
            best = None
            for j in range(i, len(sents)):
                d = sents[j]["end"] - sents[i]["start"]
                if d > hi:
                    break
                if d >= lo and (best is None or abs(d - target) < abs(best[1] - target)):
                    best = (j, d)
            if best:
                spans.add((i, best[0], target))
    return sorted(spans)


def _ratio(hits: int, total: int, full_at: float) -> float:
    """0..100, reaching 100 when hits/total hits full_at."""
    return min(100.0, 100.0 * (hits / max(total, 1)) / full_at)


def _overlap(a0: float, a1: float, spans: list[list[float]]) -> float:
    return sum(max(0.0, min(a1, e) - max(a0, s)) for s, e in spans)


def score_window(sents: list[dict], weights: dict, *, silences: Optional[list] = None,
                 scene_cuts: Optional[list] = None, faces: Optional[list] = None) -> dict:
    """Score one candidate (a run of sentences). Returns score, subscores, penalties and plain-language reasons."""
    start, end = sents[0]["start"], sents[-1]["end"]
    dur = max(end - start, 0.1)
    text = " ".join(s["text"] for s in sents)
    toks = _tokens(text)
    first, last = sents[0]["text"], sents[-1]["text"]
    first_toks, last_toks = _tokens(first), _tokens(last)
    reasons: list[str] = []
    sub: dict[str, float] = {}

    # Hook: how strongly the first sentence opens.
    h = 35.0
    if "?" in first:
        h += 25; reasons.append("Opens with a question")
    if re.search(r"\d", first):
        h += 12; reasons.append("Opening includes a specific number")
    hook_hits = len(set(first_toks) & HOOK)
    if hook_hits:
        h += min(25, 12 * hook_hits); reasons.append("Opening uses direct, attention-getting wording")
    if 4 <= len(first_toks) <= 18:
        h += 10
    elif len(first_toks) > 30:
        h -= 15; reasons.append("Opening sentence is long")
    dangling = bool(first_toks) and first_toks[0] in DANGLING
    if dangling:
        h -= 20
    sub["hook"] = max(0.0, min(100.0, h))

    emo = sum(t in EMOTION for t in toks)
    sub["emotion"] = min(100.0, _ratio(emo, len(toks), 0.05) * 0.8 + min(20, text.count("!") * 10))
    if sub["emotion"] >= 60:
        reasons.append("Emotionally charged language")

    cur = sum(t in CURIOSITY for t in toks)
    sub["curiosity"] = min(100.0, _ratio(cur, len(toks), 0.06) * 0.7 + min(30, text.count("?") * 15))
    if sub["curiosity"] >= 60:
        reasons.append("Raises questions that make people keep watching")

    info = sum(t in INFO for t in toks) + len(re.findall(r"\d+", text))
    density = len(set(toks)) / max(len(toks), 1)  # varied vocabulary reads as substance, repetition as filler
    sub["information"] = min(100.0, _ratio(info, len(toks), 0.06) * 0.7 + density * 40)
    if sub["information"] >= 60:
        reasons.append("Contains concrete facts or explanation")

    # Completeness: a self-contained thought with a clean start and finish.
    c = 55.0
    if len(sents) >= 2:
        c += 10
    if sents[-1]["punctuated"]:
        c += 15
    if set(last_toks) & CONCLUSION or set(_tokens(sents[-2]["text"] if len(sents) > 1 else "")) & CONCLUSION:
        c += 20; reasons.append("Ends on a conclusion")
    sub["completeness"] = max(0.0, min(100.0, c))

    # Audio/visual: speech pace, silence, a visible speaker, not too many cuts.
    sil = _overlap(start, end, silences or []) / dur
    wps = len(toks) / dur
    av = 70.0 - min(40.0, sil * 100) + (15 if 1.8 <= wps <= 3.8 else -10 if wps < 1.0 else 0)
    if faces:
        inside = [f for f in faces if start <= f["t"] <= end]
        if inside:
            seen = sum(f["cx"] is not None for f in inside) / len(inside)
            av += 15 * seen
            if seen >= 0.6:
                reasons.append("Speaker is visible for most of the clip")
    cuts = sum(start < t < end for t in (scene_cuts or []))
    if cuts / dur > 0.5:
        av -= 10
    sub["av_quality"] = max(0.0, min(100.0, av))

    total_w = sum(max(0.0, float(weights.get(k, 0))) for k in WEIGHT_KEYS) or 1.0
    score = sum(sub[k] * max(0.0, float(weights.get(k, 0))) for k in WEIGHT_KEYS) / total_w

    penalties: list[dict] = []
    if not sents[-1]["punctuated"] and any(s["punctuated"] for s in sents):
        penalties.append({"points": 8, "why": "Last sentence may be unfinished"})
    if dangling:
        penalties.append({"points": 10, "why": f"Starts with \"{first.split()[0]}\", so it leans on earlier context"})
    if sil > 0.25:
        penalties.append({"points": round(min(15, sil * 30)), "why": f"{round(sil * 100)}% of the clip is silence"})
    if wps < 1.0:
        penalties.append({"points": 6, "why": "Very little speech"})
    score = max(0.0, min(100.0, score - sum(p["points"] for p in penalties)))
    if not reasons:
        reasons.append("Complete passage with steady speech")
    return {"score": round(score, 1), "subscores": {k: round(v, 1) for k, v in sub.items()},
            "penalties": penalties, "reasons": reasons}


def _similar(a: dict, b: dict) -> bool:
    inter = max(0.0, min(a["end"], b["end"]) - max(a["start"], b["start"]))
    if inter / min(a["end"] - a["start"], b["end"] - b["start"]) > 0.5:
        return True
    ta, tb = set(_tokens(a["transcript"])), set(_tokens(b["transcript"]))
    return len(ta & tb) / max(len(ta | tb), 1) > 0.7  # same words said twice elsewhere in the video


def find_candidates(words: list[dict], *, durations: list[float], weights: dict, max_candidates: int = 12,
                    silences: Optional[list] = None, scene_cuts: Optional[list] = None,
                    faces: Optional[list] = None) -> list[dict]:
    """Ranked, de-duplicated clip candidates for a transcript."""
    sents = build_sentences(words)
    scored = []
    for i, j, target in generate_windows(sents, durations):
        span = sents[i:j + 1]
        r = score_window(span, weights, silences=silences, scene_cuts=scene_cuts, faces=faces)
        hook = span[0]["text"].strip()
        title = re.sub(r"\s+", " ", hook).rstrip(".!?।,;: ")
        reason = "; ".join(r["reasons"]) + "".join(f". Penalty -{p['points']}: {p['why']}" for p in r["penalties"]) + "."
        scored.append({"start": round(span[0]["start"], 2), "end": round(span[-1]["end"], 2),
                       "transcript": " ".join(s["text"] for s in span), "hook": hook,
                       "title": title if len(title) <= 70 else title[:67].rsplit(" ", 1)[0] + "...",
                       "reason": reason, "score": r["score"],
                       "subscores": {**r["subscores"], "penalties": r["penalties"], "target_duration": target}})
    scored.sort(key=lambda c: (-c["score"], c["start"]))
    picked: list[dict] = []
    for c in scored:
        if not any(_similar(c, p) for p in picked):
            picked.append(c)
        if len(picked) >= max_candidates:
            break
    return picked
