"""Local HTTP + WebSocket API (standard library only).

Every request needs `Authorization: Bearer <token>` (or `?token=` for
WebSocket clients that cannot set headers). The token comes from
EDITH_API_TOKEN or is generated once into ~/.edith/api_token.

GET  /health                         -> {"ok": true}
GET  /providers | /models            -> registry and discovered models
POST /tasks {task, workspace, mode?, provider?, model?, team?, max_steps?,
             verify?, review?, approval_timeout?}           -> {"id"}
GET  /tasks | /tasks/<id>            -> status, result, session
GET  /tasks/<id>/events?after=N      -> events since N (polling)
GET  /tasks/<id>/ws                  -> WebSocket: every event live; send
                                        {"type": "approve", "id": ..., "allow": true}
POST /tasks/<id>/approvals/<rid> {"allow": bool}
POST /tasks/<id>/cancel
GET  /tasks/<id>/artifacts[/<name>]  -> plan, diff, test report, review, report"""
import asyncio
import base64
import hashlib
import json
import os
import secrets
import struct
import threading
import time
import urllib.parse
import uuid

from . import app, config
from .session import Session

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def api_token():
    tok = os.environ.get("EDITH_API_TOKEN")
    if tok:
        return tok
    path = os.path.join(config.edith_home(), "api_token")
    if not os.path.exists(path):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_urlsafe(24))
    with open(path) as f:
        return f.read().strip()


class Job:
    def __init__(self, task, loop, approval_timeout):
        self.id = uuid.uuid4().hex[:12]
        self.task, self.loop, self.approval_timeout = task, loop, approval_timeout
        self.status, self.result, self.events, self.approvals = "running", None, [], {}
        self.created = time.time()
        self.cond = asyncio.Condition()
        self.atask = None

    def emit(self, event):
        """Thread-safe: tools run in worker threads."""
        def add():
            self.events.append({"seq": len(self.events) + 1, "ts": time.time(), **event})

            async def wake():
                async with self.cond:
                    self.cond.notify_all()
            asyncio.ensure_future(wake())
        self.loop.call_soon_threadsafe(add)

    def log(self, text):
        self.emit({"type": "log", "text": text})

    def approve(self, kind, detail):
        """Called from a tool thread; waits for a client's answer or times out (= no)."""
        rid = uuid.uuid4().hex[:8]
        done = threading.Event()
        self.approvals[rid] = {"kind": kind, "detail": detail, "allow": None, "done": done}
        self.emit({"type": "approval", "id": rid, "kind": kind, "detail": detail[:4000]})
        done.wait(self.approval_timeout)
        allow = bool(self.approvals[rid]["allow"])
        self.emit({"type": "approval_result", "id": rid, "allow": allow,
                   "timed_out": not done.is_set()})
        return allow

    def answer(self, rid, allow):
        a = self.approvals.get(rid)
        if not a or a["done"].is_set():
            return False
        a["allow"] = bool(allow)
        a["done"].set()
        return True

    def view(self):
        r = self.result or {}
        return {"id": self.id, "task": self.task, "status": self.status, "created": self.created,
                "session": r.get("session") or r.get("run_id"), "answer": r.get("answer"),
                "pending_approvals": [k for k, a in self.approvals.items() if not a["done"].is_set()],
                "events": len(self.events)}


class Server:
    def __init__(self, con, token=None, log=print):
        self.con, self.token, self.log = con, token or api_token(), log
        self.jobs = {}

    # --- http plumbing ---
    async def handle(self, reader, writer):
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 30)
            lines = head.decode("latin-1").split("\r\n")
            method, target, _ = lines[0].split(" ", 2)
            headers = {k.strip().lower(): v.strip() for k, v in (l.split(":", 1) for l in lines[1:] if ":" in l)}
            n = int(headers.get("content-length") or 0)
            if n > 2_000_000:
                return await self._send(writer, 413, {"error": "body too large"})
            body = await reader.readexactly(n) if n else b""
            url = urllib.parse.urlparse(target)
            query = dict(urllib.parse.parse_qsl(url.query))
            auth = headers.get("authorization", "")
            given = auth[7:] if auth.lower().startswith("bearer ") else query.get("token", "")
            if not secrets.compare_digest(given.encode(), self.token.encode()):
                return await self._send(writer, 401, {"error": "missing or wrong token"})
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return await self._send(writer, 400, {"error": "body is not JSON"})
            parts = [p for p in url.path.split("/") if p]
            if headers.get("upgrade", "").lower() == "websocket" and len(parts) == 3 and parts[2] == "ws":
                return await self._websocket(reader, writer, headers, parts[1])
            status, out = await self.route(method, parts, data, query)
            await self._send(writer, status, out)
        except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, ValueError):
            pass
        finally:
            try:
                writer.close()
            except OSError:
                pass

    async def _send(self, writer, status, obj, content_type="application/json"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj, default=str).encode()
        reason = {200: "OK", 201: "Created", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found",
                  409: "Conflict", 413: "Too Large"}.get(status, "OK")
        writer.write(f"HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\n"
                     f"Connection: close\r\n\r\n".encode() + body)
        await writer.drain()

    # --- routes ---
    async def route(self, method, parts, data, query):
        if parts == ["health"]:
            return 200, {"ok": True, "jobs": len(self.jobs)}
        if parts == ["providers"]:
            ps = config.load_providers()
            return 200, [{"name": n, "enabled": bool(p.get("enabled")), "keys": len(config.keys(p)),
                          "private_code": bool(p.get("allow_private_code")), "status": p.get("status")}
                         for n, p in ps.items()]
        if parts == ["models"]:
            rows = self.con.execute("SELECT provider, model, status, quality, context, tools FROM models "
                                    "WHERE status IN ('active','probation') ORDER BY quality DESC NULLS LAST LIMIT 500")
            return 200, [dict(r) for r in rows]
        if parts == ["tasks"] and method == "GET":
            return 200, [j.view() for j in self.jobs.values()]
        if parts == ["tasks"] and method == "POST":
            return await self._create(data)
        if len(parts) >= 2 and parts[0] == "tasks":
            job = self.jobs.get(parts[1])
            if not job:
                return 404, {"error": "no such task"}
            rest = parts[2:]
            if not rest:
                return 200, {**job.view(), "result": _public(job.result)}
            if rest == ["events"]:
                after = int(query.get("after", 0))
                return 200, [e for e in job.events if e["seq"] > after]
            if rest == ["cancel"] and method == "POST":
                if job.atask and not job.atask.done():
                    job.atask.cancel()
                return 200, {"ok": True}
            if len(rest) == 2 and rest[0] == "approvals" and method == "POST":
                ok = job.answer(rest[1], data.get("allow"))
                return (200, {"ok": True}) if ok else (409, {"error": "no pending approval with that id"})
            if rest[0] == "artifacts":
                sid = (job.result or {}).get("session")
                if not sid:
                    return 404, {"error": "no artifacts yet"}
                d = os.path.join(Session(sid, resume=True).dir, "artifacts")
                if len(rest) == 1:
                    return 200, sorted(os.listdir(d))
                name = os.path.basename(rest[1])
                path = os.path.join(d, name)
                if not os.path.isfile(path):
                    return 404, {"error": "no such artifact"}
                with open(path, errors="replace") as f:
                    return 200, {"name": name, "content": f.read()}
        return 404, {"error": "not found"}

    async def _create(self, data):
        task, ws = data.get("task"), data.get("workspace")
        if not task or not ws:
            return 400, {"error": "task and workspace are required"}
        mode = data.get("mode", "default")
        if mode not in ("plan", "default", "accept_edits", "trusted", "bypass"):
            return 400, {"error": f"bad mode {mode}"}
        job = Job(task, asyncio.get_running_loop(), float(data.get("approval_timeout", 300)))
        try:
            run, info = app.build(self.con, ws, job.approve, job.log, mode=mode, provider=data.get("provider"),
                                  model=data.get("model"), max_steps=int(data.get("max_steps", 30)),
                                  verify=data.get("verify", True), review=data.get("review", True),
                                  team=bool(data.get("team")))
        except app.SetupError as e:
            return 400, {"error": str(e)}
        self.jobs[job.id] = job

        async def go():
            try:
                job.result = await run(task)
                job.status = job.result.get("status") or ("done" if job.result.get("done") else "stopped")
            except asyncio.CancelledError:
                job.status = "cancelled"
            except Exception as e:  # noqa: BLE001 - one broken job must not take the server down
                job.status, job.result = "error", {"answer": f"{type(e).__name__}: {e}"}
            job.emit({"type": "end", "status": job.status, "answer": (job.result or {}).get("answer")})
        job.atask = asyncio.create_task(go())
        return 201, {"id": job.id, **info}

    # --- websocket ---
    async def _websocket(self, reader, writer, headers, job_id):
        job = self.jobs.get(job_id)
        if not job or "sec-websocket-key" not in headers:
            return await self._send(writer, 404, {"error": "no such task"})
        accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"] + WS_GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
        await writer.drain()

        async def pump():
            sent = 0
            while True:
                async with job.cond:
                    if sent >= len(job.events):
                        await job.cond.wait()
                for e in job.events[sent:]:
                    await ws_send(writer, json.dumps(e, default=str))
                    sent += 1
                    if e["type"] == "end":
                        await ws_send(writer, b"", opcode=8)
                        return

        sender = asyncio.create_task(pump())
        try:
            while not sender.done():
                recv = asyncio.create_task(ws_recv(reader))
                done, _ = await asyncio.wait({recv, sender}, return_when=asyncio.FIRST_COMPLETED)
                if recv not in done:
                    recv.cancel()
                    break
                op, payload = recv.result()
                if op == 8:
                    break
                if op == 9:
                    await ws_send(writer, payload, opcode=10)
                elif op == 1:
                    try:
                        msg = json.loads(payload)
                        if msg.get("type") == "approve":
                            job.answer(msg.get("id"), msg.get("allow"))
                    except (json.JSONDecodeError, AttributeError):
                        pass
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            sender.cancel()


async def ws_send(writer, data, opcode=1):
    payload = data.encode() if isinstance(data, str) else data
    n = len(payload)
    head = bytes([0x80 | opcode]) + (bytes([n]) if n < 126 else
                                     b"\x7e" + struct.pack(">H", n) if n < 65536 else b"\x7f" + struct.pack(">Q", n))
    writer.write(head + payload)
    await writer.drain()


async def ws_recv(reader):
    b0, b1 = await reader.readexactly(2)
    n = b1 & 0x7F
    if n == 126:
        n = struct.unpack(">H", await reader.readexactly(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", await reader.readexactly(8))[0]
    if n > 1_000_000:
        raise ConnectionError("frame too large")
    mask = await reader.readexactly(4) if b1 & 0x80 else b"\0\0\0\0"
    data = bytes(c ^ mask[i % 4] for i, c in enumerate(await reader.readexactly(n)))
    return b0 & 0x0F, data


def _public(result):
    if not result:
        return None
    return {k: v for k, v in result.items() if k in ("done", "status", "answer", "session", "evidence",
                                                     "input_tokens", "output_tokens", "run_id", "checks_passed",
                                                     "review", "board")}


async def serve(con, host="127.0.0.1", port=8765, log=print):
    srv = Server(con, log=log)
    server = await asyncio.start_server(srv.handle, host, port)
    log(f"E.D.I.T.H. API on http://{host}:{port}  (token in ~/.edith/api_token or EDITH_API_TOKEN)")
    async with server:
        await server.serve_forever()
