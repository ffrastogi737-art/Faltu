# Kirana shop (practice project with bugs)

A tiny grocery billing module with **3 bugs**. All 4 tests fail on purpose (the full-bill test hits all three).

```bash
python -m unittest -q          # see the failures
edith run "fix all failing tests in this project"
python -m unittest -q          # after E.D.I.T.H.: all 4 must pass
```

Undo E.D.I.T.H.'s changes to try again: `edith rewind <session id> --to 1` (ids: `edith sessions`).
