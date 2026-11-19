# GTA 6 AI Media Engine

A cloud-first automation system for a GTA 6 YouTube channel with three engines:
**Shorts Factory**, **Long-form/SEO Guides**, and **Stream Clipping & Campaigns**.
You run it entirely from an Android phone: the mobile dashboard is the control panel, and GitHub Actions is the render farm.

## Architecture (₹0/month to start)

```
 Phone (browser) ──► Dashboard/API  (Render free web service, Docker)
                          │
                          ▼
                 Supabase Postgres  ◄──── GitHub Actions worker (cron, 3×/day)
                 (topics, jobs, videos,      research → plan → render (FFmpeg)
                  campaigns, logs, spend)    → QC → upload media → (approved) publish
                          ▲                          │
                          └──── Cloudflare R2 ◄──────┘  (rendered mp4/jpg, DB backups)
```

| Piece | Choice | Why | Free-tier catch |
|---|---|---|---|
| Rendering | **GitHub Actions** | Job-based compute, FFmpeg preinstalled-able, no always-on server | Private repo: 2,000 min/month (public: unlimited). ~3–6 min per run here |
| Database | **Supabase Postgres** | Real Postgres, phone-friendly web console | 500 MB; pauses after 7 days idle (the 3×/day worker keeps it active) |
| Media storage | **Cloudflare R2** | S3 API, zero egress fees | 10 GB-month free; delete old renders |
| Dashboard | **Render** free web service | Docker, HTTPS URL | Sleeps after 15 min idle, ~1 min to wake |
| Not chosen | Cloudflare Workers | Can't run Python + FFmpeg | — |
| Not chosen | GPU servers | Nothing here needs a GPU | — |

## What's in the repo

```
app/
  config.py            env-based settings + "missing credentials" list
  db.py                SQLAlchemy models (SQLite local / Postgres cloud)
  brain/
    trends.py          research: YouTube Data API, RSS news, evergreen guides; merge + dedupe
    scoring.py         6-factor topic score (demand, velocity, competition, viral, freshness, money)
    verify.py          news verification (official source OR 2 reputable outlets; leaks = rumor)
    planner.py         content calendar (2 shorts + 1 long/day cap), daily report
    queue.py           DB job queue, retries w/ exponential backoff, start/pause/resume/stop
    budget.py          daily spend cap (default $0 = never calls paid APIs)
  llm.py               Claude script writer (only if key + budget) → offline template fallback
  tts.py               edge-tts free neural voice / silent placeholder
  render.py            FFmpeg: 9:16 & 16:9, captions (ASS), scene changes, whoosh + music bed,
                       loudness normalize, thumbnails, QC, duplicate hashes
  engines/shorts.py    Engine 1
  engines/longform.py  Engine 2 (+ chapters; rumors blocked)
  engines/clipping.py  Engine 3: campaign discovery/eligibility gate, loudness+scene+transcript
                       moment detection, hooks, vertical crop w/ blur fill, captions, payout tracking
  publish/youtube.py   OAuth, resumable upload, thumbnail, schedule, playlist, stats, gates
  storage.py           R2/S3 push/pull
  api.py + static/     mobile JARVIS-style command center
  cli.py               worker entrypoint
migrations/001_init.sql   Postgres schema (+RLS on)
.github/workflows/ (repo root)  gta6-ci.yml (tests on SQLite + Postgres), gta6-worker.yml (cron render), gta6-backup.yml
Dockerfile, render.yaml   dashboard deploy
```

## Safety controls (enforced in code, covered by tests)

- `REQUIRE_APPROVAL=true`: nothing uploads until you tap **Approve**; QC-failed videos can't be approved.
- Duplicate prevention: identical script hash → not re-rendered; same content never uploaded twice.
- `MAX_UPLOADS_PER_DAY` (default 3) + planner caps (default 3 shorts + 1 long/day, editable on the dashboard) to avoid spam-like volume.
- Unverified news is always titled **UNCONFIRMED** and is never allowed in long-form.
- `DAILY_BUDGET_USD=0` by default: no paid API call happens until you raise it yourself.
- Clipping refuses to process unless *you* marked the campaign's rules, payout and content rights as verified.
- Visuals come only from `media/library` (footage you own) or generated backgrounds. Nothing is scraped.
- Uploads are flagged `containsSyntheticMedia: true` (AI voice/visuals disclosure).

## Status
See **PROJECT_STATUS.md**, **AUDIT_REPORT.md** and **TEST_REPORT.md** (the earlier status table here was replaced after the 19 Nov 2026 audit). Setup from a phone: **PHONE_SETUP_GUIDE.md**. Deployment: **DEPLOYMENT.md**. Security: **SECURITY.md**.

## Local run (any machine)
```bash
pip install -r requirements.txt
python -m app.cli demo          # offline: research → plan → render
DASHBOARD_TOKEN=a-long-token-123 uvicorn app.api:app --port 8000
pytest -q
```

## Honest limits
- The offline template script is deliberately thin. Long-form made from it fails QC by design.
  Good long-form needs `ANTHROPIC_API_KEY` + a small budget (Haiku ≈ $0.005/script), or your own scripts.
- Generated gradient backgrounds are placeholders. Real watch-time needs your own gameplay captures in
  `media/library/` (upload them to R2 under `library/` and the worker can pull them; see checklist).
- "Campaign discovery" works by pasting a campaign page's text, because Whop and similar platforms have no public API for this.
- YouTube may limit channels that post mass-produced, repetitive content. The caps help, but the commentary still has to be genuinely original.
