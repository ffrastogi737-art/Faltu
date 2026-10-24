"""End-to-end: the real loop and OpenAI adapter talk HTTP to a local fake
provider that plays a scripted model, and fix examples/buggy_cart."""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from agent import loop
from agent.config import redact
from agent.providers.openai_compat import OpenAICompat
from agent.tools import ToolError, Tools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_CMD = f"{sys.executable} -m unittest -q"


def call(name, args, raw=False):
    return {"role": "assistant", "content": None, "tool_calls": [{
        "id": f"c_{name}", "type": "function",
        "function": {"name": name, "arguments": args if raw else json.dumps(args)}}]}


def answer(text):
    return {"role": "assistant", "content": text}


class FakeProvider:
    """Serves scripted replies and records every request body."""

    def __init__(self, script):
        self.script, self.requests = list(script), []
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append((self.headers["Authorization"], body))
                msg = outer.script.pop(0) if outer.script else answer("out of script")
                data = json.dumps({"choices": [{"message": msg, "finish_reason": "stop"}],
                                   "usage": {"prompt_tokens": 10, "completion_tokens": 5}}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/v1"

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class Loop(unittest.TestCase):
    def setUp(self):
        self.ws = tempfile.mkdtemp()
        shutil.copytree(os.path.join(ROOT, "examples", "buggy_cart"), self.ws, dirs_exist_ok=True)
        self.logs = []

    def tearDown(self):
        shutil.rmtree(self.ws)

    def go(self, script, mode="trusted", approve=lambda *_: True):
        fake = FakeProvider(script)
        self.addCleanup(fake.close)
        tools = Tools(self.ws, approve, mode)
        result = asyncio.run(loop.run("Fix the failing test in this repo.", OpenAICompat("fake", fake.url, "sk-test-secret"),
                                      "any-model", tools, log=self.logs.append))
        return result, fake

    def test_fixes_bug_and_tests_pass(self):
        result, fake = self.go([
            call("list_files", {"pattern": "*.py"}),
            call("read_file", {"path": "cart.py"}),
            call("run_command", {"command": TEST_CMD}),
            call("edit_file", {"path": "cart.py", "old": "subtotal * discount_percent,",
                               "new": "subtotal * discount_percent / 100,"}),
            call("run_command", {"command": TEST_CMD}),
            answer("Fixed: discount is a percent, divided by 100. Tests: OK."),
        ])
        self.assertTrue(result["done"], self.logs)
        p = subprocess.run(TEST_CMD, shell=True, cwd=self.ws, capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stderr)
        # the adapter sent tool results back in OpenAI format with matching ids
        auth, last = fake.requests[-1]
        self.assertEqual(auth, "Bearer sk-test-secret")
        tool_msgs = [m for m in last["messages"] if m["role"] == "tool"]
        self.assertEqual(len(tool_msgs), 5)
        self.assertEqual(tool_msgs[1]["tool_call_id"], "c_read_file")
        self.assertIn("exit code 1", tool_msgs[2]["content"])
        self.assertIn("exit code 0", tool_msgs[4]["content"])
        self.assertEqual({t["function"]["name"] for t in last["tools"]},
                         {"read_file", "list_files", "grep", "edit_file", "write_file", "run_command"})
        self.assertEqual(result["input_tokens"], 60)

    def test_plan_mode_cannot_edit(self):
        result, fake = self.go([
            call("edit_file", {"path": "cart.py", "old": "x", "new": "y"}),
            answer("plan: divide by 100"),
        ], mode="plan")
        self.assertTrue(result["done"])
        self.assertIn("disallowed tool", fake.requests[-1][1]["messages"][-1]["content"])
        self.assertEqual({t["function"]["name"] for t in fake.requests[0][1]["tools"]}, {"read_file", "list_files", "grep"})

    def test_rejected_edit_changes_nothing(self):
        before = open(os.path.join(self.ws, "cart.py")).read()
        self.go([call("edit_file", {"path": "cart.py", "old": "discount_percent,", "new": "1,"}), answer("ok")],
                mode="default", approve=lambda *_: False)
        self.assertEqual(open(os.path.join(self.ws, "cart.py")).read(), before)

    def test_doom_loop_stops(self):
        bad = call("read_file", {"path": "missing.py"})
        result, _ = self.go([bad, bad, bad, answer("never reached")])
        self.assertFalse(result["done"])
        self.assertIn("doom loop", result["answer"])

    def test_cut_off_tool_json_is_repaired(self):
        result, fake = self.go([call("read_file", '{"path": "cart.py"', raw=True), answer("ok")])
        self.assertIn("def total", fake.requests[-1][1]["messages"][-1]["content"])

    def test_unrepairable_tool_json_is_reported_to_model(self):
        result, fake = self.go([call("read_file", "path is cart.py", raw=True), answer("retrying later")])
        self.assertTrue(result["done"])
        self.assertIn("not valid JSON", fake.requests[-1][1]["messages"][-1]["content"])


class Safety(unittest.TestCase):
    def setUp(self):
        self.ws = tempfile.mkdtemp()
        self.tools = Tools(self.ws, lambda *_: True, "trusted", scrub_env=["EDITH_TEST_KEY"])

    def tearDown(self):
        shutil.rmtree(self.ws)

    def test_outside_workspace_blocked(self):
        with self.assertRaises(ToolError):
            self.tools.read_file("../../etc/passwd")

    def test_env_file_blocked(self):
        with open(os.path.join(self.ws, ".env"), "w") as f:
            f.write("K=v")
        with self.assertRaises(ToolError):
            self.tools.read_file(".env")

    def test_keys_not_passed_to_commands(self):
        os.environ["EDITH_TEST_KEY"] = "topsecretvalue"
        self.addCleanup(os.environ.pop, "EDITH_TEST_KEY")
        out = self.tools.run_command("env")
        self.assertNotIn("topsecretvalue", out)

    def test_redact(self):
        self.assertEqual(redact("key=topsecretvalue!", ["topsecretvalue"]), "key=[REDACTED]!")


if __name__ == "__main__":
    unittest.main()
