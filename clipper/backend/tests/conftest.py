"""Shared fixtures. Storage points at a temp folder before the app is imported, and a sample video with
synthesised speech (ffmpeg's flite voice) is generated once per test run - no media files are committed."""
import os
import tempfile
import time
from pathlib import Path

import pytest

from tests import sample_media

_STORE = tempfile.mkdtemp(prefix="clipper-test-")
os.environ["CLIPPER_STORAGE"] = _STORE

@pytest.fixture(scope="session")
def sample(tmp_path_factory):
    return sample_media.build(tmp_path_factory.mktemp("sample"))


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
