"""Caption templates, word grouping and ASS subtitle generation."""
import re
from typing import Callable, Optional

# Sizes are for a 1080-wide frame and scale with the output width. Colours are #RRGGBB.
TEMPLATES: dict[str, dict] = {
    "bold_impact": {  # Hormozi-style: heavy uppercase, three words, coloured active word
        "label": "Bold Impact", "font": "Inter", "size": 92, "bold": True, "uppercase": True, "words_per_line": 3,
        "primary": "#FFFFFF", "highlight": "#FFE600", "outline_color": "#000000", "outline": 7, "shadow": 3,
        "pos_y": 0.68, "active_scale": 110, "pop": True, "box": False},
    "dynamic_pop": {  # high-energy: one or two big words that pop in
        "label": "Dynamic Pop", "font": "Inter", "size": 118, "bold": True, "uppercase": True, "words_per_line": 2,
        "primary": "#FFFFFF", "highlight": "#39FF88", "outline_color": "#101010", "outline": 9, "shadow": 4,
        "pos_y": 0.6, "active_scale": 118, "pop": True, "box": False},
    "minimal_white": {
        "label": "Minimal White", "font": "Inter", "size": 60, "bold": False, "uppercase": False, "words_per_line": 5,
        "primary": "#FFFFFF", "highlight": "#FFFFFF", "outline_color": "#000000", "outline": 3, "shadow": 1,
        "pos_y": 0.8, "active_scale": 100, "pop": False, "box": False},
    "yellow_highlight": {
        "label": "Yellow Highlight", "font": "Inter", "size": 76, "bold": True, "uppercase": False, "words_per_line": 4,
        "primary": "#FFFFFF", "highlight": "#FFD400", "outline_color": "#000000", "outline": 5, "shadow": 2,
        "pos_y": 0.72, "active_scale": 100, "pop": False, "box": False},
    "podcast": {  # longer lines on a translucent bar, low on the frame
        "label": "Podcast", "font": "Inter", "size": 54, "bold": True, "uppercase": False, "words_per_line": 7,
        "primary": "#FFFFFF", "highlight": "#8AB4FF", "outline_color": "#000000", "outline": 14, "shadow": 0,
        "pos_y": 0.84, "active_scale": 100, "pop": False, "box": True},
    "educational": {
        "label": "Educational", "font": "Inter", "size": 66, "bold": True, "uppercase": False, "words_per_line": 5,
        "primary": "#F5F7FA", "highlight": "#22D3EE", "outline_color": "#0B1220", "outline": 5, "shadow": 2,
        "pos_y": 0.76, "active_scale": 104, "pop": False, "box": False},
}
STYLE_KEYS = set(TEMPLATES["bold_impact"]) - {"label"}


def resolve_style(template: str, overrides: Optional[dict] = None) -> dict:
    style = dict(TEMPLATES.get(template) or TEMPLATES["bold_impact"])
    style.update({k: v for k, v in (overrides or {}).items() if k in STYLE_KEYS and v is not None})
    return style


def words_from_segments(segments: list[dict]) -> list[dict]:
    """Flatten transcript segments to words. Segments without word timing get evenly spread words
    (weighted by word length) - the sentence-level fallback."""
    out: list[dict] = []
    for seg in segments:
        if seg.get("words"):
            out += [{"text": w["text"].strip(), "start": w["start"], "end": w["end"]} for w in seg["words"] if w["text"].strip()]
            continue
        tokens = seg["text"].split()
        total = sum(len(t) + 1 for t in tokens) or 1
        t, span = seg["start"], seg["end"] - seg["start"]
        for tok in tokens:
            d = span * (len(tok) + 1) / total
            out.append({"text": tok, "start": round(t, 3), "end": round(t + d, 3)})
            t += d
    return out


def build_cues(words: list[dict], style: dict, clip_start: float, clip_end: float,
               remap: Optional[Callable[[float], Optional[float]]] = None) -> list[dict]:
    """Group words into on-screen lines. Returns [{start, end, words:[{text,start,end}]}] in clip time.

    remap converts clip time to output time when silence was cut out; it returns None for removed moments."""
    remap = remap or (lambda t: t)
    timed = []
    for w in words:
        if w["end"] <= clip_start or w["start"] >= clip_end or not str(w["text"]).strip():
            continue
        s = remap(max(0.0, w["start"] - clip_start))
        e = remap(min(clip_end, w["end"]) - clip_start)
        if s is None and e is None:
            continue
        s = s if s is not None else e
        e = e if e is not None and e > s else s + 0.05
        text = str(w["text"]).strip()
        timed.append({"text": text.upper() if style["uppercase"] else text, "start": s, "end": e})
    timed.sort(key=lambda w: w["start"])
    cues: list[dict] = []
    group: list[dict] = []
    per_line = max(1, int(style["words_per_line"]))
    for i, w in enumerate(timed):
        group.append(w)
        nxt = timed[i + 1] if i + 1 < len(timed) else None
        sentence_end = re.search(r"[.!?।]$", w["text"]) is not None
        if nxt is None or len(group) >= per_line or sentence_end or nxt["start"] - w["end"] > 0.8:
            cues.append({"start": group[0]["start"], "end": group[-1]["end"], "words": group})
            group = []
    for i, cue in enumerate(cues):  # words stay lit until the next word; lines never overlap the next line
        limit = cues[i + 1]["start"] if i + 1 < len(cues) else cue["end"] + 0.4
        cue["end"] = min(max(cue["end"], cue["words"][-1]["start"] + 0.05) + 0.25, limit)
        for j, w in enumerate(cue["words"]):
            w["end"] = cue["words"][j + 1]["start"] if j + 1 < len(cue["words"]) else cue["end"]
    return [c for c in cues if c["end"] > c["start"]]


def _ass_color(hex_color: str, alpha: int = 0) -> str:
    h = hex_color.lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        h = "FFFFFF"
    return f"&H{alpha:02X}{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def _ass_time(t: float) -> str:
    cs = max(0, round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def _esc(text: str) -> str:
    # braces start ASS override blocks and backslash starts a tag: neutralise both
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_ass(cues: list[dict], style: dict, width: int, height: int) -> str:
    k = width / 1080
    font = re.sub(r"[,\n\r]", " ", str(style["font"]))
    box = style["box"]
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},{round(float(style['size']) * k)},{_ass_color(style['primary'])},{_ass_color(style['primary'])},{_ass_color(style['outline_color'], 0x60 if box else 0)},{_ass_color(style['outline_color'], 0x60 if box else 0x40)},{-1 if style['bold'] else 0},0,0,0,100,100,0,0,{3 if box else 1},{round(float(style['outline']) * k, 1)},{round(float(style['shadow']) * k, 1)},5,{round(70 * k)},{round(70 * k)},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    x, y = width // 2, round(height * min(0.97, max(0.03, float(style["pos_y"]))))
    hl, scale = _ass_color(style["highlight"]), int(style["active_scale"])
    lines = []
    for cue in cues:
        for i, active in enumerate(cue["words"]):
            parts = []
            for j, w in enumerate(cue["words"]):
                txt = _esc(w["text"])
                parts.append(f"{{\\c{hl}\\fscx{scale}\\fscy{scale}}}{txt}{{\\r}}" if j == i and (hl or scale != 100) else txt)
            pop = "\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)" if style["pop"] and i == 0 else ""
            lines.append(f"Dialogue: 0,{_ass_time(active['start'])},{_ass_time(active['end'])},Cap,,0,0,0,,"
                         f"{{\\an5\\pos({x},{y}){pop}}}{' '.join(parts)}")
    return header + "\n".join(lines) + "\n"


def parse_transcript_file(name: str, text: str) -> list[dict]:
    """SRT or WebVTT -> [{start, end, text}]. Lets a user bring an existing transcript instead of running Whisper."""
    segs = []
    pat = re.compile(r"(\d+):(\d\d):(\d\d)[.,](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[.,](\d{1,3})[^\n]*\n(.*?)(?=\n\s*\n|\Z)", re.S)
    for m in pat.finditer(text.replace("\r\n", "\n")):
        g = m.groups()
        t0 = int(g[0]) * 3600 + int(g[1]) * 60 + int(g[2]) + int(g[3].ljust(3, "0")) / 1000
        t1 = int(g[4]) * 3600 + int(g[5]) * 60 + int(g[6]) + int(g[7].ljust(3, "0")) / 1000
        body = re.sub(r"<[^>]+>", "", g[8]).replace("\n", " ").strip()
        if body and t1 > t0:
            segs.append({"start": t0, "end": t1, "text": body})
    if not segs:
        raise ValueError(f"No timed captions found in {name}. Supported formats: .srt and .vtt")
    return segs
