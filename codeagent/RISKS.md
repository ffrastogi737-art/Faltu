# Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Provider entries in `providers.yaml` are unverified (no web research in Phase 0). URLs or free tiers may be wrong. | Live probe sets real status; failing providers are skipped, never crash. |
| R2 | Termux cannot block network for child processes without root. | Command allow/deny rules + approval for network tools; optional `proot`; Docker/bwrap on PC later. |
| R3 | With all providers `allow_private_code: false`, no provider may see code. | Phase 1 asks which providers to trust; flag is per provider. |
| R4 | Free-tier rate limits are low and change without notice. | Read rate-limit headers, local counters, cooldowns, spread load across many providers. |
| R5 | Weak free models produce broken tool-call JSON. | Repair layer, failover to another provider, probe-based reliability score. |
| R6 | Android may kill Termux in the background mid-task. | Append-only session log + resume; `termux-wake-lock` advised in README. |
| R7 | 4 GB RAM with thousands of models. | Models stay in SQLite, SQL prefilter before scoring; nothing large loaded in memory. |
| R8 | Secrets leaking into prompts/logs. | Keys only from env; env scrubbed for subprocesses; redaction filter on every outbound request, log and trace. |
