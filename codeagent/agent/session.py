"""Sessions: append-only JSONL log, file snapshots for rewind, an optional
git checkpoint, and resume.

~/.edith/sessions/<id>/log.jsonl     every event, never rewritten
~/.edith/sessions/<id>/snap/<n>/...  file contents before step n changed them
~/.edith/sessions/<id>/artifacts/    plan, diff, test report, review, report

Snapshots cover files changed through edit/write tools. Changes made by
shell commands are only covered by the git checkpoint (tracked files)."""
import difflib
import json
import os
import shutil
import subprocess
import time
import uuid
from dataclasses import asdict

from .config import edith_home
from .messages import Message, ToolCall


def _dir(sid):
    return os.path.join(edith_home(), "sessions", sid)


def to_dict(m):
    return asdict(m)


def from_dict(d):
    return Message(d["role"], d.get("content", ""), [ToolCall(**t) for t in d.get("tool_calls") or []],
                   d.get("tool_call_id", ""))


class Session:
    def __init__(self, sid=None, workspace=".", task="", mode="default", resume=False):
        self.id = sid or time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
        self.dir = _dir(self.id)
        self.path = os.path.join(self.dir, "log.jsonl")
        self.step = 0
        self.snapped = set()  # (step, rel) already saved
        self.todo = []
        if resume:
            if not os.path.exists(self.path):
                raise FileNotFoundError(f"no session {sid}")
            self.meta = self._replay()["meta"]
            return
        os.makedirs(os.path.join(self.dir, "artifacts"), exist_ok=True)
        self.meta = {"id": self.id, "workspace": os.path.realpath(workspace), "task": task, "mode": mode,
                     "started": time.time(), "git_checkpoint": self._git_checkpoint(workspace)}
        self.event("meta", **self.meta)

    # --- log ---
    def event(self, t, **data):
        with open(self.path, "a") as f:
            f.write(json.dumps({"t": t, "ts": time.time(), "step": self.step, **data}, default=str) + "\n")

    def message(self, m):
        self.event("msg", m=to_dict(m))

    def events(self):
        with open(self.path) as f:
            return [json.loads(line) for line in f if line.strip()]

    def _replay(self):
        """History as it stands after rewinds and compactions."""
        meta, history = {}, []
        for e in self.events():
            if e["t"] == "meta":
                meta = {k: v for k, v in e.items() if k not in ("t", "ts", "step")}
            elif e["t"] == "msg":
                history.append((e["step"], from_dict(e["m"])))
            elif e["t"] == "rewind":
                history = [(s, m) for s, m in history if s < e["to_step"]]
            elif e["t"] == "compaction":
                history = [(e["step"], from_dict(d)) for d in e["history"]]
            elif e["t"] == "todo":
                self.todo = e["items"]
            self.step = max(self.step, e["step"])
        self.history = [m for _, m in history]
        return {"meta": meta}

    def history_for_resume(self):
        return list(self.history)

    # --- snapshots / rewind ---
    def snapshot(self, rel, full):
        """Save a file's content before the current step changes it (once per step)."""
        if (self.step, rel) in self.snapped:
            return
        self.snapped.add((self.step, rel))
        dst = os.path.join(self.dir, "snap", str(self.step), rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        existed = os.path.exists(full)
        if existed:
            shutil.copy2(full, dst)
        self.event("snapshot", path=rel, existed=existed)

    def rewind(self, to_step):
        """Restore files to how they were before `to_step` and cut the history there."""
        ws = self.meta["workspace"]
        snaps = [e for e in self.events() if e["t"] == "snapshot" and e["step"] >= to_step]
        first = {}
        for e in snaps:  # the earliest snapshot at or after to_step is the state we want
            first.setdefault(e["path"], e)
        restored = []
        for rel, e in first.items():
            full = os.path.join(ws, rel)
            if e["existed"]:
                os.makedirs(os.path.dirname(full), exist_ok=True)
                shutil.copy2(os.path.join(self.dir, "snap", str(e["step"]), rel), full)
            elif os.path.exists(full):
                os.remove(full)
            restored.append(rel)
        self.event("rewind", to_step=to_step, restored=restored)
        return restored

    def changed_files(self):
        return sorted({e["path"] for e in self.events() if e["t"] == "snapshot"})

    def diff(self):
        """Unified diff of every file this session changed, from its first snapshot to now."""
        ws, out = self.meta["workspace"], []
        first = {}
        for e in self.events():
            if e["t"] == "snapshot":
                first.setdefault(e["path"], e)
        for rel, e in sorted(first.items()):
            old = ""
            if e["existed"]:
                with open(os.path.join(self.dir, "snap", str(e["step"]), rel), errors="replace") as f:
                    old = f.read()
            full, new = os.path.join(ws, rel), ""
            if os.path.exists(full):
                with open(full, errors="replace") as f:
                    new = f.read()
            out.extend(difflib.unified_diff(old.splitlines(True), new.splitlines(True), f"a/{rel}", f"b/{rel}"))
        return "".join(out)

    # --- git checkpoint ---
    def _git_checkpoint(self, ws):
        """A commit object of the current work tree, kept under refs/edith/ so git does not
        garbage-collect it. Does not touch the branch, index or files."""
        try:
            def git(*a):
                return subprocess.run(["git", *a], cwd=ws, capture_output=True, text=True, timeout=30)
            if git("rev-parse", "--is-inside-work-tree").stdout.strip() != "true":
                return None
            sha = git("stash", "create").stdout.strip() or git("rev-parse", "HEAD").stdout.strip()
            if sha:
                git("update-ref", f"refs/edith/{self.id}", sha)
            return sha or None
        except (OSError, subprocess.SubprocessError):
            return None

    def restore_git_checkpoint(self):
        """Tracked files back to the session start (covers changes made by shell commands)."""
        sha = self.meta.get("git_checkpoint")
        if not sha:
            return "no git checkpoint for this session"
        p = subprocess.run(["git", "checkout", sha, "--", "."], cwd=self.meta["workspace"], capture_output=True, text=True)
        self.event("git_restore", sha=sha, ok=p.returncode == 0)
        return p.stderr.strip() or f"tracked files restored to {sha[:10]}"

    # --- artifacts ---
    def artifact(self, name, text):
        path = os.path.join(self.dir, "artifacts", name)
        with open(path, "w") as f:
            f.write(text)
        return path


def list_sessions(limit=20):
    root = os.path.join(edith_home(), "sessions")
    if not os.path.isdir(root):
        return []
    out = []
    for sid in sorted(os.listdir(root), reverse=True)[:limit]:
        try:
            with open(os.path.join(root, sid, "log.jsonl")) as f:
                meta = json.loads(f.readline())
            ends = [e for e in Session(sid, resume=True).events() if e["t"] == "end"]
            out.append({"id": sid, "task": meta.get("task", ""), "workspace": meta.get("workspace"),
                        "status": ends[-1].get("status") if ends else "unfinished"})
        except (OSError, ValueError, KeyError):
            continue
    return out
