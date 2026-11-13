# CLIPPING_INSTRUCTIONS.md

How to turn one long video into short vertical clips (9:16), fully edited.
Claude Code: read this file fully, then follow it exactly. Do not skip steps.

## 0. Rules before anything else

- Only work on videos the user is allowed to use: their own content, or a video from an official clipping campaign, or one with written permission.
- Before downloading any link, ask the user once: "Is this your video, or do you have permission or an official campaign for it?" If the answer is no, stop and say so.
- Ask before installing anything. Never delete files in `input/`.
- Reply to the user in simple Hinglish. Keep messages short.

## 1. Folder layout

```
clipping-project/
├── CLIPPING_INSTRUCTIONS.md
├── input/
│   └── podcast.mp4          (source video)
└── output/
    ├── clips/               (raw clips + clips_report.md)
    └── final/               (edited clips, ready to post)
```

Create any missing folders.

## 2. Tools

- ffmpeg, faster-whisper (or whisper.cpp), yt-dlp (only if the user gives a link).
- First check which are installed (`ffmpeg -version`, `pip show faster-whisper`, `yt-dlp --version`).
- List what is missing and ask the user before installing. This is a Windows laptop, so use PowerShell-safe commands.

## 3. Getting the video

- If the user gives a file: use it from `input/`.
- If the user gives a YouTube link (after the rights question in section 0): download the best quality MP4 with yt-dlp into `input/podcast.mp4`.

## 4. Transcription

- Transcribe the video in `input/` with word-level timestamps.
- Save as `output/transcript.json`.
- A long video takes time. Tell the user the progress.

## 5. Moment scoring

Score every possible moment from 1 to 10 on:

1. Hook in the first 3 seconds (bold claim, question or surprise)
2. Payoff (laugh, shock, strong opinion or useful lesson)
3. Makes sense on its own, without the rest of the video
4. Clean ending (no cut in the middle of a sentence)

Rules:

- Clip length: 30 to 60 seconds.
- Pick the top N moments only (N is given by the user in the run prompt; default 2 for a test).
- Clips must not overlap.

## 6. Raw clip output spec

- 1080x1920 vertical, 30 fps, H.264, AAC audio normalized to -14 LUFS.
- Reframe so the speaker's face stays centered. If there is no face (gameplay, trailer), center-crop on the main action.
- No captions in this step.
- Save as `output/clips/clip1.mp4`, `clip2.mp4`, and so on.

## 7. Report

Write `output/clips/clips_report.md` with, for each clip: start time, end time, score, a short reason, and a hook title (max 8 words, in Hinglish or English matching the video).

## 8. Editing (only when the user asks for the edit step)

For every clip in `output/clips/`:

- Captions: word-by-word, 2 to 4 words at a time, bold white sans-serif (Montserrat ExtraBold or Inter ExtraBold, about 80 px), black outline, centered at about 70% of the frame height. The word being spoken turns yellow (#FFD400).
- Hook title: from `clips_report.md`, at the top for the first 3 seconds, white text on a black rounded box.
- Punch-in zoom from 1.00 to 1.08 on the strongest line, every 4 to 6 seconds, with smooth easing. Add a short zoom-out after each punch-in so it feels natural.
- Remove silences longer than 0.4 seconds, but never cut in the middle of a word.
- Keep all text out of the top 10%, bottom 15% and right 12% of the frame (platform buttons).
- Normalize audio to -14 LUFS.
- Export to `output/final/clip1_final.mp4`, `clip2_final.mp4`, and so on.
- Before finishing, show one frame from each clip so the user can check captions and framing.

## 9. After the run

- Show the report and the file paths of the clips.
- If the user says a hook is weak: find a stronger start, up to 5 seconds earlier or later.
- If a crop is off: re-center on the speaker.
- If captions are out of sync: re-sync to the word timestamps.

## 10. Upload (optional, later)

Final clips go to the Google Drive folder named by the user. Uploading to YouTube is handled separately (Zapier), one clip at a time. Do not upload anything from here unless the user asks.
