# OPERATIONS

## Start / pause / resume / stop
Dashboard -> **CONTROLS** -> *All engines*: Start, Pause, Resume, Stop. Per-engine buttons are on HOME. Stop cancels queued jobs for that engine (Retry brings them back). Paused engines keep their jobs but the worker skips them.
Hard stop of everything automatic: GitHub -> Actions -> *gta6-worker* -> ... -> Disable workflow.

## Daily cycle (automatic, GitHub Actions cron 06:45 / 12:45 / 18:45 IST)
research -> plan day (limits from DB) -> work (renders, QC, uploads media to R2) -> stats (only if YouTube connected) -> report. Nothing is published without Approve.
Run now: CONTROLS -> *Run worker now* (needs GH_DISPATCH_TOKEN) or GitHub -> Actions -> gta6-worker -> Run workflow.

## Daily routine for the owner (5 min)
1. HOME -> Pending approvals: preview, Approve or Reject.
2. Approved -> VIDEOS -> Publish (blank = now, or a UTC time to schedule).
3. SYSTEM -> Errors / Job queue: Retry failed.
4. CLIPS: update views/post URL per submission for payout tracking.

## Budget guardrails
GitHub private repo: 2,000 free Actions min/month (3 runs/day x ~6 min x 30 ~ 540 min). Public repo: unlimited standard runners. Supabase 500 MB, R2 10 GB: delete old renders. Paid-API budget default $0. If anything asks for a card, stop.

## Backup
`gta6-backup` workflow dumps Postgres weekly to R2 `backups/` (Supabase free has no point-in-time restore). Restore: `psql "$DATABASE_URL" < dump.sql`.
