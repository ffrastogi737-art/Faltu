# Security review

E.D.I.T.H. runs commands and edits files on your machine, guided by models from outside providers. This is what protects you, and what does not.

## Threats and protections

| threat | protection | tested in |
|---|---|---|
| API keys leaking to a model, logs, sessions or commands | Keys only from env/.env; `.env` files cannot be read by tools or common shell commands; every key value is replaced by `[REDACTED]` in tool output, logs and session files; all provider key variables are removed from the environment of commands and hooks. | `test_phase9.SecretHygiene`, `test_loop.Safety` |
| Code sent to a provider that may train on it | `allow_private_code: false` for every provider by default; the router never routes to them. AI Horde can never be trusted (volunteer workers). | `test_router.test_hard_filters` |
| Destructive commands | Built-in deny list (rm -rf / or ~, mkfs, dd to devices, fork bomb, shutdown, curl\|sh, sudo/su, reading .env). Consequential actions (git push, publish, system packages, reset --hard, writes outside the workspace) always ask, even in `trusted` mode. | `test_phase456.Sandbox` |
| Runaway commands | Timeout (max 600 s); the whole process group is killed. | `test_timeout_kills_process_group` |
| Files outside the project | Tool paths are resolved and must stay inside the workspace (symlinks included). | `test_loop.Safety` |
| Prompt injection from files, web pages, tool output | System prompt says such text is data; web content is wrapped in `<untrusted_content>`; read-only roles cannot edit; risky actions still need approval regardless of what the model says. | `test_web_fetch_is_wrapped_and_permissioned` |
| A cloned repo that tries to weaken rules | A workspace's `.edith/settings.yaml` can only add deny/ask rules. Allow rules, hooks and MCP servers from a repo are ignored unless you list the repo in `trusted_workspaces`. | `test_untrusted_workspace_cannot_loosen_rules` |
| Another program on the phone/PC using the API | Bearer token (generated, file mode 600), constant-time comparison, bound to 127.0.0.1 by default; artifact names are reduced to a basename. | `test_interfaces.Api` |
| Unanswered approvals in API/MCP/CI use | No answer = no. Headless and MCP modes refuse everything that needs approval. | `test_unanswered_approval_is_a_no`, `test_headless_json_and_refusals` |
| Bad provider config (`file://` URL) | Adapters only open http(s) URLs. | `test_provider_urls_must_be_http` |
| Model output executed by the probe | The code-fix probe checks the answer by pattern; it never runs it. | `discovery._probe_code` |
| Losing work | File snapshots before every edit, a git checkpoint at session start, `edith rewind`. | `test_phase456.Sessions` |

## Known limits (be careful here)

1. **No kernel sandbox on Termux.** Without root there is no bubblewrap, so a command the agent runs can reach the network and any file your Termux user can reach. Network commands and writes outside the workspace need approval, but a cleverly disguised command can slip past pattern rules. Keep `default` or `accept_edits` mode for unknown code. On Linux with `bwrap` installed, commands run with a read-only system, the workspace writable and no network unless approved.
2. **Pattern rules are not a security boundary.** The deny/ask lists catch common mistakes and obvious attacks, not a determined attacker inside a repo you do not trust.
3. **`trusted` and `bypass` modes run commands without asking.** `bypass` needs `allow_bypass: true` in your settings and still keeps the built-in deny list.
4. **Project files (AGENT.md, CLAUDE.md, ...) are read as instructions**, like other coding agents do. A hostile repo can try to steer the model through them. Approvals are the backstop.
5. **Redaction covers the keys E.D.I.T.H. knows about** (the variables in providers.yaml). Other secrets in your repo are not masked; tools refuse `.env` files only.
6. **Provider data policies were not verified** (see providers.yaml `status`). Flip `allow_private_code` only after reading a provider's terms.

## Lint pass

`ruff check --select S,B agent` (bandit rules), 2026-10: remaining findings are reviewed and intended. Subprocess calls are the shell tool and git (guarded by the policy above). Built SQL strings only contain constant column names or `?` placeholders. SHA-1 is required by the WebSocket handshake. `random` is only used for exploration. Fixed in this pass: provider URLs limited to http(s).

## Reporting

Found a problem? Open an issue in this repository without the exploit details, or contact the owner directly.
