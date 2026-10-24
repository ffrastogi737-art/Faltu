"""Builds a ready-to-run agent (or team) from options. Shared by the CLI,
the HTTP/WebSocket API and the MCP server so they behave the same."""
import os

from . import config
from .hooks import Hooks
from .loop import Agent
from .mcp import McpTools
from .memory import Memory
from .providers import make_adapter
from .router import Fixed, Quota, Router
from .tools import Tools


class SetupError(Exception):
    pass


def make_brain(con, providers, mode, log, provider=None, model=None):
    """Router (a model per step) unless a provider or model is fixed. Returns (brain, description)."""
    provider = provider or os.environ.get("EDITH_PROVIDER")
    model = model or os.environ.get("EDITH_MODEL")
    if not provider and not model:
        return Router(con, mode=mode, log=log), "auto-routing across all trusted providers"
    ready = config.usable(providers)
    provider = provider or next(iter(ready), None)
    if not provider or provider not in providers:
        raise SetupError(f"Unknown or missing provider `{provider}`. See `edith providers`.")
    if provider not in ready:
        raise SetupError(f"`{provider}` is disabled or {providers[provider].get('key_env')} is empty.")
    if not providers[provider].get("allow_private_code"):
        raise SetupError(f"`{provider}` has allow_private_code: false, so it may not see your code.\n"
                         f"If you trust it: `edith providers trust {provider}`.")
    if not model:  # best probed model of this provider; no names in code
        row = con.execute("SELECT model FROM models WHERE provider=? AND status='active' AND tools=1 "
                          "ORDER BY quality DESC, context DESC LIMIT 1", (provider,)).fetchone()
        if not row:
            raise SetupError(f"No probed model for {provider}. Run `edith refresh` and `edith probe --provider "
                             f"{provider}`, or pass --model.")
        model = row["model"]
    return Fixed(make_adapter(provider, providers[provider]), model), f"fixed: {provider}/{model}"


def build(con, workspace, approve, log, mode="default", provider=None, model=None, max_steps=30,
          max_cost_usd=None, verify=True, review=True, team=False, parallel=True, session=None):
    """Returns (run, info): `await run(task, history=None)` gives the result dict."""
    ws = os.path.realpath(workspace)
    if not os.path.isdir(ws):
        raise SetupError(f"workspace does not exist: {ws}")
    providers = config.load_providers()
    settings = config.load_settings(ws)
    if mode == "bypass" and not settings["allow_bypass"]:
        raise SetupError("bypass mode is off. Set `allow_bypass: true` in ~/.edith/settings.yaml to enable it.")
    secret_values = config.secrets(providers)
    redact = lambda s: config.redact(s, secret_values)  # noqa: E731
    say = lambda s: log(redact(s))  # noqa: E731
    brain, how = make_brain(con, providers, mode, say, provider, model)
    scrub = [k for p in providers.values() for k in config.key_envs(p)]
    probe_tools = Tools(ws, approve, mode, scrub_env=scrub, settings=settings, log=say)
    hooks = Hooks(settings["hooks"], cwd=ws, env=probe_tools._env(), log=say) if settings["hooks"] else None
    mcp = McpTools(settings["mcp_servers"], log=say) if settings["mcp_servers"] else None

    def tools_for(path):
        t = Tools(path, approve, mode, scrub_env=scrub, settings=settings, hooks=hooks, log=say)
        return t

    def agent_for(tools, **kw):
        extra = mcp.install(tools) if mcp else []
        a = Agent(kw.pop("brain", brain), tools, log=say, memory=Memory(con), hooks=hooks, settings=settings,
                  context_budget=settings["context_budget"], redact=redact, extra_tools=extra, **kw)
        if mcp:
            a.mcp_catalog = mcp.catalog()
        return a

    async def run(task, history=None):
        say(f"brain: {how}")
        try:
            if team:
                from .agents import Team
                quota = Quota(con)
                t = Team(con, (lambda: brain) if isinstance(brain, Fixed) else
                         (lambda: Router(con, mode=mode, log=say, quota=quota)),
                         lambda path, allow: tools_for(path), ws, log=say, hooks=hooks, memory=Memory(con),
                         settings=settings, parallel=parallel,
                         agent_kwargs={"redact": redact, "context_budget": settings["context_budget"]})
                return await t.run(task)
            a = agent_for(tools_for(ws), session=session, max_steps=max_steps, max_cost_usd=max_cost_usd,
                          verify_changes=verify, review_changes=review)
            result = await a.run(task, history=history)
            used = sorted({p for p, _ in getattr(brain, "switches", [])})
            if used:
                say(f"providers used: {len(used)} ({', '.join(used)}); model calls: {len(brain.switches)}")
            return result
        finally:
            if mcp:
                mcp.close()

    return run, {"brain": how, "workspace": ws, "mode": mode}
