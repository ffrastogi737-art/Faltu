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
    router.py           classify step, filter, score, failover, quotas  (P3)
    tools.py            read/list/grep/repo_map/edit/write/run_command/
                        git/check/web_fetch/web_search/screenshot       (P1, P4)
    sandbox.py          command policy + bwrap/subprocess execution     (P4)
    hooks.py            lifecycle hooks                                 (P4)
    context.py          prompt composer, project memory, skills,
                        graduated compaction                            (P5)
    memory.py           SQLite FTS5 lessons, dreaming job               (P5)
    session.py          JSONL log, snapshots, git checkpoint, rewind    (P5)
    verify.py           check detection/runner, Reviewer                (P6)
    agents.py           supervisor, specialists, task board, worktrees  (P7)
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
