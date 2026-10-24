"""Verification after changes, and the Reviewer agent.

detect() finds the project's own test/lint/type-check/build commands;
they run through Tools.run_command, so the normal permission rules apply.
The Reviewer is a separate model call, routed to a different model family
than the coder when possible, that tries to find what is wrong."""
import json
import os
import shutil
import sys

from .messages import Message
from .providers.repair import parse_args
from .router import family

REVIEWER = """You are a strict code reviewer. Another agent changed the code below to do a task.
Try to break it: wrong logic, missed cases, broken callers, security problems, tests that do not
really test the change. Judge only from the task, the diff and the check results.
Reply with JSON only: {"verdict": "approve" | "changes", "issues": ["...", ...]}.
Approve only if you found no real problem."""


def detect(ws):
    """[(label, command)] for checks this project supports."""
    has = lambda *p: os.path.exists(os.path.join(ws, *p))  # noqa: E731
    out = []
    py = sys.executable
    pyfiles = [f for f in os.listdir(ws) if f.endswith(".py")] if os.path.isdir(ws) else []
    if has("pyproject.toml") or has("setup.py") or has("pytest.ini") or pyfiles or has("tests"):
        if shutil.which("pytest") and (has("pytest.ini") or has("conftest.py") or _mentions(ws, "pyproject.toml", "pytest")):
            out.append(("tests", "pytest -q"))
        else:
            out.append(("tests", f"{py} -m unittest -q" + (" discover -s tests" if has("tests") else "")))
        if shutil.which("ruff"):
            out.append(("lint", "ruff check --output-format concise ."))
    if has("package.json"):
        try:
            with open(os.path.join(ws, "package.json")) as f:
                scripts = json.load(f).get("scripts") or {}
        except (OSError, ValueError):
            scripts = {}
        for name, label in (("test", "tests"), ("lint", "lint"), ("typecheck", "types"), ("build", "build")):
            if name in scripts:
                out.append((label, f"npm run -s {name}"))
        if "typecheck" not in scripts and has("tsconfig.json") and shutil.which("tsc"):
            out.append(("types", "tsc --noEmit"))
    if has("go.mod"):
        out += [("build", "go build ./..."), ("tests", "go test ./...")]
    if has("Cargo.toml"):
        out += [("tests", "cargo test -q")]
    return out


def _mentions(ws, name, word):
    try:
        with open(os.path.join(ws, name)) as f:
            return word in f.read()
    except OSError:
        return False


def run_checks(tools, ws):
    """Runs every detected check. Returns (all_passed, report_text, results)."""
    results = []
    for label, cmd in detect(ws):
        out = tools.run_command(cmd, timeout=600)
        ok = out.startswith("exit code 0\n")
        results.append({"check": label, "command": cmd, "passed": ok, "output": out[-2500:]})
    report = "\n\n".join(f"[{'PASS' if r['passed'] else 'FAIL'}] {r['check']}: {r['command']}\n{r['output']}"
                         for r in results)
    return all(r["passed"] for r in results), report or "no checks detected for this project", results


async def review(brain, task, diff, check_report, coder_models):
    """Returns {"verdict", "issues", "model"}; never raises."""
    fams = [family(p, m) for p, m in coder_models]
    avoid = max(set(fams), key=fams.count) if fams else None
    prompt = [Message("system", REVIEWER),
              Message("user", f"Task:\n{task[:3000]}\n\nDiff:\n{diff[-20000:] or '(no file changes)'}\n\n"
                              f"Check results:\n{check_report[-6000:]}")]
    try:
        resp = await brain.chat(prompt, [], task_type="review", avoid_family=avoid)
    except Exception as e:  # noqa: BLE001 - a missing reviewer must not lose the coder's work
        return {"verdict": "skipped", "issues": [f"reviewer unavailable: {e}"], "model": None}
    v = parse_args(resp.message.content)
    if v.get("verdict") not in ("approve", "changes"):
        text = resp.message.content.strip()
        # an answer we cannot read is never counted as an approval
        v = {"verdict": "changes" if text else "unclear", "issues": [text[:1500]] if text else
             ["reviewer gave no readable verdict"]}
    if not isinstance(v.get("issues"), list):
        v["issues"] = [str(v.get("issues"))] if v.get("issues") else []
    v["model"] = f"{resp.provider}/{resp.model}"
    v["diverse"] = avoid is None or family(resp.provider, resp.model) != avoid
    return v
