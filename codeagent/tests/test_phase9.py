"""Phase 9: benchmark harness and graders, comparison, secret hygiene end to end."""
import asyncio
import json
import os
import shutil
import sys
import tempfile
import unittest

from agent import config, evals
from agent.loop import Agent
from agent.messages import ProviderError
from agent.providers.openai_compat import OpenAICompat
from agent.router import Fixed
from agent.tools import Tools
from tests.fakes import FakeServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Evals(unittest.TestCase):
    def test_every_task_is_complete(self):
        tasks = evals.load_tasks()
        self.assertGreaterEqual(len(tasks), 20)
        self.assertLessEqual(len(tasks), 30)
        for t in tasks:
            self.assertTrue(t["text"] and t["solution"], t["name"])
            self.assertIn(t["kind"], ("bugfix", "feature", "refactor", "performance"))
            self.assertFalse(any(n.startswith("hidden") for n in os.listdir(os.path.join(t["dir"], "repo"))))

    def test_graders_fail_before_and_pass_after_the_reference_fix(self):
        tasks = evals.load_tasks()

        def make(brain_for):
            def make_run(t, ws):
                return Agent(brain_for(t), Tools(ws, lambda *_: True, "trusted"), log=lambda s: None,
                             review_changes=False).run
            return make_run
        before = asyncio.run(evals.run_all(tasks, make(lambda t: evals.Noop()), log=lambda s: None))
        after = asyncio.run(evals.run_all(tasks, make(evals.Oracle), log=lambda s: None))
        self.assertEqual([r["task"] for r in before if r["passed"]], [])
        self.assertEqual([r["task"] for r in after if not r["passed"]], [])
        c = evals.compare({"rows": before}, {"rows": after})
        self.assertEqual(c["verdict"], "better")
        self.assertEqual(len(c["fixed"]), len(tasks))
        self.assertEqual(evals.compare({"rows": after}, {"rows": before})["verdict"], "worse")


class SecretHygiene(unittest.TestCase):
    SECRET = "sk-live-THIS-MUST-NEVER-LEAK-42"

    def test_key_never_reaches_model_logs_or_session_files(self):
        ws = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, ws)
        with open(os.path.join(ws, "settings.py"), "w") as f:
            f.write(f"API_KEY = '{self.SECRET}'\n")  # someone committed a key into the repo
        os.environ["LEAKY_KEY"] = self.SECRET
        self.addCleanup(os.environ.pop, "LEAKY_KEY")
        steps = [("read_file", {"path": "settings.py"}), ("run_command", {"command": "echo key=$LEAKY_KEY; env"}),
                 ("run_command", {"command": f"{sys.executable} -c \"import os;print(os.environ.get('LEAKY_KEY'))\""})]
        bodies = []

        def handler(method, path, body):
            bodies.append(json.dumps(body))
            n = sum(1 for m in body["messages"] if m["role"] == "tool")
            msg = ({"role": "assistant", "content": None, "tool_calls": [{"id": f"c{n}", "type": "function", "function": {
                "name": steps[n][0], "arguments": json.dumps(steps[n][1])}}]} if n < len(steps)
                   else {"role": "assistant", "content": "done"})
            return 200, {"choices": [{"message": msg}], "usage": {}}
        srv = FakeServer(handler)
        self.addCleanup(srv.close)
        logs = []
        providers = {"leaky": {"key_env": "LEAKY_KEY", "enabled": True}}
        secrets = config.secrets(providers)
        tools = Tools(ws, lambda *_: True, "trusted", scrub_env=["LEAKY_KEY"])
        agent = Agent(Fixed(OpenAICompat("leaky", srv.url, self.SECRET), "m"), tools, log=logs.append,
                      redact=lambda s: config.redact(s, secrets), verify_changes=False)
        r = asyncio.run(agent.run("show me the settings"))
        self.assertTrue(r["done"])
        sent_to_model = "".join(bodies)
        self.assertNotIn(self.SECRET, sent_to_model)
        self.assertIn("[REDACTED]", sent_to_model)  # the committed key was masked before the model saw it
        self.assertNotIn(self.SECRET, "\n".join(logs))
        session_dir = os.path.join(os.environ["EDITH_HOME"], "sessions", r["session"])
        for root, _, files in os.walk(session_dir):
            for name in files:
                with open(os.path.join(root, name), errors="replace") as f:
                    self.assertNotIn(self.SECRET, f.read(), name)

    def test_provider_urls_must_be_http(self):
        a = OpenAICompat("x", "file:///etc", "k")
        with self.assertRaises(ProviderError):
            asyncio.run(a.list_models())


if __name__ == "__main__":
    unittest.main()
