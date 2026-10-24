# Decisions

Each entry: decision, why, and what would change it.

## D1. Mobile (Termux) first, PC later
Target order: Android Termux CLI first; Windows/Linux PC only after Termux works fully. Every choice below must work on Termux without root and without a compiler.

## D2. Python 3.11+ with asyncio
Termux ships current Python (`pkg install python`). Python has the widest LLM/HTTP ecosystem and matches the master prompt's default stack.

## D3. One runtime dependency: `pyyaml`
It installs on Termux with plain `pip` (PyYAML falls back to its pure-Python loader). Everything else is stdlib: `urllib` for HTTP (run in `asyncio.to_thread`), `sqlite3`, `subprocess`, `json`, `difflib`.
Phase 1 dropped the planned `httpx`: stdlib `urllib` was enough, so there is one less package to install on the phone.
Rejected for now: pydantic (needs Rust-built `pydantic-core`), tree-sitter (native build), provider SDKs (heavy, one per provider). Revisit only if a pure option fails.

## D4. No provider SDKs: one generic OpenAI-compatible adapter + small native adapters
Most providers speak the OpenAI chat-completions format, so one adapter covers them. Native adapters only for: Gemini, Cohere, AI21, Cloudflare Workers AI, AI Horde (async job polling). All adapters convert to one internal message format, so a session can switch provider at any step.

## D5. No limit on providers, keys or models
`providers.yaml` is the only place a provider exists. Any OpenAI-compatible provider is added with `agent providers add` (zero code). Discovery runs in parallel with a concurrency cap; models are cached in indexed SQLite tables; the router prefilters with SQL before scoring.

## D6. No model names in code or config
Models come only from each provider's list endpoint (cached in SQLite) or from user-edited `models_extra.yaml`. Task-type quality starts from capability probes, not from a hardcoded "best model" list.

## D7. Provider status starts as `unverified`
Per user instruction, Phase 0 did not web-research the provider list: the design treats providers as unlimited and replaceable, so a fixed list's status is less important than runtime checking. Each entry in `providers.yaml` is written from knowledge and marked `unverified` / `unclear` / `dead`. The real status is set by the live probe (`agent providers probe`) once a key is present. A provider with no key, a dead URL or failing probes is skipped, never a crash.
Known dead or doubtful, shipped `enabled: false`: Anyscale Endpoints, Lepton AI, Replit AI, MonsterAPI.

## D8. Privacy default: `allow_private_code: false` everywhere
No provider's data policy has been confirmed yet, so none may see workspace code until you flip the flag. AI Horde stays `false` permanently (volunteer workers). `.env` and anything matching secret patterns is redacted before any request, log or trace.
Consequence: until you set at least one provider to `true`, the agent can only run on non-code tasks. Phase 1 will ask you which providers to trust.

## D9. Sandbox on Termux = restricted subprocess
Termux has no Docker and no bubblewrap without root. Commands run as a subprocess with: workspace as cwd, path allow/deny rules, timeout, output size cap, a scrubbed environment (no API keys passed through), and an approval prompt for anything outside the rules. Optional `proot` isolation when installed. On PC, Docker/bubblewrap are added later behind the same interface.
Limit: "network off during commands" cannot be enforced on unrooted Android. It is enforced by command rules only (e.g. `curl`, `pip install` need approval). Recorded as risk R2.

## D10. Repo map without tree-sitter
Use `ctags` if installed (`pkg install ctags`), else a regex-based symbol scanner for common languages. Tree-sitter can be added later as an optional extra.

## D11. State in SQLite, sessions as append-only JSONL
One SQLite file for registry, quotas, stats, memory (FTS5 for long-term memory, no embeddings needed on 4 GB). Each session is an append-only JSONL log in the internal format, so resume and provider switching both read the same file.

## D12. Location: `codeagent/` inside this repo
The repo already holds other apps (LIFE RPG, WHAT IF?). The agent is an independent Python project in its own folder and shares nothing with them. Can move to its own repo later with `git subtree split`.

## D13. Currency for budgets: INR
Budget caps are in rupees (`budget.daily_inr`); providers that report USD cost are converted with a user-set rate in config.

## D14. Phase 1 scope choices
- The user picks the model (`EDITH_MODEL` in `.env` or `--model`). Choosing models automatically is the router's job (Phase 3). Model names are never in code.
- `run_command` ships in Phase 1, before the Phase 4 sandbox, because the agent must run tests to verify its own fix. It runs in the workspace with a timeout and an output cap, with all provider keys removed from its environment, and needs approval unless `--mode trusted`.
- Permission modes: `plan` (read-only tools only), `default` (ask before every edit and command), `accept_edits` (ask only before commands), `trusted` (ask nothing). `bypass` is not built.
- Broken tool-call JSON is sent back to the model as an error so it can retry. The real repair layer comes in Phase 2.
- Doom loop = the same tool call with the same arguments fails 3 times in a row.
- Not in Phase 1: the session log, resume, a cost cap (no price data yet), streaming, and non-OpenAI adapters.

## D15. Phase 2: adapters and registry
- Native adapters only where the wire format differs: **Gemini** (generateContent, `thoughtSignature` kept and replayed), **Cohere** v2 (`/chat`, different response shape), **AI Horde** (async job + polling, no tools). AI21 and Cloudflare Workers AI expose OpenAI-compatible endpoints, so they use the generic adapter with a custom model-list URL. Fewer adapters = less to break.
- `providers.yaml` stays the commented, shipped base. `edith providers add|enable|disable|remove|restore|trust|untrust` writes `providers.local.yaml` (git-ignored), merged on top on every read, so changes apply to the next step with no restart and the base comments survive.
- `remove` hides a provider; its models and stats stay in SQLite (`~/.edith/state.db`, override with `EDITH_HOME`) so `restore` brings them back.
- Discovery: list endpoints are fetched in parallel (default 8 at a time, 30 s timeout each), cached for 6 h. A model missing from a fresh list becomes `gone`; if it returns it goes back to `probation`. One provider failing is recorded in the `discovery` table and never stops the others.
- Probes (4 checks: reply, tool call, JSON, code fix). The code-fix answer is checked by pattern and never executed. Score >= 0.75 -> `active`; < 0.5 -> `failing`; 3 failing runs -> `disabled`. A 429 stops probing that provider for this run and does not count against the model.
- Tool-call repair: code fences, surrounding prose, trailing commas, double-encoded JSON, cut-off JSON (closes quotes/brackets), Python-style dicts. Anything else goes back to the model as an error.
- Model choice in `edith run` without `--model`: the best `active` probed model of the provider, from SQLite. Still no model names in code.
- Live check (2026-10, no keys): OpenRouter, Hugging Face router, Ollama Cloud and AI Horde model lists parse from the real APIs. Groq, Cerebras and Vercel answer 401 without a key, which confirms their URLs. GitHub Models' catalog answered plain "OK" without a token, so it is marked `unclear`.

## D16. Phase 3: smart router (`agent/router.py`)
Every model call is routed on its own; a session can use a different provider at every step.
1. **Classify** the step from the history: first step `plan`; after a failed command or tool error `debug`; after `read_file` `patch_edit`; after list/grep/edit `tool_heavy`; after a command `review`; history over ~30k tokens `long_context_read`. Cheap heuristics, no extra model call.
2. **Prefilter** in SQL: only active/probation models of enabled, keyed, trusted, not-cooling providers; at most 200 rows (best quality first). This keeps a step fast with thousands of models.
3. **Hard filters** (each rejection is counted and logged): banned, forced provider, privacy flag, tool calling (probed `tools=0` out; unknown only allowed while on probation), context too small (history x1.2 + 2000), model/provider/key cooldown, reviewer same family, paid without budget, quota exhausted.
4. **Score** = weighted sum of quality, speed, quota headroom, cost and reliability. Weights depend on the task type (plan/debug/review weight quality; quick_answer/summaries weight speed). Quality blends the probe score with live success for that task type (probe counts as 3 calls of evidence). Probation models get x0.8. A 0.03 switch penalty for changing provider (prompt cache) that never blocks a switch.
5. **Explore**: 10% of steps pick one of the next 4 candidates instead of the top one, so the router keeps learning (epsilon-greedy; `router.explore`).
6. **Failover**: 429 -> cooldown (Retry-After if given, else 15 s doubling up to 1 h) on that key, and on the whole provider if it has one key; 5xx/timeout -> provider cooldown; 401/403 -> provider cooldown 1 h; empty output, malformed tool-call JSON, refusal -> next candidate. After a failure the next try prefers a different provider. 3 consecutive failures of a model open its circuit for 5 min. Up to 8 attempts per step, then a clean stop with the reasons.
7. **Escalation**: two failed verifications (a command failing after an edit) switch the weights to quality-first until a check passes.
8. **Diversity**: `avoid_family` lets the Reviewer (Phase 6) exclude the coder's model family.
9. **Quota**: per key lane, requests/minute from local counters, requests/day from the calls table (resets at UTC midnight), and `x-ratelimit-remaining/limit` headers when a provider sends them. Optional `limits: {rpm, rpd}` per provider in providers.yaml. Several keys per provider: `key_env: KEY_A,KEY_B`; the lane with the most headroom is used.
10. **Transparency**: each call logs the chosen model, score parts, top alternatives and rejection counts, and stores them in `calls.why`. `edith route explain --task-type T --context N`, `edith dashboard`.
11. **Controls**: `edith route pin debug=provider/model | unpin | ban x | unban x | force provider|off | paid on|off | budget <rupees/day>`; saved in providers.local.yaml.
12. **Portable history**: the conversation stays in the internal format, so any adapter can continue it. A tool call made by another provider is replayed to Gemini with Gemini's documented placeholder signature (`skip_thought_signature_validator`). This is unverified without a key.
- With `--provider/--model` or `EDITH_PROVIDER/EDITH_MODEL`, the session is fixed to one model (`router.Fixed`), as in Phase 1.
- Known limits: the price is known only where a list endpoint publishes it (OpenRouter), so the cost cap only counts those; latency is the rolling average of successful calls, not p50/p95; tokens/sec is not scored yet.

## D17. Phase 4: tools, sandbox, permissions, hooks
- New tools: `git` (read commands free; add/commit/checkout... need edit approval; push is consequential; anything else refused), `repo_map` (ctags if installed, else a regex symbol scan; tree-sitter needs a native build that Termux lacks), `check` (py_compile, ruff/pyflakes, node --check, tsc), `web_fetch`, `web_search` (DuckDuckGo HTML, no key), `screenshot` (Node Playwright when present; not on Termux). Package manager and database work go through `run_command`.
- Command policy (`agent/sandbox.py`), in order: built-in deny (rm -rf / or ~, mkfs, dd to devices, fork bomb, shutdown, curl|sh, sudo/su, reading .env) -> user deny -> consequential, always asked even in `trusted` (git push, publishing, system packages, reset --hard, clean -f, writes outside the workspace) -> user ask -> user allow -> network (setting `network: ask|allow|deny`, default ask) -> mode.
- Execution: bubblewrap with the network cut off (unless the command was approved as a network command) when `bwrap` exists; otherwise a subprocess in its own process group, killed as a group on timeout, with all provider keys removed from its environment. On Termux this means network blocking is by approval, not by the kernel (risk R2).
- Modes: plan, default, accept_edits, trusted, bypass. Bypass only works with `allow_bypass: true` in ~/.edith/settings.yaml, and even then the built-in deny list applies.
- Settings: ~/.edith/settings.yaml (permissions allow/ask/deny, network, network_allow hosts, hooks, mcp_servers, sandbox, context_budget, trusted_workspaces). A workspace's own `.edith/settings.yaml` is untrusted: it can only add deny/ask rules unless the user lists the workspace in `trusted_workspaces` (a cloned repo must not be able to auto-approve commands or run hooks).
- Hooks (`agent/hooks.py`): events session_start/end, before/after_tool, before/after_model, permission_request, subagent_start/stop, compaction. Built-in `block:` rules or commands with JSON on stdin; exit 2 blocks; JSON can block, allow, replace tool arguments or add context. A failing hook is logged and skipped.
- Web content is wrapped in `<untrusted_content>` with a note to ignore instructions inside it.

## D18. Phase 5: context, memory, sessions
- The system prompt is rebuilt every step from: role, mode, project files (AGENT.md, AGENTS.md, CLAUDE.md, GEMINI.md, re-read from disk each step, so also after compaction), recalled lessons, skill list, todo list, reminders.
- Compaction by share of `context_budget` (default 32k tokens, small enough for free models): 60% reminder to the model, 70% mask old tool outputs, 85% model-written summary of the middle (task type `summarize_or_compact`), 100% full compaction. Cuts never separate a tool call from its result. A provider's "context too long" error forces compaction and one retry.
- Long-term memory: SQLite FTS5 `lessons` (no embeddings: fits 4 GB and Termux). `remember` tool; relevant lessons recalled at task start. `edith dream` (also automatic at most once a day at session end): lessons from stopped sessions, frequent tool errors, merge duplicates, retire never-used lessons after 120 days, skill drafts from 3+ similar successful tasks (drafts are not loaded until the user moves them).
- Skills: `~/.edith/skills/<name>/SKILL.md` (and plugins' skills; workspace skills only for trusted workspaces). Only names and descriptions are in the prompt; `load_skill` returns the body.
- Sessions: `~/.edith/sessions/<id>/log.jsonl` append-only; file snapshots before each change; a git checkpoint (commit object under refs/edith/<id>, branch and index untouched) for changes made by shell commands. `edith sessions | resume <id> | rewind <id> --to N [--git] | report <id>`. Ctrl-C ends the session cleanly and it can be resumed.

## D19. Phase 6: verification and Reviewer
- When the model says it is done and files changed, E.D.I.T.H. runs the project's own checks (detected: unittest/pytest, ruff, npm test/lint/typecheck/build, tsc, go build/test, cargo test) through the normal permission rules. Failures go back to the model (up to 3 rounds); two failed checks also escalate the router to stronger models.
- Then a Reviewer call, routed with `avoid_family` = the coder's most used model family, gets the task, the diff and the check results and must answer JSON approve/changes. Issues go back to the coder once. An unreadable verdict is never counted as approval.
- Every stop writes artifacts: report.md (answer, files, evidence, reviewer, tokens, providers), diff.patch, test_report.txt, review.json.
