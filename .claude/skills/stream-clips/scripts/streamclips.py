#!/usr/bin/env python3
"""stream-clips: long streams and videos in, ready-to-post vertical clips out.

Run with any Python 3; it switches itself into the private env made by setup_env.py.

    streamclips.py setup
    streamclips.py doctor
    streamclips.py find  --topic "Valorant"
    streamclips.py clip  URL [URL ...] --topic "Valorant"
    streamclips.py clip  --find --topic "GTA 6" --count 5
"""

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IS_WIN = os.name == "nt"
VENV = Path.home() / ".streamclips" / "venv"
VENV_PY = VENV / ("Scripts/python.exe" if IS_WIN else "bin/python")


def in_venv():
    try:
        return Path(sys.prefix).resolve() == VENV.resolve()
    except OSError:
        return False


def main():
    args = sys.argv[1:]
    if args[:1] == ["setup"]:
        sys.exit(subprocess.call([sys.executable, str(HERE / "setup_env.py"), *args[1:]]))
    if not in_venv():
        if not VENV_PY.exists():
            print("stream-clips is not set up yet. Run:\n  "
                  f"{'python' if IS_WIN else 'python3'} \"{HERE / 'setup_env.py'}\"", file=sys.stderr)
            sys.exit(1)
        env = dict(os.environ)
        bin_dir = str(VENV_PY.parent)
        env["PATH"] = bin_dir + os.pathsep + env.get("PATH", "")
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        sys.exit(subprocess.call([str(VENV_PY), str(Path(__file__).resolve()), *args], env=env))

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    os.environ["PATH"] = str(VENV_PY.parent) + os.pathsep + os.environ.get("PATH", "")
    sys.path.insert(0, str(HERE))
    from sc.cli import main as cli_main
    sys.exit(cli_main(args) or 0)


if __name__ == "__main__":
    main()
