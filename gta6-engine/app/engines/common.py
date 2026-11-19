"""Shared produce pipeline: topic -> script -> voice/visuals/captions -> QC ->
duplicate check -> metadata -> Video row awaiting approval."""
from ..brain.queue import NoRetry
from ..config import settings
from ..db import SessionLocal, Topic, Video, log
from .. import llm, render, storage


class DuplicateContent(NoRetry):
    pass


def produce(engine, topic_id, preset, n_beats, thumb_size=(1280, 720)):
    with SessionLocal() as s:
        t = s.get(Topic, topic_id)
        if not t:
            raise ValueError(f"Topic {topic_id} not found")
        if t.kind == "rumor" and engine == "longform":
            raise ValueError("Unverified topics are not allowed in long-form")
        topic = dict(title=t.title, verified=t.verified, note=t.verification_note, urls=t.source_urls or [])
    kind = "shorts" if engine == "shorts" else "longform"
    script = llm.write_script(topic["title"], kind, topic["verified"], topic["note"], n_beats)
    h = render.script_hash(script)
    with SessionLocal() as s:
        if s.query(Video).filter(Video.content_hash == h).first() or \
           s.query(Video).filter(Video.topic_id == topic_id, Video.engine == engine).first():
            raise DuplicateContent(f"Duplicate content for topic {topic_id}")
    out_dir = settings.media_dir / engine / f"topic{topic_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    res = render.render_video(script, preset, out_dir / "final.mp4", out_dir / "work")
    qc = render.quality_check(res["path"], "short_any" if preset.startswith("short") else preset)
    qc["frame_hash"] = render.frame_hash(res["path"])
    thumb = render.thumbnail(script["title"], out_dir / "thumb.jpg", w=thumb_size[0], h=thumb_size[1])
    desc = script["description"]
    if topic["urls"]:
        desc += "\n\nSources:\n" + "\n".join(topic["urls"][:5])
    if engine == "shorts":
        desc += "\n#Shorts"
    storage.push(res["path"])
    storage.push(thumb)
    with SessionLocal() as s:
        v = Video(engine=engine, topic_id=topic_id, title=script["title"][:100], description=desc[:4900],
                  tags=script["tags"][:15], script="\n".join([script["hook"], *script["beats"], script["cta"]]),
                  file_path=res["path"], thumbnail_path=thumb, duration=res["duration"], content_hash=h, qc=qc,
                  approval="pending" if qc["passed"] else "rejected")
        s.add(v)
        tt = s.get(Topic, topic_id)
        tt.status = "used"
        s.commit()
        vid = v.id
    log("info", engine, f"Video {vid} rendered ({res['duration']:.1f}s) QC={'PASS' if qc['passed'] else 'FAIL'} script={script.get('provider')}")
    return {"video_id": vid, "qc_passed": qc["passed"]}
