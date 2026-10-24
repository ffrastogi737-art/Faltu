# Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Provider entries in `providers.yaml` are unverified (no web research in Phase 0). URLs or free tiers may be wrong. | Live probe sets real status; failing providers are skipped, never crash. 2026-10 live check: OpenRouter, Hugging Face, Ollama Cloud, AI Horde lists work; Groq, Cerebras, Vercel URLs answer (401 without key). |
| R2 | Termux cannot block network for child processes without root. | Command allow/deny rules + approval for network tools; bubblewrap (no network) where available on Linux PCs. |
| R3 | With all providers `allow_private_code: false`, no provider may see code. | `edith providers trust <name>` per provider, after reading its data policy. |
| R4 | Free-tier rate limits are low and change without notice. | Read rate-limit headers, local counters, cooldowns, spread load across many providers. |
| R5 | Weak free models produce broken tool-call JSON. | Repair layer, failover to another provider, probe-based reliability score. |
| R6 | Android may kill Termux in the background mid-task. | Append-only session log + resume; `termux-wake-lock` advised in README. |
| R7 | 4 GB RAM with thousands of models. | Models stay in SQLite, SQL prefilter before scoring; nothing large loaded in memory. |
| R8 | Secrets leaking into prompts/logs. | Keys only from env; env scrubbed for subprocesses; redaction filter on every outbound request, log and trace. |
| R9 | Nothing was tested against a real model with tool calling (no keys during the build). Real models may misuse tools in ways the fakes did not. | Probes reject weak models; repair layer; failover; `edith eval` gives real numbers once a key is added. |
| R10 | Windows code path not run on Windows. | Small, isolated branch in sandbox.run; report problems and they are cheap to fix. |
| R11 | Pattern-based command rules can be bypassed by a disguised command. | Kernel sandbox (bwrap) where available; approvals; see SECURITY.md. |
