# Benchmark

24 small coding tasks: 15 bug fixes (one across two files, one infinite loop), 4 features, 1 refactor, 1 performance fix, 3 of them in JavaScript.

Each task folder has:
- `task.md`: what the agent is told
- `repo/`: the starting code (copied to a temp folder for every run)
- `hidden_test.py` or `hidden_test.js`: the grader, never shown to the agent
- `meta.json`: kind, grader, reference solution (edits), optional grader timeout

```bash
edith eval                       # run all tasks with the router (needs keys); compares with your last model run
edith eval --tasks off_by_one,js_sum --provider groq --model <id>
edith eval --compare reports/eval-<date>-model.json
edith eval --oracle              # reference solutions: must be 24/24 (checks harness and graders)
edith eval --noop                # agent that changes nothing: must be 0/24 (graders really test the fix)
```

Reports go to `codeagent/reports/eval-<date>-<label>.{json,md}`. The comparison says `better`, `worse` or `same` and lists fixed and regressed tasks. Run it before and after changing E.D.I.T.H. and keep the change only if the verdict is not `worse`.

Add a task: create a folder with the four parts above. `tests/test_phase9.py` checks that every grader fails on the original repo and passes with the reference solution.
