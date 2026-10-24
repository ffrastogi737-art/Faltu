# E.D.I.T.H.

**Efficient Developer Interface for Tech & Hacks**: a terminal coding agent whose brain is a router over many LLM providers (mostly free tiers). Status: **Phase 0** (plan and scaffolding). Nothing runs yet.

Read next: [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [RISKS.md](RISKS.md), [providers.yaml](providers.yaml).

## Setup on Android (Termux), the first target

```bash
pkg install python git ctags
cd codeagent
pip install -e .
cp .env.example .env    # fill only the keys you have
python -m unittest discover tests
edith                   # welcome screen (agent loop arrives in Phase 1)
```

PC (Windows/Linux) setup comes after Termux works.
