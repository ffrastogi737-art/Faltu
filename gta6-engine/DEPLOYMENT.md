# DEPLOYMENT

## Architecture (minimum services, Rs 0 target)
```
Phone -> Render (dashboard/API, free web service)
              |  SQL
              v
        Supabase Postgres  <---- GitHub Actions "gta6-worker" (cron 3x/day + manual): FFmpeg render, QC, upload to R2
              ^                         |
              +----- Cloudflare R2 <----+  (mp4/jpg, weekly DB dump)
```
Four services, each with one job. Rejected: Cloudflare Workers (cannot run Python/FFmpeg), always-on VPS/GPU (cost, not needed), Hugging Face Spaces for the dashboard (not verified in this audit; the earlier note that Docker Spaces are paid is unconfirmed either way), a separate queue/Redis (DB queue is enough).

## Free-tier facts (checked 19 Nov 2026 by web search; confirm on the vendor page before relying)
| Service | Free limit | Catch |
|---|---|---|
| GitHub Actions | Private repo: 2,000 min/month on standard Linux runners; public repo: standard runners free/unlimited (per GitHub's runner docs, via secondary sources) | Expected use ~540 min/month |
| Supabase | Free: 500 MB DB, 500 MB RAM, 2 active projects; paused after 1 week of inactivity (official pricing page) | Over-quota behaviour unclear (read-only vs warnings) |
| Cloudflare R2 | 10 GB-month, 1M class A + 10M class B ops per month, no egress fee (official pricing page) | Delete old renders; overage is paid |
| Render free web service | 750 instance-hours/month, spins down after 15 min idle, wake ~1 min, may restart anytime (Render docs) | Verify no card is requested at signup; if asked, stop |
| YouTube Data API | Default 10,000 units/day; one upload costs 1,600 -> about 6 uploads/day shared with other writes (older docs; sources disagree on a newer upload-only bucket, check Cloud Console quota) | Projects created after 28 Jul 2020 are locked to **private** uploads until Google audits the project |

## Status of this deployment
**Nothing is live.** The audit sandbox has no Supabase/Render/R2/Google accounts and cannot reach those services, and a GitHub workflow cron only runs from the default branch (this work is on branch `ccr-61587a00-jmkyt4`, no PR opened). Everything is prepared: `render.yaml` (repo root, `rootDir: gta6-engine`), `Dockerfile` (non-root), `.github/workflows/gta6-{ci,worker,backup}.yml`, `migrations/*.sql`. The Docker image was **not built** (no Docker daemon); the same app was started natively with uvicorn and `/health` returned OK.

## Steps (full phone-friendly version: PHONE_SETUP_GUIDE.md)
1. Merge the branch into `main`.
2. Supabase project -> run `migrations/001_init.sql` then `002_settings_uploaded_at.sql`.
3. R2 bucket + API token.
4. GitHub Secrets/Variables (CONFIGURATION.md).
5. Actions -> gta6-tests must be green; gta6-worker -> Run workflow (`research`, then `work`).
6. Render -> New -> Blueprint -> Faltu repo; fill env vars; open the URL; token login.
7. CONTROLS -> Connect YouTube; Test connection.
8. Publishing publicly: apply for the YouTube API Services audit/quota extension (Google form) - until approved, uploads stay private.

## Health check
`GET <url>/health` -> `{"ok": true, "locked": false}` (`locked: true` means DASHBOARD_TOKEN is missing). Worker: Actions log of `python -m app.cli init` then the daily report JSON.

## Cost control
No paid service is activated by this repo. Paid Claude API needs both a key and `DAILY_BUDGET_USD>0`. Set Render/Supabase/Cloudflare to free plans only and do not add a card.
