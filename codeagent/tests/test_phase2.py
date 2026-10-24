"""Phase 2: native adapters, registry management, discovery, probes, scale."""
import asyncio
import io
import os
import resource
import shutil
import tempfile
import time
import unittest
from contextlib import redirect_stdout

from agent import cli, config, db, discovery, loop
from agent.messages import Message, ToolCall
from agent.providers import make_adapter
from agent.providers.repair import parse_args
from agent.router import Fixed
from agent.tools import Tools
from tests.fakes import FakeServer, openai_provider

TOOLS = [{"name": "read_file", "description": "x", "parameters": {"type": "object", "properties": {}}}]
CONVO = [Message("system", "be brief"), Message("user", "read a.py"),
         Message("assistant", "", [ToolCall("c1", "read_file", {"path": "a.py"}, {"thoughtSignature": "sig"})]),
         Message("tool", "print(1)", tool_call_id="c1")]


class Isolated(unittest.TestCase):
    """Temp registry overlay, temp extra-models file and temp SQLite per test."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.saved = (config.LOCAL, config.EXTRA, os.environ.get("EDITH_HOME"))
        config.LOCAL = os.path.join(self.tmp, "providers.local.yaml")
        config.EXTRA = os.path.join(self.tmp, "models_extra.yaml")
        os.environ["EDITH_HOME"] = self.tmp
        self.con = db.connect(os.path.join(self.tmp, "state.db"))
        self.servers = []

    def tearDown(self):
        config.LOCAL, config.EXTRA, home = self.saved
        os.environ.pop("EDITH_HOME") if home is None else os.environ.__setitem__("EDITH_HOME", home)
        for s in self.servers:
            s.close()
        self.con.close()
        shutil.rmtree(self.tmp)

    def server(self, s):
        self.servers.append(s)
        return s

    def add(self, name, url, key="k-123456789", **extra):
        os.environ[f"KEY_{name.upper()}"] = key
        self.addCleanup(os.environ.pop, f"KEY_{name.upper()}", None)
        config.save_override(name, {"api": "openai", "base_url": url, "key_env": f"KEY_{name.upper()}",
                                    "models": "/models", "enabled": True, "status": "unverified",
                                    "allow_private_code": True, **extra})

    def mine(self):
        """Only the providers this test added (the shipped ones have no keys here anyway)."""
        return {n: p for n, p in config.load_providers().items() if n.startswith("t_")}

    def cli(self, *argv):
        out = io.StringIO()
        with redirect_stdout(out):
            code = cli.main(list(argv))
        return code, out.getvalue()


class Adapters(Isolated):
    def test_gemini_request_and_response(self):
        def handler(method, path, body):
            if method == "GET":
                return 200, {"models": [
                    {"name": "models/g-chat", "inputTokenLimit": 1000000, "outputTokenLimit": 8192,
                     "supportedGenerationMethods": ["generateContent"]},
                    {"name": "models/g-embed", "supportedGenerationMethods": ["embedContent"]}]}
            return 200, {"candidates": [{"content": {"parts": [
                {"text": "reading"}, {"functionCall": {"name": "read_file", "args": {"path": "b.py"}},
                                      "thoughtSignature": "sig2"}]}, "finishReason": "STOP"}],
                         "usageMetadata": {"promptTokenCount": 11, "candidatesTokenCount": 4}}
        s = self.server(FakeServer(handler))
        os.environ["GEM_TEST_KEY"] = "gkey-123456"
        self.addCleanup(os.environ.pop, "GEM_TEST_KEY")
        a = make_adapter("g", {"api": "gemini", "base_url": s.url + "/v1beta", "key_env": "GEM_TEST_KEY", "models": "/models"})
        models = asyncio.run(a.list_models())
        self.assertEqual([m["model"] for m in models], ["g-chat"])
        self.assertEqual(models[0]["context"], 1000000)
        r = asyncio.run(a.chat("g-chat", CONVO, TOOLS))
        _, path, headers, body = s.requests[-1]
        self.assertEqual(path, "/v1beta/models/g-chat:generateContent")
        self.assertEqual(headers["x-goog-api-key"], "gkey-123456")
        self.assertEqual(body["systemInstruction"]["parts"][0]["text"], "be brief")
        self.assertEqual([c["role"] for c in body["contents"]], ["user", "model", "user"])
        self.assertEqual(body["contents"][1]["parts"][0]["thoughtSignature"], "sig")
        self.assertEqual(body["contents"][2]["parts"][0]["functionResponse"]["name"], "read_file")
        self.assertEqual(body["tools"][0]["functionDeclarations"][0]["name"], "read_file")
        self.assertEqual(r.message.content, "reading")
        self.assertEqual(r.message.tool_calls[0].arguments, {"path": "b.py"})
        self.assertEqual(r.message.tool_calls[0].meta, {"thoughtSignature": "sig2"})
        self.assertEqual((r.usage.input_tokens, r.usage.output_tokens), (11, 4))

    def test_gemini_gets_only_fields_it_accepts(self):
        """The real API answered 400 to an unknown `read_only` key and rejects empty `required`."""
        from agent.loop import TODO_TOOL
        from agent.tools import schemas

        def strict(method, path, body):
            for f in body["tools"][0]["functionDeclarations"]:
                if set(f) - {"name", "description", "parameters"} or f["parameters"].get("required") == []:
                    return 400, {"error": {"message": f"Invalid JSON payload: bad field in {f['name']}"}}
            return 200, {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
        s = self.server(FakeServer(strict))
        os.environ["GEM_STRICT"] = "gkey-123456"
        self.addCleanup(os.environ.pop, "GEM_STRICT")
        a = make_adapter("g", {"api": "gemini", "base_url": s.url, "key_env": "GEM_STRICT"})
        r = asyncio.run(a.chat("m", [Message("user", "hi")], schemas("default", extra=[TODO_TOOL])))
        self.assertEqual(r.message.content, "ok")

    def test_cohere_response(self):
        s = self.server(FakeServer(lambda m, p, b: (200, {
            "message": {"role": "assistant", "content": [{"type": "text", "text": "hi"}],
                        "tool_calls": [{"id": "x", "type": "function",
                                        "function": {"name": "read_file", "arguments": '{"path": "a.py"}'}}]},
            "finish_reason": "TOOL_CALL", "usage": {"tokens": {"input_tokens": 5, "output_tokens": 2}}})))
        os.environ["CO_TEST"] = "c-123456789"
        self.addCleanup(os.environ.pop, "CO_TEST")
        a = make_adapter("co", {"api": "cohere", "base_url": s.url + "/v2", "key_env": "CO_TEST"})
        r = asyncio.run(a.chat("m", CONVO, TOOLS))
        self.assertEqual(s.requests[-1][1], "/v2/chat")
        self.assertEqual(s.requests[-1][3]["messages"][-1], {"role": "tool", "content": "print(1)", "tool_call_id": "c1"})
        self.assertEqual((r.message.content, r.message.tool_calls[0].arguments), ("hi", {"path": "a.py"}))
        self.assertEqual(r.usage.output_tokens, 2)

    def test_horde_async_job(self):
        polls = []

        def handler(method, path, body):
            if path.endswith("/async"):
                return 202, {"id": "job1"}
            polls.append(path)
            done = len(polls) >= 2
            return 200, {"done": done, "generations": [{"text": " pong \nUSER: invented turn"}] if done else []}
        s = self.server(FakeServer(handler))
        os.environ["HORDE_TEST"] = "0000000000"
        self.addCleanup(os.environ.pop, "HORDE_TEST")
        a = make_adapter("h", {"api": "horde", "base_url": s.url + "/api/v2", "key_env": "HORDE_TEST"})
        a.poll_seconds = 0.01
        r = asyncio.run(a.chat("some-model", [Message("user", "say pong")], []))
        self.assertEqual(r.message.content, "pong")
        self.assertEqual(s.requests[0][2]["apikey"], "0000000000")
        self.assertIn("USER: say pong", s.requests[0][3]["prompt"])

    def test_list_formats(self):
        from agent.providers.openai_compat import model_record
        orr = model_record({"id": "x/y:free", "context_length": 128000, "supported_parameters": ["tools"],
                            "pricing": {"prompt": "0", "completion": "0"}})
        self.assertEqual((orr["free"], orr["tools"], orr["context"]), (1, 1, 128000))
        gh = model_record({"id": "org/m", "limits": {"max_input_tokens": 8000}, "capabilities": ["tool-calling"]})
        self.assertEqual((gh["context"], gh["tools"]), (8000, 1))
        hf = model_record({"id": "org/m", "providers": [{"context_length": 4096, "supports_tools": False},
                                                        {"context_length": 131072, "supports_tools": True}]})
        self.assertEqual((hf["context"], hf["tools"]), (131072, 1))
        cf = model_record({"name": "@cf/vendor/m", "task": {"name": "Text Generation"}})
        self.assertEqual((cf["model"], cf["tools"]), ("@cf/vendor/m", None))

    def test_repair(self):
        self.assertEqual(parse_args('```json\n{"a": 1,}\n```'), {"a": 1})
        self.assertEqual(parse_args('{"path": "a.py", "old": "x\\"y'), {"path": "a.py", "old": 'x"y'})
        self.assertEqual(parse_args("Sure! {'a': True}"), {"a": True})
        self.assertEqual(parse_args('"{\\"a\\": 2}"'), {"a": 2})
        self.assertIn("_error", parse_args("no json here"))


class Registry(Isolated):
    def test_disable_remove_restore_without_code_changes(self):
        s = self.server(openai_provider(["m1", "m2"]))
        self.add("t_a", s.url)
        self.add("t_b", s.url)
        asyncio.run(discovery.refresh(self.con, self.mine()))
        self.assertEqual(set(self.mine()), {"t_a", "t_b"})

        self.cli("providers", "disable", "t_a")
        self.assertFalse(self.mine()["t_a"]["enabled"])
        self.assertEqual(set(config.usable(self.mine())), {"t_b"})
        self.cli("providers", "remove", "t_b")
        self.assertNotIn("t_b", self.mine())
        # history survives removal
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM models WHERE provider='t_b'").fetchone()[0], 2)
        self.cli("providers", "restore", "t_b")
        self.cli("providers", "enable", "t_a")
        self.assertEqual(set(config.usable(self.mine())), {"t_a", "t_b"})
        # shipped providers.yaml was never touched
        with open(config.BASE) as f:
            self.assertNotIn("t_a", f.read())

    def test_running_session_survives_registry_changes(self):
        """A session on t_a keeps working while other providers are removed and disabled under it."""
        s = self.server(openai_provider(["m1"]))
        for n in ("t_a", "t_b", "t_c"):
            self.add(n, s.url)
        ws = tempfile.mkdtemp(dir=self.tmp)
        open(os.path.join(ws, "a.py"), "w").close()
        state = {"turn": 0}

        def reply(_):
            state["turn"] += 1
            if state["turn"] == 1:  # change the registry while the session is mid-flight
                self.cli("providers", "disable", "t_b")
                self.cli("providers", "remove", "t_c")
                return {"role": "assistant", "content": None, "tool_calls": [{
                    "id": "1", "type": "function", "function": {"name": "list_files", "arguments": "{}"}}]}
            return {"role": "assistant", "content": "finished"}
        s2 = self.server(openai_provider(["m1"], reply=reply))
        self.add("t_a", s2.url)
        adapter = make_adapter("t_a", self.mine()["t_a"])
        result = asyncio.run(loop.run("list files", Fixed(adapter, "m1"), Tools(ws, lambda *_: True, "trusted"), log=lambda s: None))
        self.assertTrue(result["done"])
        self.assertEqual(set(config.usable(config.load_providers())) & {"t_a", "t_b", "t_c"}, {"t_a"})

    def test_add_provider_at_runtime_with_zero_code(self):
        s = self.server(openai_provider(["brand-new-model", "another"]))
        os.environ["NEWCO_KEY"] = "n-123456789"
        self.addCleanup(os.environ.pop, "NEWCO_KEY")
        code, out = self.cli("providers", "add", "t_newco", "--base-url", s.url + "/v1", "--key-env", "NEWCO_KEY")
        self.assertEqual(code, 0, out)
        _, out = self.cli("refresh", "--provider", "t_newco")
        self.assertIn("2 models", out)
        _, out = self.cli("probe", "--provider", "t_newco")
        self.assertIn("active", out)
        _, out = self.cli("models", "--provider", "t_newco")
        self.assertIn("brand-new-model", out)
        self.assertIn("active", out)


class Discovery(Isolated):
    def test_vanished_models_and_bad_providers(self):
        live = ["m1", "m2", "m3"]
        good = self.server(openai_provider(lambda: live))
        bad = self.server(openai_provider([], fail_status=500))
        self.add("t_good", good.url)
        self.add("t_bad", bad.url)
        self.add("t_dead", "http://127.0.0.1:9")  # nothing listens here
        report = asyncio.run(discovery.refresh(self.con, self.mine(), force=True))
        self.assertEqual(report["t_good"], 3)
        self.assertIn("500", report["t_bad"])
        self.assertIn("ProviderError", report["t_dead"])
        live.remove("m2")
        asyncio.run(discovery.refresh(self.con, self.mine(), force=True))
        st = dict(self.con.execute("SELECT model, status FROM models WHERE provider='t_good'").fetchall())
        self.assertEqual(st, {"m1": "probation", "m2": "gone", "m3": "probation"})
        # fresh lists are not fetched again
        n = len(good.requests)
        asyncio.run(discovery.refresh(self.con, self.mine()))
        self.assertEqual(len(good.requests), n)

    def test_probe_skips_a_model_without_quota(self):
        def h(method, path, body):
            if method == "GET":
                return 200, {"data": [{"id": "a-big", "context_length": 1000000}, {"id": "b-small", "context_length": 8000}]}
            if body["model"] == "a-big":
                return 429, {"error": {"message": "limit: 0"}}
            from tests.fakes import last_user, smart_reply
            return 200, {"choices": [{"message": smart_reply(last_user(body))}]}
        s = self.server(FakeServer(h))
        self.add("t_q", s.url)
        asyncio.run(discovery.refresh(self.con, self.mine()))
        res = asyncio.run(discovery.probe(self.con, self.mine(), limit=5))
        self.assertEqual([r["model"] for r in res["t_q"]], ["a-big", "b-small"])  # biggest context first
        self.assertTrue(res["t_q"][0]["rate_limited"])
        self.assertEqual(res["t_q"][1]["status"], "active")

    def test_models_extra(self):
        with open(config.EXTRA, "w") as f:
            f.write("t_x:\n  - id: listed-by-hand\n    context: 4096\n    tools: true\n")
        self.add("t_x", "http://127.0.0.1:9", models="extra")
        report = asyncio.run(discovery.refresh(self.con, self.mine()))
        self.assertEqual(report["t_x"], 1)
        r = self.con.execute("SELECT * FROM models WHERE provider='t_x'").fetchone()
        self.assertEqual((r["model"], r["context"], r["tools"]), ("listed-by-hand", 4096, 1))

    def test_probes(self):
        smart = self.server(openai_provider(["s"]))
        dumb = self.server(openai_provider(["d"], reply=lambda t: {"role": "assistant", "content": "no idea"}))
        limited = self.server(openai_provider(["l"], fail_status=429))
        for n, s in (("t_smart", smart), ("t_dumb", dumb)):
            self.add(n, s.url)
        asyncio.run(discovery.refresh(self.con, self.mine()))
        self.add("t_limited", limited.url)
        self.con.execute("INSERT INTO models (provider, model) VALUES ('t_limited', 'l')")
        res = asyncio.run(discovery.probe(self.con, self.mine()))
        self.assertEqual(res["t_smart"][0]["status"], "active")
        self.assertIn("simulated", res["t_dumb"][0].get("error") or "simulated")
        self.assertEqual(res["t_smart"][0]["score"], 1.0)
        self.assertEqual(res["t_dumb"][0]["status"], "failing")
        self.assertTrue(res["t_limited"][0]["rate_limited"])
        row = self.con.execute("SELECT status, probe_fails FROM models WHERE provider='t_limited'").fetchone()
        self.assertEqual(tuple(row), ("probation", 0))  # a 429 is not the model's fault
        for _ in range(2):  # three bad probe runs in total -> disabled
            asyncio.run(discovery.probe(self.con, self.mine(), provider="t_dumb"))
        self.assertEqual(self.con.execute("SELECT status FROM models WHERE provider='t_dumb'").fetchone()[0], "disabled")


class Scale(Isolated):
    PROVIDERS, MODELS = 120, 50

    def test_many_providers_and_thousands_of_models(self):
        def handler(method, path, body):  # one server plays every provider: /p<i>/models
            i = path.split("/")[1]
            return 200, {"data": [{"id": f"{i}-model-{j}", "context_length": 8192 * (1 + j % 16)}
                                  for j in range(self.MODELS)]}
        s = self.server(FakeServer(handler))
        for i in range(self.PROVIDERS):
            self.add(f"t_p{i}", f"{s.url}/p{i}")
        t0 = time.perf_counter()
        report = asyncio.run(discovery.refresh(self.con, self.mine(), concurrency=16))
        refresh_s = time.perf_counter() - t0
        self.assertEqual(sum(report.values()), self.PROVIDERS * self.MODELS)
        self.con.execute("UPDATE models SET status='active', tools=1, quality=abs(random() % 100) / 100.0")
        # the cheap prefilter the router will run before scoring
        t0 = time.perf_counter()
        for _ in range(100):
            rows = self.con.execute("SELECT provider, model, quality FROM models WHERE status='active' AND tools=1 "
                                    "AND context >= ? ORDER BY quality DESC LIMIT 50", (100_000,)).fetchall()
        query_ms = (time.perf_counter() - t0) * 10
        rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        print(f"\n[scale] {self.PROVIDERS} providers, {self.PROVIDERS * self.MODELS} models: refresh {refresh_s:.2f}s, "
              f"prefilter {query_ms:.2f} ms/query, peak RSS {rss_mb:.0f} MB")
        self.assertEqual(len(rows), 50)
        self.assertLess(query_ms, 50)
        self.assertLess(rss_mb, 500)


if __name__ == "__main__":
    unittest.main()
