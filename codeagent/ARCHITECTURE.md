# Architecture

Planned layout. Folders are created in the phase that first needs them, not before.

```
codeagent/
  providers.yaml        provider registry (no models, no keys)
  models_extra.yaml     models for providers without a list endpoint   (Phase 2)
  .env.example          key variable names only
  agent/
    messages.py         internal normalized format: messages, tool calls,
                        tool results, usage, finish reason, errors      (P1)
    loop.py             plan -> tool -> observe -> verify; step/time/cost caps,
                        doom-loop detection, plan mode                  (P1)
    cli.py              `edith` command and welcome screen              (P1)
    config.py           providers.yaml + .env loading, secret redaction (P1)
    tools.py            read/list/grep/edit/write/run_command           (P1)
    providers/
      openai_compat.py  generic adapter (most providers)                (P1)
      gemini.py cohere.py horde.py   native adapters                   (P2)
      repair.py         broken tool-call JSON repair                    (P2)
    config.py           also: providers.local.yaml overlay (registry)   (P2)
    db.py               SQLite: models, discovery, calls                (P2)
    discovery.py        model lists + capability probes                 (P2)
    router/             classify step, filter, score, failover, quotas  (P3)
    tools/              read, write, patch, grep/glob, repo map, shell,
                        git, web, browser, lint                         (P1 basic, P4 rest)
    sandbox.py          restricted subprocess + permission modes        (P4)
    hooks.py            lifecycle hooks                                 (P4)
    context/            prompt composer, compaction, project memory    (P5)
    memory/             SQLite FTS long-term memory, dreaming job       (P5)
    session.py          JSONL log, resume, rewind/checkpoints           (P5)
    verify/             test/lint runner, Reviewer agent                (P6)
    agents/             supervisor, specialists, task board, worktrees  (P7)
    server/             HTTP + WebSocket API, MCP server/client         (P8)
  evals/                20-30 benchmark tasks + reports                 (P9)
  tests/
```

## Request flow

```
CLI / API / MCP
     |
   loop  --(step + task type)-->  router  --(filter, score)-->  adapter --> provider API
     |                               ^                              |
   tools (sandboxed) <---------------+--- stats, quotas, failover --+
     |
 session JSONL + SQLite state
```

The loop never sees provider formats. Adapters translate to and from `messages.py`, which is what makes switching provider at every step possible.
