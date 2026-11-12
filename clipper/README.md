# Personal AI Clipper

Turns a long video into short vertical clips on your own computer: transcribe, find the strongest passages,
score and explain them, add animated word-by-word captions, reframe to 9:16 and export an MP4. It also keeps a
personal record of clipping campaigns, submissions, views and earnings.

Everything runs locally. There is no account, no cloud service and no paid API. The only download is the
Whisper speech model, fetched once from Hugging Face the first time you transcribe.

## Requirements

* Python 3.12, Node 20+, FFmpeg 6+ with libx264 and libass (`ffmpeg -filters | grep ass`)
* About 2 GB of RAM for the default `small` Whisper model. No GPU needed; an NVIDIA GPU is used if present.

## Run it

```bash
./scripts/start.sh          # builds the frontend the first time, then serves everything on http://127.0.0.1:8000
```

For development, run the two halves separately (the Vite dev server proxies `/api` and `/ws` to the backend):

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload            # http://127.0.0.1:8000
cd frontend && npm install && npm run dev           # http://127.0.0.1:5173
```

### On an Android phone (Termux)

Install Termux from F-Droid, then:

```bash
pkg install -y git
git clone -b ccr-c4395a15-te5jiw https://github.com/ffrastogi737-art/Faltu.git
cd Faltu/clipper && ./scripts/termux.sh
```

Open http://127.0.0.1:8000 in Chrome on the same phone. Keep Termux open while you use it.

What is different on a phone:

* **Transcription uses whisper.cpp.** faster-whisper has no Android build, so `scripts/termux.sh` compiles
  whisper.cpp on the phone (a few minutes, once). Start with the `tiny` or `base` model; `medium` needs about 2 GB of
  free memory and is very slow on a phone. If the build fails, import an `.srt` or `.vtt` transcript instead.
  **This path has not been run on a real phone yet** - it is tested against a stand-in program only.
* **No face-aware crop.** OpenCV is not installed, so "centred on the speaker's face" falls back to the manual position.
* **Rendering is slow.** Use the "Fast draft 720p" preset; a 30-second clip can take a few minutes.
* The frontend is shipped pre-built in `frontend/dist`. After changing frontend code, run `npm run build` on a
  computer and commit `dist` again.
* The app itself has been run on a real phone (import and playback); the whisper.cpp build step has not.

Data lives in `storage/` (override with `CLIPPER_STORAGE`, see `.env.example`):
`source_videos/` copies of imported videos, `exports/` rendered clips, `logs/` FFmpeg logs per job,
`backups/` database backups, `assets/` logos and intros, `clipper.db` the SQLite database.

## The workflow

1. **New Project** - drop in a video (MP4, MOV, MKV, WebM, ...) or paste a direct link to a video file you are
   authorised to use. The file is checked with ffprobe, de-duplicated by content hash and copied into storage.
   Your original is never modified.
2. **Project page -> Start analysis** - three background jobs run in order: extract audio, transcribe with
   faster-whisper (English, Hindi, Hinglish; word timestamps), find highlights. Progress streams over a
   WebSocket; jobs can be cancelled and retried. Already have subtitles? Import an `.srt`/`.vtt` instead.
3. **AI Clips** - candidates ranked by a 0-100 Clip Quality Score with the reasons and six sub-scores.
   Preview, edit timestamps, reject, accept, or regenerate with your own weights and clip lengths.
4. **Video Editor** - trim on a timeline, fix caption words, choose a caption template and restyle it, pick
   aspect ratio / crop / zoom, audio options, logo, intro and outro. Edits save automatically.
5. **Export** - renders H.264 + AAC MP4 (1080x1920 by default). Every render is a new file.
6. **Campaigns / Earnings** - record campaigns and their rules, check a clip against them, log submissions,
   views and payments (by hand or CSV).

## How the score works

`backend/app/ai/highlight.py`. Candidates are runs of whole sentences near each target length, so a sentence
is never cut. Each gets six sub-scores (hook 25%, emotion 20%, curiosity 15%, information 15%, completeness
15%, audio/visual 10% - all adjustable) from the wording, pauses, speaking pace, scene cuts and whether a face
is visible. Points come off for an unfinished last sentence, an opening that leans on earlier context, and
heavy silence. Overlapping or near-identical candidates are dropped.

It is a transparent heuristic for sorting, **not** a prediction of views. There is no engagement data in it.

## Tests

```bash
cd backend && .venv/bin/python -m pytest          # 50 tests, about 90 seconds
```

The suite generates its own test video with synthesised speech (FFmpeg's `flite` voice), so no media is
committed. It covers metadata, audio extraction, transcript handling, candidate generation, scoring, timestamp
validation, caption timing, real FFmpeg renders, campaign checks, earnings maths, job cancel/retry/recovery,
the WebSocket, and the whole flow import -> audio -> transcript -> highlights -> clip -> captions -> render.

A browser run of the real app (needs Playwright):

```bash
cd backend && .venv/bin/python -m tests.sample_media /tmp/clipper-media
node scripts/e2e.mjs http://127.0.0.1:8000 /tmp/clipper-media
```

## Layout

```
backend/app/
  main.py            FastAPI app, startup (migrations, seed presets, worker)
  models.py          all 16 tables (SQLAlchemy); migrations/ holds the Alembic history
  services.py        import, transcript and caption-track helpers shared by API and worker
  api/               projects, clips, jobs (+ WebSocket), campaigns/earnings, system
  workers/runner.py  the single background worker and its job handlers
  ai/                transcription.py (faster-whisper), highlight.py (candidates + scoring)
  video/             ffmpeg.py (probe/run/silence/scenes), render.py (filter graph), subtitles.py (ASS), faces.py
  campaigns/, earnings/   checklist and payout maths
frontend/src/        pages/, components/ui.tsx (design system), stores/app.ts (jobs + toasts), services/api.ts
```

One worker thread runs one job at a time, so two jobs can never write the same files. Jobs are rows in
`analysis_jobs`; anything left "running" when the app stops is marked failed at next start and can be retried.

## What is and is not here

Built and tested: everything in "The workflow" above.

Not built, or different from the original brief - worth knowing before you rely on it:

| Area | Status |
|---|---|
| Whisper on a real model | The integration is written and unit-tested with a stand-in model, but the model download was blocked where this was developed, so **real transcription has not been run end to end yet**. Try it on a short video first. |
| LLM rating | Optional and off by default. With `CLIPPER_LLM_KEY` in `.env`, the top candidates' transcript text is sent to an OpenAI-compatible chat service (Gemini by default) which rates them and writes titles; the final score is half built-in, half model. **Not run against a real service yet**; the default model name `gemini-flash-latest` is unchecked. If the call fails the built-in scores are kept and the job log says why. |
| WhisperX alignment | Not integrated; word timings come from faster-whisper. |
| Scene detection | Uses FFmpeg's scene filter rather than PySceneDetect (same job, no extra dependency). |
| Face detection | OpenCV's Haar detector rather than MediaPipe. Face-aware crop centres on the median face position for the clip; it does not follow a moving speaker. Not checked against real footage of a face here. |
| Online import | Direct links to video files only. No YouTube/Instagram/TikTok downloading, by design. |
| Emoji | Emoji you type into captions are kept; none are added automatically, and colour emoji need an emoji font installed. |
| Live preview | Approximates the export. Blurred background, face position, silence removal and the slow push-in appear only in the rendered file. |
| Preview of unusual formats | The browser must be able to play the source for live preview (MP4/WebM are safe). Other formats still render. |
| Earnings totals | Added across campaigns without currency conversion. |
| Access control | None. The start script binds to 127.0.0.1; do not expose the port to a network. |
