#!/data/data/com.termux/files/usr/bin/bash
# Run the app on an Android phone inside Termux (install Termux from F-Droid, not the Play Store).
#   pkg install -y git && git clone <this repo> && cd <repo>/clipper && ./scripts/termux.sh
# Then open http://127.0.0.1:8000 in Chrome on the same phone.
# The frontend is shipped pre-built in frontend/dist, so Node is not needed on the phone.
set -euo pipefail
cd "$(dirname "$0")/.."
pkg install -y python ffmpeg
ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass " || echo "WARNING: this ffmpeg has no libass; captions cannot be burned in."
[ -d backend/.venv ] || python -m venv backend/.venv
# pydantic-core is compiled Rust. The Termux User Repository index has an Android build of the version pinned in
# requirements-termux.txt; --only-binary stops pip from trying (and failing) to compile it from source.
backend/.venv/bin/pip install --only-binary=pydantic-core \
  --extra-index-url https://termux-user-repository.github.io/pypi/ -r backend/requirements-termux.txt || {
  echo
  echo "Install failed. If the error mentions pydantic-core, the prebuilt Android build could not be downloaded:"
  echo "check that https://termux-user-repository.github.io/pypi/ opens in your phone's browser, then run this again."
  exit 1
}
command -v termux-wake-lock >/dev/null && termux-wake-lock   # keep renders alive with the screen off
cd backend
echo "Open http://127.0.0.1:8000 in your phone's browser. Press Ctrl+C here to stop."
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}"
