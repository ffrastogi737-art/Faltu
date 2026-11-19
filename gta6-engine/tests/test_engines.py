import json
import subprocess

import httpx
import pytest

from app import llm, render
from app.config import settings
from app.db import SessionLocal, Topic, Video, Campaign, Submission
from app.engines import common, shorts, longform, clipping  # noqa: F401
from app.brain import queue


def _topic(title="GTA 6 map size compared", kind="guide", verified=True):
    with SessionLocal() as s:
        t = Topic(title=title, fingerprint=title, kind=kind, verified=verified, verification_note="test", source_urls=[])
        s.add(t)
        s.commit()
        return t.id


def test_template_labels_rumors():
    out = llm.write_script("GTA 6 leak", "shorts", verified=False)
    assert out["title"].startswith("UNCONFIRMED") and "GTA 6 rumor" in out["tags"]


def test_claude_path_with_budget(monkeypatch):
    body = {"title": "Map", "hook": "h", "beats": ["a"], "cta": "c", "description": "d", "tags": ["x"]}

    def fake(req):
        return httpx.Response(200, json={"content": [{"text": json.dumps(body)}], "usage": {"input_tokens": 1000, "output_tokens": 500}})
    monkeypatch.setattr(settings, "anthropic_api_key", "k")
    monkeypatch.setattr(settings, "daily_budget_usd", 1.0)
    out = llm.write_script("t", "shorts", verified=False, client=httpx.Client(transport=httpx.MockTransport(fake)))
    assert out["provider"] == "claude" and out["title"].startswith("UNCONFIRMED")
    # budget = 0 -> never calls API
    monkeypatch.setattr(settings, "daily_budget_usd", 0)
    assert llm.write_script("t", "shorts")["provider"] == "template"


def test_short_render_qc_and_duplicate():
    tid = _topic()
    r = queue.HANDLERS["shorts.produce"]({"topic_id": tid, "preset": "short30"})
    with SessionLocal() as s:
        v = s.get(Video, r["video_id"])
        assert v.qc["checks"]["resolution"] and v.qc["checks"]["has_audio"]
        assert v.qc["passed"], v.qc
        assert v.approval == "pending" and "#Shorts" in v.description
    with pytest.raises(common.DuplicateContent):
        queue.HANDLERS["shorts.produce"]({"topic_id": tid, "preset": "short30"})


def test_longform_rejects_rumor():
    tid = _topic("GTA 6 leak", kind="rumor", verified=False)
    with pytest.raises(ValueError):
        queue.HANDLERS["longform.produce"]({"topic_id": tid})


def test_longform_too_thin_fails_qc():
    """Offline template is too short for long-form -> QC fails -> auto-rejected (no low-value uploads)."""
    tid = _topic("GTA 6 vs GTA 5 differences")
    r = queue.HANDLERS["longform.produce"]({"topic_id": tid})
    with SessionLocal() as s:
        v = s.get(Video, r["video_id"])
        assert not v.qc["passed"] and v.approval == "rejected" and "Chapters:" in v.description


def test_frame_hash_similarity(tmp_path):
    a = tmp_path / "a.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:d=3", "-pix_fmt", "yuv420p", str(a)], check=True)
    h = render.frame_hash(a)
    assert render.hamming(h, render.frame_hash(a)) == 0


# ---------- clipping ----------
@pytest.fixture
def stream(tmp_path):
    """60s fake stream: quiet tone, with a loud burst + visual change at 40s."""
    p = settings.media_dir / "sources" / "stream.mp4"
    p.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=s=1280x720:d=60:r=30",
                    "-f", "lavfi", "-i", "sine=f=220:d=60",
                    "-filter_complex", "[1:a]volume='if(between(t,40,44),1.0,0.02)':eval=frame[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-shortest", str(p)], check=True)
    return p


def test_moment_detection_finds_spike(stream):
    loud = clipping.loudness_curve(stream)
    assert 55 <= len(loud) <= 61
    m = clipping.detect_moments(loud, [], [], clip_len=15, top_n=2)
    assert m[0]["start"] <= 40 < m[0]["end"]


def test_campaign_gate_and_processing(stream):
    cid = clipping.discover_from_text("GTA RP Clip Campaign\nEarn $1.50 per 1K views. Minimum 10k views. Ends 2099-01-01", "https://whop.com/x")
    with SessionLocal() as s:
        c = s.get(Campaign, cid)
        assert c.rate_per_1k == 1.5 and c.min_views == 10000 and c.status == "unverified"
    with pytest.raises(clipping.NotEligible):
        queue.HANDLERS["clipping.process"]({"campaign_id": cid, "source_path": str(stream)})
    with SessionLocal() as s:
        c = s.get(Campaign, cid)
        c.rules_verified = c.payout_verified = c.content_rights_confirmed = True
        s.commit()
    r = queue.HANDLERS["clipping.process"]({"campaign_id": cid, "source_path": str(stream), "top_n": 1, "clip_len": 15})
    with SessionLocal() as s:
        v = s.get(Video, r["video_ids"][0])
        assert v.qc["checks"]["resolution"] and v.qc["passed"]
        sub = s.query(Submission).one()
    assert clipping.record_stats(sub.id, 5000) == 0  # under min views
    assert clipping.record_stats(sub.id, 20000, "https://youtube.com/shorts/x") == 30.0


def test_free_llm_provider_capped_and_rumor_labelled(monkeypatch):
    """Mocked OpenAI-compatible endpoint (NOT a real provider call)."""
    import json as _j
    body = {"title": "Map leak", "hook": "h", "beats": ["b"], "cta": "c", "description": "d", "tags": ["GTA 6"]}
    calls = []
    def fake(req):
        calls.append(req.url.path)
        return httpx.Response(200, json={"choices": [{"message": {"content": _j.dumps(body)}}]})
    c = httpx.Client(transport=httpx.MockTransport(fake))
    for k, v in (("llm_base_url", "https://llm.example/v1"), ("llm_model", "m"), ("llm_max_calls_per_day", 1)):
        monkeypatch.setattr(settings, k, v)
    out = llm.write_script("Map leak", "shorts", verified=False, client=c)
    assert out["provider"] == "free-llm" and out["title"].startswith("UNCONFIRMED")
    assert calls == ["/v1/chat/completions"]
    assert llm.write_script("Map leak", "shorts", client=c)["provider"] == "template"  # daily cap hit -> offline template
    assert len(calls) == 1
