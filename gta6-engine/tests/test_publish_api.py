import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal, Video, now
from app.publish import youtube


def _video(tmp_path, approval="pending", passed=True, h="abc"):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"0" * 1000)
    with SessionLocal() as s:
        v = Video(engine="shorts", title="T", description="D", tags=["a"], file_path=str(f), content_hash=h,
                  qc={"passed": passed}, approval=approval)
        s.add(v)
        s.commit()
        return v.id


def test_publish_requires_approval_and_creds(tmp_path):
    vid = _video(tmp_path)
    with pytest.raises(youtube.PublishBlocked, match="not approved"):
        youtube.queue_upload(vid)
    with SessionLocal() as s:
        s.get(Video, vid).approval = "approved"
        s.commit()
    youtube.queue_upload(vid)  # queues fine
    with pytest.raises(youtube.PublishBlocked, match="credentials"):
        youtube.upload_video({"video_id": vid})
    with SessionLocal() as s:
        assert s.get(Video, vid).upload_status == "failed"


def test_upload_flow_mocked(tmp_path, monkeypatch):
    """Exercises request sequence against a fake Google API. NOT a real integration test."""
    for k in ("yt_client_id", "yt_client_secret", "yt_refresh_token"):
        monkeypatch.setattr(settings, k, "x")
    vid = _video(tmp_path, approval="approved")
    seen = []

    def fake(req):
        seen.append((req.method, req.url.path))
        if "token" in req.url.path:
            return httpx.Response(200, json={"access_token": "A"})
        if req.method == "POST" and "/upload/youtube/v3/videos" in req.url.path:
            return httpx.Response(200, headers={"Location": "https://upload.example/session"})
        if req.method == "PUT":
            return httpx.Response(200, json={"id": "YT123"})
        return httpx.Response(200, json={})
    c = httpx.Client(transport=httpx.MockTransport(fake))
    assert youtube.upload_video({"video_id": vid}, client=c)["youtube_id"] == "YT123"
    assert ("PUT", "/session") in seen
    # duplicate content never uploaded twice
    vid2 = _video(tmp_path, approval="approved")
    with pytest.raises(youtube.PublishBlocked, match="Duplicate"):
        youtube.upload_video({"video_id": vid2}, client=c)


def test_daily_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "max_uploads_per_day", 1)
    with SessionLocal() as s:
        s.add(Video(engine="shorts", title="x", upload_status="uploaded", uploaded_at=now(), qc={"passed": True}, approval="approved"))
        s.commit()
    vid = _video(tmp_path, approval="approved", h="zzz")
    with pytest.raises(youtube.PublishBlocked, match="cap"):
        youtube.queue_upload(vid)


def test_api_auth_controls_and_approval(tmp_path):
    from app.api import app
    c = TestClient(app)
    assert c.get("/health").json() == {"ok": True, "locked": False}
    assert c.get("/api/status").status_code == 401
    assert c.get("/docs").status_code == 404 and c.get("/openapi.json").status_code == 404
    H = {"x-token": "test-token-0123456789"}
    st = c.get("/api/status", headers=H).json()
    assert set(st["engines"]) == {"shorts", "longform", "clipping", "publish"}
    assert any(not x["set"] for x in st["config"])
    assert st["limits"] == {"max_shorts_per_day": 3, "max_longform_per_day": 1, "max_clips_per_day": 10, "max_uploads_per_day": 3}
    assert c.post("/api/engine/shorts/pause", headers=H).json()["state"] == "paused"
    assert c.post("/api/engine/hax/pause", headers=H).status_code == 400
    assert c.post("/api/engine/all/stop", headers=H).status_code == 200
    assert set(c.get("/api/status", headers=H).json()["engines"].values()) == {"stopped"}
    assert c.post("/api/engine/all/start", headers=H).status_code == 200
    bad = _video(tmp_path, passed=False, h="q1")
    assert c.post(f"/api/video/{bad}/approve", headers=H).status_code == 400
    good = _video(tmp_path, h="q2")
    assert c.post(f"/api/video/{good}/approve", headers=H).json() == {"ok": True}
    assert c.post(f"/api/video/{good}/publish", headers=H, json={"publish_at": "garbage"}).status_code == 400
    assert c.post(f"/api/video/{good}/publish", headers=H, json={"publish_at": "2020-01-01T00:00"}).status_code == 400
    assert c.post(f"/api/video/{good}/publish", headers=H, json={}).status_code == 200
    vids = {v["id"]: v for v in c.get("/api/status", headers=H).json()["videos"]}
    assert c.get(vids[good]["url"]).status_code == 200  # signed link works
    assert c.get(f"/media/{good}?token=test-token-0123456789").status_code == 403  # raw token is not a credential
    assert c.get(vids[good]["url"].replace("sig=", "sig=0")).status_code == 403
    assert c.post("/api/limits", headers=H, json={"max_shorts_per_day": 2}).json()["max_shorts_per_day"] == 2
    assert c.post("/api/limits", headers=H, json={"max_shorts_per_day": 999}).status_code == 422
    r = c.post("/api/campaign", headers=H, json={"text": "Camp\n$2 per 1k views"}).json()
    assert c.post(f"/api/campaign/{r['campaign_id']}/verify", headers=H, json={"rules_verified": True}).json()["eligible"] is False
    assert c.post("/api/campaign/999/verify", headers=H, json={}).status_code == 404
    # clip ingest: unverified campaign refused; traversal / url names refused
    assert c.post("/api/clips/ingest", headers=H, json={"campaign_id": r["campaign_id"], "filename": "a.mp4"}).status_code == 400
    assert c.post("/api/clips/ingest", headers=H, json={"campaign_id": r["campaign_id"], "filename": "../../etc/passwd.mp4"}).status_code == 400
    assert c.post("/api/worker/run", headers=H).status_code == 400  # inline rendering off by default
    assert c.post("/api/worker/dispatch", headers=H).status_code == 400  # not configured -> honest error, no fake success
    assert "GTA6 Engine" in c.get("/").text


def test_login_rate_limit_and_locked_without_token(monkeypatch):
    from app import api
    c = TestClient(api.app)
    api._FAILS.clear()
    for _ in range(10):
        assert c.get("/api/status", headers={"x-token": "wrong"}).status_code == 401
    assert c.get("/api/status", headers={"x-token": "wrong"}).status_code == 429
    api._FAILS.clear()
    monkeypatch.setattr(settings, "dashboard_token", "change-me")  # weak/default token -> locked, never open
    assert c.get("/api/status", headers={"x-token": "change-me"}).status_code == 503


def test_oauth_callback_stores_token_and_rejects_bad_state(monkeypatch):
    from app import api
    from app.db import get_setting
    c = TestClient(api.app)
    for k, v in (("yt_client_id", "cid"), ("yt_client_secret", "sec"), ("public_url", "https://dash.example")):
        monkeypatch.setattr(settings, k, v)
    H = {"x-token": "test-token-0123456789"}
    url = c.get("/api/yt/auth-url", headers=H).json()["url"]
    state = url.split("state=")[1].split("&")[0].replace("%2E", ".")
    assert c.get("/oauth/youtube/callback?code=abc&state=bad.state").status_code == 400
    real = httpx.Client  # mocked Google token endpoint (NOT a real Google call)
    monkeypatch.setattr(youtube.httpx, "Client", lambda **k: real(transport=httpx.MockTransport(
        lambda req: httpx.Response(200, json={"refresh_token": "R-TOKEN-1", "access_token": "a"}))))
    assert c.get(f"/oauth/youtube/callback?code=abc&state={state}").status_code == 200
    assert get_setting("yt_refresh_token") == "R-TOKEN-1" and youtube.configured()
    assert "R-TOKEN-1" not in c.get("/api/status", headers=H).text  # never returned by the API


def test_storage_key_is_machine_independent():
    from app.storage import key_for
    assert key_for("/home/runner/x/data/media/shorts/topic3/final.mp4") == "shorts/topic3/final.mp4"
    assert key_for("/app/media/clipping/c1_s/clip1.mp4") == "clipping/c1_s/clip1.mp4"
