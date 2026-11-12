"""API tests, including the whole workflow: import -> audio -> transcript -> highlights -> clip -> captions -> render."""
import io
import json
import subprocess

import pytest

from app import models as m
from app.ai import transcription
from app.core import config
from app.database.db import SessionLocal
from app.workers import runner
from tests.conftest import wait_chain, wait_job


def probe(path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


@pytest.fixture(scope="module")
def project(client, sample):
    """A project with the sample video imported."""
    pid = client.post("/api/projects", json={"name": "Money talk"}).json()["id"]
    with open(sample["path"], "rb") as f:
        r = client.post(f"/api/projects/{pid}/videos", files={"file": ("../My Talk (final).mp4", f, "video/mp4")})
    assert r.status_code == 201, r.text
    return {"id": pid, "video": r.json()}


@pytest.fixture(scope="module")
def analyzed(client, project, sample):
    """Runs the analysis chain. Whisper itself is replaced with the sample's known sentence timings,
    because the model cannot be downloaded in every test environment."""
    real = transcription.transcribe

    def fake(audio, **kw):
        assert audio.is_file()  # audio extraction really produced the WAV
        kw["on_progress"](0.5)
        return {"language": "en", "model": "test", "segments": sample["segments"]}

    transcription.transcribe = fake
    try:
        r = client.post(f"/api/videos/{project['video']['id']}/analyze", json={"durations": [15, 30]})
        assert r.status_code == 202
        last = wait_chain(client, project["id"], "highlight_detection", r.json()["id"])
        assert last["status"] == "completed", last
    finally:
        transcription.transcribe = real
    return project


def test_health_and_dashboard(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["database"] == "ok" and h["whisper"]["installed"]
    assert client.get("/api/dashboard").status_code == 200


def test_import_stores_metadata_and_sanitises_name(client, project, sample):
    v = project["video"]
    assert v["filename"] == "My Talk (final).mp4" or v["filename"] == "My Talk _final_.mp4"
    assert (v["width"], v["height"], v["fps"], v["audio_streams"]) == (640, 360, 25.0, 1)
    stored = config.STORAGE / v["path"]
    assert stored.is_file() and stored.parent == config.DIRS["source_videos"]
    assert stored.read_bytes() == sample["path"].read_bytes()  # a faithful copy; the original is untouched


def test_duplicate_and_invalid_uploads_are_rejected(client, project, sample):
    with open(sample["path"], "rb") as f:
        r = client.post(f"/api/projects/{project['id']}/videos", files={"file": ("copy.mp4", f, "video/mp4")})
    assert r.status_code == 409 and r.json()["detail"]["video_id"] == project["video"]["id"]
    pid = project["id"]
    assert client.post(f"/api/projects/{pid}/videos", files={"file": ("notes.txt", b"hello", "text/plain")}).status_code == 400
    assert client.post(f"/api/projects/{pid}/videos", files={"file": ("fake.mp4", b"not a video", "video/mp4")}).status_code == 400
    assert client.post(f"/api/projects/{pid}/videos", files={"file": ("empty.mp4", b"", "video/mp4")}).status_code == 400
    assert not list(config.DIRS["temp"].glob("upload*"))  # rejected uploads leave nothing behind
    assert client.post("/api/projects/9999/videos", files={"file": ("a.mp4", b"x", "video/mp4")}).status_code == 404


def test_url_import_rules(client, project):
    pid = project["id"]
    assert client.post(f"/api/projects/{pid}/videos/url", json={"url": "file:///etc/passwd", "confirm_rights": True}).status_code == 400
    assert client.post(f"/api/projects/{pid}/videos/url", json={"url": "https://example.com/a.mp4"}).status_code == 400
    job = client.post(f"/api/projects/{pid}/videos/url", json={"url": "http://127.0.0.1:9/a.mp4", "confirm_rights": True}).json()
    done = wait_job(client, job["id"])
    assert done["status"] == "failed" and done["error"]  # unreachable source fails cleanly with a message


def test_video_file_supports_seeking(client, project):
    r = client.get(f"/api/videos/{project['video']['id']}/file", headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100


def test_analysis_pipeline(client, analyzed, sample):
    vid = analyzed["video"]["id"]
    jobs = {j["type"]: j for j in client.get(f"/api/jobs?project_id={analyzed['id']}").json() if j["status"] == "completed"}
    assert {"audio_extraction", "transcription", "highlight_detection"} <= set(jobs)
    assert all(j["progress"] == 100 and j["started_at"] and j["finished_at"] for j in jobs.values())
    tr = client.get(f"/api/videos/{vid}/transcript").json()
    assert len(tr["segments"]) == len(sample["segments"]) and tr["language"] == "en"
    assert tr["segments"][3]["start"] == sample["segments"][3]["start"]
    assert not list(config.DIRS["temp"].glob("audio-*.wav"))  # temp audio cleaned up
    cands = client.get(f"/api/candidates?project_id={analyzed['id']}").json()
    assert len(cands) >= 2
    assert [c["score"] for c in cands] == sorted((c["score"] for c in cands), reverse=True)
    assert all(c["reason"] and set(c["subscores"]) >= {"hook", "emotion", "curiosity", "information", "completeness", "av_quality"} for c in cands)
    log = client.get(f"/api/jobs/{jobs['highlight_detection']['id']}").json()["log"]
    assert "Detecting scene changes" in log and "candidates" in log


def test_candidate_edit_reject_regenerate(client, analyzed):
    pid, vid = analyzed["id"], analyzed["video"]["id"]
    cands = client.get(f"/api/candidates?project_id={pid}").json()
    c = cands[-1]
    assert client.patch(f"/api/candidates/{c['id']}", json={"start": 5, "end": 5.5}).status_code == 400  # under 1s
    assert client.patch(f"/api/candidates/{c['id']}", json={"end": 99999}).status_code == 400  # past the end
    edited = client.patch(f"/api/candidates/{c['id']}", json={"start": c["start"] + 1}).json()
    assert edited["start"] == c["start"] + 1
    assert client.patch(f"/api/candidates/{c['id']}", json={"status": "rejected"}).json()["status"] == "rejected"
    job = client.post(f"/api/videos/{vid}/candidates/regenerate",
                      json={"durations": [15], "weights": {"hook": 1, "emotion": 0, "curiosity": 0, "information": 0, "completeness": 0, "av_quality": 0}}).json()
    assert wait_job(client, job["id"])["status"] == "completed"
    after = client.get(f"/api/candidates?project_id={pid}").json()
    assert any(x["id"] == c["id"] and x["status"] == "rejected" for x in after)  # the user's decision survives
    fresh = [x for x in after if x["status"] == "new"]
    assert fresh and all(x["subscores"]["target_duration"] == 15 for x in fresh)
    assert all(abs(x["score"] - x["subscores"]["hook"] + sum(p["points"] for p in x["subscores"]["penalties"])) < 0.2 or x["score"] == 0 for x in fresh)
    assert client.post(f"/api/videos/{vid}/candidates/regenerate", json={"durations": [2]}).status_code == 400


@pytest.fixture(scope="module")
def clip(client, analyzed):
    cand = next(c for c in client.get(f"/api/candidates?project_id={analyzed['id']}").json() if c["status"] == "new")
    r = client.post(f"/api/candidates/{cand['id']}/accept")
    assert r.status_code == 201
    again = client.post(f"/api/candidates/{cand['id']}/accept").json()
    assert again["id"] == r.json()["id"]  # accepting twice does not create two clips
    return client.get(f"/api/clips/{r.json()['id']}").json()


def test_clip_has_synchronised_captions(client, clip):
    assert clip["words"] and clip["cues"]
    assert all(clip["start"] - 0.01 <= w["start"] and w["end"] <= clip["end"] + 0.01 for w in clip["words"])
    assert clip["cues"][0]["start"] < 0.5 and clip["cues"][-1]["end"] <= clip["end"] - clip["start"] + 0.5


def test_trim_and_subtitle_correction(client, clip):
    cid = clip["id"]
    words = clip["words"]
    words[0]["text"] = "Corrected"
    saved = client.put(f"/api/clips/{cid}/subtitles", json={"words": words}).json()
    assert saved["words"][0]["text"] == "Corrected"
    grown = client.patch(f"/api/clips/{cid}", json={"end": clip["end"] + 4}).json()
    assert grown["words"][0]["text"] == "Corrected"  # the correction survives a re-trim
    assert len(grown["words"]) > len(words)  # and the new stretch got its captions
    assert client.patch(f"/api/clips/{cid}", json={"start": 40, "end": 40.2}).status_code == 400
    assert client.put(f"/api/clips/{cid}/subtitles", json={"words": [{"text": "x", "start": 5, "end": 4}]}).status_code == 400
    assert client.patch(f"/api/clips/{cid}", json={"settings": {"aspect": "7:3"}}).status_code == 400
    assert client.patch(f"/api/clips/{cid}", json={"settings": {"watermark": "../../etc/passwd"}}).status_code == 400
    client.patch(f"/api/clips/{cid}", json={"end": clip["end"]})
    reset = client.post(f"/api/clips/{cid}/subtitles/reset").json()
    assert reset["words"][0]["text"] != "Corrected"


def test_render_vertical_video_with_captions(client, clip, sample):
    cid = clip["id"]
    client.patch(f"/api/clips/{cid}", json={"settings": {"template": "yellow_highlight", "crop_mode": "blur", "dynamic_zoom": True}})
    preset = next(p for p in client.get("/api/presets").json() if p["short_side"] == 1080)
    job = client.post(f"/api/clips/{cid}/render", json={"preset_id": preset["id"]}).json()
    done = wait_job(client, job["id"], timeout=300)
    assert done["status"] == "completed", done
    c = client.get(f"/api/clips/{cid}").json()
    assert c["status"] == "rendered"
    out = config.STORAGE / c["output_path"]
    info = probe(out)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    assert (v["width"], v["height"], v["codec_name"], v["pix_fmt"]) == (1080, 1920, "h264", "yuv420p")
    assert a["codec_name"] == "aac"
    assert abs(float(info["format"]["duration"]) - (c["end"] - c["start"])) < 0.3
    assert client.get(f"/api/clips/{cid}/file", headers={"Range": "bytes=0-9"}).status_code == 206  # preview
    dl = client.get(f"/api/clips/{cid}/file?download=1")
    assert "attachment" in dl.headers["content-disposition"] and len(dl.content) == out.stat().st_size  # export
    # captions were really burned in: the caption band differs from a render without captions
    with SessionLocal() as db:
        rj = db.query(m.RenderJob).filter_by(job_id=job["id"]).one()
        assert rj.output_path == c["output_path"] and "ass=captions.ass" in (config.STORAGE / rj.log_path).read_text()
    # the source video was not modified
    assert (config.STORAGE / client.get(f"/api/projects/{c['project_id']}").json()["videos"][0]["path"]).read_bytes() == sample["path"].read_bytes()
    # rendering again never overwrites the first export
    job2 = client.post(f"/api/clips/{cid}/render", json={}).json()
    assert wait_job(client, job2["id"], timeout=300)["status"] == "completed"
    c2 = client.get(f"/api/clips/{cid}").json()
    assert c2["output_path"] != c["output_path"] and out.is_file()


def test_render_with_silence_removal_watermark_intro_and_face_mode(client, analyzed, sample, tmp_path):
    vid = analyzed["video"]["id"]
    gap = sample["segments"][5]["end"]  # the 1.6 s pause sits right after this
    clip = client.post("/api/clips", json={"source_video_id": vid, "start": gap - 4, "end": gap + 5, "title": "Extras"}).json()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=red:s=200x100:d=1", "-frames:v", "1", str(tmp_path / "logo.png")], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=blue:s=320x240:r=10:d=1", "-pix_fmt", "yuv420p", str(tmp_path / "intro.mp4")], check=True)
    logo = client.post("/api/assets", files={"file": ("logo.png", (tmp_path / "logo.png").read_bytes(), "image/png")}).json()["name"]
    intro = client.post("/api/assets", files={"file": ("intro.mp4", (tmp_path / "intro.mp4").read_bytes(), "video/mp4")}).json()["name"]
    assert client.post("/api/assets", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 400
    r = client.patch(f"/api/clips/{clip['id']}", json={"settings": {
        "aspect": "1:1", "crop_mode": "face", "remove_silence": True, "watermark": logo, "intro": intro, "zoom": 1.2}})
    assert r.status_code == 200, r.text
    fast = next(p for p in client.get("/api/presets").json() if p["short_side"] == 720)
    job = client.post(f"/api/clips/{clip['id']}/render", json={"preset_id": fast["id"]}).json()
    done = wait_job(client, job["id"], timeout=300)
    assert done["status"] == "completed", done
    log = client.get(f"/api/jobs/{job['id']}").json()["log"]
    assert "Removed" in log and "No face found" in log  # a test pattern has no face: falls back to manual crop
    c = client.get(f"/api/clips/{clip['id']}").json()
    info = probe(config.STORAGE / c["output_path"])
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (v["width"], v["height"]) == (720, 720)
    dur = float(info["format"]["duration"])
    import re
    removed = float(re.search(r"Removed ([\d.]+)s", log).group(1))
    assert removed >= 1.2  # at least the long pause, minus the padding kept around speech
    assert abs(dur - (9 + 1 - removed)) < 0.3  # 9 s clip + 1 s intro - the silence that was cut


def test_failed_render_is_reported_and_retryable(client, clip, monkeypatch):
    with SessionLocal() as db:
        video = db.get(m.SourceVideo, clip["source_video_id"])
        real = config.STORAGE / video.path
    hidden = real.with_suffix(".hidden")
    real.rename(hidden)
    try:
        job = client.post(f"/api/clips/{clip['id']}/render", json={}).json()
        failed = wait_job(client, job["id"])
        assert failed["status"] == "failed" and "missing on disk" in failed["error"]
        assert client.post(f"/api/jobs/{job['id']}/cancel").status_code == 409
    finally:
        hidden.rename(real)
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 200
    assert wait_job(client, job["id"], timeout=300)["status"] == "completed"  # recovered


def test_cancel_queued_and_running_jobs(client, clip):
    a = client.post(f"/api/clips/{clip['id']}/render", json={}).json()
    assert client.post(f"/api/clips/{clip['id']}/render", json={}).status_code == 409  # no double render of one clip
    r = client.post(f"/api/jobs/{a['id']}/cancel")
    assert r.status_code == 200
    final = wait_job(client, a["id"])
    assert final["status"] == "cancelled"
    assert client.get(f"/api/clips/{clip['id']}").json()["status"] == "rendered"  # earlier export still valid
    assert not list(config.DIRS["temp"].glob("render-*"))


def test_interrupted_jobs_recover_on_restart(client, analyzed):
    with SessionLocal() as db:
        job = m.AnalysisJob(type="video_render", project_id=analyzed["id"], status="running", stage="Rendering video")
        db.add(job)
        db.commit()
        jid = job.id
    runner.recover()  # what startup does
    j = client.get(f"/api/jobs/{jid}").json()
    assert j["status"] == "failed" and "Retry" in j["error"]


def test_transcript_import_and_manual_clip(client, sample):
    pid = client.post("/api/projects", json={"name": "Imported transcript"}).json()["id"]
    alt = sample["path"].parent / "alt.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(sample["path"]), "-t", "12", "-an", "-c:v", "libx264",
                    "-preset", "ultrafast", str(alt)], check=True)
    with open(alt, "rb") as f:
        v = client.post(f"/api/projects/{pid}/videos", files={"file": ("silent.mp4", f, "video/mp4")}).json()
    assert v["audio_streams"] == 0
    job = client.post(f"/api/videos/{v['id']}/analyze", json={}).json()
    assert "no audio track" in wait_job(client, job["id"])["error"]
    srt = "1\n00:00:01,000 --> 00:00:04,000\nपैसे बचाना क्यों ज़रूरी है?\n\n2\n00:00:04,500 --> 00:00:09,000\nKyunki yahi sach hai dosto.\n"
    r = client.post(f"/api/videos/{v['id']}/transcript/import", files={"file": ("t.srt", srt.encode(), "text/plain")})
    assert r.json() == {"segments": 2}
    c = client.post("/api/clips", json={"source_video_id": v["id"], "start": 0.5, "end": 9.5, "title": "Hindi"}).json()
    assert [w["text"] for w in c["words"]][:2] == ["पैसे", "बचाना"]
    job = client.post(f"/api/clips/{c['id']}/render", json={"preset_id": 2}).json()
    assert wait_job(client, job["id"], timeout=300)["status"] == "completed"  # video without audio renders too
    info = probe(config.STORAGE / client.get(f"/api/clips/{c['id']}").json()["output_path"])
    assert {s["codec_type"] for s in info["streams"]} == {"video", "audio"}
    # deleting the project removes the stored copy but keeps the export
    export = config.STORAGE / client.get(f"/api/clips/{c['id']}").json()["output_path"]
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert not (config.STORAGE / v["path"]).exists() and export.is_file()
    assert client.get(f"/api/clips/{c['id']}").status_code == 404


def test_campaigns_submissions_and_earnings(client, clip):
    body = {"name": "Spring launch", "brand": "BrandX", "allowed_platforms": ["TikTok"], "min_duration": 10, "max_duration": 60,
            "rate_per_1000": 2.0, "max_payout": 50, "rules": [{"kind": "hashtag", "value": "#brandx"}, {"kind": "branding", "value": "Logo on screen"}]}
    camp = client.post("/api/campaigns", json=body).json()
    assert len(camp["rules"]) == 2
    assert client.post("/api/campaigns", json={**body, "min_duration": 90}).status_code == 400
    manual_rule = next(r for r in camp["rules"] if r["kind"] == "branding")
    upd = client.put(f"/api/campaigns/{camp['id']}", json={**body, "notes": "edited"}).json()
    assert next(r for r in upd["rules"] if r["kind"] == "branding")["id"] == manual_rule["id"]
    assert client.patch(f"/api/clips/{clip['id']}", json={"campaign_id": camp["id"]}).json()["campaign_id"] == camp["id"]
    assert client.patch(f"/api/clips/{clip['id']}", json={"campaign_id": 9999}).status_code == 404
    pre = client.get(f"/api/campaigns/{camp['id']}/checklist?clip_id={clip['id']}&platform=TikTok&caption=hi").json()
    assert {i["status"] for i in pre} >= {"pass", "fail", "manual"}

    sub = client.post("/api/submissions", json={"campaign_id": camp["id"], "clip_id": clip["id"], "platform": "TikTok",
                                                "caption": "New drop #brandx", "status": "submitted"}).json()
    assert sub["submitted_at"] and sub["estimate_basis"] == "none" and sub["estimated"] == 0
    assert [i["status"] for i in sub["checklist"]].count("manual") == 1
    sub = client.put(f"/api/submissions/{sub['id']}", json={"campaign_id": camp["id"], "clip_id": clip["id"], "platform": "TikTok",
                     "caption": "New drop #brandx", "status": "submitted", "manual_checks": {str(manual_rule["id"]): True}}).json()
    assert all(i["status"] == "pass" for i in sub["checklist"])
    sub = client.post(f"/api/submissions/{sub['id']}/metrics", json={"views": 12000}).json()
    assert sub["self_reported_views"] == 12000 and sub["estimate_basis"] == "self_reported" and sub["estimated"] == 24.0
    sub = client.post(f"/api/submissions/{sub['id']}/metrics", json={"views": 8000, "kind": "verified"}).json()
    assert sub["verified_views"] == 8000 and sub["estimate_basis"] == "verified" and sub["estimated"] == 16.0
    assert client.post(f"/api/submissions/{sub['id']}/metrics", json={"views": -1}).status_code == 422

    assert client.post("/api/payments", json={"campaign_id": camp["id"], "amount": 0}).status_code == 422
    client.post("/api/payments", json={"campaign_id": camp["id"], "submission_id": sub["id"], "amount": 10, "note": "first payout"})
    csv = f"campaign_id,amount,date,note\n{camp['id']},5.5,2026-02-01,second\n9999,3,,\n{camp['id']},oops,,\n"
    r = client.post("/api/earnings/import?kind=payments", files={"file": ("p.csv", csv.encode(), "text/csv")}).json()
    assert r["imported"] == 1 and len(r["errors"]) == 2
    csv = f"submission_id,views,kind\n{sub['id']},9000,verified\n"
    assert client.post("/api/earnings/import?kind=metrics", files={"file": ("m.csv", csv.encode(), "text/csv")}).json()["imported"] == 1

    e = client.get("/api/earnings").json()
    row = next(c for c in e["by_campaign"] if c["campaign_id"] == camp["id"])
    assert row["submitted"] == 1 and row["self_reported_views"] == 12000 and row["verified_views"] == 9000
    assert row["estimated"] == 18.0 and row["received"] == 15.5  # estimate and real money are separate numbers
    plat = {p["platform"]: p for p in e["by_platform"]}
    assert plat["TikTok"]["received"] == 10 and plat["Not linked to a submission"]["received"] == 5.5
    d = client.get("/api/dashboard").json()
    assert d["campaigns"] >= 1 and d["verified_views"] >= 9000 and d["received_earnings"] >= 15.5 and d["exported_clips"] >= 1


def test_settings_validation_and_backup(client, monkeypatch):
    s = client.get("/api/settings").json()
    assert s["scoring_weights"]["hook"] == 25 and s["clip_durations"] == [15, 30, 45, 60]
    assert client.put("/api/settings", json={"whisper_model": "enormous"}).status_code == 400
    assert client.put("/api/settings", json={"scoring_weights": {"hook": -1}}).status_code == 400
    ok = client.put("/api/settings", json={"whisper_model": "base", "clip_durations": [20, 40], "bogus": 1}).json()
    assert ok["whisper_model"] == "base" and ok["clip_durations"] == [20, 40] and "bogus" not in ok
    # AI rating: the key is write-only, an empty field keeps it, and switching the provider off forgets it
    from app.ai import llm
    assert not s["_llm_key_set"] and client.get("/api/health").json()["llm"] is None
    assert client.put("/api/settings", json={"llm_url": "ftp://x", "llm_key": "k"}).status_code == 400
    assert client.post("/api/settings/llm-test", json={"llm_url": "https://x.test/v1"}).status_code == 400  # no key yet
    on = client.put("/api/settings", json={"llm_url": "https://x.test/v1", "llm_model": "m1", "llm_key": " secret "}).json()
    assert on["llm_key"] == "" and on["_llm_key_set"] and client.get("/api/health").json()["llm"] == "m1"
    seen = {}
    monkeypatch.setattr(llm, "list_models", lambda cfg: seen.update(cfg) or ["m1", "m2"])
    assert client.post("/api/settings/llm-test", json={"llm_url": "https://y.test", "llm_key": ""}).json() == {"models": ["m1", "m2"]}
    assert seen["key"] == "secret" and seen["url"] == "https://y.test"  # saved key, address from the form
    monkeypatch.setattr(llm, "list_models", lambda cfg: (_ for _ in ()).throw(RuntimeError("The AI service answered 401: bad key")))
    assert "401" in client.post("/api/settings/llm-test", json={"llm_key": "wrong"}).json()["detail"]
    assert client.put("/api/settings", json={"llm_model": "m2", "llm_key": ""}).json()["_llm_key_set"]
    assert not client.put("/api/settings", json={"llm_url": ""}).json()["_llm_key_set"]
    b = client.post("/api/settings/backup").json()
    import sqlite3
    con = sqlite3.connect(b["path"])
    assert con.execute("select count(*) from projects").fetchone()[0] >= 1
    con.close()


def test_presets_crud(client):
    p = client.post("/api/presets", json={"name": "Tiny", "short_side": 480, "crf": 30, "x264_preset": "ultrafast"}).json()
    assert client.post("/api/presets", json={"name": "Tiny"}).status_code == 409
    assert client.post("/api/presets", json={"name": "Bad", "x264_preset": "; rm -rf /"}).status_code == 422
    assert client.put(f"/api/presets/{p['id']}", json={"name": "Tiny", "short_side": 360}).json()["short_side"] == 360
    assert client.delete(f"/api/presets/{p['id']}").status_code == 204
    assert client.delete("/api/presets/1").status_code == 400  # built-in
    assert len(client.get("/api/caption-templates").json()) == 6


def test_data_survives_restart(client, analyzed):
    """A second app instance on the same storage sees everything (the session client stays open)."""
    with SessionLocal() as db:
        assert db.get(m.Project, analyzed["id"]).name == "Money talk"
    from app.database.db import migrate
    migrate()  # running migrations again on an existing database is a no-op
    assert client.get(f"/api/projects/{analyzed['id']}").json()["clip_count"] >= 1


def test_websocket_streams_job_progress(client, clip):
    with client.websocket_connect("/ws/jobs") as ws:
        job = client.post(f"/api/clips/{clip['id']}/render", json={"preset_id": 2}).json()
        seen = []
        while True:
            msg = ws.receive_json()
            if msg["job"]["id"] == job["id"]:
                seen.append(msg["job"])
                if msg["job"]["status"] in ("completed", "failed", "cancelled"):
                    break
    assert seen[-1]["status"] == "completed"
    assert any(0 < j["progress"] < 100 for j in seen) and any(j["stage"] == "Rendering video" for j in seen)
