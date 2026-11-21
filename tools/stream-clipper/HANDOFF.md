# Stream Clipper: handoff to a new chat

Standalone tool. Raw gameplay/stream clips in `input/` -> 9:16 YouTube Shorts + an upload kit in `output/<clip>/`. **It never uploads anything** (the user uploads by hand).
It is not connected to any other project, channel or automation. Reply to the user in simple Hindi (they write English/Hindi).

## Run
- `python3 edit_clip.py` edits every clip in `input/`. `--test` runs the synthetic self-test (about 100 s, must print "self-check OK").
- Common flags: `--creator "@name"` (credit line + settings from `creators.json`), `--game "GTA 6"`, `--hook "5-7 WORD HOOK"`, `--box x,y,w,h`, `--facecam right|left|top-right`, `--no-facecam`, `--require-facecam`, `--cal` (writes `cal.jpg` only), `--save-preset`, `--model small|medium`, `--retranscribe`.
- Output per clip: `final_short.mp4` (1080x1920), `sheet.jpg` (contact sheet), `metadata.txt` (3 titles <60 chars, description + @credit, hashtags, Studio tags, pinned comment; also printed), `words.json` (editable captions), `cal.jpg`.

## What it does (edit_clip.py, one file)
1. Finds the sharp 16:9 picture (second-difference edge energy; strips blurred/black phone-recording bars). 2. Trims pause-menu frames (still picture, no loud reaction) and dead air; targets 18-45 s.
3. Split screen: facecam crop -> top 1080x670, gameplay centre -> bottom 1080x1250, yellow divider. `--no-facecam`: gameplay fills 9:16 and follows the action.
4. Local transcription: faster-whisper via `transcribe_worker.py` (run by a Python that has faster-whisper; found automatically or via `STREAM_CLIPPER_WHISPER_PY`), Roman Hinglish, word timestamps, Devanagari -> Roman fallback. Captions 2-4 words, white + black outline, active word #FFE600, centred on the divider.
5. Hook banner 0-3.5 s (auto from the funniest line, or `--hook`). Loud-peak punch-in zoom 1.07x + synthesized whoosh/pop/boom. Audio mastered to -15.5 LUFS.
6. Facecam resolution order: `--box` > `--facecam` preset > `creators.json` (`--creator`) > automatic stationary-face search (YuNet ONNX via onnxruntime, 12 frames) > `--no-facecam` fallback. `cal.jpg` shows which source was used.

## Needs (all existing tools, nothing exotic)
ffmpeg + ffprobe, Python 3 with numpy, scipy, Pillow, onnxruntime; a Python with `faster-whisper` (CPU, int8; needs `av<16`: av 16+ dropped `metadata_errors` and transcription fails); font Inter Black (falls back to DejaVu).
Models are NOT in this bundle: the YuNet face model (232 KB) and the Whisper model download into `models/` on first use (`medium` is about 1.5 GB, `small` about 0.5 GB). Whisper must be the multilingual one for Hindi.

## State and lessons so far
- One real clip processed end to end (a phone screen-recording of a GTA stream, facecam inset top-right). Detection and crops were tuned on that single clip + synthetic tests: test other creators' clips with `--cal` first.
- Whisper small garbles Hindi when game audio is loud; `medium` is the default and much better, still not perfect. Captions have mis-hearings: edit `output/<clip>/words.json` and re-run (it reuses the file, about 30 s). `temperature=0` made medium loop ("chalo chalo ..."): keep the default fallback + `collapse_loops`.
- Metadata is rule-based from the hook/transcript (no AI service): the user reviews it before uploading. Do not quote raw speech-to-text in descriptions.
- Loudness: very peaky clips land near -15.8 LUFS because the true-peak ceiling (-1.5 dBTP) wins over the target.
- Known quirk to fix if the user agrees: `--creator` + `--box` auto-saves the creator, and a one-off `--game` overwrites the creator's saved default game. Better: auto-save only the box; save game/lang only with `--save-preset`.
- `assets/facecam_fixture.png` is a facecam still cropped from the user's own clip, used only by `--test` for the 4-corner face-detection tests.
- `creators.json` is pre-seeded: `@Mythpat` box `0.765,0.12,0.235,0.30`, game `GTA 5`, lang `hi`.
- The clipped footage belongs to another creator: the user credits them and decides about permission; this tool only produces files.
