"""Shared helpers: subprocess, ffprobe, json IO."""
import json
import shutil
import subprocess
import sys
from pathlib import Path


def need(binary):
    if shutil.which(binary) is None:
        sys.exit(f"ERROR: '{binary}' not found in PATH. Install it first (ffmpeg: https://ffmpeg.org).")


def run(cmd, capture=False, check=True):
    print("→", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run([str(c) for c in cmd], check=check,
                          capture_output=capture, text=True)


def duration_of(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path], capture=True)
    return float(r.stdout.strip())


def save_json(obj, path):
    Path(path).write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=float))


def load_json(path, default=None):
    p = Path(path)
    return json.loads(p.read_text()) if p.exists() else default
