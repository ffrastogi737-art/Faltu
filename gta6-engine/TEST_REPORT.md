# TEST REPORT (19 Nov 2026, executed in the audit sandbox)

| Run | Command | Result |
|---|---|---|
| Full suite, PostgreSQL 16 (local server) | `DATABASE_URL=postgresql+psycopg2://... pytest -q` | **27 passed** (~58 s) |
| Full suite, SQLite | `pytest -q` | **26 passed, 1 skipped** (skip = migration test, Postgres-only) |
| Migration negative check | moved `002_*.sql` away, ran migration test | failed as expected (`migtest.settings` missing) |
| Dependency scan | `pip-audit -r requirements.txt` | No known vulnerabilities |
| E2E offline pipeline | `python -m app.cli demo` | research -> plan -> 4 jobs done: 3 Shorts 1080x1920 (QC pass), 1 long-form 1920x1080 (QC **fail**: too short, correctly rejected) |
| E2E approval over real HTTP (uvicorn) | curl | QC-failed approve -> 400; unapproved publish -> 400; approve -> ok; publish queued; worker -> `failed: YouTube credentials missing`; video `upload_status=failed`, `youtube_id=None` (no fake success) |
| Dashboard on Android viewport | headless Chromium, Pixel 7 (412 px) | 5 tabs rendered, no horizontal overflow, 0 console/page errors, login gate shown without token |

## Real vs mocked
Real: FFmpeg/ffprobe renders and QC, SQLite and Postgres, SQL migrations on Postgres, queue/retry/recovery, FastAPI over HTTP, headless browser.
Mocked (HTTP mock transport, labelled in the test names/docstrings): YouTube upload + OAuth callback, Claude API, free-LLM provider. These prove request sequencing and gates, **not** that Google/Anthropic accept the calls.

## Not run (and why)
Live trend research (news hosts blocked in sandbox), edge-tts, R2, Supabase, Render deploy, Actions runs, Docker build (no daemon), real YouTube upload (no credentials), faster-whisper.

## Test inventory
Scoring/verify/RSS/merge, queue retry+backoff+stale recovery+NoRetry, budget, planner+editable limits, secret redaction, migrations vs models, Shorts/Long-form render + QC + duplicate block, thin long-form reject, rumor block, free-LLM cap + rumor label, Claude budget path, clipping moments/eligibility/export/payout, API auth/limits/rate-limit/locked-token/signed-media/ingest validation/dispatch-not-configured, OAuth state + token storage, publish gates + daily cap.
