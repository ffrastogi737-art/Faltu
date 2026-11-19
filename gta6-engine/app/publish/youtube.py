"""YouTube Data API v3 publishing (resumable upload, thumbnail, schedule, playlist)
+ YouTube Analytics stats pull.

STATUS: code complete, NOT yet integration-tested — needs YT_CLIENT_ID,
YT_CLIENT_SECRET, YT_REFRESH_TOKEN. Run `python -m app.cli yt-test` once they're set.

Safety gates (enforced in queue_upload + upload_video):
 - approval must be 'approved' while REQUIRE_APPROVAL=true
 - QC must have passed
 - same content_hash never uploaded twice
 - MAX_UPLOADS_PER_DAY cap (anti-spam)
"""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import httpx

from ..config import settings
from ..brain.queue import handler, enqueue, NoRetry
from ..db import SessionLocal, Video, log, get_setting, set_setting, limit
from .. import storage

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
API = "https://www.googleapis.com/youtube/v3"
SCOPES = ("https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube "
          "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly")


class PublishBlocked(NoRetry):
    pass


def refresh_token():
    """Env var wins; otherwise the token stored by the dashboard OAuth flow (never printed to logs)."""
    return settings.yt_refresh_token or get_setting("yt_refresh_token")


def configured():
    return all([settings.yt_client_id, settings.yt_client_secret, refresh_token()])


def auth_url(redirect_uri, state=""):
    """Google consent URL. The dashboard callback exchanges the code and stores the refresh token."""
    from urllib.parse import urlencode
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": settings.yt_client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": SCOPES, "access_type": "offline", "prompt": "consent", "state": state})


def exchange_code(code, redirect_uri, client=None):
    c = client or httpx.Client(timeout=30)
    r = c.post(TOKEN_URL, data={"code": code, "client_id": settings.yt_client_id, "client_secret": settings.yt_client_secret,
                                "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
    r.raise_for_status()
    rt = r.json().get("refresh_token")
    if not rt:
        raise RuntimeError("Google returned no refresh_token (revoke the app at myaccount.google.com/permissions and retry)")
    set_setting("yt_refresh_token", rt)
    log("info", "publish", "YouTube refresh token stored")
    return {"stored": True}


def access_token(client=None):
    if not configured():
        raise PublishBlocked("YouTube credentials missing (YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN)")
    c = client or httpx.Client(timeout=30)
    r = c.post(TOKEN_URL, data={"client_id": settings.yt_client_id, "client_secret": settings.yt_client_secret,
                                "refresh_token": refresh_token(), "grant_type": "refresh_token"})
    r.raise_for_status()
    return r.json()["access_token"]


def gate(v, s):
    if settings.require_approval and v.approval != "approved":
        raise PublishBlocked(f"Video {v.id} not approved")
    if v.approval == "rejected":
        raise PublishBlocked(f"Video {v.id} rejected")
    if not (v.qc or {}).get("passed"):
        raise PublishBlocked(f"Video {v.id} failed QC")
    dup = s.query(Video).filter(Video.content_hash == v.content_hash, Video.id != v.id,
                                Video.upload_status == "uploaded").first() if v.content_hash else None
    if dup:
        raise PublishBlocked(f"Duplicate of already-uploaded video {dup.id}")
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
    count = s.query(Video).filter(Video.upload_status.in_(["uploaded", "uploading"]), Video.id != v.id,
                                  Video.uploaded_at >= since).count()
    if count >= limit("max_uploads_per_day"):
        raise PublishBlocked(f"Daily upload cap {limit('max_uploads_per_day')} reached")


def queue_upload(video_id, publish_at=None, playlist_id=None):
    with SessionLocal() as s:
        v = s.get(Video, video_id)
        gate(v, s)
        v.upload_status, v.publish_at, v.playlist_id = "queued", publish_at, playlist_id
        s.commit()
    return enqueue("publish", "publish.upload", {"video_id": video_id})


@handler("publish.upload")
def upload_video(p, client=None):
    c = client or httpx.Client(timeout=600)
    with SessionLocal() as s:
        v = s.get(Video, p["video_id"])
        gate(v, s)
        if v.youtube_id:
            return {"youtube_id": v.youtube_id, "skipped": "already uploaded"}
        v.upload_status = "uploading"
        s.commit()
        meta = {
            "snippet": {"title": v.title[:100], "description": v.description[:5000], "tags": v.tags or [], "categoryId": "20"},
            "status": {"privacyStatus": "private" if v.publish_at else "public", "selfDeclaredMadeForKids": False,
                       "containsSyntheticMedia": True},
        }
        if v.publish_at:
            meta["status"]["publishAt"] = v.publish_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        path, thumb, playlist = Path(storage.ensure_local(v.file_path)), storage.ensure_local(v.thumbnail_path), v.playlist_id
    try:
        tok = access_token(c)
        h = {"Authorization": f"Bearer {tok}"}
        init = c.post(UPLOAD_URL, params={"uploadType": "resumable", "part": "snippet,status"},
                      headers={**h, "Content-Type": "application/json; charset=UTF-8",
                               "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(path.stat().st_size)},
                      content=json.dumps(meta))
        init.raise_for_status()
        up = c.put(init.headers["Location"], headers={**h, "Content-Type": "video/mp4"}, content=path.read_bytes())
        up.raise_for_status()
        yt_id = up.json()["id"]
    except Exception:
        with SessionLocal() as s:
            s.get(Video, p["video_id"]).upload_status = "failed"
            s.commit()
        raise  # queue retries with backoff
    # Record the id BEFORE thumbnail/playlist: a failure there must never cause a re-upload (duplicate).
    with SessionLocal() as s:
        v = s.get(Video, p["video_id"])
        v.youtube_id, v.upload_status, v.uploaded_at = yt_id, "uploaded", datetime.now(timezone.utc).replace(tzinfo=None)
        s.commit()
    extras = {}
    try:
        if thumb and Path(thumb).exists():
            r = c.post("https://www.googleapis.com/upload/youtube/v3/thumbnails/set", params={"videoId": yt_id},
                       headers={**h, "Content-Type": "image/jpeg"}, content=Path(thumb).read_bytes())
            extras["thumbnail"] = r.status_code
        if playlist:
            r = c.post(f"{API}/playlistItems", params={"part": "snippet"}, headers=h,
                       json={"snippet": {"playlistId": playlist, "resourceId": {"kind": "youtube#video", "videoId": yt_id}}})
            extras["playlist"] = r.status_code
    except Exception as e:
        log("warn", "publish", f"Video {yt_id} uploaded, but thumbnail/playlist step failed: {e}")
    bad = {k: v for k, v in extras.items() if v >= 300}
    if bad:
        log("warn", "publish", f"Video {yt_id} uploaded; extras rejected by YouTube: {bad}")
    log("info", "publish", f"Uploaded video {p['video_id']} -> {yt_id}")
    return {"youtube_id": yt_id, "extras": extras}


@handler("publish.stats")
def pull_stats(p=None, client=None):
    """Views/retention (+ CTR, revenue where the channel/scope allows) from YouTube Analytics.
    Each metric group is its own query: one unsupported metric must not zero out the rest."""
    c = client or httpx.Client(timeout=60)
    h = {"Authorization": f"Bearer {access_token(c)}"}
    end = datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%d")
    groups = {("views", "averageViewPercentage"): ("views", "retention"),
              ("estimatedRevenue",): ("revenue",),
              ("videoThumbnailImpressionsClickRate",): ("ctr",)}
    n = 0
    with SessionLocal() as s:
        for v in s.query(Video).filter(Video.youtube_id.isnot(None)).all():
            st = dict(v.stats or {})
            for metrics, names in groups.items():
                r = c.get("https://youtubeanalytics.googleapis.com/v2/reports", headers=h, params={
                    "ids": "channel==MINE", "startDate": "2020-01-01", "endDate": end,
                    "metrics": ",".join(metrics), "filters": f"video=={v.youtube_id}"})
                if r.status_code == 200:
                    row = (r.json().get("rows") or [[0] * len(names)])[0]
                    st.update(dict(zip(names, row)))
                else:
                    st.setdefault("unavailable", [])
                    st["unavailable"] = sorted(set(st["unavailable"]) | set(names))
            v.stats, n = st, n + 1
        s.commit()
    return {"updated": n}


def integration_test():
    """Real check: refresh token works + channel readable. Upload test is separate & manual."""
    c = httpx.Client(timeout=30)
    tok = access_token(c)
    r = c.get(f"{API}/channels", params={"part": "snippet", "mine": "true"}, headers={"Authorization": f"Bearer {tok}"})
    r.raise_for_status()
    items = r.json().get("items", [])
    return {"ok": bool(items), "channel": items[0]["snippet"]["title"] if items else None}
