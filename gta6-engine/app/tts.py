"""Voice. 'edge' = Microsoft Edge neural TTS (free, needs internet + `pip install edge-tts`).
'silent' = placeholder track with correct timing (for tests / when offline).
Returns (path, duration_seconds)."""
import asyncio
import subprocess

from .config import settings


def _duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def estimate_seconds(text, wpm=165):
    return max(1.5, len(text.split()) / wpm * 60)


def synth(text, out_path):
    out_path = str(out_path)
    if settings.tts_provider == "edge":
        import edge_tts  # optional dependency
        asyncio.run(edge_tts.Communicate(text, settings.tts_voice).save(out_path))
        return out_path, _duration(out_path)
    secs = estimate_seconds(text)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-t", f"{secs:.2f}", "-c:a", "libmp3lame", out_path], check=True)
    return out_path, secs
