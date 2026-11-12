"""Speech recognition with faster-whisper. CPU works everywhere; CUDA is used when asked for and available.
Where faster-whisper cannot be installed (Android/Termux), the whisper.cpp command-line program is used instead."""
import json
import os
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path
from typing import Callable, Optional

from ..core import config

MODEL_SIZES = ["tiny", "base", "small", "medium", "large-v3"]


class TranscriptionError(RuntimeError):
    pass


def status() -> dict:
    try:
        import ctranslate2
        import faster_whisper  # noqa: F401
        return {"installed": True, "cuda": ctranslate2.get_cuda_device_count() > 0}
    except Exception as e:  # missing package or broken native library
        if cpp_binary():
            return {"installed": True, "cuda": False, "engine": "whisper.cpp"}
        return {"installed": False, "cuda": False, "error": str(e)}


def cpp_binary() -> Optional[str]:
    """whisper-cli from CLIPPER_WHISPER_CPP, the PATH, or the copy scripts/termux.sh builds."""
    built = config.ROOT / "whisper.cpp" / "build" / "bin" / "whisper-cli"
    return os.environ.get("CLIPPER_WHISPER_CPP") or shutil.which("whisper-cli") or (str(built) if built.is_file() else None)


def cpp_model(size: str, should_cancel: Optional[Callable[[], bool]] = None) -> Path:
    if size not in MODEL_SIZES:
        raise TranscriptionError(f"Unknown Whisper model '{size}'. Choose one of: {', '.join(MODEL_SIZES)}")
    folder = Path(config.WHISPER_DIR) if config.WHISPER_DIR else config.STORAGE / "models"
    path = folder / f"ggml-{size}.bin"
    if path.is_file():
        return path
    folder.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(".part")

    def hook(*_):
        if should_cancel and should_cancel():
            raise InterruptedError()
    try:
        urllib.request.urlretrieve(f"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{path.name}", part, hook)
        part.replace(path)  # only a complete download gets the real name
    except InterruptedError:
        part.unlink(missing_ok=True)
        raise
    except Exception as e:
        part.unlink(missing_ok=True)
        raise TranscriptionError(
            f"Could not download the Whisper '{size}' model: {e}. It is downloaded from huggingface.co the first "
            f"time it is used, so this needs internet access once. You can also put {path.name} in {folder} yourself.") from e
    return path


def cpp_segments(data: dict) -> list[dict]:
    """whisper-cli -ojf JSON -> our segments. Tokens are word pieces; a leading space starts a new word."""
    out = []
    for seg in data.get("transcription", []):
        text = seg.get("text", "").strip()
        if not text:
            continue
        words: list[dict] = []
        for tok in seg.get("tokens", []):
            t = tok.get("text", "")
            if t.startswith("[_") or not t.strip():  # [_BEG_], [_TT_123] and friends are not speech
                continue
            off = tok.get("offsets") or seg["offsets"]
            if words and not t.startswith(" "):
                words[-1]["text"] += t
                words[-1]["end"] = off["to"] / 1000
            else:
                words.append({"text": t.strip(), "start": off["from"] / 1000, "end": off["to"] / 1000})
        out.append({"start": seg["offsets"]["from"] / 1000, "end": seg["offsets"]["to"] / 1000, "text": text, "words": words})
    return out


def transcribe_cpp(audio: Path, *, size: str, language: str = "auto", threads: int = 0,
                   on_progress: Optional[Callable[[float], None]] = None,
                   should_cancel: Optional[Callable[[], bool]] = None) -> dict:
    model = cpp_model(size, should_cancel)
    prefix = Path(audio).with_suffix("")  # whisper-cli writes <prefix>.json
    result = Path(f"{prefix}.json")
    cmd = [cpp_binary(), "-m", str(model), "-f", str(audio), "-l", language, "-ojf", "-of", str(prefix), "-pp"]
    proc = subprocess.Popen(cmd + (["-t", str(threads)] if threads else []), stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE, text=True, errors="replace")
    tail = ""
    try:
        # shortcut: cancel is only noticed when whisper-cli prints a line (every 5% of the audio); poll on a timer if that feels slow
        for line in proc.stderr:
            tail = (tail + line)[-600:]
            if should_cancel and should_cancel():
                raise InterruptedError()
            m = re.search(r"progress =\s*(\d+)%", line)
            if m and on_progress:
                on_progress(min(1.0, int(m.group(1)) / 100))
        if proc.wait() != 0 or not result.is_file():
            hint = " The phone may have run out of memory: pick a smaller model." if proc.returncode < 0 else ""
            raise TranscriptionError(f"whisper.cpp failed (exit {proc.returncode}).{hint} {tail.strip()}")
        data = json.loads(result.read_text(encoding="utf-8", errors="replace"))
    finally:
        proc.kill()
        proc.wait()
        result.unlink(missing_ok=True)
    return {"language": data.get("result", {}).get("language") or language, "model": f"{size} (whisper.cpp)",
            "segments": cpp_segments(data)}


def load_model(size: str, device: str = "auto", threads: int = 0):
    from faster_whisper import WhisperModel

    if size not in MODEL_SIZES:
        raise TranscriptionError(f"Unknown Whisper model '{size}'. Choose one of: {', '.join(MODEL_SIZES)}")
    want_cuda = device == "cuda" or (device == "auto" and status()["cuda"])
    attempts = ([("cuda", "float16")] if want_cuda else []) + [("cpu", "int8")]  # CPU is always the fallback
    last: Optional[Exception] = None
    for dev, compute in attempts:
        try:
            return WhisperModel(size, device=dev, compute_type=compute, cpu_threads=threads, download_root=config.WHISPER_DIR), dev
        except MemoryError as e:
            raise TranscriptionError(f"Not enough memory to load the '{size}' model. Pick a smaller model in Settings.") from e
        except Exception as e:
            last = e
    raise TranscriptionError(
        f"Could not load the Whisper '{size}' model: {last}. The model is downloaded from huggingface.co the first "
        "time it is used, so this needs internet access once (or a model already in the cache).")


def transcribe(audio: Path, *, size: str, device: str = "auto", language: str = "auto", threads: int = 0,
               duration: float = 0, on_progress: Optional[Callable[[float], None]] = None,
               should_cancel: Optional[Callable[[], bool]] = None) -> dict:
    """Returns {"language", "model", "segments": [{start, end, text, words:[{text,start,end}]}]}.

    faster-whisper streams segments, so long audio is decoded chunk by chunk rather than held in memory."""
    if status().get("engine") == "whisper.cpp":
        return transcribe_cpp(audio, size=size, language=language, threads=threads,
                              on_progress=on_progress, should_cancel=should_cancel)
    model, dev = load_model(size, device, threads)
    try:
        segments, info = model.transcribe(
            str(audio), language=None if language == "auto" else language, word_timestamps=True, vad_filter=True)
        out = []
        for seg in segments:
            if should_cancel and should_cancel():
                raise InterruptedError()
            out.append({"start": seg.start, "end": seg.end, "text": seg.text.strip(),
                        "words": [{"text": w.word.strip(), "start": w.start, "end": w.end} for w in (seg.words or [])]})
            if on_progress and duration:
                on_progress(min(1.0, seg.end / duration))
    except MemoryError as e:
        raise TranscriptionError("Ran out of memory while transcribing. Pick a smaller model in Settings.") from e
    return {"language": info.language, "model": f"{size} ({dev})", "segments": out}
