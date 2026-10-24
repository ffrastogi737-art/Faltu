# Evidence

| file | what it shows |
|---|---|
| `phase2_live_checks.txt` | real provider APIs (no keys): model lists parsed from OpenRouter, Hugging Face, Ollama Cloud, AI Horde; 401s confirm Groq, Cerebras, Vercel URLs; one real AI Horde generation |
| `phase3_cli_demo.txt` | the real `edith` CLI with 4 local fake providers: refresh, probe, route explain, a routed session with a 429 failover and switching across 3 providers, dashboard |
| `eval-*-oracle.*` | benchmark with reference solutions: 24/24 (harness and graders work) |
| `eval-*-noop.*` | benchmark with an agent that changes nothing: 0/24 (graders really test the fix) |

Real-model benchmark results will appear here as `eval-<date>-model.*` after `edith eval` runs with a key.
