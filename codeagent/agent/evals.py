"""Benchmark: evals/tasks/<name>/{task.md, repo/, hidden_test.(py|js), meta.json}.

Each task runs on a fresh copy of its repo; afterwards the hidden test
(never shown to the agent) decides pass/fail. Reports go to reports/ and
can be compared with an earlier run to see if a change made E.D.I.T.H.
better or worse.

`--oracle` replays each task's reference solution instead of a model: it
checks the harness and the graders, not model quality."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

from .config import ROOT
from .messages import Message, Response, ToolCall, Usage

TASKS_DIR = os.path.join(ROOT, "evals", "tasks")
REPORTS = os.path.join(ROOT, "reports")


def load_tasks(names=None):
    out = []
    for name in sorted(os.listdir(TASKS_DIR)):
        if names and name not in names:
            continue
        d = os.path.join(TASKS_DIR, name)
        with open(os.path.join(d, "meta.json")) as f:
            meta = json.load(f)
        with open(os.path.join(d, "task.md")) as f:
            text = f.read().strip()
        out.append({"name": name, "dir": d, "text": text, **meta})
    return out


def grade(task, ws, timeout=None):
    """Runs the hidden test inside the workspace copy. Returns (passed, output)."""
    timeout = timeout or task.get("timeout", 30)  # meta.json may lower it, e.g. for a bug that loops forever
    js = task["grader"] == "node"
    hidden = "hidden_test.js" if js else "hidden_test.py"
    shutil.copy(os.path.join(task["dir"], hidden), os.path.join(ws, hidden))
    cmd = ["node", hidden] if js else [sys.executable, "-m", "unittest", "-q", "hidden_test"]
    try:
        p = subprocess.run(cmd, cwd=ws, capture_output=True, text=True, timeout=timeout)
        return p.returncode == 0, (p.stdout + p.stderr)[-1500:]
    except subprocess.TimeoutExpired:
        return False, f"grader timed out after {timeout}s"
    finally:
        os.remove(os.path.join(ws, hidden))


class Oracle:
    """A 'model' that types in the reference solution (harness check only)."""

    session_cost_usd = 0.0

    def __init__(self, task):
        self.edits = task["solution"]

    async def chat(self, history, tools, task_type=None, escalate=False, avoid_family=None):
        if not tools:
            msg = Message("assistant", '{"verdict": "approve", "issues": []}')
        else:
            n = sum(1 for m in history if m.role == "tool")
            if n < len(self.edits):
                e = self.edits[n]
                call = ToolCall(f"o{n}", "edit_file", {"path": e["path"], "old": e["old"], "new": e["new"]})
                msg = Message("assistant", "", [call])
            else:
                msg = Message("assistant", "Applied the reference solution.")
        return Response(msg, "stop", Usage(len(str(history)) // 4, 20), "oracle", "reference")


class Noop:
    """A 'model' that changes nothing: every grader must fail against it."""

    session_cost_usd = 0.0

    async def chat(self, history, tools, task_type=None, escalate=False, avoid_family=None):
        return Response(Message("assistant", "I made no changes."), "stop", Usage(), "noop", "none")


async def run_all(tasks, make_run, log=print):
    """make_run(task, ws) -> async run(task_text) -> result dict. Returns per-task rows."""
    rows = []
    for t in tasks:
        ws = tempfile.mkdtemp(prefix=f"edith-eval-{t['name']}-")
        shutil.copytree(os.path.join(t["dir"], "repo"), ws, dirs_exist_ok=True)
        t0 = time.monotonic()
        try:
            run = make_run(t, ws)
            res = await run(t["text"])
            err = None
        except Exception as e:  # noqa: BLE001 - one broken task must not end the benchmark
            res, err = {}, f"{type(e).__name__}: {e}"
        seconds = round(time.monotonic() - t0, 1)
        passed, out = grade(t, ws)
        rows.append({"task": t["name"], "kind": t["kind"], "passed": passed, "agent_status": res.get("status", "error"),
                     "steps": res.get("steps"), "input_tokens": res.get("input_tokens", 0),
                     "output_tokens": res.get("output_tokens", 0), "seconds": seconds,
                     "session": res.get("session"), "error": err, "grader_output": None if passed else out[-600:]})
        log(f"{'PASS' if passed else 'FAIL'} {t['name']:22} {seconds:6.1f}s steps={res.get('steps')} "
            f"tokens={res.get('input_tokens', 0)}+{res.get('output_tokens', 0)}" + (f" error={err}" if err else ""))
        shutil.rmtree(ws, ignore_errors=True)
    return rows


def summary(rows):
    n = len(rows) or 1
    return {"tasks": len(rows), "passed": sum(r["passed"] for r in rows),
            "pass_rate": round(sum(r["passed"] for r in rows) / n, 3),
            "tokens": sum(r["input_tokens"] + r["output_tokens"] for r in rows),
            "seconds": round(sum(r["seconds"] for r in rows), 1)}


def compare(old, new):
    """Per-task changes and a verdict: better / worse / same."""
    o = {r["task"]: r["passed"] for r in old["rows"]}
    n = {r["task"]: r["passed"] for r in new["rows"]}
    common = sorted(set(o) & set(n))
    fixed = [t for t in common if n[t] and not o[t]]
    regressed = [t for t in common if o[t] and not n[t]]
    so, sn = summary([r for r in old["rows"] if r["task"] in common]), summary([r for r in new["rows"] if r["task"] in common])
    if len(fixed) != len(regressed):
        verdict = "better" if len(fixed) > len(regressed) else "worse"
    elif sn["tokens"] < so["tokens"] * 0.9:
        verdict = "better (same results, fewer tokens)"
    elif sn["tokens"] > so["tokens"] * 1.1:
        verdict = "worse (same results, more tokens)"
    else:
        verdict = "same"
    return {"verdict": verdict, "fixed": fixed, "regressed": regressed, "old": so, "new": sn}


def save(rows, label, meta):
    os.makedirs(REPORTS, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    data = {"label": label, "date": stamp, **meta, "summary": summary(rows), "rows": rows}
    base = os.path.join(REPORTS, f"eval-{stamp}-{label}")
    with open(base + ".json", "w") as f:
        json.dump(data, f, indent=1)
    s = data["summary"]
    lines = [f"# Eval {label} ({stamp})", "", f"brain: {meta.get('brain')}", "",
             f"**{s['passed']}/{s['tasks']} passed** ({s['pass_rate']:.0%}), {s['tokens']} tokens, {s['seconds']} s", "",
             "| task | kind | result | agent | steps | tokens | seconds |", "|---|---|---|---|---|---|---|"]
    lines += [f"| {r['task']} | {r['kind']} | {'PASS' if r['passed'] else 'FAIL'} | {r['agent_status']} | {r['steps']} | "
              f"{r['input_tokens'] + r['output_tokens']} | {r['seconds']} |" for r in rows]
    with open(base + ".md", "w") as f:
        f.write("\n".join(lines) + "\n")
    return base + ".json", data


def latest(label=None, exclude=None):
    if not os.path.isdir(REPORTS):
        return None
    files = sorted(f for f in os.listdir(REPORTS) if f.startswith("eval-") and f.endswith(".json")
                   and (not label or f.endswith(f"-{label}.json")))
    files = [f for f in files if os.path.join(REPORTS, f) != exclude]
    return os.path.join(REPORTS, files[-1]) if files else None
