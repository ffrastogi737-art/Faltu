"""Lifecycle hooks: deterministic rules run by the harness, not the model.

settings.yaml:
  hooks:
    - event: before_tool          # see EVENTS
      match: run_command          # optional regex on the tool name
      command: ./check.sh         # gets the event as JSON on stdin
    - event: before_tool
      match: write_file
      block: "no new files in this repo"   # built-in rule, no command

A command hook decides through its exit code and stdout:
  exit 2            -> block; stderr is the reason given to the model
  exit 0 + JSON     -> {"decision": "block"|"allow", "reason": "...",
                        "arguments": {...},   # before_tool: replace the tool arguments
                        "context": "..."}     # text added for the model to see
  anything else     -> logged and ignored (a broken hook never stops the agent)"""
import json
import re
import subprocess

EVENTS = {"session_start", "session_end", "before_tool", "after_tool", "before_model", "after_model",
          "permission_request", "subagent_start", "subagent_stop", "compaction"}


class Hooks:
    def __init__(self, specs=(), cwd=".", env=None, log=print):
        self.specs = [h for h in specs if h.get("event") in EVENTS]
        self.cwd, self.env, self.log = cwd, env, log
        for h in specs:
            if h.get("event") not in EVENTS:
                log(f"hook ignored: unknown event {h.get('event')!r}")

    def fire(self, event, payload, name=""):
        """Returns {"block": reason|None, "allow": bool, "arguments": dict|None, "context": [str]}."""
        out = {"block": None, "allow": False, "arguments": None, "context": []}
        for h in self.specs:
            if h["event"] != event or (h.get("match") and not re.search(h["match"], name or "")):
                continue
            if "block" in h:
                out["block"] = str(h["block"])
                return out
            try:
                p = subprocess.run(h["command"], shell=True, cwd=self.cwd, env=self.env, text=True,
                                   input=json.dumps({"event": event, "name": name, **payload}, default=str),
                                   capture_output=True, timeout=int(h.get("timeout", 30)))
            except (subprocess.TimeoutExpired, OSError) as e:
                self.log(f"hook {h['command']!r} failed: {e}")
                continue
            if p.returncode == 2:
                out["block"] = (p.stderr.strip() or "blocked by hook")[:500]
                return out
            if p.returncode != 0:
                self.log(f"hook {h['command']!r} exited {p.returncode}: {p.stderr.strip()[:200]}")
                continue
            try:
                d = json.loads(p.stdout) if p.stdout.strip() else {}
            except json.JSONDecodeError:
                d = {"context": p.stdout.strip()}
            if d.get("decision") == "block":
                out["block"] = d.get("reason") or "blocked by hook"
                return out
            out["allow"] = out["allow"] or d.get("decision") == "allow"
            if isinstance(d.get("arguments"), dict):
                out["arguments"] = d["arguments"]
            if d.get("context"):
                out["context"].append(str(d["context"])[:2000])
        return out
