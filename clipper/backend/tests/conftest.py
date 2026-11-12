"""Shared fixtures. Storage points at a temp folder before the app is imported, and a sample video with
synthesised speech (ffmpeg's flite voice) is generated once per test run - no media files are committed."""
import os
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

_STORE = tempfile.mkdtemp(prefix="clipper-test-")
os.environ["CLIPPER_STORAGE"] = _STORE

SENTENCES = [
    "Why do most people fail at saving money?",
    "Here is the secret that nobody tells you.",
    "You never need a bigger salary to start.",
    "First, move ten percent of every payment into a separate account.",
    "This works because you cannot spend what you do not see.",
    "I lost everything at twenty five and it was painful.",
    "But that failure taught me the most important lesson of my life.",
    "A study of one thousand families found the same pattern.",
    "The families who saved first were happier after five years.",
    "So remember, pay yourself first and the rest becomes easy.",
    "And then we talked about some other things for a while.",
    "What would you do with an extra hundred dollars every month?",
    "Imagine the freedom of having six months of savings.",
    "That is the real reason to start today.",
]


def _run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def _duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


@pytest.fixture(scope="session")
def sample(tmp_path_factory):
    """{"path": video file, "segments": [{start,end,text}] with the true timing of each spoken sentence}."""
    d = tmp_path_factory.mktemp("sample")
    segments, t, parts = [], 0.5, []
    for i, text in enumerate(SENTENCES):
        wav = d / f"s{i}.wav"
        (d / f"s{i}.txt").write_text(text)
        _run("-f", "lavfi", "-i", f"flite=textfile={d / f's{i}.txt'}:voice=slt", "-ar", "16000", str(wav))
        dur = _duration(wav)
        segments.append({"start": round(t, 3), "end": round(t + dur, 3), "text": text})
        parts.append((wav, t))
        t += dur + (1.6 if i == 5 else 0.35)  # one long pause, for the silence tests
    total = t + 0.5
    inputs, filt = [], []
    for i, (wav, at) in enumerate(parts):
        inputs += ["-i", str(wav)]
        filt.append(f"[{i}:a]adelay={int(at * 1000)}[a{i}]")
    filt.append("".join(f"[a{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0[a]")
    path = d / "sample.mp4"
    _run(*inputs, "-f", "lavfi", "-i", f"testsrc2=s=640x360:r=25:d={total:.2f}", "-filter_complex", ";".join(filt),
         "-map", f"{len(parts)}:v", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-t", f"{total:.2f}", str(path))
    return {"path": path, "segments": segments, "duration": total}


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


def wait_job(client, job_id: int, timeout: float = 180) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("completed", "failed", "cancelled"):
            return job
        time.sleep(0.2)
    raise AssertionError(f"job {job_id} did not finish: {job}")


def wait_chain(client, project_id: int, last_type: str, first_job_id: int, timeout: float = 180) -> dict:
    """Wait until the chained analysis reaches (and finishes) its last stage, or any stage fails."""
    end = time.time() + timeout
    while time.time() < end:
        jobs = [j for j in client.get(f"/api/jobs?project_id={project_id}").json() if j["id"] >= first_job_id]
        bad = [j for j in jobs if j["status"] in ("failed", "cancelled")]
        if bad:
            return client.get(f"/api/jobs/{bad[0]['id']}").json()
        done = [j for j in jobs if j["type"] == last_type and j["status"] == "completed"]
        if done:
            return done[0]
        time.sleep(0.2)
    raise AssertionError("analysis chain did not finish")
