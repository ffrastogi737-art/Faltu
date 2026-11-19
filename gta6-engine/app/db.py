"""Persistent memory: SQLite locally, Postgres (Supabase) in the cloud via DATABASE_URL."""
import re
from datetime import datetime, timezone
from sqlalchemy import (create_engine, Column, Integer, String, Float, Text, DateTime,
                        Boolean, JSON, ForeignKey)
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


Base = declarative_base()


class Topic(Base):
    __tablename__ = "topics"
    id = Column(Integer, primary_key=True)
    title = Column(String(300), nullable=False)
    fingerprint = Column(String(64), unique=True, index=True)
    source = Column(String(100))
    source_urls = Column(JSON, default=list)
    signals = Column(JSON, default=dict)      # raw inputs for scoring
    scores = Column(JSON, default=dict)       # per-factor scores
    total_score = Column(Float, default=0)
    verified = Column(Boolean, default=False)
    verification_note = Column(Text, default="")
    kind = Column(String(20), default="news")  # news | guide | rumor
    status = Column(String(20), default="new")  # new | scheduled | used | rejected
    created_at = Column(DateTime, default=now)


class CalendarSlot(Base):
    __tablename__ = "calendar"
    id = Column(Integer, primary_key=True)
    date = Column(String(10), index=True)
    engine = Column(String(20))
    topic_id = Column(Integer, ForeignKey("topics.id"))
    status = Column(String(20), default="planned")


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True)
    engine = Column(String(20), index=True)   # shorts | longform | clipping | publish
    kind = Column(String(40))
    payload = Column(JSON, default=dict)
    status = Column(String(20), default="queued", index=True)
    # queued | running | done | failed | paused | stopped
    attempts = Column(Integer, default=0)
    last_error = Column(Text, default="")
    result = Column(JSON, default=dict)
    run_after = Column(DateTime, default=now)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


class Video(Base):
    __tablename__ = "videos"
    id = Column(Integer, primary_key=True)
    engine = Column(String(20))
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True)
    title = Column(String(200))
    description = Column(Text)
    tags = Column(JSON, default=list)
    script = Column(Text)
    file_path = Column(String(500))
    thumbnail_path = Column(String(500))
    duration = Column(Float)
    content_hash = Column(String(64), index=True)
    qc = Column(JSON, default=dict)
    approval = Column(String(20), default="pending")  # pending | approved | rejected
    upload_status = Column(String(20), default="not_queued")
    # not_queued | queued | uploading | uploaded | failed
    youtube_id = Column(String(40))
    uploaded_at = Column(DateTime, nullable=True)
    publish_at = Column(DateTime, nullable=True)
    playlist_id = Column(String(64))
    stats = Column(JSON, default=dict)  # views, ctr, retention, revenue (from Analytics API)
    created_at = Column(DateTime, default=now)


class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(Integer, primary_key=True)
    name = Column(String(200))
    platform = Column(String(50))
    url = Column(String(500))
    rate_per_1k = Column(Float, default=0)
    rules = Column(Text, default="")
    content_rights_confirmed = Column(Boolean, default=False)
    rules_verified = Column(Boolean, default=False)
    payout_verified = Column(Boolean, default=False)
    deadline = Column(DateTime, nullable=True)
    min_views = Column(Integer, default=0)
    allowed_sources = Column(JSON, default=list)
    status = Column(String(20), default="unverified")
    created_at = Column(DateTime, default=now)


class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"))
    video_id = Column(Integer, ForeignKey("videos.id"))
    post_url = Column(String(500))
    views = Column(Integer, default=0)
    payout_usd = Column(Float, default=0)
    status = Column(String(20), default="draft")
    created_at = Column(DateTime, default=now)


class Spend(Base):
    __tablename__ = "spend"
    id = Column(Integer, primary_key=True)
    service = Column(String(50))
    usd = Column(Float)
    note = Column(String(200))
    created_at = Column(DateTime, default=now)


class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True)
    level = Column(String(10))
    engine = Column(String(20))
    message = Column(Text)
    created_at = Column(DateTime, default=now)


class Setting(Base):
    """Runtime-editable limits (dashboard) and OAuth tokens. Values are never returned by the API."""
    __tablename__ = "settings"
    key = Column(String(60), primary_key=True)
    value = Column(Text)


class EngineState(Base):
    __tablename__ = "engine_state"
    engine = Column(String(20), primary_key=True)
    state = Column(String(20), default="running")  # running | paused | stopped


ENGINES = ["shorts", "longform", "clipping", "publish"]

_kw = {"connect_args": {"check_same_thread": False}} if settings.database_url.startswith("sqlite") else {"pool_pre_ping": True}
engine = create_engine(settings.database_url, **_kw)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db():
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        for e in ENGINES:
            if not s.get(EngineState, e):
                s.add(EngineState(engine=e, state="running"))
        s.commit()


_SECRET = re.compile(r"(?i)((?:key|token|secret|code|password|refresh_token|access_token)=|bearer\s+)[^&\s'\"]+")


def redact(text):
    """Strip API keys / tokens from anything that is logged or stored (httpx errors embed full URLs)."""
    return _SECRET.sub(lambda m: m.group(1) + "***", str(text))


def log(level, engine_name, message):
    with SessionLocal() as s:
        s.add(Log(level=level, engine=engine_name, message=redact(message)[:4000]))
        s.commit()


LIMIT_DEFAULTS = {"max_shorts_per_day": 3, "max_longform_per_day": 1, "max_clips_per_day": 10, "max_uploads_per_day": 3}


def get_setting(key, default=None):
    with SessionLocal() as s:
        r = s.get(Setting, key)
        return r.value if r else default


def set_setting(key, value):
    with SessionLocal() as s:
        s.merge(Setting(key=key, value=str(value)))
        s.commit()


def limit(key):
    """Daily limit: dashboard value (DB) > env default > built-in default."""
    base = settings.max_uploads_per_day if key == "max_uploads_per_day" else LIMIT_DEFAULTS[key]
    try:
        return int(get_setting("limit." + key, base))
    except ValueError:
        return base
