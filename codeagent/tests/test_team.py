"""Phase 7: supervisor, specialists, task board, worktrees, merge and conflicts."""
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

from agent import db
from agent.agents import Team, load_roles
from agent.providers.openai_compat import OpenAICompat
from agent.router import Fixed
from agent.tools import Tools
from tests.fakes import FakeServer

PY = sys.executable
FILES = {
    "cart.py": "def total(prices, discount_percent=0):\n    subtotal = sum(prices)\n"
               "    return round(subtotal - subtotal * discount_percent, 2)\n",
    "tax.py": "def with_tax(amount, rate_percent):\n    return round(amount * (1 + rate_percent), 2)\n",
    "test_shop.py": "import unittest\nfrom cart import total\nfrom tax import with_tax\n\n"
                    "class T(unittest.TestCase):\n    def test_cart(self):\n        self.assertEqual(total([100], 10), 90.0)\n\n"
                    "    def test_tax(self):\n        self.assertEqual(with_tax(100, 18), 118.0)\n",
}
CART_FIX = {"path": "cart.py", "old": "subtotal * discount_percent,", "new": "subtotal * discount_percent / 100,"}
TAX_FIX = {"path": "tax.py", "old": "(1 + rate_percent)", "new": "(1 + rate_percent / 100)"}
EXTRA_TEST = {"path": "test_extra.py", "content": "import unittest\nfrom cart import total\n\n"
              "class X(unittest.TestCase):\n    def test_zero(self):\n        self.assertEqual(total([5], 0), 5)\n"}


def call(name, args, i=0):
    return {"role": "assistant", "content": None, "tool_calls": [
        {"id": f"c{i}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


def say(t):
    return {"role": "assistant", "content": t}


def team_model(plan, scripts, seen):
    """Plays the supervisor, every specialist and the reviewer, depending on the request."""
    def handler(method, path, body):
        msgs = body["messages"]
        system, user = msgs[0]["content"], next(m["content"] for m in msgs if m["role"] == "user")
        if system.startswith("You are the Supervisor"):
            msg = say(json.dumps({"tasks": plan}))
        elif "strict code reviewer" in system:
            msg = say('{"verdict": "approve", "issues": []}')
        else:
            line = re.search(r"Your subtask \(\w+\): (.*)", user).group(1)
            title = next((t for t in scripts if line.startswith(t)), None)
            seen.setdefault(title, []).append({"system": system, "user": user,
                                               "tools": [t["function"]["name"] for t in body.get("tools", [])]})
            steps = scripts.get(title, [])  # unscripted subtasks just finish
            n = sum(1 for m in msgs if m["role"] == "tool")
            msg = steps[n] if n < len(steps) else say(f"{title}: finished")
        return 200, {"choices": [{"message": msg}], "usage": {"prompt_tokens": 20, "completion_tokens": 5}}
    return FakeServer(handler)


class TeamTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ws = os.path.join(self.tmp, "shop")
        os.makedirs(self.ws)
        for name, text in FILES.items():
            with open(os.path.join(self.ws, name), "w") as f:
                f.write(text)
        self.g("init", "-q")
        self.g("add", "-A")
        self.g("commit", "-qm", "init")
        self.con = db.connect(os.path.join(self.tmp, "state.db"))
        self.logs = []

    def tearDown(self):
        self.con.close()
        shutil.rmtree(self.tmp)

    def g(self, *a):
        return subprocess.run(["git", "-c", "user.email=a@b", "-c", "user.name=a", *a], cwd=self.ws,
                              capture_output=True, text=True)

    def team(self, plan, scripts, **kw):
        seen = {}
        srv = team_model(plan, scripts, seen)
        self.addCleanup(srv.close)
        make_brain = lambda: Fixed(OpenAICompat("fake", srv.url, "k"), "m")  # noqa: E731
        make_tools = lambda path, allow: Tools(path, lambda *_: True, "trusted", log=self.logs.append)  # noqa: E731
        return Team(self.con, make_brain, make_tools, self.ws, log=self.logs.append, **kw), seen

    def test_parallel_worktrees_handoffs_and_final_verification(self):
        plan = [{"id": "t1", "role": "coder", "title": "Fix cart discount", "files": ["cart.py"]},
                {"id": "t2", "role": "coder", "title": "Fix tax rate", "files": ["tax.py"]},
                {"id": "t3", "role": "tester", "title": "Add zero discount test", "files": ["test_extra.py"],
                 "depends_on": ["t1", "t2"]},
                {"id": "t4", "role": "researcher", "title": "Explain rounding", "depends_on": ["t3"]}]
        scripts = {"Fix cart discount": [call("read_file", {"path": "cart.py"}), call("edit_file", CART_FIX, 1)],
                   "Fix tax rate": [call("edit_file", TAX_FIX)],
                   "Add zero discount test": [call("write_file", EXTRA_TEST)],
                   "Explain rounding": [call("grep", {"pattern": "round"})]}
        team, seen = self.team(plan, scripts)
        out = asyncio.run(team.run("Fix the shop's money bugs and add a test"))
        print("\n[team log]\n" + "\n".join(l for l in self.logs if "supervisor" in l or "Board" in l or l.startswith(("-", "#"))))
        board = {b["id"]: b for b in out["board"]}
        self.assertEqual({k: b["status"] for k, b in board.items()}, dict.fromkeys(board, "done"))
        self.assertTrue(out["checks_passed"])
        self.assertTrue(out["done"])
        # t1 and t2 ran at the same time in separate worktrees
        self.assertTrue(board["t1"]["worktree"] and board["t2"]["worktree"])
        self.assertNotEqual(board["t1"]["worktree"], board["t2"]["worktree"])
        self.assertLess(board["t2"]["started"], board["t1"]["finished"])
        self.assertLess(board["t1"]["started"], board["t2"]["finished"])
        # both results merged into the real workspace; worktrees cleaned up
        self.assertIn("/ 100,", open(os.path.join(self.ws, "cart.py")).read())
        self.assertIn("rate_percent / 100", open(os.path.join(self.ws, "tax.py")).read())
        self.assertTrue(os.path.exists(os.path.join(self.ws, "test_extra.py")))
        self.assertNotIn("edith", self.g("worktree", "list").stdout.split("\n", 1)[-1])
        self.assertEqual(self.g("rev-list", "--count", "HEAD").stdout.strip(), "1")  # user's branch untouched
        # the tester got both coders' handoffs in the fixed format
        tester_prompt = seen["Add zero discount test"][0]["user"]
        for key in ('"from": "coder"', '"task_id": "t1"', '"task_id": "t2"', '"files_changed"', '"open_questions"'):
            self.assertIn(key, tester_prompt)
        # per-agent tool access: the researcher cannot edit
        tools = set(seen["Explain rounding"][0]["tools"])
        self.assertIn("grep", tools)
        self.assertFalse(tools & {"edit_file", "write_file", "run_command"})
        self.assertIn("Answer the question from the code", seen["Explain rounding"][0]["system"])
        t = Tools(self.ws, lambda *_: True, "trusted")
        t.git_read_only = True
        with self.assertRaises(Exception):
            t.git("commit -m x")
        self.assertEqual(out["review"]["verdict"], "approve")

    def test_conflicting_agents_are_resolved(self):
        plan = [{"id": "a", "role": "coder", "title": "Note A"}, {"id": "b", "role": "coder", "title": "Note B"}]
        line = "    subtotal = sum(prices)\n"
        scripts = {"Note A": [call("edit_file", {"path": "cart.py", "old": line, "new": "    subtotal = sum(prices)  # A\n"})],
                   "Note B": [call("edit_file", {"path": "cart.py", "old": "sum(prices)", "new": "sum(prices)  # B"})]}
        team, seen = self.team(plan, scripts)
        out = asyncio.run(team.run("annotate"))
        text = open(os.path.join(self.ws, "cart.py")).read()
        self.assertIn("# A", text)
        self.assertIn("# B", text)
        self.assertTrue(any("conflicts with work merged before it" in l for l in self.logs))
        self.assertEqual(len(seen["Note B"]) >= 2, True)  # B ran a second time on the merged tree
        self.assertIn("Your first attempt, for reference", seen["Note B"][-1]["user"])
        self.assertEqual({b["status"] for b in out["board"] if b["id"] in "ab"}, {"done"})

    def test_same_files_never_share_a_wave_and_bad_plans_fall_back(self):
        team, _ = self.team([], {})
        waves = team._waves(team._validate([
            {"id": "x", "files": ["a.py"]}, {"id": "y", "files": ["a.py"]}, {"id": "z", "files": ["b.py"]},
            {"id": "w", "depends_on": ["ghost", "w"]}], "t"))
        self.assertEqual([[t["id"] for t in w] for w in waves], [["x", "z", "w"], ["y"]])
        self.assertEqual(team._validate("not a list", "do it")[0]["role"], "coder")

    def test_not_git_runs_sequentially_and_final_failure_gets_a_debugger(self):
        shutil.rmtree(os.path.join(self.ws, ".git"))
        plan = [{"id": "t1", "role": "coder", "title": "Fix cart discount", "files": ["cart.py"]}]
        scripts = {"Fix cart discount": [call("edit_file", CART_FIX)],
                   "Fix the failing checks": [call("edit_file", TAX_FIX)]}
        team, seen = self.team(plan, scripts)
        out = asyncio.run(team.run("fix cart"))
        self.assertTrue(any("not a git repo" in l for l in self.logs))
        self.assertTrue(any("sending a debugger" in l for l in self.logs))
        self.assertIn("fix", {b["id"] for b in out["board"]})
        self.assertTrue(out["checks_passed"])

    def test_custom_agent_definition(self):
        d = os.path.join(os.environ["EDITH_HOME"], "agents")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "translator.md"), "w") as f:
            f.write("---\nname: translator\ndescription: Translates UI strings\ntools: read_file, edit_file\n"
                    "max_steps: 5\n---\nTranslate user-facing strings to Hindi.\n")
        self.addCleanup(os.remove, os.path.join(d, "translator.md"))
        r = load_roles()["translator"]
        self.assertEqual((r["tools"], r["max_steps"]), (["read_file", "edit_file"], 5))
        self.assertIn("Hindi", r["prompt"])


if __name__ == "__main__":
    unittest.main()
