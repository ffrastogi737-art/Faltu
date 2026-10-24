"""Phase 3: smart router - per-step switching, failover, quota spreading,
filters, escalation, diversity, multiple keys, portable history."""
import asyncio
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

from agent import config, db, loop
from agent.messages import Message
from agent.router import AllFailed, Router, classify, family
from agent.tools import Tools
from tests.fakes import FakeServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_CMD = f"{sys.executable} -m unittest -q"
FIX = {"path": "cart.py", "old": "subtotal * discount_percent,", "new": "subtotal * discount_percent / 100,"}
SCRIPT = [("list_files", {"pattern": "*.py"}), ("read_file", {"path": "cart.py"}), ("read_file", {"path": "test_cart.py"}),
          ("run_command", {"command": TEST_CMD}), ("grep", {"pattern": "discount"}), ("edit_file", FIX),
          ("run_command", {"command": TEST_CMD}), ("read_file", {"path": "cart.py"})]
FINAL = "Fixed: the discount is a percentage, so it is divided by 100. Tests pass."


def step_of(body):
    """How many tool results the conversation already holds, in any wire format."""
    if "contents" in body:  # Gemini
        return sum(1 for c in body["contents"] for p in c["parts"] if "functionResponse" in p)
    return sum(1 for m in body["messages"] if m["role"] == "tool")


def scripted_openai(on_call=None):
    def handler(method, path, body):
        if on_call:
            r = on_call(body)
            if r:
                return r
        n = step_of(body)
        if n >= len(SCRIPT) or not body.get("tools"):  # a real model cannot call tools it was not given
            msg = {"role": "assistant", "content": FINAL if body.get("tools") else '{"verdict": "approve", "issues": []}'}
        else:
            name, args = SCRIPT[n]
            msg = {"role": "assistant", "content": None, "tool_calls": [
                {"id": f"s{n}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}
        return 200, {"choices": [{"message": msg, "finish_reason": "stop"}],
                     "usage": {"prompt_tokens": 100, "completion_tokens": 20}}
    return handler


def scripted_gemini(seen):
    def handler(method, path, body):
        seen.append(body)
        n = step_of(body)
        if n >= len(SCRIPT) or not body.get("tools"):
            parts = [{"text": FINAL if body.get("tools") else '{"verdict": "approve", "issues": []}'}]
        else:
            name, args = SCRIPT[n]
            parts = [{"functionCall": {"name": name, "args": args}, "thoughtSignature": f"sig{n}"}]
        return 200, {"candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}],
                     "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 20}}
    return handler


class RouterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.saved = config.LOCAL
        config.LOCAL = os.path.join(self.tmp, "providers.local.yaml")
        self.con = db.connect(os.path.join(self.tmp, "state.db"))
        self.providers, self.servers, self.logs = {}, [], []

    def tearDown(self):
        config.LOCAL = self.saved
        for s in self.servers:
            s.close()
        self.con.close()
        shutil.rmtree(self.tmp)

    def provider(self, name, handler, api="openai", quality=0.9, keys=1, limits=None, tools=1, context=128000,
                 private=True, free=1, path=""):
        s = FakeServer(handler)
        self.servers.append(s)
        envs = []
        for i in range(keys):
            env = f"RT_{name.upper()}_{i}"
            os.environ[env] = f"key-{name}-{i}-xxxxxxxx"
            self.addCleanup(os.environ.pop, env, None)
            envs.append(env)
        self.providers[name] = {"api": api, "base_url": s.url + path, "key_env": ",".join(envs), "enabled": True,
                                "allow_private_code": private, "free_tier": True, "limits": limits or {}}
        self.con.execute("INSERT OR REPLACE INTO models (provider, model, tools, context, free, status, quality) "
                         "VALUES (?, 'm', ?, ?, ?, 'active', ?)", (name, tools, context, free, quality))
        self.con.commit()
        return s

    def router(self, seed=1, **kw):
        return Router(self.con, providers=self.providers, log=self.logs.append, rng=random.Random(seed), **kw)

    def ws(self):
        ws = tempfile.mkdtemp(dir=self.tmp)
        shutil.copytree(os.path.join(ROOT, "examples", "buggy_cart"), ws, dirs_exist_ok=True)
        return ws

    # --- acceptance -----------------------------------------------------
    def test_long_session_switches_across_providers(self):
        """One coding session, four providers (one speaks Gemini's native format), rpm limit 3 each."""
        gemini_seen = []
        for n in ("alpha", "beta", "gamma"):
            self.provider(n, scripted_openai(), limits={"rpm": 3})
        self.provider("gem", scripted_gemini(gemini_seen), api="gemini", limits={"rpm": 3}, path="/v1beta")
        ws = self.ws()
        r = self.router()
        result = asyncio.run(loop.run("Fix the failing test.", r, Tools(ws, lambda *_: True, "trusted"),
                                      log=self.logs.append))
        print("\n[session log]\n" + "\n".join(self.logs))
        self.assertTrue(result["done"], self.logs[-5:])
        used = {p for p, _ in r.switches}
        self.assertGreaterEqual(len(used), 3)
        self.assertIn("gem", used)
        self.assertEqual(subprocess.run(TEST_CMD, shell=True, cwd=ws, capture_output=True).returncode, 0)
        # every routed call was logged with its reasons
        rows = self.con.execute("SELECT why FROM calls WHERE why IS NOT NULL").fetchall()
        self.assertEqual(len(rows), len(r.switches))
        self.assertIn("parts", json.loads(rows[0]["why"]))
        # Gemini got tool results produced by other providers, as functionResponse parts
        replays = [p for body in gemini_seen for c in body["contents"] for p in c["parts"] if "functionResponse" in p]
        self.assertTrue(replays)

    def test_429_fails_over_in_the_same_step_and_cools_down(self):
        hits = {"limited": 0}

        def limited(body):
            hits["limited"] += 1
            return 429, {"error": "rate limited"}
        self.provider("limited", scripted_openai(on_call=limited), quality=1.0)
        self.provider("backup", scripted_openai(), quality=0.6)
        r = self.router()
        r.choose = self._no_explore(r)
        resp = asyncio.run(r.chat([Message("user", "go")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertEqual(resp.provider, "backup")
        self.assertEqual(hits["limited"], 1)
        row = self.con.execute("SELECT until FROM cooldowns WHERE lane='limited/m'").fetchone()
        self.assertAlmostEqual(row["until"] - time.time(), 7, delta=2)  # Retry-After: 7 was respected
        asyncio.run(r.chat([Message("user", "again")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertEqual(hits["limited"], 1)  # cooling provider is not called again
        self.assertTrue(any("failover" in l and "429" in l for l in self.logs))

    def test_429_on_two_models_cools_the_provider(self):
        self.provider("g", scripted_openai(on_call=lambda b: (429, {"error": {"message": "quota"}})))
        self.con.execute("INSERT INTO models (provider, model, tools, context, free, status, quality) "
                         "VALUES ('g', 'm2', 1, 128000, 1, 'active', 0.8)")
        r = self.router()
        r.choose = self._no_explore(r)
        with self.assertRaises(AllFailed):
            asyncio.run(r.chat([Message("user", "go")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertIsNotNone(r.quota.cooling("g/m"))
        self.assertIsNotNone(r.quota.cooling("g/m2"))
        self.assertIsNotNone(r.quota.cooling("g"))
        self.assertTrue(any("quota" in l for l in self.logs))  # the provider's own message, not raw JSON

    def test_quota_spreading(self):
        """Equal providers with 20 rpm each (60 total): 30 quick calls must be spread, not drain one."""
        for n in ("p1", "p2", "p3"):
            self.provider(n, scripted_openai(), limits={"rpm": 20})
        r = self.router(seed=7)
        for i in range(30):
            asyncio.run(r.chat([Message("user", f"q{i}")], [], task_type="quick_answer"))
        counts = {n: sum(1 for p, _ in r.switches if p == n) for n in ("p1", "p2", "p3")}
        print(f"\n[quota spreading] {counts}")
        self.assertTrue(all(7 <= c <= 13 for c in counts.values()), counts)

    # --- filters and controls -------------------------------------------
    def test_hard_filters(self):
        h = scripted_openai()
        self.provider("ok", h, quality=0.5)
        self.provider("secret", h, private=False, quality=1.0)
        self.provider("notools", h, tools=0, quality=1.0)
        self.provider("small", h, context=1000, quality=1.0)
        self.provider("paid", h, free=0, quality=1.0)
        ranked, rejected = self.router().candidates("plan", need_tokens=5000)
        self.assertEqual([c["provider"] for c in ranked], ["ok"])
        self.assertEqual(rejected, {"privacy flag": 1, "no tool calling": 1, "context too small": 1, "paid, no budget": 1})

    def test_pin_ban_force(self):
        for n, q in (("a", 0.9), ("b", 0.5), ("c", 0.4)):
            self.provider(n, scripted_openai(), quality=q)
        r = self.router()
        config.save_router_setting("router", "pin", {"debug": "c/m"})
        self.assertEqual(r.choose("debug", 100)[0][0]["provider"], "c")
        config.save_router_setting("router", "ban", ["a"])
        config.save_router_setting("router", "explore", 0)
        self.assertEqual(r.choose("plan", 100)[0][0]["provider"], "b")
        config.save_router_setting("router", "force_provider", "c")
        self.assertEqual({c["provider"] for c in r.choose("plan", 100)[0]}, {"c"})

    def test_escalation_prefers_quality(self):
        self.provider("fast", scripted_openai(), quality=0.55)
        self.provider("strong", scripted_openai(), quality=0.95)
        for _ in range(5):  # fast is much faster in history
            self.con.execute("INSERT INTO calls (provider, model, task_type, ok, latency_ms) VALUES ('fast','m','quick_answer',1,200)")
            self.con.execute("INSERT INTO calls (provider, model, task_type, ok, latency_ms) VALUES ('strong','m','quick_answer',1,20000)")
        r = self.router()
        config.save_router_setting("router", "explore", 0)
        self.assertEqual(r.choose("quick_answer", 100)[0][0]["provider"], "fast")
        self.assertEqual(r.choose("quick_answer", 100, escalate=True)[0][0]["provider"], "strong")

    def test_reviewer_diversity(self):
        self.provider("x", scripted_openai(), quality=0.9)
        self.con.execute("UPDATE models SET model='org/llama-3-70b' WHERE provider='x'")
        self.provider("y", scripted_openai(), quality=0.5)
        self.con.execute("UPDATE models SET model='qwen-coder' WHERE provider='y'")
        ranked, rejected = self.router().candidates("review", 100, avoid_family=family("x", "org/llama-3-70b"))
        self.assertEqual([c["provider"] for c in ranked], ["y"])
        self.assertEqual(rejected, {"same family as coder": 1})

    def test_bad_outputs_fail_over_and_open_breaker(self):
        def broken(body):
            return 200, {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [
                {"id": "1", "type": "function", "function": {"name": "x", "arguments": "not json at all"}}]}}]}
        self.provider("broken", scripted_openai(on_call=broken), quality=1.0)
        self.provider("empty", scripted_openai(on_call=lambda b: (200, {"choices": [{"message": {"content": ""}}]})), quality=0.95)
        self.provider("down", scripted_openai(on_call=lambda b: (503, {"error": "down"})), quality=0.9)
        self.provider("good", scripted_openai(), quality=0.3)
        r = self.router()
        config.save_router_setting("router", "explore", 0)
        resp = asyncio.run(r.chat([Message("user", "go")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertEqual(resp.provider, "good")
        log = "\n".join(self.logs)
        for reason in ("malformed tool-call JSON", "empty output", "HTTP 503"):
            self.assertIn(reason, log)
        # the failed models now score lower, so the next call goes straight to the good one
        self.logs.clear()
        resp = asyncio.run(r.chat([Message("user", "go")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertEqual(resp.provider, "good")
        self.assertFalse(any("failover" in l for l in self.logs), self.logs)

    def test_circuit_breaker(self):
        self.provider("flaky", scripted_openai(on_call=lambda b: (200, {"choices": [{"message": {"content": ""}}]})))
        r = self.router()
        for _ in range(3):
            with self.assertRaises(AllFailed):
                asyncio.run(r.chat([Message("user", "go")], [], task_type="plan"))
        self.assertEqual(r.quota.cooling("flaky/m"), "circuit open")

    def test_second_key_used_when_first_is_limited(self):
        calls = []

        def per_key(body):
            calls.append(1)
            return None
        s = self.provider("multi", scripted_openai(on_call=per_key), keys=2)
        r = self.router()
        r.quota.cool("multi#0", 60, "429")
        resp = asyncio.run(r.chat([Message("user", "go")], [], task_type="quick_answer"))
        self.assertEqual(resp.provider, "multi")
        self.assertEqual(s.requests[-1][2]["authorization"], "Bearer key-multi-1-xxxxxxxx")

    def test_all_fail_raises_cleanly(self):
        self.provider("down", scripted_openai(on_call=lambda b: (500, {})), quality=0.9)
        with self.assertRaises(AllFailed):
            asyncio.run(self.router().chat([Message("user", "go")], [], task_type="plan"))

    # --- found in the first live run (Groq + Gemini) -------------------------
    def test_listed_prices_are_free_when_all_models_free(self):
        """Groq lists paid-tier prices, yet its free key covers every model; a marketplace's priced model stays paid."""
        self.provider("groqlike", scripted_openai())
        self.provider("market", scripted_openai())
        self.con.execute("UPDATE models SET free=NULL, price_in=0.15")
        self.providers["groqlike"]["all_models_free"] = True
        ranked, rejected = self.router().candidates("plan", 100)
        self.assertEqual([c["provider"] for c in ranked], ["groqlike"])
        self.assertEqual(rejected, {"paid, no budget": 1})

    def test_overloaded_model_does_not_cool_its_provider(self):
        def busy(body):
            return (503, {"error": {"message": "high demand"}}) if body["model"] == "m" else None
        self.provider("g", scripted_openai(on_call=busy), quality=1.0)
        self.con.execute("INSERT INTO models (provider, model, tools, context, free, status, quality) "
                         "VALUES ('g', 'm2', 1, 128000, 1, 'active', 0.5)")
        r = self.router()
        r.choose = self._no_explore(r)
        resp = asyncio.run(r.chat([Message("user", "go")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertEqual((resp.provider, resp.model), ("g", "m2"))
        self.assertIsNotNone(r.quota.cooling("g/m"))
        self.assertIsNone(r.quota.cooling("g"))

    def test_model_without_tool_support_is_remembered(self):
        def no_tools(body):
            return 400, {"error": {"message": "`tool calling` is not supported with this model"}}
        self.provider("t", scripted_openai(on_call=no_tools), tools=None, quality=1.0)
        self.con.execute("UPDATE models SET status='probation'")
        self.provider("ok", scripted_openai(), quality=0.3)
        r = self.router()
        r.choose = self._no_explore(r)
        resp = asyncio.run(r.chat([Message("user", "go")], [{"name": "x", "parameters": {}}], task_type="plan"))
        self.assertEqual(resp.provider, "ok")
        self.assertEqual(self.con.execute("SELECT tools FROM models WHERE provider='t'").fetchone()[0], 0)
        _, rejected = r.candidates("plan", 100)
        self.assertEqual(rejected, {"no tool calling": 1})

    def test_per_provider_budget_cap(self):
        self.provider("pricey", scripted_openai(), free=0)
        config.save_router_setting("budget", "paid_enabled", True)
        config.save_router_setting("budget", "daily_inr", 100)
        config.save_router_setting("budget", "per_provider_inr", {"pricey": 10})
        r = self.router()
        self.assertEqual(len(r.candidates("plan", 100)[0]), 1)
        self.con.execute("INSERT INTO calls (provider, model, task_type, ok, cost_usd) VALUES ('pricey','m','plan',1,0.2)")
        self.assertEqual(r.candidates("plan", 100)[1], {"paid, no budget": 1})  # 0.2 USD = ~17 INR > 10

    def test_fixed_model_waits_out_a_rate_limit(self):
        from unittest import mock

        from agent.providers.openai_compat import OpenAICompat
        from agent.router import Fixed
        hits = []

        def first_limited(body):
            hits.append(1)
            return (429, {"error": "slow down"}) if len(hits) == 1 else None
        s = self.provider("solo", scripted_openai(on_call=first_limited))
        waits = []

        async def no_sleep(t):
            waits.append(t)
        with mock.patch("agent.router.asyncio.sleep", no_sleep):
            resp = asyncio.run(Fixed(OpenAICompat("solo", s.url, "k"), "m").chat([Message("user", "go")], []))
        self.assertEqual(resp.message.content, '{"verdict": "approve", "issues": []}')
        self.assertEqual(waits, [7.0])  # the provider's Retry-After

    def test_classify(self):
        from agent.messages import ToolCall
        h = [Message("system", ""), Message("user", "fix")]
        self.assertEqual(classify(h), "plan")
        h += [Message("assistant", "", [ToolCall("1", "read_file", {})]), Message("tool", "x", tool_call_id="1")]
        self.assertEqual(classify(h), "patch_edit")
        h += [Message("assistant", "", [ToolCall("2", "run_command", {})]), Message("tool", "exit code 1\nFAIL", tool_call_id="2")]
        self.assertEqual(classify(h), "debug")
        self.assertEqual(classify(h, mode="plan"), "plan")

    def _no_explore(self, r):
        orig = r.choose

        def choose(*a, **kw):
            r.rng = random.Random(0)
            r.rng.random = lambda: 1.0
            return orig(*a, **kw)
        return choose


if __name__ == "__main__":
    unittest.main()
