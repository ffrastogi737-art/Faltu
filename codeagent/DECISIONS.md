# Decisions

Each entry: decision, why, and what would change it.

## D1. Mobile (Termux) first, PC later
Target order: Android Termux CLI first; Windows/Linux PC only after Termux works fully. Every choice below must work on Termux without root and without a compiler.

## D2. Python 3.11+ with asyncio
Termux ships current Python (`pkg install python`). Python has the widest LLM/HTTP ecosystem and matches the master prompt's default stack.

## D3. Two runtime dependencies: `httpx` and `pyyaml`
Both install on Termux with plain `pip` (pure Python; PyYAML falls back to its pure-Python loader). Everything else is stdlib: `sqlite3`, `asyncio`, `subprocess`, `json`, `difflib`.
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
