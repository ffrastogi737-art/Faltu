# SECURITY

## Model
Single admin (the owner). One secret: `DASHBOARD_TOKEN` (>=12 chars) in the `x-token` header. No cookies -> CSRF not applicable. Without a strong token every endpoint returns 503 (fail closed).

## Controls in place (all covered by tests unless noted)
| Area | Control |
|---|---|
| Auth / admin | Constant-time token compare; locked without a strong token; 10 failed attempts/10 min/IP -> 429 (in-memory, per web instance) |
| API | Pydantic bodies with bounds; engine/action allow-lists; `/docs` + OpenAPI off; CSP, nosniff, no-referrer, X-Frame-Options DENY |
| Media | Signed, 1-hour HMAC links; admin token never in URLs |
| Secrets | Only env vars / GitHub Secrets; `.env` and `*.db` git-ignored; no secret found in repo scan; log + job-error redaction (`key=`, `token=`, `secret=`, `code=`, `Bearer ...`) |
| OAuth | Authorization-code flow, signed 10-min `state`, refresh token stored server-side in DB (`settings` table), never returned by any endpoint; scopes: upload, youtube, analytics(+monetary) |
| SQL injection | SQLAlchemy ORM only, no string-built SQL (migrations are static files) |
| SSRF | No endpoint fetches a user-supplied URL. RSS URLs are env-config only. Clip sources are **file names** in `sources/` (regex-checked, no `..`, no paths, no URLs); worker re-checks the resolved path is inside `MEDIA_DIR` |
| Uploads | No file-upload endpoint exists. Media goes to R2 by the owner directly |
| Job execution | Jobs run only registered handlers; payloads come from the server, not from clients |
| Database | Postgres tables have RLS enabled with no policies: Supabase's public API (anon key) can read nothing; the app uses the direct DB URL |
| Dependencies | `pip-audit`: no known vulnerabilities (19 Nov 2026) |
| Content safety | Approval gate, QC gate, duplicate gate, daily caps, rumors labelled UNCONFIRMED, clipping needs 3 manual verifications, AI-content disclosure flag on uploads |

## Known gaps / accepted risks
- Rate-limit store is per process memory (resets on restart; Render free = one instance). Upgrade: Redis/DB counter.
- Single shared admin token: rotate it by changing the env var; no per-user accounts.
- Refresh token lives in the DB in plain text (protected by DB credentials). Upgrade: encrypt with a key from env.
- Token is kept in the phone browser's localStorage; anyone with the unlocked phone can use it.
- Free Render may restart/sleep; nothing sensitive is held only in memory except the rate limiter.
- edge-tts uses Microsoft's unofficial endpoint: it may change or stop working.

## If a secret leaks
Rotate: dashboard token (Render env), Google OAuth client secret + revoke app at myaccount.google.com/permissions then reconnect, Supabase DB password, R2 token, GitHub token.
