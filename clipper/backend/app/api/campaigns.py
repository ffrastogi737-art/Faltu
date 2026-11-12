from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..campaigns.checklist import run_checklist
from ..database.db import get_db
from ..earnings import calc
from .deps import apply, get_or_404

router = APIRouter(prefix="/api")


class RuleIn(BaseModel):
    kind: Literal["hashtag", "caption", "branding", "rule"]
    value: str = Field(min_length=1, max_length=1000)


class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str = ""
    description: str = ""
    source_reference: str = ""
    url: str = Field("", max_length=1000)
    allowed_platforms: list[str] = []
    min_duration: Optional[float] = Field(None, ge=0)
    max_duration: Optional[float] = Field(None, gt=0)
    deadline: Optional[datetime] = None
    payment_model: Literal["per_1000_views", "flat_per_clip", "none"] = "per_1000_views"
    rate_per_1000: float = Field(0, ge=0)
    flat_rate: float = Field(0, ge=0)
    max_payout: Optional[float] = Field(None, ge=0)
    currency: str = Field("USD", max_length=8)
    notes: str = ""
    status: Literal["active", "paused", "ended"] = "active"
    rules: list[RuleIn] = []


def campaign_dict(c: m.Campaign) -> dict:
    return {**c.to_dict(), "rules": [r.to_dict() for r in c.rules]}


def _save(db: Session, c: m.Campaign, body: CampaignIn) -> dict:
    if body.min_duration is not None and body.max_duration is not None and body.min_duration > body.max_duration:
        raise HTTPException(400, "Minimum duration is longer than maximum duration")
    data = body.model_dump(exclude={"rules"})
    if data["deadline"] and data["deadline"].tzinfo:  # store naive UTC like every other timestamp
        data["deadline"] = data["deadline"].astimezone(timezone.utc).replace(tzinfo=None)
    for k, v in data.items():
        setattr(c, k, v)
    # keep ids of unchanged rules so manual confirmations on submissions stay attached
    old = {(r.kind, r.value): r for r in c.rules}
    c.rules = [old.get((r.kind, r.value)) or m.CampaignRule(kind=r.kind, value=r.value) for r in body.rules]
    db.add(c)
    db.commit()
    return campaign_dict(c)


@router.get("/campaigns")
def list_campaigns(db: Session = Depends(get_db)):
    return [campaign_dict(c) for c in db.scalars(select(m.Campaign).order_by(m.Campaign.created_at.desc()))]


@router.post("/campaigns", status_code=201)
def create_campaign(body: CampaignIn, db: Session = Depends(get_db)):
    return _save(db, m.Campaign(), body)


@router.put("/campaigns/{cid}")
def update_campaign(cid: int, body: CampaignIn, db: Session = Depends(get_db)):
    return _save(db, get_or_404(db, m.Campaign, cid), body)


@router.delete("/campaigns/{cid}", status_code=204)
def delete_campaign(cid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Campaign, cid))
    db.commit()


# ---- submissions and view counts --------------------------------------------------------------

class SubmissionIn(BaseModel):
    campaign_id: int
    clip_id: Optional[int] = None
    platform: str = Field(min_length=1, max_length=40)
    post_url: str = Field("", max_length=1000)
    caption: str = ""
    status: Literal["pending", "submitted", "approved", "rejected"] = "pending"
    notes: str = ""
    manual_checks: dict[str, bool] = {}


def submission_dict(db: Session, s: m.CampaignSubmission) -> dict:
    campaign = db.get(m.Campaign, s.campaign_id)
    clip = db.get(m.Clip, s.clip_id) if s.clip_id else None
    metrics = [x.to_dict() for x in db.scalars(select(m.PlatformMetric).where(m.PlatformMetric.submission_id == s.id)
                                               .order_by(m.PlatformMetric.recorded_at))]
    checklist = run_checklist(campaign.to_dict(), [r.to_dict() for r in campaign.rules],
                              clip_duration=clip.end - clip.start if clip else None, platform=s.platform,
                              caption=s.caption, manual_checks=s.manual_checks)
    return {**s.to_dict(), "clip_title": clip.title if clip else None, "campaign_name": campaign.name,
            "currency": campaign.currency, "metrics": metrics, "checklist": checklist,
            **calc.submission_estimate(campaign.to_dict(), metrics)}


@router.get("/submissions")
def list_submissions(campaign_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = select(m.CampaignSubmission).order_by(m.CampaignSubmission.created_at.desc())
    if campaign_id is not None:
        q = q.where(m.CampaignSubmission.campaign_id == campaign_id)
    return [submission_dict(db, s) for s in db.scalars(q)]


def _save_submission(db: Session, s: m.CampaignSubmission, body: SubmissionIn) -> dict:
    get_or_404(db, m.Campaign, body.campaign_id)
    if body.clip_id is not None:
        get_or_404(db, m.Clip, body.clip_id)
    was = s.status
    apply(s, body)
    if s.status != "pending" and (was in (None, "pending")) and not s.submitted_at:
        s.submitted_at = m.now()
    db.add(s)
    db.commit()
    return submission_dict(db, s)


@router.post("/submissions", status_code=201)
def create_submission(body: SubmissionIn, db: Session = Depends(get_db)):
    return _save_submission(db, m.CampaignSubmission(), body)


@router.put("/submissions/{sid}")
def update_submission(sid: int, body: SubmissionIn, db: Session = Depends(get_db)):
    return _save_submission(db, get_or_404(db, m.CampaignSubmission, sid), body)


@router.delete("/submissions/{sid}", status_code=204)
def delete_submission(sid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.CampaignSubmission, sid))
    db.commit()


class MetricIn(BaseModel):
    views: int = Field(ge=0)
    kind: Literal["self_reported", "verified"] = "self_reported"
    recorded_at: Optional[datetime] = None
    note: str = ""


@router.post("/submissions/{sid}/metrics", status_code=201)
def add_metric(sid: int, body: MetricIn, db: Session = Depends(get_db)):
    s = get_or_404(db, m.CampaignSubmission, sid)
    db.add(m.PlatformMetric(submission_id=sid, views=body.views, kind=body.kind, note=body.note,
                            recorded_at=(body.recorded_at or m.now()).replace(tzinfo=None)))
    db.commit()
    return submission_dict(db, s)


@router.delete("/metrics/{mid}", status_code=204)
def delete_metric(mid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.PlatformMetric, mid))
    db.commit()


@router.get("/campaigns/{cid}/checklist")
def checklist_for_clip(cid: int, clip_id: int, platform: Optional[str] = None, caption: str = "", db: Session = Depends(get_db)):
    """Preview the checklist for a clip before a submission exists."""
    c, clip = get_or_404(db, m.Campaign, cid), get_or_404(db, m.Clip, clip_id)
    return run_checklist(c.to_dict(), [r.to_dict() for r in c.rules], clip_duration=clip.end - clip.start,
                         platform=platform, caption=caption)


# ---- earnings ---------------------------------------------------------------------------------

class PaymentIn(BaseModel):
    campaign_id: int
    submission_id: Optional[int] = None
    amount: float = Field(gt=0)
    received_at: Optional[datetime] = None
    note: str = ""


def _add_payment(db: Session, data: dict) -> m.Earning:
    get_or_404(db, m.Campaign, data["campaign_id"])
    if data.get("submission_id") is not None:
        sub = get_or_404(db, m.CampaignSubmission, data["submission_id"])
        if sub.campaign_id != data["campaign_id"]:
            raise HTTPException(400, f"Submission {sub.id} belongs to a different campaign")
    data["received_at"] = (data.get("received_at") or m.now()).replace(tzinfo=None)
    e = m.Earning(**data)
    db.add(e)
    return e


@router.post("/payments", status_code=201)
def add_payment(body: PaymentIn, db: Session = Depends(get_db)):
    e = _add_payment(db, body.model_dump())
    db.commit()
    return e.to_dict()


@router.delete("/payments/{pid}", status_code=204)
def delete_payment(pid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Earning, pid))
    db.commit()


def earnings_summary(db: Session) -> dict:
    campaigns = {c.id: c for c in db.scalars(select(m.Campaign))}
    subs = [submission_dict(db, s) for s in db.scalars(select(m.CampaignSubmission))]
    payments = [p.to_dict() for p in db.scalars(select(m.Earning).order_by(m.Earning.received_at.desc()))]
    sub_platform = {s["id"]: s["platform"] for s in subs}

    def bucket() -> dict:
        return {"submissions": 0, "pending": 0, "submitted": 0, "approved": 0, "rejected": 0,
                "self_reported_views": 0, "verified_views": 0, "estimated": 0.0, "received": 0.0}

    by_campaign = {cid: {"campaign_id": cid, "name": c.name, "currency": c.currency, **bucket()} for cid, c in campaigns.items()}
    by_platform: dict[str, dict] = {}
    for s in subs:
        for b in (by_campaign[s["campaign_id"]], by_platform.setdefault(s["platform"], {"platform": s["platform"], **bucket()})):
            b["submissions"] += 1
            b[s["status"]] += 1
            b["self_reported_views"] += s["self_reported_views"]
            b["verified_views"] += s["verified_views"]
            if s["status"] != "rejected":  # a rejected clip is not expected to pay
                b["estimated"] = round(b["estimated"] + s["estimated"], 2)
    for p in payments:
        p["campaign_name"] = campaigns[p["campaign_id"]].name
        p["currency"] = campaigns[p["campaign_id"]].currency
        by_campaign[p["campaign_id"]]["received"] = round(by_campaign[p["campaign_id"]]["received"] + p["amount"], 2)
        plat = sub_platform.get(p["submission_id"], "Not linked to a submission")
        b = by_platform.setdefault(plat, {"platform": plat, **bucket()})
        b["received"] = round(b["received"] + p["amount"], 2)
    # shortcut: totals add amounts across campaigns without currency conversion; split per currency if you mix currencies
    totals = bucket()
    for b in by_campaign.values():
        for k in totals:
            totals[k] = round(totals[k] + b[k], 2)
    return {"totals": totals, "by_campaign": list(by_campaign.values()), "by_platform": list(by_platform.values()),
            "payments": payments}


@router.get("/earnings")
def get_earnings(db: Session = Depends(get_db)):
    return earnings_summary(db)


@router.post("/earnings/import")
def import_csv(kind: Literal["metrics", "payments"], file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = file.file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "CSV file is larger than 5 MB")
    rows, errors = calc.parse_csv(kind, raw.decode("utf-8-sig", errors="replace"))
    added = 0
    for n, row in enumerate(rows):
        try:
            if kind == "metrics":
                get_or_404(db, m.CampaignSubmission, row["submission_id"])
                row["recorded_at"] = row["recorded_at"] or m.now()
                db.add(m.PlatformMetric(**row))
            else:
                _add_payment(db, row)
            added += 1
        except HTTPException as e:
            errors.append(f"Row {n + 1}: {e.detail}")
    db.commit()
    return {"imported": added, "errors": errors}
