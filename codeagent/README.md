# E.D.I.T.H.

**Efficient Developer Interface for Tech & Hacks**: a terminal coding agent whose brain is a router over many LLM providers (mostly free tiers). Status: **Phase 6**. Smart router across all providers, sandboxed tools with permissions and hooks, sessions with resume/rewind, memory, automatic verification and a reviewer from another model family. Evidence: [reports/](reports/).

Read next: [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [RISKS.md](RISKS.md), [providers.yaml](providers.yaml).

## Setup on Android (Termux), the first target

```bash
pkg install python git ctags
cd codeagent
pip install -e .
cp .env.example .env    # fill only the keys you have
python -m unittest discover tests
```

## Use

```bash
edith providers                          # every provider: on/off, key, model count, health
edith refresh                            # fetch model lists from every provider with a key
edith probe --provider groq              # test a few models: reply, tool call, JSON, code fix
edith models --provider groq             # discovered models with status and probe score
edith providers trust groq               # allow it to see your code (only if you trust it)
# leave EDITH_PROVIDER / EDITH_MODEL empty for automatic routing; set them to fix one model

edith providers add mynewco --base-url https://api.example.com/v1 --key-env MYNEWCO_KEY
edith providers disable groq | enable groq | remove groq | restore groq
cd your-project
edith                                    # welcome screen, then type a task
edith run "fix the failing test"         # one-shot
edith run "how would you add X?" --mode plan   # read-only, proposes a plan
edith route explain --task-type debug    # how the router ranks models right now
edith route pin debug=groq/<model>       # also: unpin, ban, unban, force <provider>|off, paid on|off, budget 50
edith dashboard                          # calls, errors, latency, cost and cooldowns per provider today
```

Several keys for one provider: `key_env: GROQ_API_KEY,GROQ_API_KEY_2` in providers.local.yaml. Optional limits: `limits: {rpm: 30, rpd: 1000}`.

Modes: `default` asks before every edit and command, `accept_edits` asks only before commands, `trusted` asks only for consequential actions (push, publish, system packages, writes outside the workspace, network), `plan` only reads.

```bash
edith sessions                           # recent sessions and how they ended
edith report <id>                        # evidence: checks, reviewer verdict, files, tokens
edith resume <id> ["extra instruction"]  # continue after a stop or Ctrl-C
edith rewind <id> --to 1 [--git]         # undo a session's file changes
edith memory | memory add "..." | dream  # long-term lessons
```

Settings live in `~/.edith/settings.yaml`:

```yaml
permissions:
  allow: ["python -m unittest*", "ruff *"]   # commands that never ask
  deny: ["make deploy*"]
  network: ask                                # ask | allow | deny
  network_allow: [pypi.org, docs.python.org]  # hosts web_fetch may use without asking
hooks:
  - {event: before_tool, match: write_file, block: "no new files"}
  - {event: after_tool, match: edit_file, command: "ruff format --quiet ."}
context_budget: 32000
trusted_workspaces: [~/projects/myapp]        # only these may add allow rules/hooks in .edith/settings.yaml
```
Options go after the subcommand (`edith run "..." --model X`).

PC (Windows/Linux) setup comes after Termux works.
