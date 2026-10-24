"""Google Gemini native API (generateContent)."""
import asyncio

from ..messages import Message, ProviderError, Response, ToolCall, Usage
from .openai_compat import OpenAICompat
from .repair import parse_args


class Gemini(OpenAICompat):
    def headers(self):
        return {"x-goog-api-key": self.key, "Content-Type": "application/json", "User-Agent": "edith-agent"}

    def body(self, model, messages, tools):
        names = {}  # tool_call_id -> tool name; Gemini matches responses by name
        contents, system = [], []
        for m in messages:
            if m.role == "system":
                system.append(m.content)
                continue
            if m.role == "tool":
                role, parts = "user", [{"functionResponse": {"name": names.get(m.tool_call_id, "tool"),
                                                             "response": {"result": m.content}}}]
            elif m.role == "assistant":
                role = "model"
                parts = ([{"text": m.content}] if m.content else []) + [
                    {"functionCall": {"name": t.name, "args": t.arguments},
                     **({"thoughtSignature": t.meta["thoughtSignature"]} if "thoughtSignature" in t.meta else {})}
                    for t in m.tool_calls]
                names.update({t.id: t.name for t in m.tool_calls})
            else:
                role, parts = "user", [{"text": m.content}]
            if contents and contents[-1]["role"] == role:  # Gemini wants alternating turns
                contents[-1]["parts"] += parts
            else:
                contents.append({"role": role, "parts": parts or [{"text": ""}]})
        body = {"contents": contents}
        if system:
            body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system)}]}
        if tools:
            body["tools"] = [{"functionDeclarations": tools}]
        return body

    async def chat(self, model, messages, tools):
        data = await asyncio.to_thread(self._request, f"/models/{model}:generateContent",
                                       self.body(model, messages, tools))
        return self.parse(data, model)

    def parse(self, data, model):
        cands = data.get("candidates") or []
        if not cands:
            reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates")
            raise ProviderError(self.name, 200, f"empty response: {reason}")
        c = cands[0]
        text, calls = [], []
        for i, part in enumerate((c.get("content") or {}).get("parts") or []):
            if "text" in part and not part.get("thought"):
                text.append(part["text"])
            if "functionCall" in part:
                fc = part["functionCall"]
                meta = {"thoughtSignature": part["thoughtSignature"]} if "thoughtSignature" in part else {}
                calls.append(ToolCall(fc.get("id") or f"call_{i}", fc["name"], parse_args(fc.get("args")), meta))
        u = data.get("usageMetadata") or {}
        return Response(Message("assistant", "".join(text), calls), c.get("finishReason", ""),
                        Usage(u.get("promptTokenCount", 0), u.get("candidatesTokenCount", 0)), self.name, model)

    async def list_models(self):
        out, token = [], ""
        while True:
            path = self.models_path + "?pageSize=1000" + (f"&pageToken={token}" if token else "")
            data = await asyncio.to_thread(self._request, path)
            for m in data.get("models") or []:
                if "generateContent" not in (m.get("supportedGenerationMethods") or []):
                    continue
                out.append({"model": m["name"].removeprefix("models/"), "context": m.get("inputTokenLimit"),
                            "max_output": m.get("outputTokenLimit"), "tools": None, "vision": None, "free": None})
            token = data.get("nextPageToken")
            if not token:
                return out

