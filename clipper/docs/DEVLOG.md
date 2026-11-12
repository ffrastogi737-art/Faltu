# Development log

## 2026-11-12 - initial build (phases 1-8)

Environment: Python 3.12.3, Node 22, FFmpeg 6.1.1 (libx264, libass, flite), 4 CPU cores, 15 GB RAM, no GPU.
The repository already held three unrelated apps, so this one lives in `clipper/` and touches nothing else.

Decisions
* One job table (`analysis_jobs`) is the queue for every job type; `render_jobs` holds render-only detail.
  Five handlers cover the eight job types in the brief: transcript analysis, highlight detection and clip
  generation are one `highlight_detection` job, and subtitle generation happens inside `video_render`.
* One worker thread, in-process. No Redis or separate worker process: a single user on one machine does not
  need it, and one-at-a-time execution is what guarantees jobs cannot corrupt each other's files.
* Caption words are stored in source-video time, so re-trimming a clip keeps the user's corrections.
* FFmpeg always runs with `-n` and a fresh output name. FFmpeg exits 0 when `-n` refuses to overwrite, so the
  wrapper checks its message explicitly.

Found by testing
* OpenCV 5 removed `CascadeClassifier`; pinned `<5`.
* The slow push-in zoomed toward the top-left corner because `crop` does not re-read a changing input size.
  The crop offset is now written in terms of `t`. Regression test: `test_push_in_zoom_stays_centred`.
* The editor said "all changes saved" during the debounce before a save. The status now flips the moment an
  edit is made, and the browser warns before leaving with a save pending. Caught by `scripts/e2e.mjs`.

Not verified
* faster-whisper against a real model (huggingface.co was not reachable from the build environment).
* Face-aware crop on footage that contains a face.
* GPU (CUDA) execution.

Next
* Run a real transcription and tune the highlight lexicons on real English/Hindi/Hinglish transcripts.
* Optional local-LLM rescoring of the top candidates; speaker tracking for face-aware crop.

## 2026-11-12 - phone (Termux) support

* Phone layout: bottom navigation under 768px, no sideways overflow on any page (measured at Pixel 7 size).
* `requirements-termux.txt`: no faster-whisper, no OpenCV, plain uvicorn + websockets. Face sampling returns
  nothing when OpenCV is missing; the project page explains that transcription is unavailable.
* `frontend/dist` is now committed so the phone needs no Node.
* Verified: full browser journey against a server running only the Termux dependency list (on Linux).
* Not verified: `scripts/termux.sh` on a real device (package names, pydantic-core wheel from the TUR index,
  libass and fonts in Termux's ffmpeg).
* Next for phones: a whisper.cpp backend so transcription works on-device.

## 2026-11-12 - whisper.cpp fallback for phones

* `transcription.py` uses the `whisper-cli` program when faster-whisper is not importable: `-ojf` JSON, word
  timings rebuilt from token pieces, progress read from `-pp`, model `ggml-<size>.bin` downloaded once into
  `storage/models`. `scripts/termux.sh` builds whisper.cpp v1.9.5 on the phone.
* Verified: flags and JSON shape read from whisper.cpp's `examples/cli/cli.cpp`; the subprocess path is tested
  against a stand-in program (`test_whisper_cpp_fallback`).
* Not verified: a real whisper.cpp build or transcription (could not be compiled in the build environment),
  and the build inside Termux.
* whisper.cpp runs without the voice-activity filter faster-whisper uses, so long silences or music may
  produce made-up lines.

## 2026-11-12 - optional LLM rating of top candidates

* `ai/llm.py`: one chat request per analysis with the de-duplicated top candidates; score blended 50/50, title
  replaced, reason appended. Off without `CLIPPER_LLM_KEY`. Failure keeps the heuristic ranking.
* `start.sh` / `termux.sh` now load `.env`.
* Not verified: a real Gemini (or other) call - the endpoint was not reachable from the build environment.
