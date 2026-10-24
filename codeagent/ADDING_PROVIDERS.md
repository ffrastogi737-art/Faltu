# How to add a provider

There is no limit on how many providers, keys or models E.D.I.T.H. uses. Most providers need **zero code**.

## 1. OpenAI-compatible API (most providers): no code

If the provider documents a `POST /chat/completions` endpoint in OpenAI's format:

```bash
echo 'NEWCO_API_KEY=sk-...' >> codeagent/.env
edith providers add newco --base-url https://api.newco.ai/v1 --key-env NEWCO_API_KEY
edith refresh --provider newco          # lists its models (GET <base-url>/models)
edith probe --provider newco            # tests a few: reply, tool call, JSON, code fix
edith providers trust newco             # only if its data policy is OK for your code
```

The router starts using its models as soon as a probe marks one `active`. New models start on probation and get a small share of traffic until they prove themselves.

Options for `providers add`:

| option | when |
|---|---|
| `--models-path /v1/models` or a full URL | the model list is not at `<base-url>/models` |
| `--models-path extra` | there is no list endpoint: put the models in `models_extra.yaml` |
| `--api gemini \| cohere \| horde` | the provider speaks one of these native formats |

Other settings go in `~/.edith/providers.local.yaml` under the provider's name:

```yaml
providers:
  newco:
    key_env: NEWCO_API_KEY,NEWCO_API_KEY_2   # several keys: the router uses the one with most quota left
    limits: {rpm: 30, rpd: 1000}             # if the provider does not send rate-limit headers
    free_tier: true                          # true, false (paid: needs a budget) or unknown
    allow_private_code: false                # what `providers trust/untrust` changes
```

`{VAR}` in a URL is filled from the environment, e.g. `https://api.example.com/accounts/{ACCOUNT_ID}/v1`.

## 2. A provider with its own format: a small adapter

Write `agent/providers/<name>.py` with a class that extends `OpenAICompat` and overrides only what differs:

```python
from ..messages import Message, Response, ToolCall, Usage
from .openai_compat import OpenAICompat
from .repair import parse_args


class NewCo(OpenAICompat):
    chat_path = "/generate"                      # if the endpoint differs

    def headers(self):                           # if auth differs
        return {"X-Api-Key": self.key, "Content-Type": "application/json"}

    def body(self, model, messages, tools):      # internal messages -> provider request
        ...

    def parse(self, data, model):                # provider response -> internal Response
        calls = [ToolCall(c["id"], c["name"], parse_args(c["args"])) for c in data.get("calls", [])]
        return Response(Message("assistant", data["text"], calls), data.get("stop", ""),
                        Usage(data["in"], data["out"]), self.name, model)

    async def list_models(self):                 # rows: {"model", "context", "max_output", "tools", "vision", "free", ...}
        ...
```

Register it in `agent/providers/__init__.py` (`ADAPTERS = {..., "newco": NewCo}`) and use `api: newco` in the registry. Look at `gemini.py` (different message shape), `cohere.py` (different response) and `horde.py` (async jobs) for complete examples.

Rules every adapter must keep:
- Convert to and from the internal format in `agent/messages.py` only. The router replays the same history to any provider, so never keep provider-specific state outside `ToolCall.meta`.
- Run tool-call arguments through `parse_args` (the repair layer).
- Raise `ProviderError(name, http_status, detail)` on failures, with `retry_after` set when the provider sends it. The router uses the status for cooldowns and failover.
- Never log or return the key.

Add a test with a local fake server (see `tests/test_phase2.py`, class `Adapters`).

## Removing or pausing a provider

```bash
edith providers disable newco    # stops routing to it, keeps everything
edith providers remove newco     # hides it; its stats stay in ~/.edith/state.db
edith providers restore newco    # brings it back with its history
```
