# TROUBLESHOOTING

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard says "Dashboard locked" | DASHBOARD_TOKEN missing / <12 chars | Set a longer token in Render env, redeploy |
| "too many failed attempts" (429) | 10 wrong tokens | Wait 10 minutes |
| First open takes ~1 min | Render free sleeps after 15 min idle | Wait; normal |
| Videos list empty | Worker never ran or no DATABASE_URL on both sides | CONTROLS -> Research, then Run worker now; check the same DATABASE_URL in Render and GitHub |
| Preview does not play | Render has no local file; R2 not configured | Set the 4 S3 vars on Render and on the worker |
| Uploads blocked / `credentials missing` | YouTube not connected | CONTROLS -> Connect YouTube |
| Upload works but video stays private | Google API project not audited | Apply for YouTube API Services audit (see DEPLOYMENT.md); until then publish manually from YouTube Studio |
| `quotaExceeded` | Daily YouTube API quota | Do not retry; quota resets 00:00 Pacific; lower uploads/day |
| Job `failed: daily clip cap` / `not eligible` | Gates working as designed | Raise the limit or verify the campaign |
| Long-form always QC-failed | Template script too short | Configure the free LLM or supply real scripts |
| Silent video | TTS_PROVIDER not `edge`, or edge-tts blocked | Set `TTS_PROVIDER=edge`; check worker log |
| Supabase paused | 7 days with no DB activity | Resume in Supabase dashboard; the 3x/day worker normally prevents it |
| "Run worker now" -> 400/502 | GH_DISPATCH_TOKEN/GH_REPO missing or token lacks Actions write, or default branch is not `main` | Fix token; the dispatch uses ref `main` |
