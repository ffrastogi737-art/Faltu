"""Model Context Protocol over stdio (newline-delimited JSON-RPC 2.0).

Client: starts the servers listed under `mcp_servers` in settings, lists
their tools and exposes them to the agent lazily: the prompt only names
them; `tool_schema` loads one schema and `mcp_call` runs it.
Server: `edith mcp` lets other agents (Claude Code, Codex, ...) use
E.D.I.T.H. as a tool."""
import json
import os
import subprocess
import sys
import threading

PROTOCOL = "2025-06-18"


class McpError(Exception):
    pass


class StdioClient:
    def __init__(self, name, command, args=(), env=None, timeout=60):
        self.name, self.timeout = name, timeout
        self.proc = subprocess.Popen([command, *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, env={**os.environ, **(env or {})})
        self.lock, self.next_id = threading.Lock(), 0
        self.request("initialize", {"protocolVersion": PROTOCOL, "capabilities": {},
                                    "clientInfo": {"name": "edith", "version": "0"}})
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.tools = {t["name"]: t for t in self.request("tools/list", {}).get("tools", [])}

    def _send(self, msg):
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def request(self, method, params):
        with self.lock:
            self.next_id += 1
            rid = self.next_id
            self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
            result = {}

            def read():
                while True:
                    line = self.proc.stdout.readline()
                    if not line:
                        result["error"] = {"message": "server closed the connection"}
                        return
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if msg.get("id") == rid:
                        result.update(msg)
                        return
            t = threading.Thread(target=read, daemon=True)
            t.start()
            t.join(self.timeout)
            if t.is_alive():
                raise McpError(f"{self.name}: {method} timed out")
            if "error" in result:
                raise McpError(f"{self.name}: {result['error'].get('message')}")
            return result.get("result") or {}

    def call(self, tool, arguments):
        r = self.request("tools/call", {"name": tool, "arguments": arguments or {}})
        text = "\n".join(c.get("text", json.dumps(c)) for c in r.get("content") or [])
        return ("error: " if r.get("isError") else "") + text

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(5)
            self.proc.stdin.close()
            self.proc.stdout.close()
        except (OSError, subprocess.TimeoutExpired):
            pass


class McpTools:
    """Adds `tool_schema` and `mcp_call` to an agent for every configured MCP server."""

    def __init__(self, servers, log=print):
        self.clients = {}
        for name, spec in (servers or {}).items():
            try:
                self.clients[name] = StdioClient(name, spec["command"], spec.get("args") or [], spec.get("env"))
            except (OSError, McpError, KeyError) as e:
                log(f"MCP server {name!r} not available: {e}")

    def catalog(self):
        return [(f"mcp__{s}__{t}", (d.get("description") or "")[:150]) for s, c in self.clients.items()
                for t, d in c.tools.items()]

    def _split(self, full):
        try:
            _, server, tool = full.split("__", 2)
            return self.clients[server], tool
        except (ValueError, KeyError):
            raise McpError(f"unknown MCP tool {full!r}; see the list in your instructions") from None

    def schema(self, name):
        client, tool = self._split(name)
        return json.dumps(client.tools[tool].get("inputSchema") or {}, indent=1)

    def install(self, tools):
        """Registers handlers on a Tools object and returns the specs to offer the model."""
        if not self.clients:
            return []

        def call(name, arguments=None):
            client, tool = self._split(name)
            if not tools._allowed("command", f"MCP tool {name} {json.dumps(arguments)[:1500]}"):
                return "user rejected this MCP call"
            return client.call(tool, arguments)
        tools.extra["tool_schema"] = lambda name: self.schema(name)
        tools.extra["mcp_call"] = call
        return [{"name": "tool_schema", "read_only": True, "description": "Get the input schema of an MCP tool.",
                 "parameters": {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}},
                {"name": "mcp_call", "description": "Call an MCP tool (get its schema first).",
                 "parameters": {"type": "object", "required": ["name"], "properties": {
                     "name": {"type": "string"}, "arguments": {"type": "object"}}}}]

    def close(self):
        for c in self.clients.values():
            c.close()


# --- server ---------------------------------------------------------------

SERVER_TOOLS = [
    {"name": "edith_run_task", "description": "Give E.D.I.T.H. a coding task in a workspace. It plans, edits, runs "
     "tests, gets a review and returns its report. Mode 'plan' only reads; 'accept_edits' may edit but not run "
     "commands; 'trusted' may run commands (consequential actions are always refused here).",
     "inputSchema": {"type": "object", "required": ["task", "workspace"], "properties": {
         "task": {"type": "string"}, "workspace": {"type": "string"},
         "mode": {"type": "string", "enum": ["plan", "accept_edits", "trusted"]},
         "team": {"type": "boolean"}, "max_steps": {"type": "integer"}}}},
    {"name": "edith_models", "description": "Usable models with status and probe scores.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "edith_session_report", "description": "The report of an earlier E.D.I.T.H. session.",
     "inputSchema": {"type": "object", "required": ["session"], "properties": {"session": {"type": "string"}}}},
]


def serve_stdio(handle_tool, stdin=sys.stdin, stdout=sys.stdout):
    """Blocking loop. handle_tool(name, arguments) -> text."""
    def reply(rid, result=None, error=None):
        msg = {"jsonrpc": "2.0", "id": rid}
        msg.update({"error": error} if error else {"result": result})
        stdout.write(json.dumps(msg) + "\n")
        stdout.flush()

    for line in stdin:
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        method, rid, params = msg.get("method"), msg.get("id"), msg.get("params") or {}
        if rid is None:
            continue  # notifications
        if method == "initialize":
            reply(rid, {"protocolVersion": params.get("protocolVersion", PROTOCOL), "capabilities": {"tools": {}},
                        "serverInfo": {"name": "edith", "version": "0"}})
        elif method == "ping":
            reply(rid, {})
        elif method == "tools/list":
            reply(rid, {"tools": SERVER_TOOLS})
        elif method == "tools/call":
            try:
                text = handle_tool(params.get("name"), params.get("arguments") or {})
                reply(rid, {"content": [{"type": "text", "text": text}], "isError": False})
            except Exception as e:  # noqa: BLE001 - report every failure to the calling agent
                reply(rid, {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}], "isError": True})
        else:
            reply(rid, error={"code": -32601, "message": f"unknown method {method}"})
