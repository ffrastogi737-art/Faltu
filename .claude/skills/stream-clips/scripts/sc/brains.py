"""Who reads the transcript and picks the moments. Each backend is a coding-agent CLI the
user is already signed in to, so it runs on their own subscription (no API keys):

  claude    Claude Code       claude -p                       (prompt on stdin)
  codex     OpenAI Codex CLI  codex exec -                    (prompt on stdin)
  gemini    Gemini CLI        gemini -p "..."                 (prompt on stdin)
  opencode  OpenCode          opencode run "read <file> ..."  (prompt in a file)
  agent     no CLI call: prompts are written to files and the agent running this
            skill answers them itself, then runs the same command again.
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from .common import Problem

ORDER = ("claude", "codex", "gemini", "opencode")

# Environment variables these tools set for the commands they run, used to prefer the
# CLI of whichever agent launched us.
HOST_HINTS = {
    "claude": ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"),
    "codex": ("CODEX_SANDBOX", "CODEX_MANAGED_BY_NPM", "CODEX_HOME"),
    "gemini": ("GEMINI_CLI",),
    "opencode": ("OPENCODE", "OPENCODE_BIN_PATH"),
}

TIMEOUT = 900


class NeedAgent(Exception):
    """Agent mode: some prompt files still need an answer file."""

    def __init__(self, waiting):
        super().__init__(f"{len(waiting)} part(s) waiting for answers")
        self.waiting = waiting


class SignedOut(Problem):
    """The brain CLI is installed but not logged in: stop instead of retrying every part."""


def choose(wanted="auto"):
    if wanted and wanted != "auto":
        if wanted != "agent" and not shutil.which(wanted):
            raise Problem(f"--brain {wanted}: the '{wanted}' command is not installed or not on "
                          f"PATH. Use --brain agent to let the current agent pick the moments.")
        return wanted
    for name, hints in HOST_HINTS.items():
        if any(os.environ.get(h) for h in hints) and shutil.which(name):
            return name
    for name in ORDER:
        if shutil.which(name):
            return name
    return "agent"


def _child_env():
    env = dict(os.environ)
    # A nested `claude -p` refuses to start if it thinks it's inside another session.
    for key in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"):
        env.pop(key, None)
    env["NO_COLOR"] = "1"
    return env


def _call(cmd, stdin_text=None, cwd=None):
    exe = shutil.which(cmd[0]) or cmd[0]
    try:
        proc = subprocess.run([exe, *cmd[1:]], input=stdin_text, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=TIMEOUT,
                              env=_child_env(), cwd=cwd)
    except subprocess.TimeoutExpired as exc:
        raise Problem(f"{cmd[0]} did not answer within {TIMEOUT // 60} min") from exc
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        text = " | ".join(detail[-4:])[:400]
        low = text.lower()
        if any(k in low for k in ("authenticate", "login", "log in", "oauth", "unauthorized",
                                  "api key", "credentials", "not logged")):
            raise SignedOut(f"the {cmd[0]} CLI is not signed in ({text[:160]}). Sign in once by "
                            f"running `{cmd[0]}` in a terminal (Claude Code: /login), or use "
                            f"--brain agent to let the current agent pick the moments.")
        raise Problem(f"{cmd[0]} failed: " + text)
    return proc.stdout


def ask(brain, prompt, model=None, scratch: Path = None):
    """Send one prompt, return the raw text reply."""
    scratch = scratch or Path(tempfile.gettempdir())
    if brain == "claude":
        return _call(["claude", "-p", *(["--model", model] if model else [])], prompt)
    if brain == "codex":
        out = scratch / f"codex_reply_{os.getpid()}_{id(prompt)}.txt"
        _call(["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only",
               "--color", "never", "--output-last-message", str(out),
               *(["-m", model] if model else []), "-"], prompt, cwd=str(scratch))
        try:
            return out.read_text(encoding="utf-8")
        finally:
            out.unlink(missing_ok=True)
    if brain == "gemini":
        return _call(["gemini", *(["-m", model] if model else []), "-p",
                      "Follow the instructions in the text above and reply with only the JSON array"],
                     prompt, cwd=str(scratch))
    if brain == "opencode":
        task = scratch / f"opencode_task_{os.getpid()}_{id(prompt)}.txt"
        task.write_text(prompt, encoding="utf-8")
        try:
            return _call(["opencode", "run", *(["-m", model] if model else []),
                          f"Read the file {task} and do exactly what it asks. "
                          f"Reply with only the JSON array it asks for"], cwd=str(scratch))
        finally:
            task.unlink(missing_ok=True)
    raise Problem(f"unknown brain '{brain}'")
