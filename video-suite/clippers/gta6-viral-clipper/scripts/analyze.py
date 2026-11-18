"""Signals nikalta hai: audio energy, silence, scene cuts, transcript (word-level).

Output (workdir me): audio.wav, energy.json, silence.json, scenes.json, transcript.json
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from common import need, run, save_json, load_json  # noqa: E402


def extract_audio(video, workdir):
    out = Path(workdir) / "audio.wav"
    if not out.exists():
        run(["ffmpeg", "-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", out])
    return out


def audio_energy(audio_path, win=1.0):
    """1-second RMS bins (dB) -> list. Pure numpy, librosa ki zaroorat nahi."""
    proc = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio_path), "-f", "f32le",
                           "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True)
    y = np.frombuffer(proc.stdout, dtype=np.float32)
    n = int(16000 * win)
    bins = len(y) // n
    if bins == 0:
        return []
    y = y[: bins * n].reshape(bins, n)
    rms = np.sqrt((y ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    peak = np.abs(y).max(axis=1)
    return [{"t": float(i * win), "db": float(db[i]), "peak": float(peak[i])} for i in range(bins)]


def detect_silence(video, noise_db=-35, min_len=1.5):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(video), "-vn", "-af",
                        f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return [{"start": s, "end": e} for s, e in zip(starts, ends)]


def detect_scenes(video, threshold=0.30):
    """ffmpeg scene filter se cut timestamps. Heavy videos ke liye 360p pe analyze."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(video), "-an", "-vf",
                        f"scale=-2:360,select='gt(scene,{threshold})',showinfo",
                        "-f", "null", "-"], capture_output=True, text=True)
    return [float(x) for x in re.findall(r"pts_time:([\d.]+)", r.stderr)]


def transcribe(audio_path, model_size="small", language=None):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("! faster-whisper installed nahi hai -> transcript skip "
              "(pip install faster-whisper). Audio/scene signals se kaam chalega, subtitles nahi banenge.")
        return None
    def _run(device, ctype):
        model = WhisperModel(model_size, device=device, compute_type=ctype)
        segs, info = model.transcribe(str(audio_path), beam_size=5, word_timestamps=True,
                                      vad_filter=True, language=language)
        return list(segs), info
    try:
        segs, info = _run("auto", "auto")
    except Exception as e:
        print(f"! GPU/auto whisper fail ({e}) -> CPU int8 pe chala raha hoon")
        segs, info = _run("cpu", "int8")
    out = []
    for s in segs:
        out.append({"start": s.start, "end": s.end, "text": s.text.strip(),
                    "words": [{"start": w.start, "end": w.end, "word": w.word.strip()}
                              for w in (s.words or [])]})
    print(f"✓ transcript: {len(out)} segments, language={info.language}")
    return out


def analyze(video, workdir, whisper_model="small", language=None, transcript_file=None):
    need("ffmpeg")
    wd = Path(workdir)
    wd.mkdir(parents=True, exist_ok=True)
    audio = extract_audio(video, wd)

    save_json(audio_energy(audio), wd / "energy.json")
    save_json(detect_silence(video), wd / "silence.json")
    save_json(detect_scenes(video), wd / "scenes.json")

    if transcript_file:                       # user ka apna transcript (same schema)
        tr = load_json(transcript_file)
    elif (wd / "transcript.json").exists():   # resume
        tr = load_json(wd / "transcript.json")
    else:
        tr = transcribe(audio, whisper_model, language)
    save_json(tr or [], wd / "transcript.json")
    return wd


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("workdir")
    ap.add_argument("--whisper-model", default="small")
    ap.add_argument("--language", default=None, help="e.g. en, hi (default: auto)")
    ap.add_argument("--transcript", default=None)
    a = ap.parse_args()
    analyze(a.video, a.workdir, a.whisper_model, a.language, a.transcript)
