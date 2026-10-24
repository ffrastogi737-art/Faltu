"""Local HTTP servers that imitate provider APIs for tests."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FakeServer:
    """handler(method, path, body) -> (status, json_obj) ; every request is recorded."""

    def __init__(self, handler):
        self.requests = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def _do(self, method):
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n)) if n else None
                outer.requests.append((method, self.path, {k.lower(): v for k, v in self.headers.items()}, body))
                status, obj = handler(method, self.path, body)
                data = json.dumps(obj).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                if status == 429:
                    self.send_header("Retry-After", "7")
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                self._do("GET")

            def do_POST(self):
                self._do("POST")

            def log_message(self, *a):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def last_user(body):
    return [m for m in body["messages"] if m["role"] == "user"][-1]["content"]


def smart_reply(text):
    """What a capable model would answer to each probe, in OpenAI format."""
    if "pong" in text:
        return {"role": "assistant", "content": "pong"}
    if "add tool" in text:
        return {"role": "assistant", "content": None, "tool_calls": [{
            "id": "t1", "type": "function", "function": {"name": "add", "arguments": '{"a": 2, "b": 3}'}}]}
    if "JSON" in text:
        return {"role": "assistant", "content": '{"city": "Paris", "country": "France"}'}
    if "is_even" in text:
        return {"role": "assistant", "content": "def is_even(n):\n    return n % 2 == 0"}
    return {"role": "assistant", "content": "done"}


def openai_provider(models, reply=smart_reply, fail_status=None):
    """An OpenAI-compatible provider. models: list of ids or callable returning it."""
    def handler(method, path, body):
        if fail_status:
            return fail_status, {"error": "simulated"}
        if method == "GET" and path.endswith("/models"):
            ids = models() if callable(models) else models
            return 200, {"data": [{"id": m, "context_length": 32768} for m in ids]}
        if path.endswith("/chat/completions"):
            msg = reply(last_user(body))
            return 200, {"choices": [{"message": msg, "finish_reason": "stop"}],
                         "usage": {"prompt_tokens": 7, "completion_tokens": 3}}
        return 404, {"error": "not found"}
    return FakeServer(handler)
