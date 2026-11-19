# CONFIGURATION (environment variables)

Set as GitHub Secrets/Variables (worker) and Render env vars (dashboard). Never commit values. Template: `.env.example`.

| Name | Where | Required | Purpose |
|---|---|---|---|
| DATABASE_URL | both | yes (cloud) | Supabase *Transaction pooler* URL, `postgresql+psycopg2://...:6543/postgres`. Empty = local SQLite (data lost on cloud restarts) |
| DASHBOARD_TOKEN | Render | yes | Admin token, >=12 chars. Locked without it |
| PUBLIC_URL | Render | for YouTube connect | `https://<app>.onrender.com` (OAuth redirect = PUBLIC_URL + `/oauth/youtube/callback`) |
| S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY | both | yes (cloud) | Cloudflare R2 media storage |
| GH_DISPATCH_TOKEN, GH_REPO | Render | for "Run worker now" | Fine-grained GitHub token (repo = Faltu only, Actions: read & write); `GH_REPO=ffrastogi737-art/Faltu` |
| YT_CLIENT_ID, YT_CLIENT_SECRET | both | for upload | Google OAuth *Web* client |
| YT_REFRESH_TOKEN | both | no | Optional override; normally stored by the dashboard OAuth flow |
| YOUTUBE_API_KEY | worker | optional | Real trend research (YouTube Data API, free quota) |
| NEWS_RSS_FEEDS | worker | recommended | Comma-separated RSS URLs; news verification needs >=2 reputable outlets |
| LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_MAX_CALLS_PER_DAY | worker | optional | Free OpenAI-compatible LLM for better scripts (you must check that provider's free tier; cap default 20/day) |
| ANTHROPIC_API_KEY + DAILY_BUDGET_USD | worker | optional, **paid** | Used only if key set AND budget > 0. Default budget 0 = never |
| TTS_PROVIDER | worker | optional | `edge` (free neural voice, unofficial endpoint) or `silent` |
| REQUIRE_APPROVAL | both | keep `true` | Nothing uploads without Approve |
| MAX_UPLOADS_PER_DAY, MAX_JOB_ATTEMPTS | both | optional | Defaults 3 and 3. Daily limits can be changed live on the dashboard |
| INLINE_WORKER | Render | keep `false` | Rendering inside the 512 MB web host |

## Daily limits (CONTROLS tab, stored in DB, no redeploy)
Defaults: 3 Shorts, 1 long-form, 10 clips, 3 uploads per day. A value of 0 disables that output.
