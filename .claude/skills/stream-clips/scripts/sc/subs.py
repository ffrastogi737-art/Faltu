"""Word-by-word captions as an ASS subtitle file (burned in by ffmpeg/libass).

Words are shown a few at a time; the word being spoken is coloured and slightly larger.
A phrase stays on screen through short breaths so captions never flicker."""

STYLE = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, \
Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, \
Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,{font},{size},{fill},{fill},&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,\
{outline},2,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

BREATH = 1.0      # gaps shorter than this keep the phrase up


def _colour(hex6):
    h = hex6.lstrip("#")
    return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def _t(sec):
    sec = max(0.0, sec)
    cs = int(round(sec * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def _clean(word):
    return word.replace("{", "").replace("}", "").replace("\\", "").strip()


def phrases(words, size):
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1]["s"] - w["e"] if i + 1 < len(words) else 9
        punct = w["w"].endswith((".", "!", "?")) or (w["w"].endswith(",") and len(cur) >= 2)
        if len(cur) >= size or nxt > 0.6 or (punct and (len(cur) >= 2 or nxt > 0.25)):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def write(words, length, path, cfg):
    """`words` are in clip time (0 = first frame). Writes `path`, returns it."""
    fill, active = _colour(cfg["cap_color"]), _colour(cfg["cap_active"])
    x, y = cfg["width"] // 2, int(cfg["height"] * cfg["cap_y"])
    rows = [STYLE.format(w=cfg["width"], h=cfg["height"], font=cfg["cap_font"],
                         size=cfg["cap_size"], fill=fill, outline=cfg["cap_outline"])]
    words = [w for w in words if w["e"] > 0 and w["s"] < length and _clean(w["w"])]
    groups = phrases(words, cfg["cap_words"])
    for gi, group in enumerate(groups):
        texts = [_clean(w["w"]) for w in group]
        if cfg["cap_upper"]:
            texts = [t.upper() for t in texts]
        hard_stop = groups[gi + 1][0]["s"] if gi + 1 < len(groups) else length
        for wi, w in enumerate(group):
            start = max(0.0, w["s"])
            if wi + 1 < len(group):
                end = group[wi + 1]["s"]
            elif hard_stop - w["e"] < BREATH:
                end = hard_stop
            else:
                end = w["e"] + 0.35
            end = min(max(end, start + 0.06), length)
            parts = []
            for j, text in enumerate(texts):
                if j == wi:
                    parts.append(f"{{\\c{active}&\\fscx110\\fscy110}}{text}{{\\c{fill}&\\fscx100\\fscy100}}")
                else:
                    parts.append(text)
            rows.append(f"Dialogue: 0,{_t(start)},{_t(end)},Word,,0,0,0,,"
                        f"{{\\pos({x},{y})}}" + " ".join(parts))
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return path
