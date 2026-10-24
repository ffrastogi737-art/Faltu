"""Internal normalized format. Adapters convert to and from this, so a
session can move between providers at any step."""
from dataclasses import dataclass, field


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict  # already parsed; a parse failure is reported as {"_error": raw}


@dataclass
class Message:
    role: str  # system | user | assistant | tool
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str = ""  # set when role == "tool"


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class Response:
    message: Message
    finish_reason: str
    usage: Usage
    provider: str
    model: str


class ProviderError(Exception):
    def __init__(self, provider, status, detail):
        super().__init__(f"{provider}: HTTP {status}: {detail}")
        self.provider, self.status = provider, status
