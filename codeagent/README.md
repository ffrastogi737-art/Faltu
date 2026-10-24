# E.D.I.T.H.

**Efficient Developer Interface for Tech & Hacks**: a terminal coding agent whose brain is a router over many LLM providers (mostly free tiers). Status: **Phase 1**. It works with one OpenAI-compatible provider at a time. You pick the model; automatic routing comes in Phase 3.

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
edith providers                          # which providers have a key
edith models --provider groq             # list that provider's models
# in .env: EDITH_PROVIDER=groq  EDITH_MODEL=<an id from the list>
# in providers.yaml: allow_private_code: true for that provider (only if you trust it)
cd your-project
edith                                    # welcome screen, then type a task
edith run "fix the failing test"         # one-shot
edith run "how would you add X?" --mode plan   # read-only, proposes a plan
```

Modes: `default` asks before every edit and command, `accept_edits` asks only before commands, `trusted` asks nothing, `plan` only reads.
Options go after the subcommand (`edith run "..." --model X`).

PC (Windows/Linux) setup comes after Termux works.
