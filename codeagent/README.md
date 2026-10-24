# E.D.I.T.H.

**Efficient Developer Interface for Tech & Hacks**: a terminal-first coding agent. Give it a task; it reads your code, plans, edits with small patches, runs your tests, gets a second opinion from a different model, and reports back with evidence.

Its brain is not one model: a **smart router** picks the best model for every single step across many LLM providers (mostly free tiers), fails over when one is rate-limited or down, and spreads load so no free quota runs dry. Python, one dependency (PyYAML), runs on Android (Termux), a 4 GB Windows laptop, and free cloud hosts.

Status: all phases (0-9) built and tested with local fake providers (80 tests). **Not yet tested with a real provider's model** (no keys were available during the build). See [reports/](reports/) and the honest limits in [SECURITY.md](SECURITY.md) and [RISKS.md](RISKS.md).

## Install

### Android (Termux): first target

```bash
pkg install python git ctags nodejs-lts    # ctags and nodejs are optional (better repo map, JS checks)
git clone <this repo> && cd <repo>/codeagent
pip install -e .
cp .env.example .env && nano .env          # fill only the keys you have
termux-wake-lock                           # keeps long tasks alive when the screen is off
edith
```

### Windows 10/11 (4 GB RAM)

Install Python 3.11+ from python.org (tick "Add to PATH") and Git for Windows, then in PowerShell:

```powershell
git clone <this repo>; cd <repo>\codeagent
py -m pip install -e .
copy .env.example .env; notepad .env
edith
```

It needs little memory: a full routed session (with tests and review) peaked at 34 MB here. No local model; everything is stored in SQLite. Commands run through `cmd.exe`. (The Windows path is written but has not been run on Windows yet.)

### Linux, WSL or a free cloud VM

```bash
sudo apt install python3 python3-pip git bubblewrap universal-ctags   # bubblewrap: commands run without network
cd codeagent && pip install -e . && cp .env.example .env
edith serve --host 127.0.0.1 --port 8765     # optional API; put a TLS proxy in front before exposing it
```

## First run

```bash
edith providers                  # every provider: on/off, keys, models, health
edith refresh                    # fetch model lists from every provider with a key
edith probe                      # test a few models each: reply, tool call, JSON, small code fix
edith providers trust groq       # allow a provider to see your code (read its data policy first)
cd your-project
edith                            # welcome screen, then type your task
```

No provider may see your code until you `trust` it. Leave `EDITH_PROVIDER`/`EDITH_MODEL` empty in `.env` for automatic routing, or set them to always use one model.

## Everyday commands

```bash
edith run "fix the failing test"                # one task
edith run "how should I add caching?" --mode plan   # read-only; writes a plan
edith team "add rate limiting with tests"       # supervisor + specialists, parallel in git worktrees
edith sessions | report <id> | resume <id> | rewind <id> --to 1 [--git]
edith memory | memory add "..." | dream         # long-term lessons
edith dashboard | cost                          # calls, errors, latency, cost per provider
edith route explain --task-type debug           # how the router ranks models right now
edith route pin debug=<provider>/<model> | ban <provider> | force <provider>|off | paid on|off | budget 50
edith providers add <name> --base-url <url> --key-env <VAR>   # any OpenAI-compatible API, no code
edith providers disable|enable|remove|restore <name>
edith eval [--compare latest]                   # 24 benchmark tasks; better or worse than last time?
edith serve | mcp                               # HTTP/WebSocket API, or MCP server for other agents
edith run "..." --headless --mode trusted       # CI: no prompts, JSON result, exit code
```

Options go after the subcommand (`edith run "..." --model X`).

**Modes**: `default` asks before every edit and command; `accept_edits` asks only before commands; `trusted` asks only for consequential actions (push, publish, system packages, writes outside the project, network); `plan` only reads; `bypass` asks nothing (off unless `allow_bypass: true`; the built-in deny list still applies).

## Settings: `~/.edith/settings.yaml`

```yaml
permissions:
  allow: ["python -m unittest*", "npm test*"]   # commands that never ask
  ask: ["docker *"]
  deny: ["make deploy*"]
  network: ask                                   # ask | allow | deny
  network_allow: [pypi.org, docs.python.org]     # hosts web_fetch may use without asking
hooks:
  - {event: before_tool, match: write_file, block: "no new files in this repo"}
  - {event: after_tool, match: edit_file, command: "ruff format --quiet ."}
context_budget: 32000                            # tokens before compaction starts
trusted_workspaces: [~/projects/myapp]           # only these may add allow rules/hooks/MCP in .edith/settings.yaml
mcp_servers:
  github: {command: npx, args: ["-y", "@modelcontextprotocol/server-github"]}
```

Project instructions: put an `AGENT.md` (or `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) in your project. Skills: `~/.edith/skills/<name>/SKILL.md`. Custom agents: `~/.edith/agents/<name>.md`. Plugins: `~/.edith/plugins/<name>/` with `skills/` and `agents/`.

Provider changes (keys lists, limits, trust) are in `~/.edith/providers.local.yaml`; `providers.yaml` here is the shipped base.

## API (for a phone app such as JARVIS)

```bash
TOKEN=$(cat ~/.edith/api_token)
curl -s -H "Authorization: Bearer $TOKEN" -d '{"task":"fix the failing test","workspace":"'$PWD'"}' localhost:8765/tasks
curl -s -H "Authorization: Bearer $TOKEN" "localhost:8765/tasks/<id>/events?after=0"
curl -s -H "Authorization: Bearer $TOKEN" -d '{"allow":true}' localhost:8765/tasks/<id>/approvals/<approval id>
```

Live events and approvals: WebSocket `ws://localhost:8765/tasks/<id>/ws?token=...`. Full list in `agent/server.py`. From another agent: MCP `{"command": "edith", "args": ["mcp"]}`.

## Docs

[ARCHITECTURE.md](ARCHITECTURE.md) (how it fits together) · [DECISIONS.md](DECISIONS.md) (every design choice and why) · [ADDING_PROVIDERS.md](ADDING_PROVIDERS.md) · [SECURITY.md](SECURITY.md) · [RISKS.md](RISKS.md) · [evals/README.md](evals/README.md)

## Develop

```bash
python -m unittest discover tests     # 80 tests, about a minute; no network or keys needed
edith eval --oracle && edith eval --noop   # must print 24/24 and 0/24
```
