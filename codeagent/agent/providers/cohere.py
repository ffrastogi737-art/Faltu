"""Cohere v2 chat API. Messages and tool calls are OpenAI-shaped; the
response and model list are not."""
from ..messages import Message, ProviderError, Response, ToolCall, Usage
from .openai_compat import OpenAICompat
from .repair import parse_args


class Cohere(OpenAICompat):
    chat_path = "/chat"

    def parse(self, data, model):
        msg = data.get("message")
        if msg is None:
            raise ProviderError(self.name, 200, f"no message in response: {str(data)[:300]}")
        text = "".join(c.get("text", "") for c in msg.get("content") or [] if c.get("type") == "text")
        calls = [ToolCall(c.get("id") or f"call_{i}", c["function"]["name"], parse_args(c["function"].get("arguments")))
                 for i, c in enumerate(msg.get("tool_calls") or [])]
        tokens = (data.get("usage") or {}).get("tokens") or {}
        return Response(Message("assistant", text, calls), data.get("finish_reason", ""),
                        Usage(int(tokens.get("input_tokens", 0)), int(tokens.get("output_tokens", 0))), self.name, model)

