import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from . import models as m
from .api import campaigns, clips, jobs, projects, system
from .core import config
from .database.db import SessionLocal, migrate
from .workers import events, runner

BUILTIN_PRESETS = [
    {"name": "High quality 1080p", "short_side": 1080, "crf": 20, "x264_preset": "medium", "audio_kbps": 160},
    {"name": "Fast draft 720p", "short_side": 720, "crf": 26, "x264_preset": "veryfast", "audio_kbps": 128},
    {"name": "Maximum quality 1080p", "short_side": 1080, "crf": 17, "x264_preset": "slow", "audio_kbps": 192},
]


def seed() -> None:
    with SessionLocal() as db:
        if not db.scalar(select(m.RenderPreset.id).limit(1)):
            db.add_all(m.RenderPreset(builtin=True, **p) for p in BUILTIN_PRESETS)
            db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_dirs()
    migrate()
    seed()
    events.loop = asyncio.get_running_loop()
    runner.start()
    yield
    runner.stop()


app = FastAPI(title="Personal AI Clipper", lifespan=lifespan)
for r in (system.router, projects.router, clips.router, jobs.router, campaigns.router):
    app.include_router(r)

DIST = config.ROOT / "frontend" / "dist"
if DIST.is_dir():  # production: the built frontend is served by the same process

    class SPA(StaticFiles):
        async def get_response(self, path, scope):
            from starlette.exceptions import HTTPException as SE
            try:
                return await super().get_response(path, scope)
            except SE as e:
                if e.status_code == 404 and not path.startswith(("api/", "ws/")):
                    return await super().get_response("index.html", scope)
                raise

    app.mount("/", SPA(directory=DIST, html=True), name="frontend")
