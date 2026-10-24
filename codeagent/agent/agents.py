"""Agents of agents: a Supervisor splits a task, specialists do the parts.

- Roles: built-in specialists plus custom ones from ~/.edith/agents/*.md
  (and plugins, and trusted workspaces): frontmatter name/description/
  tools/max_steps/context, body = role prompt.
- Task board in SQLite with a fixed handoff format.
- Independent tasks of a wave run in parallel, each in its own git worktree;
  tasks that declare the same files never run in the same wave.
- Results are merged back with `git apply`; a task whose patch conflicts is
  re-run on the merged tree with its first attempt as a reference.
- Without git (or with parallel off) tasks run one by one in the workspace."""
import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid

from .config import edith_home
from .context import _frontmatter
from .messages import Message
from .providers.repair import parse_args
from .tools import READ_ONLY, Tools

ALL = None  # every tool
ROLES = {
    "planner": ("Plan the work: read the code, list concrete steps and risks. Do not change files.", READ_ONLY, 15),
    "coder": ("Implement the change with small, correct patch edits, then run the relevant tests.", ALL, 30),
    "tester": ("Write or extend tests that prove the change works and catch regressions; run them.", ALL, 25),
    "debugger": ("Find the root cause of the failure from evidence (errors, logs, tests) and fix it minimally.", ALL, 30),
    "reviewer": ("Review the current changes for bugs, missed cases and broken callers. Report; do not edit.",
                 READ_ONLY + ["check", "run_command"], 15),
    "security": ("Look for security problems: injection, secrets in code, unsafe input handling, path traversal, "
                 "weak auth. Report concrete findings with file:line; fix only if asked.", READ_ONLY + ["check"], 15),
    "researcher": ("Answer the question from the code and the web. Cite files and URLs. Do not edit.", READ_ONLY, 15),
    "docs": ("Update documentation (README, docstrings, comments) to match the code. Keep it short and correct.",
             ALL, 20),
    "devops": ("Handle build, CI, packaging and scripts. Never push or publish; leave that to the user.", ALL, 25),
}
SUPERVISOR = """You are the Supervisor of a team of coding agents. Split the user's task into a few
(1-6) concrete subtasks for these roles: {roles}.
Rules: give each subtask the files it will change ("files"); subtasks that touch the same files must
depend on each other; use "depends_on" for order; prefer few tasks; a tester or reviewer task usually
depends on the coding tasks. "context" is "isolated" (fresh context, gets handoffs) or "forked" (sees
this planning conversation too).
Reply with JSON only:
{{"tasks": [{{"id": "t1", "role": "coder", "title": "...", "detail": "...", "files": ["a.py"],
  "depends_on": [], "context": "isolated"}}]}}"""

BOARD = """
CREATE TABLE IF NOT EXISTS board (
  run_id TEXT, id TEXT, role TEXT, title TEXT, detail TEXT, files TEXT, depends_on TEXT,
  context TEXT, status TEXT DEFAULT 'pending', worktree TEXT, handoff TEXT, started REAL, finished REAL,
  PRIMARY KEY (run_id, id)
);
"""


def load_roles(ws=None, trusted_ws=False):
    """{name: {"prompt", "tools", "max_steps", "context", "description"}}."""
    roles = {n: {"prompt": p, "tools": t, "max_steps": s, "context": "isolated", "description": p.split(".")[0]}
             for n, (p, t, s) in ROLES.items()}
    dirs = [os.path.join(edith_home(), "agents")]
    plugins = os.path.join(edith_home(), "plugins")
    if os.path.isdir(plugins):
        dirs += [os.path.join(plugins, p, "agents") for p in sorted(os.listdir(plugins))]
    if ws and trusted_ws:
        dirs.append(os.path.join(ws, ".edith", "agents"))
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.endswith(".md"):
                with open(os.path.join(d, f), errors="replace") as fh:
                    meta, body = _frontmatter(fh.read())
                name = meta.get("name") or f[:-3]
                tools = [t.strip() for t in meta["tools"].split(",")] if meta.get("tools") else ALL
                roles[name] = {"prompt": body.strip(), "tools": tools, "max_steps": int(meta.get("max_steps", 25)),
                               "context": meta.get("context", "isolated"), "description": meta.get("description", "")}
    return roles


def handoff(frm, to, task_id, summary, files, evidence, questions=()):
    """The one message format agents use to pass work on."""
    return {"from": frm, "to": to, "task_id": task_id, "summary": summary[:3000], "files_changed": list(files),
            "evidence": evidence, "open_questions": list(questions)}


# --- git helpers -------------------------------------------------------------

def _git(ws, *args, env=None, check=False):
    p = subprocess.run(["git", *args], cwd=ws, capture_output=True, text=True, env=env, timeout=120)
    if check and p.returncode:
        raise RuntimeError(f"git {' '.join(args)}: {p.stderr.strip()[:300]}")
    return p


def is_git(ws):
    return _git(ws, "rev-parse", "--is-inside-work-tree").stdout.strip() == "true"


def snapshot_commit(ws):
    """A commit of the whole work tree (tracked + untracked, minus ignored) made with a
    temporary index, so the user's index, branch and files stay untouched."""
    fd, index = tempfile.mkstemp(prefix="edith-index-")
    os.close(fd)
    os.remove(index)
    env = {**os.environ, "GIT_INDEX_FILE": index}
    try:
        _git(ws, "add", "-A", env=env, check=True)
        tree = _git(ws, "write-tree", env=env, check=True).stdout.strip()
        parent = _git(ws, "rev-parse", "--verify", "-q", "HEAD").stdout.strip()
        args = ["commit-tree", tree, "-m", "edith snapshot"] + (["-p", parent] if parent else [])
        cenv = {**env, "GIT_AUTHOR_NAME": "edith", "GIT_AUTHOR_EMAIL": "edith@localhost",
                "GIT_COMMITTER_NAME": "edith", "GIT_COMMITTER_EMAIL": "edith@localhost"}
        return _git(ws, *args, env=cenv, check=True).stdout.strip()
    finally:
        if os.path.exists(index):
            os.remove(index)


# --- supervisor --------------------------------------------------------------

class Team:
    def __init__(self, con, make_brain, make_tools, ws, log=print, hooks=None, memory=None, settings=None,
                 parallel=True, max_tasks=6, agent_kwargs=None):
        """make_brain() -> a fresh Router/Fixed per agent; make_tools(path, allow_mode) -> Tools."""
        self.con, self.make_brain, self.make_tools = con, make_brain, make_tools
        self.ws, self.log, self.hooks, self.memory = os.path.realpath(ws), log, hooks, memory
        self.settings = settings or {}
        self.parallel, self.max_tasks = parallel, max_tasks
        self.agent_kwargs = agent_kwargs or {}
        self.roles = load_roles(self.ws, self.settings.get("trusted_workspace", False))
        self.run_id = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
        self.diffs = []
        con.executescript(BOARD)

    # --- board ---
    def _put(self, t):
        self.con.execute("INSERT OR REPLACE INTO board (run_id, id, role, title, detail, files, depends_on, context, status) "
                         "VALUES (?,?,?,?,?,?,?,?,?)", (self.run_id, t["id"], t["role"], t["title"], t["detail"],
                                                        json.dumps(t["files"]), json.dumps(t["depends_on"]),
                                                        t["context"], "pending"))
        self.con.commit()

    def _set(self, tid, **kw):
        cols = ", ".join(f"{k}=?" for k in kw)
        self.con.execute(f"UPDATE board SET {cols} WHERE run_id=? AND id=?",
                         (*[json.dumps(v) if isinstance(v, (dict, list)) else v for v in kw.values()], self.run_id, tid))
        self.con.commit()

    def board(self):
        return [dict(r) for r in self.con.execute("SELECT * FROM board WHERE run_id=? ORDER BY rowid", (self.run_id,))]

    # --- planning ---
    async def plan(self, task):
        brain = self.make_brain()
        sys_msg = SUPERVISOR.format(roles=", ".join(f"{n} ({r['description'][:60]})" for n, r in self.roles.items()))
        self.planning = [Message("system", sys_msg), Message("user", task)]
        try:
            resp = await brain.chat(self.planning, [], task_type="plan")
            self.planning.append(resp.message)
            data = parse_args(resp.message.content)
        except Exception as e:  # noqa: BLE001 - a failed plan falls back to one coder
            self.log(f"  supervisor: planning failed ({e}); using a single coder task")
            data = {}
        tasks = self._validate(data.get("tasks"), task)
        for t in tasks:
            self._put(t)
        self.log("  supervisor plan:\n" + "\n".join(
            f"    {t['id']} [{t['role']}] {t['title']}  files={t['files']} after={t['depends_on']}" for t in tasks))
        return tasks

    def _validate(self, tasks, task):
        out, ids = [], set()
        for i, t in enumerate(tasks or []):
            if not isinstance(t, dict) or len(out) >= self.max_tasks:
                continue
            tid = re.sub(r"\W", "", str(t.get("id") or f"t{i + 1}"))[:20] or f"t{i + 1}"
            if tid in ids:
                tid = f"{tid}_{i}"
            role = t.get("role") if t.get("role") in self.roles else "coder"
            files = [str(f) for f in t.get("files") or [] if isinstance(f, str)][:20]
            out.append({"id": tid, "role": role, "title": str(t.get("title") or role)[:200],
                        "detail": str(t.get("detail") or t.get("title") or "")[:4000], "files": files,
                        "depends_on": [str(d) for d in t.get("depends_on") or []],
                        "context": "forked" if t.get("context") == "forked" else "isolated"})
            ids.add(tid)
        for t in out:  # drop unknown dependencies and cycles to earlier-or-self tasks only
            t["depends_on"] = [d for d in t["depends_on"] if d in ids and d != t["id"]]
        if not out:
            out = [{"id": "t1", "role": "coder", "title": "Do the task", "detail": task, "files": [],
                    "depends_on": [], "context": "isolated"}]
        return out

    # --- execution ---
    def _waves(self, tasks):
        done, waves, left = set(), [], list(tasks)
        while left:
            ready = [t for t in left if set(t["depends_on"]) <= done]
            if not ready:  # a dependency cycle: run the rest one by one
                ready = left[:1]
            wave, locked = [], set()
            for t in ready:  # tasks that declare the same file wait for the next wave
                if locked & set(t["files"]):
                    continue
                wave.append(t)
                locked |= set(t["files"])
            waves.append(wave)
            done |= {t["id"] for t in wave}
            left = [t for t in left if t["id"] not in done]
        return waves

    async def run(self, task):
        """Plan, run every wave, then verify and review the merged result. Returns a summary dict."""
        from . import verify
        git = is_git(self.ws)
        start = snapshot_commit(self.ws) if git else None
        tasks = await self.plan(task)
        handoffs = {}
        use_git = self.parallel and git
        if self.parallel and not use_git:
            self.log("  supervisor: workspace is not a git repo, running tasks one by one")
        for wave in self._waves(tasks):
            if use_git and len(wave) > 1:
                base = snapshot_commit(self.ws)
                results = await asyncio.gather(*(self._run_in_worktree(t, base, handoffs) for t in wave))
                for t, (res, patch) in zip(wave, results):
                    await self._merge(t, res, patch, handoffs)
            else:
                for t in wave:
                    res = await self._run_agent(t, self.ws, handoffs)
                    self.diffs.append(res.get("diff", ""))
                    self._finish(t, res, handoffs)
        tools = self.make_tools(self.ws, ALL)
        ok, report, checks = await asyncio.to_thread(verify.run_checks, tools, self.ws)
        if not ok:  # one repair round on the merged result
            self.log("  supervisor: final checks failed; sending a debugger")
            fix = {"id": "fix", "role": "debugger", "title": "Fix the failing checks after merging",
                   "detail": f"The team's merged changes fail these checks:\n{report[-6000:]}", "files": [],
                   "depends_on": [t["id"] for t in tasks], "context": "isolated"}
            self._put(fix)
            self._finish(fix, await self._run_agent(fix, self.ws, handoffs), handoffs)
            ok, report, checks = await asyncio.to_thread(verify.run_checks, tools, self.ws)
        diff = _git(self.ws, "diff", start, snapshot_commit(self.ws)).stdout if git else "".join(self.diffs)
        review = await verify.review(self.make_brain(), task, diff, report, [])
        board = self.board()
        lines = [f"# E.D.I.T.H. team report {self.run_id}", f"task: {task}", "", "## Board"]
        lines += [f"- {b['id']} [{b['role']}] {b['status']}: {b['title']}" for b in board]
        lines += ["", "## Final checks"] + ([f"- [{'PASS' if c['passed'] else 'FAIL'}] {c['check']}: `{c['command']}`"
                                             for c in checks] or ["- none detected"])
        lines += ["", f"## Review by {review.get('model')}: {review.get('verdict')}"] + [f"- {i}" for i in review["issues"]]
        out_dir = os.path.join(edith_home(), "teams", self.run_id)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "report.md"), "w") as f:
            f.write("\n".join(lines) + "\n")
        with open(os.path.join(out_dir, "diff.patch"), "w") as f:
            f.write(diff)
        self.log("\n".join(lines))
        return {"run_id": self.run_id, "board": board, "handoffs": handoffs, "checks_passed": ok, "checks": checks,
                "review": review, "diff": diff, "done": ok and all(b["status"] == "done" for b in board)}

    def _prompt(self, t, handoffs):
        deps = [handoffs[d] for d in t["depends_on"] if d in handoffs]
        text = f"Your subtask ({t['role']}): {t['title']}\n\n{t['detail']}"
        if t["files"]:
            text += f"\n\nFiles you are expected to change: {', '.join(t['files'])}"
        if deps:
            text += "\n\nHandoffs from earlier agents (JSON):\n" + json.dumps(deps, indent=1)[:8000]
        return text

    async def _run_agent(self, t, path, handoffs):
        from .loop import Agent
        role = self.roles[t["role"]]
        self._set(t["id"], status="running", started=time.time(), worktree=path if path != self.ws else None)
        if self.hooks:
            h = self.hooks.fire("subagent_start", {"task": t, "role": t["role"]}, t["role"])
            if h["block"]:
                return {"done": False, "status": "blocked", "answer": h["block"], "evidence": {"checks": []},
                        "files": []}
        tools = self.make_tools(path, role["tools"])
        tools.git_read_only = role["tools"] is not ALL and "edit_file" not in role["tools"]
        agent = Agent(self.make_brain(), tools, log=lambda s, tid=t["id"]: self.log(f"  [{tid}] {s}"),
                      memory=self.memory, hooks=self.hooks, settings=self.settings, role=role["prompt"],
                      tool_allow=None if role["tools"] is ALL else set(role["tools"]) | {"todo", "remember", "load_skill"},
                      max_steps=role["max_steps"], review_changes=False,
                      # the supervisor verifies the merged result; inside a worktree other parts may be unfinished
                      verify_changes=t["role"] == "debugger", **self.agent_kwargs)
        history = None
        if t["context"] == "forked" and getattr(self, "planning", None):
            history = [Message("system", "")] + self.planning[1:] + [Message("user", self._prompt(t, handoffs))]
        res = await agent.run(self._prompt(t, handoffs), history=history)
        res["files"] = agent.session.changed_files()
        if self.hooks:
            self.hooks.fire("subagent_stop", {"task_id": t["id"], "status": res["status"]}, t["role"])
        return res

    async def _run_in_worktree(self, t, base, handoffs):
        path = os.path.join(edith_home(), "worktrees", f"{self.run_id}-{t['id']}")
        _git(self.ws, "worktree", "add", "--detach", path, base, check=True)
        try:
            res = await self._run_agent(t, path, handoffs)
            after = snapshot_commit(path)
            patch = _git(path, "diff", "--binary", base, after).stdout
            return res, patch
        finally:
            _git(self.ws, "worktree", "remove", "--force", path)
            shutil.rmtree(path, ignore_errors=True)

    async def _merge(self, t, res, patch, handoffs):
        if patch.strip():
            fd, pf = tempfile.mkstemp(suffix=".patch")
            with os.fdopen(fd, "w") as f:
                f.write(patch)
            p = _git(self.ws, "apply", "--whitespace=nowarn", pf)
            os.remove(pf)
            if p.returncode:
                self.log(f"  supervisor: {t['id']} conflicts with work merged before it; re-running it on the merged tree")
                self._set(t["id"], status="conflict")
                t2 = dict(t, detail=t["detail"] + "\n\nAnother agent changed the same code first. Redo your part on top "
                                                  "of the current files. Your first attempt, for reference:\n" + patch[-6000:])
                res = await self._run_agent(t2, self.ws, handoffs)
        self._finish(t, res, handoffs)

    def _finish(self, t, res, handoffs):
        files = res.get("files") or []
        h = handoff(t["role"], "supervisor", t["id"], res.get("answer", ""), files,
                    [f"{c['check']}: {'pass' if c['passed'] else 'FAIL'}" for c in res.get("evidence", {}).get("checks", [])],
                    [] if res.get("done") else [f"stopped: {res.get('answer', '')[:300]}"])
        handoffs[t["id"]] = h
        self._set(t["id"], status="done" if res.get("done") else "failed", finished=time.time(), handoff=h)
