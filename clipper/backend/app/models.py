"""All database tables. Large media stays on disk; rows hold paths relative to storage."""
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, ForeignKey, Index, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # stored as naive UTC


class Base(DeclarativeBase):
    def to_dict(self) -> dict[str, Any]:
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class TS:
    created_at: Mapped[datetime] = mapped_column(default=now)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)


def fk(target: str, **kw) -> Mapped[int]:
    return mapped_column(ForeignKey(target, ondelete="CASCADE"), index=True, **kw)


def fk_null(target: str) -> Mapped[Optional[int]]:
    return mapped_column(ForeignKey(target, ondelete="SET NULL"), index=True, nullable=True)


class Project(Base, TS):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    videos: Mapped[list["SourceVideo"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class SourceVideo(Base, TS):
    __tablename__ = "source_videos"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = fk("projects.id")
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    size_bytes: Mapped[int]
    duration: Mapped[float]
    width: Mapped[int]
    height: Mapped[int]
    fps: Mapped[float]
    video_codec: Mapped[str] = mapped_column(String(40))
    audio_codec: Mapped[Optional[str]] = mapped_column(String(40))
    audio_streams: Mapped[int] = mapped_column(default=0)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000))
    audio_path: Mapped[Optional[str]] = mapped_column(String(500))
    scene_cuts: Mapped[Optional[list]] = mapped_column(JSON)
    silences: Mapped[Optional[list]] = mapped_column(JSON)
    faces: Mapped[Optional[list]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="imported", index=True)


class Transcript(Base, TS):
    __tablename__ = "transcripts"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_video_id: Mapped[int] = fk("source_videos.id", unique=True)
    language: Mapped[str] = mapped_column(String(10), default="")
    model: Mapped[str] = mapped_column(String(60), default="")
    origin: Mapped[str] = mapped_column(String(20), default="whisper")  # whisper | import
    segments: Mapped[list["TranscriptSegment"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="TranscriptSegment.idx")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    id: Mapped[int] = mapped_column(primary_key=True)
    transcript_id: Mapped[int] = fk("transcripts.id")
    idx: Mapped[int]
    start: Mapped[float]
    end: Mapped[float]
    text: Mapped[str] = mapped_column(Text)
    words: Mapped[list] = mapped_column(JSON, default=list)  # [{text,start,end}]
    __table_args__ = (Index("ix_segments_transcript_idx", "transcript_id", "idx"),)


class AnalysisJob(Base):
    """The persistent job queue. Every background task is a row here."""
    __tablename__ = "analysis_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    source_video_id: Mapped[Optional[int]] = mapped_column(ForeignKey("source_videos.id", ondelete="CASCADE"))
    clip_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clips.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    progress: Mapped[float] = mapped_column(default=0.0)
    stage: Mapped[str] = mapped_column(String(200), default="Queued")
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[Optional[str]] = mapped_column(Text)
    log: Mapped[str] = mapped_column(Text, default="")
    cancel_requested: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=now)
    started_at: Mapped[Optional[datetime]]
    finished_at: Mapped[Optional[datetime]]


class ClipCandidate(Base, TS):
    __tablename__ = "clip_candidates"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = fk("projects.id")
    source_video_id: Mapped[int] = fk("source_videos.id")
    start: Mapped[float]
    end: Mapped[float]
    transcript: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(200))
    hook: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(index=True)
    subscores: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)  # new|accepted|rejected


class Clip(Base, TS):
    __tablename__ = "clips"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = fk("projects.id")
    source_video_id: Mapped[int] = fk("source_videos.id")
    candidate_id: Mapped[Optional[int]] = fk_null("clip_candidates.id")
    campaign_id: Mapped[Optional[int]] = fk_null("campaigns.id")
    title: Mapped[str] = mapped_column(String(200))
    start: Mapped[float]
    end: Mapped[float]
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)  # draft|rendering|rendered|failed
    output_path: Mapped[Optional[str]] = mapped_column(String(500))


class SubtitleTrack(Base, TS):
    __tablename__ = "subtitle_tracks"
    id: Mapped[int] = mapped_column(primary_key=True)
    clip_id: Mapped[int] = fk("clips.id", unique=True)
    language: Mapped[str] = mapped_column(String(10), default="")
    words: Mapped[list] = mapped_column(JSON, default=list)  # source-video time: [{text,start,end}]


class RenderJob(Base):
    """Render-specific detail for an analysis_jobs row of type video_render."""
    __tablename__ = "render_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = fk("analysis_jobs.id", unique=True)
    clip_id: Mapped[int] = fk("clips.id")
    preset_id: Mapped[Optional[int]] = fk_null("render_presets.id")
    settings: Mapped[dict] = mapped_column(JSON, default=dict)  # snapshot used for this render
    output_path: Mapped[Optional[str]] = mapped_column(String(500))
    log_path: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(default=now)


class RenderPreset(Base, TS):
    __tablename__ = "render_presets"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    short_side: Mapped[int] = mapped_column(default=1080)  # 9:16 -> 1080x1920
    fps: Mapped[Optional[int]]  # None keeps the source frame rate
    crf: Mapped[int] = mapped_column(default=20)
    x264_preset: Mapped[str] = mapped_column(String(20), default="medium")
    audio_kbps: Mapped[int] = mapped_column(default=160)
    builtin: Mapped[bool] = mapped_column(default=False)


class Campaign(Base, TS):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    brand: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    source_reference: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(1000), default="")
    allowed_platforms: Mapped[list] = mapped_column(JSON, default=list)
    min_duration: Mapped[Optional[float]]
    max_duration: Mapped[Optional[float]]
    deadline: Mapped[Optional[datetime]]
    payment_model: Mapped[str] = mapped_column(String(20), default="per_1000_views")  # per_1000_views|flat_per_clip|none
    rate_per_1000: Mapped[float] = mapped_column(default=0.0)
    flat_rate: Mapped[float] = mapped_column(default=0.0)
    max_payout: Mapped[Optional[float]]
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active|paused|ended
    rules: Mapped[list["CampaignRule"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class CampaignRule(Base):
    __tablename__ = "campaign_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = fk("campaigns.id")
    kind: Mapped[str] = mapped_column(String(20))  # hashtag|caption|branding|rule
    value: Mapped[str] = mapped_column(Text)


class CampaignSubmission(Base, TS):
    __tablename__ = "campaign_submissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = fk("campaigns.id")
    clip_id: Mapped[Optional[int]] = fk_null("clips.id")
    platform: Mapped[str] = mapped_column(String(40), index=True)
    post_url: Mapped[str] = mapped_column(String(1000), default="")
    caption: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|submitted|approved|rejected
    submitted_at: Mapped[Optional[datetime]]
    manual_checks: Mapped[dict] = mapped_column(JSON, default=dict)  # rule id -> confirmed by user
    notes: Mapped[str] = mapped_column(Text, default="")


class PlatformMetric(Base):
    """A view count the user recorded. kind says whether the campaign verified it."""
    __tablename__ = "platform_metrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = fk("campaign_submissions.id")
    recorded_at: Mapped[datetime] = mapped_column(default=now)
    views: Mapped[int]
    kind: Mapped[str] = mapped_column(String(20), default="self_reported")  # self_reported|verified
    note: Mapped[str] = mapped_column(Text, default="")


class Earning(Base):
    """A payment actually received, entered by the user."""
    __tablename__ = "earnings"
    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = fk("campaigns.id")
    submission_id: Mapped[Optional[int]] = fk_null("campaign_submissions.id")
    amount: Mapped[float]
    received_at: Mapped[datetime] = mapped_column(default=now)
    note: Mapped[str] = mapped_column(Text, default="")


class ApplicationSetting(Base):
    __tablename__ = "application_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
