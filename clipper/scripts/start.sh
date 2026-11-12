#!/usr/bin/env bash
# Build the frontend if needed, then run the whole app on http://127.0.0.1:8000
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo "FFmpeg is not installed. Install it first (https://ffmpeg.org/download.html)."; exit 1; }
[ -d backend/.venv ] || { python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt; }
[ -d frontend/dist ] || (cd frontend && npm install && npm run build)
cd backend
# 127.0.0.1 only: the app has no login, so it must not be reachable from other machines
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}"
