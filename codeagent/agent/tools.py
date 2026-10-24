"""Workspace tools. Every tool takes JSON args, returns a size-capped string,
and never touches paths outside the workspace or .env files."""
import difflib
import fnmatch
import os
import re
import subprocess

MAX_OUT = 12_000


class ToolError(Exception):
    pass


def _cap(text, limit=MAX_OUT):
    return text if len(text) <= limit else text[:limit] + f"\n... [truncated {len(text) - limit} chars]"


class Tools:
    def __init__(self, workspace, approve, mode="default", scrub_env=()):
        self.ws = os.path.realpath(workspace)
        self.approve = approve  # (kind, detail) -> bool
        self.mode = mode  # plan | default | accept_edits | trusted
        self.scrub_env = set(scrub_env)

    def _path(self, path):
        full = os.path.realpath(os.path.join(self.ws, path))
        if full != self.ws and not full.startswith(self.ws + os.sep):
            raise ToolError(f"path is outside the workspace: {path}")
        if re.fullmatch(r"\.env(\..*)?", os.path.basename(full)) and not full.endswith(".example"):
            raise ToolError("access to .env files is blocked (secrets)")
        return full

    def _allowed(self, kind, detail):
        if self.mode == "trusted" or (self.mode == "accept_edits" and kind == "edit"):
            return True
        return self.approve(kind, detail)

    # --- read-only ---
    def read_file(self, path, start=1, end=None):
        with open(self._path(path), errors="replace") as f:
            lines = f.read().splitlines()
        start = max(1, int(start))
        end = min(len(lines), int(end) if end else start + 399)
        body = "\n".join(f"{i:5} {lines[i - 1]}" for i in range(start, end + 1))
        return _cap(f"{path} lines {start}-{end} of {len(lines)}\n{body}")

    def list_files(self, pattern="*"):
        out = []
        for root, dirs, files in os.walk(self.ws):
            dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "__pycache__", ".venv")]
            for name in files:
                rel = os.path.relpath(os.path.join(root, name), self.ws)
                if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(name, pattern):
                    out.append(rel)
        return _cap("\n".join(sorted(out)[:500]) or "no files match")

    def grep(self, pattern, glob="*"):
        rx = re.compile(pattern)
        hits = []
        for rel in self.list_files(glob).splitlines():
            try:
                with open(self._path(rel), errors="strict") as f:
                    for n, line in enumerate(f, 1):
                        if rx.search(line):
                            hits.append(f"{rel}:{n}: {line.rstrip()}")
            except (UnicodeDecodeError, ToolError, OSError):
                continue
            if len(hits) >= 200:
                break
        return _cap("\n".join(hits) or "no matches")

    # --- changing ---
    def edit_file(self, path, old, new):
        full = self._path(path)
        with open(full) as f:
            text = f.read()
        count = text.count(old) if old else 0
        if count != 1:
            raise ToolError(f"`old` must match exactly once, found {count} matches; read the file and copy the text exactly")
        updated = text.replace(old, new, 1)
        diff = "".join(difflib.unified_diff(text.splitlines(True), updated.splitlines(True), path, path))
        if not self._allowed("edit", diff):
            return "user rejected this edit"
        with open(full, "w") as f:
            f.write(updated)
        return "edited:\n" + _cap(diff)

    def write_file(self, path, content):
        full = self._path(path)
        if os.path.exists(full):
            raise ToolError("file exists; use edit_file to change it")
        if not self._allowed("edit", f"create {path} ({len(content)} chars)\n{content[:2000]}"):
            return "user rejected this file"
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as f:
            f.write(content)
        return f"created {path}"

    def run_command(self, command, timeout=120):
        if not self._allowed("command", command):
            return "user rejected this command"
        env = {k: v for k, v in os.environ.items() if k not in self.scrub_env}
        try:
            p = subprocess.run(command, shell=True, cwd=self.ws, env=env, capture_output=True,
                               text=True, timeout=min(int(timeout), 600))
        except subprocess.TimeoutExpired:
            return f"timed out after {timeout}s"
        out = (p.stdout + p.stderr)[-MAX_OUT:]  # the tail holds test summaries
        return f"exit code {p.returncode}\n{out}"


READ_ONLY = ["read_file", "list_files", "grep"]

SCHEMAS = {
    "read_file": {"description": "Read a text file with line numbers. Use start/end for large files.",
                  "parameters": {"type": "object", "required": ["path"], "properties": {
                      "path": {"type": "string"}, "start": {"type": "integer"}, "end": {"type": "integer"}}}},
    "list_files": {"description": "List workspace files matching a glob, e.g. '*.py' or 'src/*'.",
                   "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}}},
    "grep": {"description": "Search file contents with a regex. Optional glob filters files.",
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern": {"type": "string"}, "glob": {"type": "string"}}}},
    "edit_file": {"description": "Replace one exact, unique snippet `old` with `new` in a file. Keep `old` small but unique.",
                  "parameters": {"type": "object", "required": ["path", "old", "new"], "properties": {
                      "path": {"type": "string"}, "old": {"type": "string"}, "new": {"type": "string"}}}},
    "write_file": {"description": "Create a new file. Fails if the file exists.",
                   "parameters": {"type": "object", "required": ["path", "content"], "properties": {
                       "path": {"type": "string"}, "content": {"type": "string"}}}},
    "run_command": {"description": "Run a shell command in the workspace (e.g. tests). Returns exit code and output tail.",
                    "parameters": {"type": "object", "required": ["command"], "properties": {
                        "command": {"type": "string"}, "timeout": {"type": "integer"}}}},
}


def schemas(mode):
    names = READ_ONLY if mode == "plan" else list(SCHEMAS)
    return [{"name": n, **SCHEMAS[n]} for n in names]
