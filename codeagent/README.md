# E.D.I.T.H.

**Efficient Developer Interface for Tech & Hacks**: a terminal coding agent whose brain is a router over many LLM providers (mostly free tiers). Status: **Phase 2**. All provider adapters, model discovery and probes are in place. A task still runs on one provider at a time; per-step routing comes in Phase 3.

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
# optional, in .env: EDITH_PROVIDER=groq  EDITH_MODEL=<an id>  (else the best probed model is used)

edith providers add mynewco --base-url https://api.example.com/v1 --key-env MYNEWCO_KEY
edith providers disable groq | enable groq | remove groq | restore groq
cd your-project
edith                                    # welcome screen, then type a task
edith run "fix the failing test"         # one-shot
edith run "how would you add X?" --mode plan   # read-only, proposes a plan
```

Modes: `default` asks before every edit and command, `accept_edits` asks only before commands, `trusted` asks nothing, `plan` only reads.
Options go after the subcommand (`edith run "..." --model X`).

PC (Windows/Linux) setup comes after Termux works.
