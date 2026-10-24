"""Phase 8: HTTP + WebSocket API, MCP server and client, headless mode, artifacts."""
import asyncio
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from agent import config, db
from agent.mcp import StdioClient
from agent.server import Server
from tests.fakes import FakeServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = {"path": "cart.py", "old": "subtotal * discount_percent,", "new": "subtotal * discount_percent / 100,"}


def scripted(delay=0.0):
    def handler(method, path, body):
        time.sleep(delay)
        msgs = body["messages"]
        if "strict code reviewer" in msgs[0]["content"]:
            msg = {"role": "assistant", "content": '{"verdict": "approve", "issues": []}'}
        else:
            n = sum(1 for m in msgs if m["role"] == "tool")
            steps = [("read_file", {"path": "cart.py"}), ("edit_file", FIX)]
            msg = ({"role": "assistant", "content": None, "tool_calls": [{"id": f"c{n}", "type": "function", "function": {
                "name": steps[n][0], "arguments": json.dumps(steps[n][1])}}]} if n < len(steps)
                   else {"role": "assistant", "content": "Fixed the discount."})
        return 200, {"choices": [{"message": msg}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}}
    return handler


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ws = os.path.join(self.tmp, "ws")
        shutil.copytree(os.path.join(ROOT, "examples", "buggy_cart"), self.ws)
        self.home = os.environ["EDITH_HOME"]
        self.saved_local = config.LOCAL
        config.LOCAL = None  # ~/.edith/providers.local.yaml inside the test EDITH_HOME
        self.fake = FakeServer(scripted(getattr(self, "delay", 0.0)))
        os.environ["FAKE_KEY"] = "fake-key-123456"
        config.save_override("fake", {"api": "openai", "base_url": self.fake.url, "key_env": "FAKE_KEY",
                                      "enabled": True, "allow_private_code": True, "free_tier": True})

    def tearDown(self):
        os.remove(config.local_path())
        config.LOCAL = self.saved_local
        self.fake.close()
        shutil.rmtree(self.tmp)

    def env(self):
        return {**os.environ, "EDITH_PROVIDER": "fake", "EDITH_MODEL": "m"}


class Api(Base):
    def setUp(self):
        super().setUp()
        self.con = db.connect(os.path.join(self.tmp, "state.db"))
        self.loop = asyncio.new_event_loop()
        self.srv = Server(self.con, token="t0ken")
        started = threading.Event()

        def run():
            asyncio.set_event_loop(self.loop)
            server = self.loop.run_until_complete(asyncio.start_server(self.srv.handle, "127.0.0.1", 0))
            self.port = server.sockets[0].getsockname()[1]
            started.set()
            self.loop.run_forever()
        threading.Thread(target=run, daemon=True).start()
        started.wait(5)

    def tearDown(self):
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.con.close()
        super().tearDown()

    def http(self, method, path, body=None, token="t0ken"):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {token}"} if token else {})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def create(self, **kw):
        body = {"task": "fix the discount", "workspace": self.ws, "provider": "fake", "model": "m", **kw}
        status, out = self.http("POST", "/tasks", body)
        self.assertEqual(status, 201, out)
        return out["id"]

    def wait(self, jid, timeout=30):
        t0 = time.time()
        while time.time() - t0 < timeout:
            _, j = self.http("GET", f"/tasks/{jid}")
            if j["status"] not in ("running",):
                return j
            time.sleep(0.1)
        self.fail("task did not finish")

    def test_auth_and_errors(self):
        self.assertEqual(self.http("GET", "/health", token=None)[0], 401)
        self.assertEqual(self.http("GET", "/health", token="wrong")[0], 401)
        self.assertEqual(self.http("GET", "/health"), (200, {"ok": True, "jobs": 0}))
        self.assertEqual(self.http("POST", "/tasks", {"task": "x"})[0], 400)
        status, out = self.http("POST", "/tasks", {"task": "x", "workspace": self.ws, "provider": "nope"})
        self.assertEqual(status, 400)
        self.assertIn("Unknown", out["error"])
        self.assertTrue(any(p["name"] == "fake" for p in self.http("GET", "/providers")[1]))

    def test_websocket_live_events_and_approval(self):
        jid = self.create(mode="default")
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        sock.sendall((f"GET /tasks/{jid}/ws?token=t0ken HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n"
                      f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        f = sock.makefile("rb")
        self.assertIn(b"101", f.readline())
        while f.readline() not in (b"\r\n", b""):
            pass
        events = []
        while True:
            b0, b1 = f.read(2)
            if b0 & 0x0F == 8:
                break
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", f.read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", f.read(8))[0]
            e = json.loads(f.read(n))
            events.append(e)
            if e["type"] == "approval":  # approve the edit from the client, as a phone app would
                payload = json.dumps({"type": "approve", "id": e["id"], "allow": True}).encode()
                mask = os.urandom(4)
                sock.sendall(bytes([0x81, 0x80 | len(payload)]) + mask +
                             bytes(c ^ mask[i % 4] for i, c in enumerate(payload)))
        sock.close()
        types = [e["type"] for e in events]
        self.assertIn("approval", types)
        self.assertEqual(events[-1]["type"], "end")
        self.assertEqual(events[-1]["status"], "done")
        self.assertTrue(any(e.get("text", "").startswith("[2] tool edit_file") for e in events))
        approvals = [e for e in events if e["type"] == "approval_result"]
        self.assertTrue(approvals and all(a["allow"] for a in approvals))
        self.assertIn("/ 100", open(os.path.join(self.ws, "cart.py")).read())
        # artifacts over HTTP
        names = self.http("GET", f"/tasks/{jid}/artifacts")[1]
        self.assertIn("report.md", names)
        self.assertIn("diff.patch", names)
        self.assertIn("/ 100", self.http("GET", f"/tasks/{jid}/artifacts/diff.patch")[1]["content"])
        self.assertEqual(self.http("GET", f"/tasks/{jid}/artifacts/..%2F..%2Fstate.db")[0], 404)

    def test_unanswered_approval_is_a_no(self):
        jid = self.create(mode="default", approval_timeout=0.3, verify=False)
        j = self.wait(jid)
        self.assertEqual(j["status"], "done")
        self.assertNotIn("/ 100", open(os.path.join(self.ws, "cart.py")).read())
        ev = self.http("GET", f"/tasks/{jid}/events?after=0")[1]
        self.assertTrue(any(e["type"] == "approval_result" and e["timed_out"] and not e["allow"] for e in ev))
        self.assertEqual(self.http("POST", f"/tasks/{jid}/approvals/nope", {"allow": True})[0], 409)


class ApiCancel(Api):
    delay = 1.0

    def test_cancel(self):
        jid = self.create(mode="trusted")
        time.sleep(0.5)
        self.assertEqual(self.http("POST", f"/tasks/{jid}/cancel", {})[0], 200)
        j = self.wait(jid)
        self.assertIn(j["status"], ("interrupted", "cancelled"))


class Mcp(Base):
    def test_edith_as_mcp_server_used_by_an_mcp_client(self):
        client = StdioClient("edith", sys.executable, ["-m", "agent", "mcp"], env=self.env(), timeout=120)
        self.addCleanup(client.close)
        self.assertEqual(set(client.tools), {"edith_run_task", "edith_models", "edith_session_report"})
        report = client.call("edith_run_task", {"task": "fix the discount", "workspace": self.ws, "mode": "trusted"})
        self.assertIn("# E.D.I.T.H. report: done", report)
        self.assertIn("[PASS] tests", report)
        self.assertIn("/ 100", open(os.path.join(self.ws, "cart.py")).read())
        self.assertTrue(client.call("edith_run_task", {"task": "x", "workspace": self.ws, "mode": "bypass"})
                        .startswith("error: ValueError"))

    def test_agent_uses_an_mcp_server_with_lazy_schemas(self):
        server = os.path.join(self.tmp, "echo_mcp.py")
        with open(server, "w") as f:
            f.write("import json,sys\nfor line in sys.stdin:\n    m=json.loads(line)\n    if 'id' not in m: continue\n"
                    "    r={}\n    if m['method']=='tools/list': r={'tools':[{'name':'shout','description':'Uppercase text',"
                    "'inputSchema':{'type':'object','properties':{'text':{'type':'string'}}}}]}\n"
                    "    if m['method']=='tools/call': r={'content':[{'type':'text','text':m['params']['arguments']['text'].upper()}]}\n"
                    "    print(json.dumps({'jsonrpc':'2.0','id':m['id'],'result':r}),flush=True)\n")
        settings = os.path.join(self.home, "settings.yaml")
        with open(settings, "w") as f:
            f.write(f"mcp_servers:\n  demo: {{command: {sys.executable}, args: ['{server}']}}\n")
        self.addCleanup(os.remove, settings)
        seen = []

        def handler(method, path, body):
            seen.append(body)
            n = sum(1 for m in body["messages"] if m["role"] == "tool")
            calls = [("tool_schema", {"name": "mcp__demo__shout"}),
                     ("mcp_call", {"name": "mcp__demo__shout", "arguments": {"text": "hello"}})]
            msg = ({"role": "assistant", "content": None, "tool_calls": [{"id": f"c{n}", "type": "function", "function": {
                "name": calls[n][0], "arguments": json.dumps(calls[n][1])}}]} if n < 2 else
                   {"role": "assistant", "content": "done"})
            return 200, {"choices": [{"message": msg}], "usage": {}}
        fake = FakeServer(handler)
        self.addCleanup(fake.close)
        config.save_override("fake", {"base_url": fake.url})
        p = subprocess.run([sys.executable, "-m", "agent", "run", "shout hello", "--headless", "--mode", "trusted",
                            "--workspace", self.ws], env=self.env(), capture_output=True, text=True, timeout=120, cwd=ROOT)
        self.assertEqual(p.returncode, 0, p.stderr[-2000:])
        system = seen[0]["messages"][0]["content"]
        self.assertIn("mcp__demo__shout: Uppercase text", system)
        self.assertNotIn("inputSchema", json.dumps(seen[0].get("tools")))  # schema not sent up front
        tool_results = [m["content"] for m in seen[-1]["messages"] if m["role"] == "tool"]
        self.assertIn('"text"', tool_results[0])  # schema loaded on demand
        self.assertEqual(tool_results[1], "HELLO")


class Headless(Base):
    def test_headless_json_and_refusals(self):
        p = subprocess.run([sys.executable, "-m", "agent", "run", "fix the discount", "--headless", "--mode", "trusted",
                            "--workspace", self.ws], env=self.env(), capture_output=True, text=True, timeout=120, cwd=ROOT)
        self.assertEqual(p.returncode, 0, p.stderr[-1500:])
        out = json.loads(p.stdout)
        self.assertTrue(out["done"])
        self.assertTrue(out["evidence"]["checks"][0]["passed"])
        self.assertIn("[2] tool edit_file", p.stderr)  # logs on stderr, JSON alone on stdout
        shutil.copy(os.path.join(ROOT, "examples", "buggy_cart", "cart.py"), self.ws)
        p = subprocess.run([sys.executable, "-m", "agent", "run", "fix the discount", "--headless",
                            "--workspace", self.ws], env=self.env(), capture_output=True, text=True, timeout=120, cwd=ROOT)
        self.assertIn("[headless] refused (edit)", p.stderr)
        self.assertNotIn("/ 100", open(os.path.join(self.ws, "cart.py")).read())


if __name__ == "__main__":
    unittest.main()
