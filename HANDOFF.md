# HANDOFF (session branch ccr-fa5fa7f1-do17r2, 18 Nov 2026)

## Done in this session
- **Long video 01** for Kratos Playz: "GTA 5 Habits That Will Get You Caught In GTA 6", 4:19, 1920x1080, 31 MB.
  Files: `long-form/01-gta5-habits-gta6/` (mp4, thumb.jpg, script.json with sources, README with title / description / chapters / tags, trend-research.md).
  YouTube: https://www.youtube.com/watch?v=ID0o6Y-NKes, uploaded PRIVATE, scheduled public 19 Nov 2026 16:30 IST. Test logged in `long-form/experiments.txt`
  (judge after 7 days: views + average view duration vs the Kratos Shorts median).
- **New style `cctv-wide` (CCTV Dossier)**, 16:9 long-form, in `.claude/skills/faceless-shorts/styles/cctv-wide/` (STYLE.md, example, style-sheet.png) and a row in SKILL.md.
  Reuse: `bash scripts/new_video.sh cctv-wide <name>`.
- **`scripts/words_from_lines.py`**: word timings without Whisper (the Whisper model download fails in the cloud container). Accuracy about +-0.3 s inside a line.
- Skills/plugins checked: no plugins enabled; `gta6-viral-clipper` / `peakcut-clipper` need real gameplay footage (not allowed); Adobe tools were not needed.

## Open items
- **Owner:** Kratos Playz must be phone-verified (https://www.youtube.com/verify) before ANY custom thumbnail works; then set the thumbnail on ID0o6Y-NKes (URL in the README).
- **Owner decision:** old videos dltJ6ScN2Dw and JqGb4VyObBM (someone else's gameplay): not touched, never delete; ask before making them private.
- Facts are pre-launch (game releases 19 Nov, so no reviews existed on 18 Nov). After launch: re-check 30 FPS, Heat, online, map size against real reviews, then make Part 2.
- Worked in this session branch only; the factory branch ccr-8c1babe8-9jk0db and shorts-out/ were not changed (HANDOFF.md did not exist before, created now).
- Note: the "chalk-wide" style mentioned in the brief does not exist in the repo; cctv-wide is the first 16:9 style.
