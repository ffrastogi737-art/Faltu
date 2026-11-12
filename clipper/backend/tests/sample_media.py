"""Generates a test video with synthesised speech (ffmpeg's flite voice) and known sentence timings.
Usage: python -m tests.sample_media <output-dir>"""
import subprocess
from pathlib import Path

def _run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def _duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


SENTENCES = [
    "Why do most people fail at saving money?",
    "Here is the secret that nobody tells you.",
    "You never need a bigger salary to start.",
    "First, move ten percent of every payment into a separate account.",
    "This works because you cannot spend what you do not see.",
    "I lost everything at twenty five and it was painful.",
    "But that failure taught me the most important lesson of my life.",
    "A study of one thousand families found the same pattern.",
    "The families who saved first were happier after five years.",
    "So remember, pay yourself first and the rest becomes easy.",
    "And then we talked about some other things for a while.",
    "What would you do with an extra hundred dollars every month?",
    "Imagine the freedom of having six months of savings.",
    "That is the real reason to start today.",
]


def _run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def _duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def build(d: Path) -> dict:
    """Writes sample.mp4 and sample.srt into d. Returns {"path", "segments": true timing of each spoken sentence, "duration"}."""
    segments, t, parts = [], 0.5, []
    for i, text in enumerate(SENTENCES):
        wav = d / f"s{i}.wav"
        (d / f"s{i}.txt").write_text(text)
        _run("-f", "lavfi", "-i", f"flite=textfile={d / f's{i}.txt'}:voice=slt", "-ar", "16000", str(wav))
        dur = _duration(wav)
        segments.append({"start": round(t, 3), "end": round(t + dur, 3), "text": text})
        parts.append((wav, t))
        t += dur + (1.6 if i == 5 else 0.35)  # one long pause, for the silence tests
    total = t + 0.5
    inputs, filt = [], []
    for i, (wav, at) in enumerate(parts):
        inputs += ["-i", str(wav)]
        filt.append(f"[{i}:a]adelay={int(at * 1000)}[a{i}]")
    filt.append("".join(f"[a{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0[a]")
    path = d / "sample.mp4"
    _run(*inputs, "-f", "lavfi", "-i", f"testsrc2=s=640x360:r=25:d={total:.2f}", "-filter_complex", ";".join(filt),
         "-map", f"{len(parts)}:v", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-t", f"{total:.2f}", str(path))
    def ts(x: float) -> str:
        return f"{int(x // 3600):02d}:{int(x // 60 % 60):02d}:{int(x % 60):02d},{int(x * 1000 % 1000):03d}"
    (d / "sample.srt").write_text("".join(f"{i + 1}\n{ts(s['start'])} --> {ts(s['end'])}\n{s['text']}\n\n" for i, s in enumerate(segments)))
    return {"path": path, "segments": segments, "duration": total}


if __name__ == "__main__":
    import sys
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    print(build(out)["path"])
