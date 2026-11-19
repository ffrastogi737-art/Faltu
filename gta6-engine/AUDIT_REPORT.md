# AUDIT REPORT (19 Nov 2026)

Scope: the zip `gta6-engine.zip` (41 files, ~2,600 lines Python/HTML/SQL/YAML) built earlier in Claude chat. All earlier claims were treated as unverified; everything below was checked by reading the code and running it.

## Verdict on the earlier build report
| Claim | Finding |
|---|---|
| Central AI Brain (research, scoring, verification, calendar, queue, memory, budget) | **Exists and works.** Scoring/verify/queue/budget/planner are real code. Research from live sources was **never run** (see below). |
| Shorts / Long-form / Clipping engines | **Exist, run end-to-end offline.** Real FFmpeg output verified (1080x1920 / 1920x1080, audio track, QC). Quality of content is template-level (see "Honest limits"). |
| FFmpeg rendering | **Real.** Rendered 3 Shorts + 1 long-form in this audit. |
| Mobile dashboard | Existed with 4 tabs; missing CONTROLS, clips detail, storage/API status, limits. **Rebuilt in this audit** (5 tabs, new design). |
| Job queue, SQLite + Postgres | **Real.** Verified on SQLite and PostgreSQL 16. |
| Approval system | **Real**, verified over HTTP. |
| Supabase / R2 / Render | Config only. **Never executed**, not executed in this audit either (no accounts). |
| YouTube upload / analytics | Code + mocked HTTP tests only. **Never integration-tested** (no credentials). |
| "20 passing tests" | **True**: re-run, 20/20 passed on SQLite. Now 27 (Postgres) / 26+1 skipped (SQLite). |

## What genuinely exists / works (verified by running)
Topic scoring, news verification gate, RSS parsing/dedupe, DB job queue with backoff, engine start/pause/resume/stop, budget cap ($0 default), planner, Shorts/Long-form render + QC + duplicate blocking, clipping analysis (loudness/scene, on a synthetic stream), campaign eligibility gate, approval + publish gate, daily upload cap, API auth.

## Defects found and fixed in this audit
| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | **Critical** | Dashboard token defaulted to `change-me` and was accepted | Locked (HTTP 503) until a token of >=12 chars is set; constant-time compare |
| 2 | **Critical** | YouTube API key leaked into the logs table/dashboard (httpx errors embed `?key=`) | `redact()` applied to every log line and job error; tested |
| 3 | **Critical** | `yt-exchange` workflow printed the OAuth refresh token into GitHub Actions logs (public if repo is public) | Removed. OAuth now runs on the dashboard; token stored in DB, never returned/printed |
| 4 | High | Admin token was placed in media URLs (`?token=`), i.e. in browser history/server logs | Short-lived HMAC-signed media links; raw token is rejected |
| 5 | High | No brute-force protection | 10 failed logins / 10 min / IP -> HTTP 429 |
| 6 | High | Re-upload (duplicate video on YouTube) possible if thumbnail/playlist step failed after upload | YouTube id saved immediately after upload; extras are non-fatal |
| 7 | High | Analytics pull would silently never update: revenue needs the monetary scope and one bad metric 400s the whole query | Added scope; metric groups queried separately; unavailable ones recorded |
| 8 | Medium | Input validation: engine name, `publish_at` parse (500), campaign 404 (500), unbounded bodies | Pydantic models + explicit 400/404; limits bounded |
| 9 | Medium | `/docs` and `/openapi.json` public | Disabled; security headers + CSP added |
| 10 | Medium | Killed worker leaves jobs `running` forever | `recover_stale()` requeues after 30 min |
| 11 | Medium | Permanent errors (duplicate, not eligible, gate blocked) retried 3x with backoff | `NoRetry` -> fail immediately |
| 12 | Medium | Daily caps hard-coded (2 shorts), upload cap counted by *creation* time, no clip cap, nothing editable from dashboard | Limits stored in DB, editable from CONTROLS: 3 shorts / 1 long / 10 clips / 3 uploads |
| 13 | Medium | Clipping had no way to start from the dashboard; no submission tracking UI | `/api/clips/ingest` (file name only, no URLs/paths), submission update endpoint, CLIPS tab |
| 14 | Medium | "Run jobs" button would render inside a 512 MB web host | Disabled by default; real "Run worker now" = GitHub Actions `workflow_dispatch` |
| 15 | Low | Hook caption touched screen edges | Margins + smaller hook font |
| 16 | Low | SQL migrations could drift from ORM unnoticed | Migration test (Postgres) compares tables/columns; migration 002 added |
| 17 | Low | Only Claude (paid) or templates for scripts | Optional free OpenAI-compatible provider, capped calls/day |

## Still mocked / not executed
- YouTube OAuth, upload, thumbnail, playlist, analytics: **mock transport only**.
- Claude API and the free-LLM provider: mock transport only.
- edge-tts voice: not run (Microsoft endpoint unreachable from the audit sandbox) -> demo videos carry a **silent** voice track plus whoosh/bed.
- Live RSS/YouTube trend research: not run (news sites blocked in sandbox). Parsing is tested on sample XML.
- faster-whisper transcription: not installed; clipping works on loudness + scene cuts only.
- R2/S3 storage, Supabase, Render, GitHub Actions runs, Docker image build (no Docker daemon in sandbox).

## Deployment blockers (need the owner)
See `PROJECT_STATUS.md` and `PHONE_SETUP_GUIDE.md`. In short: Supabase DB URL, R2 keys, Render account, a strong dashboard token, YouTube OAuth client, and Google's API audit before public uploads.

## Honest limits
- Offline template scripts are generic; long-form from them fails QC by design. Real watch-time needs real scripts (free LLM or your own) and your own gameplay footage in `media/library/`.
- Generated visuals are gradient placeholders. Mass-produced, low-originality videos risk YouTube's "inauthentic content" policy; keep approval ON and publish only what you would watch.
- Nothing here guarantees views or revenue.
