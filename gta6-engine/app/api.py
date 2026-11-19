"""Mobile command center API + dashboard. Run: uvicorn app.api:app

Security model: one admin token (DASHBOARD_TOKEN, >=12 chars) sent in the `x-token` header (not a cookie, so
CSRF does not apply). Locked (503) until a strong token is set. Failed logins are rate limited per IP.
Media links are short-lived HMAC-signed URLs, so the admin token never appears in a URL."""
import hashlib
import hmac
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Header, Query, Request
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from pydantic import BaseModel, Field

from .config import settings
from .db import (init_db, SessionLocal, Job, Video, Log, Campaign, Submission, EngineState, Topic, ENGINES,
                 LIMIT_DEFAULTS, limit, set_setting, get_setting, log, redact)
from .brain import queue, planner, trends, budget
from .engines import shorts, longform, clipping  # noqa: F401  (registers handlers)
from .publish import youtube
from . import storage

app = FastAPI(title="GTA6 AI Engine", docs_url=None, redoc_url=None, openapi_url=None)
init_db()
STATIC = Path(__file__).parent / "static"
_FAILS = {}  # ip -> [timestamps of failed logins]


@app.middleware("http")
async def headers(request: Request, call_next):
    r = await call_next(request)
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["Referrer-Policy"] = "no-referrer"
    r.headers["X-Frame-Options"] = "DENY"
    r.headers["Content-Security-Policy"] = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                                            "img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'")
    return r


def _sig(*parts):
    return hmac.new(settings.dashboard_token.encode(), ":".join(map(str, parts)).encode(), hashlib.sha256).hexdigest()[:32]


def auth(token, request: Request = None):
    if not settings.token_ok():
        raise HTTPException(503, "Dashboard locked: set DASHBOARD_TOKEN (at least 12 characters)")
    ip = (request.headers.get("x-forwarded-for", "").split(",")[-1].strip() or request.client.host) if request else "-"
    recent = [t for t in _FAILS.get(ip, []) if t > time.time() - 600]
    if len(recent) >= 10:
        raise HTTPException(429, "too many failed attempts, wait 10 minutes")
    if not token or not hmac.compare_digest(token.encode(), settings.dashboard_token.encode()):
        _FAILS[ip] = recent + [time.time()]
        raise HTTPException(401, "bad token")


def media_url(vid, thumb=False):
    exp = int(time.time()) + 3600
    return f"/media/{vid}?kind={'thumb' if thumb else 'video'}&exp={exp}&sig={_sig(vid, 'thumb' if thumb else 'video', exp)}"


@app.get("/health")
def health():
    with SessionLocal() as s:
        s.query(EngineState).count()
    return {"ok": True, "locked": not settings.token_ok()}


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return (STATIC / "dashboard.html").read_text(encoding="utf-8")


def _dir_mb(path):
    return round(sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 1e6, 1) if Path(path).exists() else 0


@app.get("/api/status")
def status(request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    with SessionLocal() as s:
        vids = s.query(Video).order_by(Video.id.desc()).limit(60).all()
        jobs = s.query(Job).order_by(Job.id.desc()).limit(40).all()
        subs = {x.video_id: x for x in s.query(Submission)}
        camps = {c.id: c for c in s.query(Campaign)}
        return {
            "engines": {e.engine: e.state for e in s.query(EngineState)},
            "report": planner.daily_report(),
            "calendar": planner.upcoming(),
            "videos": [{"id": v.id, "engine": v.engine, "title": v.title, "duration": v.duration, "approval": v.approval,
                        "upload_status": v.upload_status, "youtube_id": v.youtube_id,
                        "qc": {k: v.qc.get(k) for k in ("passed", "checks")} if v.qc else {}, "stats": v.stats or {},
                        "url": media_url(v.id), "thumb": media_url(v.id, True) if v.engine != "clipping" else None,
                        "created": v.created_at.strftime("%m-%d %H:%M")} for v in vids],
            "clips": [{"id": v.id, "title": v.title, "duration": v.duration, "approval": v.approval,
                       "moment": (v.qc or {}).get("moment"), "url": media_url(v.id),
                       "submission": ({"id": subs[v.id].id, "campaign": camps[subs[v.id].campaign_id].name, "status": subs[v.id].status,
                                       "views": subs[v.id].views, "payout": subs[v.id].payout_usd, "post_url": subs[v.id].post_url}
                                      if v.id in subs else None)}
                      for v in vids if v.engine == "clipping"],
            "jobs": [{"id": j.id, "engine": j.engine, "kind": j.kind, "status": j.status, "attempts": j.attempts,
                      "error": (j.last_error or "").split("\n")[0][:160]} for j in jobs],
            "logs": [{"t": l.created_at.strftime("%m-%d %H:%M"), "level": l.level, "engine": l.engine, "msg": l.message[:200]}
                     for l in s.query(Log).order_by(Log.id.desc()).limit(40)],
            "campaigns": [{"id": c.id, "name": c.name, "rate": c.rate_per_1k, "rules_verified": c.rules_verified,
                           "payout_verified": c.payout_verified, "rights": c.content_rights_confirmed,
                           "deadline": c.deadline.strftime("%Y-%m-%d") if c.deadline else None,
                           "eligible": clipping.check_eligibility(c)["eligible"],
                           "views": sum(x.views for x in s.query(Submission).filter_by(campaign_id=c.id)),
                           "payout": round(sum(x.payout_usd for x in s.query(Submission).filter_by(campaign_id=c.id)), 2)}
                          for c in camps.values()],
            "topics": [{"id": t.id, "title": t.title, "score": t.total_score, "kind": t.kind, "verified": t.verified,
                        "status": t.status} for t in s.query(Topic).order_by(Topic.total_score.desc()).limit(15)],
            "config": settings.missing_credentials(),
            "limits": {k: limit(k) for k in LIMIT_DEFAULTS},
            "budget": {"limit": settings.daily_budget_usd, "today": budget.spent_today(), "week": budget.last_7_days()},
            "storage": {"local_mb": _dir_mb(settings.media_dir), "r2": bool(storage.BUCKET),
                        "db": "postgres" if not settings.database_url.startswith("sqlite") else "sqlite (local only)"},
            "youtube": {"configured": youtube.configured()},
            "require_approval": settings.require_approval,
        }


@app.post("/api/engine/{engine}/{action}")
def engine_action(engine: str, action: str, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    state = {"start": "running", "resume": "running", "pause": "paused", "stop": "stopped"}.get(action)
    if not state:
        raise HTTPException(400, "action must be start|pause|resume|stop")
    if engine != "all" and engine not in ENGINES:
        raise HTTPException(400, f"engine must be all or one of {ENGINES}")
    for e in (ENGINES if engine == "all" else [engine]):
        queue.set_engine_state(e, state)
    return {"engine": engine, "state": state}


@app.post("/api/job/{job_id}/retry")
def job_retry(job_id: int, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    return {"ok": queue.retry_job(job_id)}


@app.post("/api/jobs/retry-failed")
def jobs_retry_failed(request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    with SessionLocal() as s:
        ids = [j.id for j in s.query(Job).filter(Job.status == "failed")]
    return {"retried": sum(queue.retry_job(i) for i in ids)}


class PublishBody(BaseModel):
    publish_at: str | None = Field(None, max_length=40)


@app.post("/api/video/{vid}/{action}")
def video_action(vid: int, action: str, request: Request, body: PublishBody = PublishBody(), x_token: str = Header(None)):
    auth(x_token, request)
    if action not in ("approve", "reject", "publish"):
        raise HTTPException(400, "approve|reject|publish")
    with SessionLocal() as s:
        v = s.get(Video, vid)
        if not v:
            raise HTTPException(404)
        if action == "approve":
            if not (v.qc or {}).get("passed"):
                raise HTTPException(400, "cannot approve: QC failed")
            v.approval = "approved"
        elif action == "reject":
            if v.upload_status in ("uploaded", "uploading"):
                raise HTTPException(400, "already uploaded; delete it in YouTube Studio")
            v.approval = "rejected"
        s.commit()
    if action == "publish":
        try:
            at = datetime.fromisoformat(body.publish_at) if body.publish_at else None
        except ValueError:
            raise HTTPException(400, "publish_at must look like 2026-11-20T14:30 (UTC)")
        if at and at.replace(tzinfo=at.tzinfo or timezone.utc) <= datetime.now(timezone.utc):
            raise HTTPException(400, "publish_at must be in the future")
        if at and at.tzinfo:
            at = at.astimezone(timezone.utc).replace(tzinfo=None)
        try:
            return {"queued_job": youtube.queue_upload(vid, at)}
        except youtube.PublishBlocked as e:
            raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/media/{vid}")
def media(vid: int, kind: str = Query("video"), exp: int = Query(0), sig: str = Query("")):
    if not settings.token_ok() or exp < time.time() or kind not in ("video", "thumb") \
            or not hmac.compare_digest(sig, _sig(vid, kind, exp)):
        raise HTTPException(403, "link expired or invalid")
    with SessionLocal() as s:
        v = s.get(Video, vid)
        p = v and (v.thumbnail_path if kind == "thumb" else v.file_path)
    if p and not Path(p).exists() and storage.BUCKET:
        return RedirectResponse(storage.public_url(p))
    if not p or not Path(p).exists():
        raise HTTPException(404)
    return FileResponse(p)


@app.post("/api/research")
def api_research(request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    return {"new_topics": trends.research(), "planned": planner.plan_day()}


@app.post("/api/worker/run")
def api_worker(request: Request, x_token: str = Header(None), max_jobs: int = Query(1, ge=1, le=3)):
    """Inline run inside the web process. Off by default: the free web host (512 MB) is too small to render."""
    auth(x_token, request)
    if not settings.inline_worker:
        raise HTTPException(400, "inline worker is off (INLINE_WORKER=true to enable); use 'Run worker now' (GitHub Actions)")
    return {"processed": queue.drain(max_jobs)}


@app.post("/api/worker/dispatch")
def api_dispatch(request: Request, x_token: str = Header(None)):
    """'Run worker now': triggers the GitHub Actions worker (a real workflow_dispatch; fails loudly if not configured)."""
    auth(x_token, request)
    if not (settings.gh_token and settings.gh_repo):
        raise HTTPException(400, "Set GH_DISPATCH_TOKEN and GH_REPO on the dashboard host (see PHONE_SETUP_GUIDE.md)")
    r = httpx.post(f"https://api.github.com/repos/{settings.gh_repo}/actions/workflows/gta6-worker.yml/dispatches",
                   headers={"Authorization": f"Bearer {settings.gh_token}", "Accept": "application/vnd.github+json"},
                   json={"ref": "main", "inputs": {"task": "work"}}, timeout=20)
    if r.status_code != 204:
        log("error", "api", f"worker dispatch failed {r.status_code}")
        raise HTTPException(502, f"GitHub refused the dispatch (HTTP {r.status_code})")
    log("info", "api", "Worker dispatched on GitHub Actions")
    return {"dispatched": True}


class LimitsBody(BaseModel):
    max_shorts_per_day: int | None = Field(None, ge=0, le=20)
    max_longform_per_day: int | None = Field(None, ge=0, le=5)
    max_clips_per_day: int | None = Field(None, ge=0, le=50)
    max_uploads_per_day: int | None = Field(None, ge=0, le=10)


@app.post("/api/limits")
def api_limits(body: LimitsBody, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    for k, v in body.model_dump(exclude_none=True).items():
        set_setting("limit." + k, v)
    log("info", "api", f"Limits changed: {body.model_dump(exclude_none=True)}")
    return {k: limit(k) for k in LIMIT_DEFAULTS}


class CampaignBody(BaseModel):
    text: str = Field(..., min_length=10, max_length=20000)
    url: str = Field("", max_length=500)


@app.post("/api/campaign")
def api_campaign(body: CampaignBody, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    return {"campaign_id": clipping.discover_from_text(body.text, body.url)}


class VerifyBody(BaseModel):
    rules_verified: bool = False
    payout_verified: bool = False
    content_rights_confirmed: bool = False


@app.post("/api/campaign/{cid}/verify")
def api_campaign_verify(cid: int, body: VerifyBody, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    with SessionLocal() as s:
        c = s.get(Campaign, cid)
        if not c:
            raise HTTPException(404)
        c.rules_verified, c.payout_verified, c.content_rights_confirmed = body.rules_verified, body.payout_verified, body.content_rights_confirmed
        c.status = "verified" if all(body.model_dump().values()) else "unverified"
        s.commit()
        return clipping.check_eligibility(c)


class IngestBody(BaseModel):
    campaign_id: int
    filename: str = Field(..., max_length=130)
    source_channel: str = Field("", max_length=100)
    top_n: int = Field(5, ge=1, le=10)


@app.post("/api/clips/ingest")
def api_ingest(body: IngestBody, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    try:
        return {"queued_job": clipping.ingest(body.campaign_id, body.filename, body.source_channel, top_n=body.top_n)}
    except (ValueError, clipping.NotEligible) as e:
        raise HTTPException(400, str(e))


class SubmissionBody(BaseModel):
    views: int = Field(..., ge=0, le=10**10)
    post_url: str | None = Field(None, max_length=500, pattern=r"^https://")


@app.post("/api/submission/{sid}")
def api_submission(sid: int, body: SubmissionBody, request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    with SessionLocal() as s:
        if not s.get(Submission, sid):
            raise HTTPException(404)
    return {"payout_usd": clipping.record_stats(sid, body.views, body.post_url)}


# ---------- YouTube OAuth (token is stored server-side, never shown or logged) ----------
def _redirect():
    return f"{settings.public_url}/oauth/youtube/callback"


@app.get("/api/yt/auth-url")
def yt_auth_url(request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    if not (settings.yt_client_id and settings.yt_client_secret and settings.public_url.startswith("https://")):
        raise HTTPException(400, "Set YT_CLIENT_ID, YT_CLIENT_SECRET and PUBLIC_URL (https) first")
    exp = int(time.time()) + 600
    return {"url": youtube.auth_url(_redirect(), f"{exp}.{_sig('yt', exp)}"), "redirect_uri": _redirect()}


@app.get("/oauth/youtube/callback", response_class=HTMLResponse)
def yt_callback(code: str = Query(""), state: str = Query(""), error: str = Query("")):
    exp, _, sig = state.partition(".")
    if not settings.token_ok() or not exp.isdigit() or int(exp) < time.time() or not hmac.compare_digest(sig, _sig("yt", exp)):
        raise HTTPException(400, "invalid or expired state; start again from the dashboard")
    if error or not code:
        return HTMLResponse("<h3>YouTube connect cancelled.</h3>")
    try:
        youtube.exchange_code(code, _redirect())
    except Exception as e:
        log("error", "publish", f"OAuth exchange failed: {e}")
        raise HTTPException(502, "Google rejected the code; try again")
    return HTMLResponse("<h3>YouTube connected. You can close this tab.</h3>")


@app.post("/api/yt/test")
def yt_test(request: Request, x_token: str = Header(None)):
    auth(x_token, request)
    try:
        return youtube.integration_test()
    except youtube.PublishBlocked as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, redact(e))
