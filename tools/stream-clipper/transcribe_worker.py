#!/usr/bin/env python3
"""Whisper worker. Run by edit_clip.py with whichever installed Python has faster-whisper (nothing is installed by this project).

  python transcribe_worker.py <audio.wav 16 kHz mono> <out.json> <model_dir> <lang: hi|en>

Writes {"words": [{"w", "s", "e"}], "language": "hi"}. The multilingual model ($STREAM_CLIPPER_MODEL: small or medium) is downloaded once into <model_dir>.
The Roman-Hindi prompt nudges Whisper toward Roman (Hinglish) spelling; edit_clip.py romanises any Devanagari that still comes out.
"""
import json, sys

from faster_whisper import WhisperModel

wav, out, model_dir, lang = sys.argv[1:5]
PROMPT = 'Haan bhai, yeh kya ho gaya! Arre yaar, bahut mast hai, dekho dekho, nahi nahi nahi, chalo chalo!'
import os
model = WhisperModel(os.environ.get('STREAM_CLIPPER_MODEL', 'small'), device='cpu', compute_type='int8', download_root=model_dir)
segs, info = model.transcribe(wav, language=None if lang == 'auto' else lang, task='transcribe', word_timestamps=True, vad_filter=True,
                              beam_size=5, condition_on_previous_text=False, initial_prompt=PROMPT, compression_ratio_threshold=2.0, repetition_penalty=1.05)    # default temperature fallback retries a looping / garbled segment
words = [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3), 'p': round(w.probability, 2)} for s in segs for w in (s.words or []) if w.word.strip()]
json.dump({'words': words, 'language': info.language}, open(out, 'w'), ensure_ascii=False)
