"""Agent loop: compose context -> ask the model -> run tools (with hooks and
permissions) -> observe -> verify -> review -> report. Stops on a final
answer that passed verification, or on a step/time/cost cap, a doom loop
or an interrupt; every stop writes a report."""
import asyncio
import json
import os
import shutil
import time

from . import context, verify
from .messages import Message, ProviderError
from .router import AllFailed
from .session import Session, to_dict
from .tools import SCHEMAS, ToolError, schemas

CONTEXT_ERR = ("context", "too long", "maximum context", "token limit", "too many tokens", "prompt is too long")

TODO_TOOL = {"name": "todo", "read_only": True,
             "description": "Replace your todo list (shown to you every step). Use it for multi-step tasks.",
             "parameters": {"type": "object", "required": ["items"], "properties": {"items": {
                 "type": "array", "items": {"type": "object", "properties": {
                     "text": {"type": "string"}, "done": {"type": "boolean"}}}}}}}
REMEMBER_TOOL = {"name": "remember", "read_only": True,
                 "description": "Save a short lesson for future sessions (a pitfall, a project fact, a fix that worked).",
                 "parameters": {"type": "object", "required": ["lesson"], "properties": {
                     "lesson": {"type": "string"}, "tags": {"type": "string"}}}}
SKILL_TOOL = {"name": "load_skill", "read_only": True, "description": "Read the full instructions of a listed skill.",
              "parameters": {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}}


def _is_context_error(e):
    s = str(e).lower()
    return getattr(e, "status", 0) in (400, 413) and any(k in s for k in CONTEXT_ERR)


class Agent:
    def __init__(self, brain, tools, log=print, session=None, memory=None, hooks=None, settings=None,
                 max_steps=30, max_seconds=900, max_cost_usd=None, redact=lambda s: s, verify_changes=True,
                 review_changes=True, context_budget=32000, role=None, tool_allow=None, extra_tools=()):
        self.brain, self.tools, self.log, self.memory, self.hooks = brain, tools, log, memory, hooks
        self.session = session
        self.max_steps, self.max_seconds, self.max_cost_usd = max_steps, max_seconds, max_cost_usd
        self.redact, self.verify_changes, self.review_changes = redact, verify_changes, review_changes
        self.role, self.tool_allow = role, tool_allow
        self.compactor = context.Compactor(context_budget, log, hooks)
        self.settings = settings or {}
        self.skills = context.find_skills(tools.ws, self.settings.get("trusted_workspace", False))
        self.extra_specs = list(extra_tools)
        self.lessons = []
        self.todo = []
        self.usage = [0, 0]
        self.task = ""
        self.evidence = {"checks": [], "review": None}

    # --- tools that live outside Tools ---
    def _extras(self):
        specs = [TODO_TOOL]
        self.tools.extra["todo"] = self._todo
        if self.memory:
            specs.append(REMEMBER_TOOL)
            self.tools.extra["remember"] = lambda lesson, tags="": self.memory.remember(lesson, tags, self._project())
        if self.skills:
            specs.append(SKILL_TOOL)
            self.tools.extra["load_skill"] = lambda name: context.load_skill(self.skills, name)
        return specs + self.extra_specs

    def _project(self):
        return self.tools.ws.rstrip("/").rsplit("/", 1)[-1]

    def _todo(self, items):
        self.todo = [{"text": str(i.get("text", ""))[:200], "done": bool(i.get("done"))} for i in items][:30]
        self.session.event("todo", items=self.todo)
        return f"todo list has {len(self.todo)} items"

    def _system(self, reminders=()):
        return Message("system", context.compose(self.tools.ws, self.tools.mode, self.lessons, self.skills,
                                                 self.todo, extra_tools=getattr(self, "mcp_catalog", ()),
                                                 role=self.role, reminders=reminders))

    # --- main ---
    async def run(self, task=None, history=None):
        """New task, or continue `history` (resume)."""
        s = self.session or Session(workspace=self.tools.ws, task=task or "", mode=self.tools.mode)
        self.session = s
        self.tools.on_edit = s.snapshot
        self.todo = list(s.todo)
        if history:
            self.history = history
            task = next((m.content for m in history if m.role == "user"), "")
        else:
            self.history = [Message("system", ""), Message("user", task)]
            s.message(self.history[1])
        self.task = task
        if self.memory and task:
            self.lessons = self.memory.recall(task, project=self._project())
        self.history[0] = self._system()
        if self.hooks:
            h = self.hooks.fire("session_start", {"task": task, "session": s.id})
            if h["block"]:
                return self._end("blocked", f"session blocked by hook: {h['block']}")
            for c in h["context"]:
                self.history.append(Message("user", f"[hook] {c}"))
        try:
            return await self._loop()
        except (KeyboardInterrupt, asyncio.CancelledError):
            return self._end("interrupted", f"interrupted; resume with `edith resume {s.id}`")

    async def _loop(self):
        specs = schemas(self.tools.mode, self.tool_allow, self._extras())
        allowed = {t["name"] for t in specs}
        last_fail, streak = None, 0
        edited, failed_checks, verify_rounds, review_rounds = bool(self.session.changed_files()), 0, 0, 0
        started = time.monotonic()
        first_step = self.session.step + 1
        for step in range(first_step, first_step + self.max_steps):
            self.session.step = step
            if time.monotonic() - started > self.max_seconds:
                return self._end("stopped", f"time cap {self.max_seconds}s reached")
            if self.max_cost_usd is not None and self.brain.session_cost_usd >= self.max_cost_usd:
                return self._end("stopped", f"cost cap ${self.max_cost_usd} reached")
            reminders = []
            self.history, note, compacted = await self.compactor.maybe(self.history, self.brain)
            if note:
                reminders.append(note)
            if compacted:
                self.session.event("compaction", history=[to_dict(m) for m in self.history])
            if self.hooks:
                reminders += self.hooks.fire("before_model", {"step": step, "messages": len(self.history)})["context"]
            self.history[0] = self._system(reminders)  # re-reads project memory files from disk
            resp = await self._ask(specs, failed_checks >= 2)
            if isinstance(resp, dict):
                return resp
            self.usage[0] += resp.usage.input_tokens
            self.usage[1] += resp.usage.output_tokens
            self.history.append(resp.message)
            self.session.message(resp.message)
            if resp.message.content:
                self.log(f"[{step}] {resp.provider}/{resp.model}: {self.redact(resp.message.content.strip())}")
            if self.hooks:
                self.hooks.fire("after_model", {"step": step, "content": resp.message.content[:4000],
                                                "tool_calls": [t.name for t in resp.message.tool_calls]})

            if not resp.message.tool_calls:
                if verify_rounds >= 3 and self.evidence["checks"] and not all(c["passed"] for c in self.evidence["checks"]):
                    return self._end("stopped", "verification still failing after 3 rounds; see the report. "
                                                f"Last answer: {resp.message.content[:500]}")
                if edited and self.verify_changes and self.tools.mode != "plan" and verify_rounds < 3:
                    verify_rounds += 1
                    ok, report, results = await asyncio.to_thread(verify.run_checks, self.tools, self.tools.ws)
                    self.evidence["checks"] = results
                    self.log(f"  verify: {'all checks passed' if ok else 'checks FAILED'} "
                             f"({', '.join(r['check'] + ('=ok' if r['passed'] else '=FAIL') for r in results) or 'none found'})")
                    if not ok:
                        failed_checks += 1
                        self._feedback(f"Verification failed. Fix the problems, then finish again.\n\n{report[-6000:]}")
                        continue
                    if self.review_changes and review_rounds < 1:
                        review_rounds += 1
                        coder = getattr(self.brain, "switches", None) or [(resp.provider, resp.model)]
                        v = await verify.review(self.brain, self.task, self.session.diff(), report, coder)
                        self.evidence["review"] = v
                        self.log(f"  review by {v.get('model')}: {v.get('verdict')}"
                                 + (f" ({len(v['issues'])} issues)" if v.get("issues") else ""))
                        if v.get("verdict") == "changes" and v.get("issues"):
                            self._feedback("A reviewer found problems. Fix the real ones (explain if you disagree), "
                                           "verify again, then finish.\n- " + "\n- ".join(map(str, v["issues"][:10])))
                            continue
                return self._end("done", resp.message.content or "(empty answer)")

            for call in resp.message.tool_calls:
                result, ok = await self._run_tool(call, allowed)
                self.history.append(Message("tool", result, tool_call_id=call.id))
                self.session.message(self.history[-1])
                if call.name in ("edit_file", "write_file") and ok and result.startswith(("edited", "created")):
                    edited = True
                if call.name == "run_command" and edited:
                    failed_checks = 0 if ok else failed_checks + 1
                key = (call.name, json.dumps(call.arguments, sort_keys=True))
                last_fail, streak = (None, 0) if ok else (key, streak + 1 if key == last_fail else 1)
                if streak >= 3:
                    return self._end("stopped", f"doom loop: `{call.name}` failed 3 times with the same arguments. "
                                                f"Last error: {result[:300]}. Change approach or ask the user.")
        return self._end("stopped", f"step cap {self.max_steps} reached")

    async def _ask(self, specs, escalate):
        """One model call; a context-length error forces compaction and one retry."""
        for attempt in range(2):
            try:
                return await self.brain.chat(self.history, specs, escalate=escalate)
            except (ProviderError, AllFailed) as e:
                if attempt == 0 and (_is_context_error(e) or (isinstance(e, AllFailed) and "context" in str(e).lower())):
                    self.log("  context too long: forcing compaction and retrying")
                    self.history, _, _ = await self.compactor.maybe(self.history, self.brain, force=True)
                    self.session.event("compaction", history=[to_dict(m) for m in self.history], forced=True)
                    self.history[0] = self._system()
                    continue
                return self._end("stopped", self.redact(str(e)))
        return self._end("stopped", "context still too long after compaction")

    async def _run_tool(self, call, allowed):
        args = call.arguments
        self.log(f"[{self.session.step}] tool {call.name} {self.redact(json.dumps(args))[:200]}")
        if self.hooks and "_error" not in args:
            h = self.hooks.fire("before_tool", {"tool": call.name, "arguments": args}, call.name)
            if h["block"]:
                self.log(f"      blocked by hook: {h['block']}")
                return f"error: blocked by a hook rule: {h['block']}", False
            if h["arguments"] is not None:
                args = h["arguments"]
        # in a thread, so parallel agents keep working while one runs a long command
        result, ok = await asyncio.to_thread(_call, self.tools, allowed, call.name, args)
        result = self.redact(result)
        if call.name == "screenshot" and ok:  # keep a copy with the session's evidence
            try:
                src = self.tools._path(args.get("path") or "screenshot.png")
                shutil.copy2(src, os.path.join(self.session.dir, "artifacts", f"step{self.session.step}-" +
                                               os.path.basename(src)))
            except (OSError, ToolError):
                pass
        if self.hooks:
            h = self.hooks.fire("after_tool", {"tool": call.name, "arguments": args, "result": result[:8000], "ok": ok},
                                call.name)
            if h["context"]:
                result += "\n[hook] " + "\n[hook] ".join(h["context"])
        self.log("      " + (result.splitlines()[0][:160] if result else ""))
        return result, ok

    def _feedback(self, text):
        self.history.append(Message("user", text))
        self.session.message(self.history[-1])

    def _end(self, status, text):
        s, usage = self.session, self.usage
        diff = s.diff()
        report = [f"# E.D.I.T.H. report: {status}", f"session: {s.id}", f"task: {self.task}", "",
                  "## Answer", text, "", "## Files changed", *([f"- {f}" for f in s.changed_files()] or ["- none"]),
                  "", "## Evidence"]
        for r in self.evidence["checks"]:
            report.append(f"- [{'PASS' if r['passed'] else 'FAIL'}] {r['check']}: `{r['command']}`")
        rv = self.evidence["review"]
        if rv:
            report.append(f"- review by {rv.get('model')}: {rv.get('verdict')}"
                          + ("" if rv.get("diverse", True) else " (same model family as the coder: no other was available)"))
            report += [f"  - {i}" for i in rv.get("issues", [])[:10]]
        if not self.evidence["checks"] and not rv:
            report.append("- no automatic checks ran" + ("" if diff else " (no files changed)"))
        used = sorted({p for p, _ in getattr(self.brain, "switches", [])})
        report += ["", f"tokens: {usage[0]} in, {usage[1]} out; cost ${getattr(self.brain, 'session_cost_usd', 0):.4f}"
                   + (f"; providers: {', '.join(used)}" if used else "")]
        s.artifact("report.md", "\n".join(report) + "\n")
        if self.tools.mode == "plan" and status == "done":
            s.artifact("plan.md", text + "\n")
        if diff:
            s.artifact("diff.patch", diff)
        if self.evidence["checks"]:
            s.artifact("test_report.txt", "\n\n".join(f"$ {r['command']}\n{r['output']}" for r in self.evidence["checks"]))
        if rv:
            s.artifact("review.json", json.dumps(rv, indent=1))
        s.event("end", status=status, reason=text[:2000])
        if self.hooks:
            self.hooks.fire("session_end", {"status": status, "session": s.id})
        if self.memory and self.memory.due():
            try:
                self.memory.dream()
            except Exception as e:  # noqa: BLE001 - curation must not break the session end
                self.log(f"  dream skipped: {e}")
        self.log(("\nDONE: " if status == "done" else f"\n{status.upper()}: ") + self.redact(text))
        self.log(f"tokens: {usage[0]} in, {usage[1]} out | report: {s.dir}/artifacts/report.md")
        return {"done": status == "done", "status": status, "answer": text, "steps": s.step, "input_tokens": usage[0],
                "output_tokens": usage[1], "session": s.id, "evidence": self.evidence, "diff": diff}


def _call(tools, allowed, name, args):
    if "_error" in args:
        return f"error: your tool arguments were not valid JSON: {args['_error'][:300]}", False
    if name not in allowed:
        return f"error: unknown or disallowed tool `{name}`; available: {', '.join(sorted(allowed))}", False
    try:
        if name in tools.extra:
            out = tools.extra[name](**args)
        else:
            known = SCHEMAS[name]["parameters"]["properties"]
            out = getattr(tools, name)(**{k: v for k, v in args.items() if k in known})
    except ToolError as e:
        return f"error: {e}", False
    except (OSError, TypeError, ValueError, KeyError) as e:
        return f"error: {type(e).__name__}: {e}", False
    out = str(out)
    # a non-zero exit is a failure for doom-loop counting, but still useful output
    return out, not out.startswith(("exit code ", "error")) or out.startswith("exit code 0\n")


async def run(task, brain, tools, **kw):
    """Convenience wrapper used by tests and simple callers."""
    return await Agent(brain, tools, **kw).run(task)
