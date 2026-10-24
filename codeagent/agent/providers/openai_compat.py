"""Generic adapter for any OpenAI-compatible chat-completions API."""
import asyncio
import json
import urllib.error
import urllib.request

from ..messages import Message, ProviderError, Response, ToolCall, Usage


def _to_wire(m):
    out = {"role": m.role, "content": m.content}
    if m.tool_calls:
        out["tool_calls"] = [
            {"id": t.id, "type": "function",
             "function": {"name": t.name, "arguments": json.dumps(t.arguments)}}
            for t in m.tool_calls]
    if m.role == "tool":
        out["tool_call_id"] = m.tool_call_id
    return out


def _parse_args(raw):
    if isinstance(raw, dict):
        return raw
    try:
        args = json.loads(raw or "{}")
        return args if isinstance(args, dict) else {"_error": raw}
    except json.JSONDecodeError:
        return {"_error": raw}  # the loop tells the model its JSON was broken


def _from_wire(data, name, model):
    choice = data["choices"][0]
    msg = choice["message"]
    calls = [ToolCall(c.get("id") or f"call_{i}", c["function"]["name"], _parse_args(c["function"].get("arguments")))
             for i, c in enumerate(msg.get("tool_calls") or [])]
    u = data.get("usage") or {}
    return Response(Message("assistant", msg.get("content") or "", calls),
                    choice.get("finish_reason") or "", Usage(u.get("prompt_tokens", 0), u.get("completion_tokens", 0)),
                    name, model)


class OpenAICompat:
    def __init__(self, name, base_url, key, timeout=120):
        self.name, self.base_url, self.key, self.timeout = name, base_url, key, timeout

    def _request(self, path, body=None):
        req = urllib.request.Request(
            self.base_url + path, method="POST" if body else "GET",
            data=json.dumps(body).encode() if body else None,
            headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            raise ProviderError(self.name, e.code, e.read()[:500].decode(errors="replace")) from None
        except (urllib.error.URLError, TimeoutError) as e:
            raise ProviderError(self.name, 0, str(e)) from None

    async def chat(self, model, messages, tools):
        body = {"model": model, "messages": [_to_wire(m) for m in messages]}
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
        data = await asyncio.to_thread(self._request, "/chat/completions", body)
        return _from_wire(data, self.name, model)

    async def list_models(self):
        data = await asyncio.to_thread(self._request, "/models")
        return sorted(m["id"] for m in data.get("data", []))
