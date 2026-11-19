"""Engine 2: GTA 6 SEO guides & long-form (16:9). Only verified topics or
evergreen guides; each video gets chapters in the description for SEO."""
from ..brain.queue import handler
from ..db import SessionLocal, Video
from .common import produce

FORMATS = ["guide", "tips", "secrets", "tutorial", "analysis", "comparison", "explainer"]


def add_chapters(video_id):
    with SessionLocal() as s:
        v = s.get(Video, video_id)
        lines, t = v.script.split("\n"), 0.0
        per = (v.duration or 0) / max(len(lines), 1)
        chapters = []
        for i, line in enumerate(lines):
            mm, ss = int(t // 60), int(t % 60)
            chapters.append(f"{mm}:{ss:02d} {'Intro' if i == 0 else line[:50]}")
            t += per
        v.description = v.description + "\n\nChapters:\n" + "\n".join(chapters)
        s.commit()


@handler("longform.produce")
def produce_long(p):
    # 10 beats ≈ 2-3 min with template; Claude scripts are longer per beat
    r = produce("longform", p["topic_id"], "long", p.get("beats", 10), thumb_size=(1280, 720))
    add_chapters(r["video_id"])
    return r
