#!/bin/bash
# Cloud session bootstrap for the shorts factory. Run by the environment setup script on every fresh container
# (repo path: Faltu/.claude/skills/faceless-shorts/scripts/cloud_bootstrap.sh). Safe to re-run: each step checks first.
# Installs: Faltu voice/Whisper env (setup.sh), Chatterbox expressive voice (own Python 3.11 venv in /root/cbx) + its
# model weights, rendering helpers. Writes a log to /tmp/cloud_bootstrap.log and a status line to stdout.
set -u
LOG=/tmp/cloud_bootstrap.log; exec > >(tee -a "$LOG") 2>&1
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
export CHROME="${CHROME:-/opt/pw-browsers/chromium}"
export PATH="$HOME/.local/bin:$PATH"
CBX="${CBX_HOME:-/root/cbx}"
step() { echo "[$(date -u +%H:%M:%S)] $*"; }

step "1/5 faceless-shorts env (Kokoro + Whisper)"
bash "$SKILL/scripts/setup.sh" || echo "setup.sh reported missing items (see above)"

step "2/5 numpy/scipy/pillow for mixing and graphics"
python3 -m pip install -q scipy pillow numpy 2>/dev/null || echo "pip step skipped"

step "3/5 uv (fast Python installer)"
UV="$(command -v uv || true)"; [ -n "$UV" ] || { python3 -m pip install -q uv 2>/dev/null; UV="$(command -v uv || echo /root/.local/bin/uv)"; }
echo "uv: $UV"

step "4/5 Chatterbox venv (Python 3.11)"
if [ ! -x "$CBX/bin/python" ]; then
  "$UV" venv -q -p /usr/bin/python3.11 "$CBX" && VIRTUAL_ENV="$CBX" "$UV" pip install -q chatterbox-tts "setuptools<81" || echo "chatterbox install FAILED"
fi

step "5/5 Chatterbox model weights (first load downloads ~6 GB into the HF cache)"
"$CBX/bin/python" -c "from chatterbox.tts import ChatterboxTTS; ChatterboxTTS.from_pretrained(device='cpu'); print('chatterbox model ok')" 2>&1 | tail -1 || echo "model download FAILED"

if [ -x "$CBX/bin/python" ] && "$CBX/bin/python" -c "import chatterbox" 2>/dev/null; then echo "STATUS chatterbox ok ($CBX)"; else echo "STATUS chatterbox MISSING"; fi
echo "STATUS done $(date -u +%FT%TZ)"
