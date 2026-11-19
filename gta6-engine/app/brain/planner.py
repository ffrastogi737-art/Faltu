"""Content calendar + orchestration + daily report.

Anti-spam rule built in: max N shorts + 1 long-form per day, and never two
pieces on the same topic. Rumors can only go to Shorts, clearly labelled."""
from datetime import date, timedelta

from ..db import SessionLocal, Topic, CalendarSlot, Job, Video, Log, limit
from .budget import spent_today
from .queue import enqueue


def plan_day(day=None):
    """Pick today's topics by score. Limits come from the dashboard (db.limit), so they can be changed from the phone."""
    day = (day or date.today()).isoformat()
    n_short, n_long = limit("max_shorts_per_day"), limit("max_longform_per_day")
    created = []
    with SessionLocal() as s:
        if s.query(CalendarSlot).filter_by(date=day).count():
            return created
        pool = s.query(Topic).filter(Topic.status == "new").order_by(Topic.total_score.desc()).all()
        # long-form only from verified topics (guides / confirmed news); rumors may only go to Shorts
        longs = [t for t in pool if t.verified][:n_long]
        shorts = [t for t in pool if t not in longs][:n_short]
        for eng, t in [("shorts", t) for t in shorts] + [("longform", t) for t in longs]:
            s.add(CalendarSlot(date=day, engine=eng, topic_id=t.id))
            t.status = "scheduled"
            created.append((eng, t.id))
        s.commit()
    for eng, tid in created:
        enqueue(eng, f"{eng}.produce", {"topic_id": tid, "preset": "short30"} if eng == "shorts" else {"topic_id": tid})
    return created


def upcoming(days=7):
    start = date.today().isoformat()
    end = (date.today() + timedelta(days=days)).isoformat()
    with SessionLocal() as s:
        rows = s.query(CalendarSlot, Topic).join(Topic, Topic.id == CalendarSlot.topic_id) \
            .filter(CalendarSlot.date >= start, CalendarSlot.date <= end).order_by(CalendarSlot.date).all()
        return [{"date": c.date, "engine": c.engine, "topic": t.title, "score": t.total_score, "status": c.status} for c, t in rows]


def daily_report():
    with SessionLocal() as s:
        jobs = {st: s.query(Job).filter_by(status=st).count() for st in ("queued", "running", "done", "failed")}
        vids = s.query(Video).all()
        errors = [l.message[:200] for l in s.query(Log).filter_by(level="error").order_by(Log.id.desc()).limit(5)]
        return {
            "date": date.today().isoformat(),
            "jobs": jobs,
            "videos_total": len(vids),
            "awaiting_approval": sum(1 for v in vids if v.approval == "pending"),
            "uploaded": sum(1 for v in vids if v.upload_status == "uploaded"),
            "views": sum((v.stats or {}).get("views", 0) for v in vids),
            "revenue_usd": round(sum((v.stats or {}).get("revenue", 0) for v in vids), 2),
            "spend_today_usd": spent_today(),
            "recent_errors": errors,
            "top_topics": [{"title": t.title, "score": t.total_score, "verified": t.verified}
                           for t in s.query(Topic).filter_by(status="new").order_by(Topic.total_score.desc()).limit(5)],
        }
