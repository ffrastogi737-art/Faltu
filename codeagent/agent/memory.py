"""Long-term memory: lessons in SQLite FTS5, recalled by relevance.
`dream()` reviews past sessions and curates the store: adds lessons from
failures, merges duplicates, retires stale entries and drafts skills from
repeated work. It runs automatically at most once a day (on session end)
and on demand with `edith dream`."""
import json
import os
import re
import time

from .config import edith_home

SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS lessons USING fts5(text, tags, project UNINDEXED, source UNINDEXED,
  created UNINDEXED, uses UNINDEXED);
CREATE TABLE IF NOT EXISTS memory_meta (key TEXT PRIMARY KEY, value TEXT);
"""
STOP = set("the a an and or to of in on for with is are was be this that it fix add make use".split())


class Memory:
    def __init__(self, con):
        self.con = con
        con.executescript(SCHEMA)

    def remember(self, text, tags="", project="", source="agent"):
        text = text.strip()[:1000]
        if not text:
            return "nothing to remember"
        dup = self.con.execute("SELECT rowid FROM lessons WHERE text = ?", (text,)).fetchone()
        if dup:
            return "already remembered"
        self.con.execute("INSERT INTO lessons VALUES (?,?,?,?,?,0)", (text, tags, project, source, time.time()))
        self.con.commit()
        return "remembered"

    def recall(self, query, project="", k=5):
        words = [w for w in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", query.lower()) if w not in STOP][:12]
        if not words:
            return []
        q = " OR ".join(f'"{w}"' for w in words)
        rows = self.con.execute(
            "SELECT rowid, text, project FROM lessons WHERE lessons MATCH ? ORDER BY "
            "(project = ?) DESC, rank LIMIT ?", (q, project, k)).fetchall()
        for r in rows:
            self.con.execute("UPDATE lessons SET uses = CAST(uses AS INTEGER) + 1 WHERE rowid = ?", (r[0],))
        self.con.commit()
        return [r[1] for r in rows]

    def all(self):
        return [dict(zip(("id", "text", "tags", "project", "source", "uses"), r)) for r in
                self.con.execute("SELECT rowid, text, tags, project, source, uses FROM lessons ORDER BY rowid")]

    def forget(self, rowid):
        self.con.execute("DELETE FROM lessons WHERE rowid = ?", (rowid,))
        self.con.commit()

    # --- dreaming ---
    def _meta(self, key, value=None):
        if value is None:
            r = self.con.execute("SELECT value FROM memory_meta WHERE key=?", (key,)).fetchone()
            return r[0] if r else None
        self.con.execute("INSERT OR REPLACE INTO memory_meta VALUES (?, ?)", (key, str(value)))
        self.con.commit()

    def due(self, hours=24):
        last = float(self._meta("last_dream") or 0)
        return time.time() - last > hours * 3600

    def dream(self, sessions_root=None, stale_days=120):
        """Deterministic curation pass. Returns a report dict."""
        root = sessions_root or os.path.join(edith_home(), "sessions")
        since = float(self._meta("last_dream") or 0)
        report = {"sessions": 0, "added": [], "merged": 0, "retired": 0, "skill_drafts": []}
        tool_errors, task_heads = {}, {}
        for sid in sorted(os.listdir(root)) if os.path.isdir(root) else []:
            path = os.path.join(root, sid, "log.jsonl")
            if not os.path.exists(path) or os.path.getmtime(path) < since:
                continue
            report["sessions"] += 1
            with open(path) as f:
                events = [json.loads(line) for line in f if line.strip()]
            meta = next((e for e in events if e["t"] == "meta"), {})
            project = os.path.basename(meta.get("workspace") or "")
            end = next((e for e in reversed(events) if e["t"] == "end"), None)
            if end and end.get("status") != "done":
                lesson = f"In {project}, a task stopped: {end.get('reason', '')[:200]} (task: {meta.get('task', '')[:120]})"
                if self.remember(lesson, "failure", project, f"dream:{sid}") == "remembered":
                    report["added"].append(lesson)
            for e in events:
                if e["t"] == "msg" and e["m"]["role"] == "tool" and e["m"]["content"].startswith("error:"):
                    key = re.sub(r"\d+", "N", e["m"]["content"][:80])
                    tool_errors[key] = tool_errors.get(key, 0) + 1
            if end and end.get("status") == "done":
                head = " ".join(meta.get("task", "").lower().split()[:3])
                task_heads.setdefault(head, []).append(meta.get("task", ""))
        for err, n in tool_errors.items():
            if n >= 3:
                lesson = f"Frequent tool error ({n}x): {err}. Read the file again and copy text exactly before editing."
                if self.remember(lesson, "tool-error", "", "dream") == "remembered":
                    report["added"].append(lesson)
        # merge near-duplicates: same words regardless of order and case
        seen = {}
        for row in self.all():
            key = " ".join(sorted(set(re.findall(r"\w+", row["text"].lower()))))
            if key in seen:
                self.forget(row["id"])
                report["merged"] += 1
            else:
                seen[key] = row["id"]
        # retire lessons never recalled for a long time
        cutoff = time.time() - stale_days * 86400
        n = self.con.execute("DELETE FROM lessons WHERE CAST(uses AS INTEGER) = 0 AND CAST(created AS REAL) < ?",
                             (cutoff,)).rowcount
        report["retired"] = n
        # repeated successful work -> skill drafts for the user to review
        for head, tasks in task_heads.items():
            if len(tasks) >= 3 and head:
                name = re.sub(r"\W+", "-", head).strip("-")[:40]
                d = os.path.join(edith_home(), "skills", "drafts", name)
                if not os.path.exists(d):
                    os.makedirs(d)
                    with open(os.path.join(d, "SKILL.md"), "w") as f:
                        f.write(f"---\nname: {name}\ndescription: Draft from {len(tasks)} similar tasks. "
                                f"Review, edit, then move to ~/.edith/skills/{name}/\n---\n\nExamples of tasks:\n"
                                + "\n".join(f"- {t}" for t in tasks[:10]) + "\n\nSteps that worked:\n- (fill in)\n")
                    report["skill_drafts"].append(name)
        self.con.commit()
        self._meta("last_dream", time.time())
        return report
