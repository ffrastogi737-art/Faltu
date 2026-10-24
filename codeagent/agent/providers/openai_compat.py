"""Generic adapter for any OpenAI-compatible chat-completions API.
Also covers AI21 and Cloudflare Workers AI, which expose this format."""
import asyncio
import json
import urllib.error
import urllib.request

from ..messages import Message, ProviderError, Response, ToolCall, Usage
from .repair import parse_args


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


def _from_wire(data, name, model):
    choices = data.get("choices") or []
    if not choices:
        raise ProviderError(name, 200, f"no choices in response: {str(data)[:300]}")
    choice = choices[0]
    msg = choice.get("message") or {}
    calls = [ToolCall(c.get("id") or f"call_{i}", c["function"]["name"], parse_args(c["function"].get("arguments")))
             for i, c in enumerate(msg.get("tool_calls") or [])]
    u = data.get("usage") or {}
    return Response(Message("assistant", msg.get("content") or "", calls),
                    choice.get("finish_reason") or "", Usage(u.get("prompt_tokens", 0), u.get("completion_tokens", 0)),
                    name, model)


def _flag(values, *names):
    """1 if any of names is in values, None (unknown) otherwise."""
    return 1 if values and any(n in values for n in names) else None


def model_record(it):
    """One discovered model from any list format we know, as a models-table row."""
    mid = it.get("id") or it.get("name") or it.get("model")
    pricing = it.get("pricing") or {}
    limits = it.get("limits") or {}
    caps = it.get("supported_parameters") or it.get("capabilities") or it.get("features") or []
    free = 1 if (str(mid).endswith(":free") or (pricing and all(str(v) in ("0", "0.0") for v in
                                                                   (pricing.get("prompt"), pricing.get("completion"))))) else None
    hosts = [h for h in it.get("providers") or [] if isinstance(h, dict)]  # Hugging Face router: one entry per host
    tools = _flag(caps, "tools", "tool-calling", "tool_use", "function_calling")
    if hosts:
        tools = tools or (1 if any(h.get("supports_tools") for h in hosts) else None)
        free = free or (1 if any(h.get("is_free") for h in hosts) else None)
    def per_million(v):
        try:
            return float(v) * 1e6 if v not in (None, "", "-1") else None
        except (TypeError, ValueError):
            return None
    return {"model": mid,
            "price_in": per_million(pricing.get("prompt")), "price_out": per_million(pricing.get("completion")),
            "context": it.get("context_length") or it.get("context_window") or limits.get("max_input_tokens")
            or max((h.get("context_length") or 0 for h in hosts), default=0) or None,
            "max_output": it.get("max_completion_tokens") or limits.get("max_output_tokens"),
            "tools": tools,
            "vision": _flag(it.get("input_modalities") or (it.get("architecture") or {}).get("input_modalities") or caps,
                            "image", "vision"),
            "free": free}


class OpenAICompat:
    chat_path = "/chat/completions"

    def __init__(self, name, base_url, key, timeout=120, models_path="/models"):
        self.name, self.base_url, self.key, self.timeout = name, base_url, key, timeout
        self.models_path = models_path
        self.last_headers = {}

    def headers(self):
        return {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json",
                "User-Agent": "edith-agent"}

    def _request(self, path, body=None):
        url = path if path.startswith("http") else self.base_url + path
        if not url.startswith(("https://", "http://")):  # never file:// or other schemes from a config typo
            raise ProviderError(self.name, 0, f"refusing non-http URL {url[:80]}")
        req = urllib.request.Request(url, method="POST" if body is not None else "GET",
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers=self.headers())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                self.last_headers = {k.lower(): v for k, v in r.headers.items()}  # rate-limit info for the router
                return json.load(r)
        except urllib.error.HTTPError as e:
            self.last_headers = {k.lower(): v for k, v in e.headers.items()}
            err = ProviderError(self.name, e.code, e.read()[:500].decode(errors="replace"))
            e.close()
            err.retry_after = e.headers.get("Retry-After")
            raise err from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            raise ProviderError(self.name, 0, str(e)) from None
        except json.JSONDecodeError as e:
            raise ProviderError(self.name, 200, f"invalid JSON from provider: {e}") from None

    def body(self, model, messages, tools):
        body = {"model": model, "messages": [_to_wire(m) for m in messages]}
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
        return body

    def parse(self, data, model):
        return _from_wire(data, self.name, model)

    async def chat(self, model, messages, tools):
        data = await asyncio.to_thread(self._request, self.chat_path, self.body(model, messages, tools))
        return self.parse(data, model)

    def _items(self, data):
        if isinstance(data, list):
            return data
        return data.get("data") or data.get("result") or data.get("models") or []

    async def list_models(self):
        data = await asyncio.to_thread(self._request, self.models_path)
        return [r for r in map(model_record, self._items(data)) if r["model"]]
