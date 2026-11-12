"""Speech recognition. faster-whisper on computers (CPU, or CUDA when available); whisper.cpp's command-line
program where faster-whisper cannot be installed, such as Android phones (see scripts/termux-whisper.sh)."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable, Optional

from ..core import config

MODEL_SIZES = ["tiny", "base", "small", "medium", "large-v3"]


class TranscriptionError(RuntimeError):
    pass


# whisper.cpp model files, in the format its program reads. Sizes in MB, for the disk-space check.
CPP_MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{size}.bin"
CPP_MODEL_MB = {"tiny": 78, "base": 148, "small": 488, "medium": 1533, "large-v3": 3095}


def _faster_whisper() -> Optional[str]:
    """None when faster-whisper works, otherwise why not."""
    try:
        import ctranslate2  # noqa: F401
        import faster_whisper  # noqa: F401
        return None
    except Exception as e:  # missing package or broken native library
        return str(e)


def cpp_binary() -> Optional[str]:
    """Path of whisper.cpp's whisper-cli: $CLIPPER_WHISPER_CPP, then PATH, then where termux-whisper.sh builds it."""
    for c in (os.environ.get("CLIPPER_WHISPER_CPP"), shutil.which("whisper-cli"),
              str(Path.home() / "whisper.cpp" / "build" / "bin" / "whisper-cli")):
        if c and Path(c).is_file() and os.access(c, os.X_OK):
            return c
    return None


def status() -> dict:
    err = _faster_whisper()
    if err is None:
        import ctranslate2
        return {"installed": True, "engine": "faster-whisper", "cuda": ctranslate2.get_cuda_device_count() > 0}
    if cpp_binary():
        return {"installed": True, "engine": "whisper.cpp", "cuda": False}
    return {"installed": False, "engine": None, "cuda": False, "error": err}


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
    on_progress(fraction, stage) may be called with a stage label; stage None means "transcribing".

    faster-whisper streams segments, so long audio is decoded chunk by chunk rather than held in memory."""
    if size not in MODEL_SIZES:
        raise TranscriptionError(f"Unknown Whisper model '{size}'. Choose one of: {', '.join(MODEL_SIZES)}")
    if _faster_whisper() is not None:
        binary = cpp_binary()
        if not binary:
            raise TranscriptionError(
                "No speech recognition engine is installed. On a computer install faster-whisper "
                "(pip install -r requirements.txt); on Android run scripts/termux-whisper.sh once.")
        return _transcribe_cpp(binary, audio, size=size, language=language, threads=threads,
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
                on_progress(min(1.0, seg.end / duration), None)
    except MemoryError as e:
        raise TranscriptionError("Ran out of memory while transcribing. Pick a smaller model in Settings.") from e
    return {"language": info.language, "model": f"{size} ({dev})", "segments": out}


def cpp_model(size: str, on_progress: Optional[Callable[[float, Optional[str]], None]] = None,
              should_cancel: Optional[Callable[[], bool]] = None) -> Path:
    """The whisper.cpp model file, downloaded once into storage/models. A partial download never counts as a model."""
    path = Path(config.WHISPER_DIR or config.DIRS["models"]) / f"ggml-{size}.bin"
    if path.is_file():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    need = CPP_MODEL_MB[size] * 1024 * 1024
    free = shutil.disk_usage(path.parent).free
    if free < need + 200 * 1024 * 1024:
        raise TranscriptionError(f"The '{size}' speech model needs about {CPP_MODEL_MB[size]} MB, but only "
                                 f"{free // 1048576} MB is free. Free some space or pick a smaller model.")
    part = path.with_suffix(".part")
    label = f"Downloading the '{size}' speech model (one time, about {CPP_MODEL_MB[size]} MB)"
    try:
        req = urllib.request.Request(CPP_MODEL_URL.format(size=size), headers={"User-Agent": "personal-ai-clipper"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(part, "wb") as f:
            total, done = int(resp.headers.get("Content-Length") or need), 0
            while chunk := resp.read(1024 * 1024):
                if should_cancel and should_cancel():
                    raise InterruptedError()
                f.write(chunk)
                done += len(chunk)
                if on_progress:
                    on_progress(min(1.0, done / total), label)
        part.replace(path)
    except OSError as e:
        raise TranscriptionError(f"Could not download the '{size}' speech model from huggingface.co: {e}. "
                                 "This needs internet access once.") from e
    finally:
        part.unlink(missing_ok=True)
    return path


def parse_cpp_json(data: dict) -> tuple[str, list[dict]]:
    """whisper-cli's --output-json-full file -> (language, segments). Offsets are milliseconds. Tokens are word
    pieces; a piece starting with a space starts a new word. "[_BEG_]"-style entries are control tokens."""
    segments = []
    for seg in data.get("transcription", []):
        words: list[dict] = []
        for tok in seg.get("tokens", []):
            text, off = tok.get("text", ""), tok.get("offsets")
            if text.startswith("[_") or not off:
                continue
            start, end = off["from"] / 1000, off["to"] / 1000
            if words and not text.startswith(" "):
                words[-1]["text"] += text
                words[-1]["end"] = max(words[-1]["end"], end)
            else:
                words.append({"text": text, "start": start, "end": end})
        words = [{**w, "text": w["text"].strip()} for w in words if w["text"].strip()]
        text = seg.get("text", "").strip()
        if text:
            segments.append({"start": seg["offsets"]["from"] / 1000, "end": seg["offsets"]["to"] / 1000,
                             "text": text, "words": words})
    return data.get("result", {}).get("language", ""), segments


def _transcribe_cpp(binary: str, audio: Path, *, size: str, language: str, threads: int,
                    on_progress: Optional[Callable] = None, should_cancel: Optional[Callable[[], bool]] = None) -> dict:
    fresh = not (Path(config.WHISPER_DIR or config.DIRS["models"]) / f"ggml-{size}.bin").is_file()
    share = 0.3 if fresh else 0.0  # part of the progress bar the one-time download takes
    model = cpp_model(size, (lambda f, s: on_progress(share * f, s)) if on_progress else None, should_cancel)
    work = Path(tempfile.mkdtemp(prefix="whisper-", dir=config.DIRS["temp"]))
    cmd = [binary, "-m", str(model), "-f", str(audio), "-l", language or "auto", "-oj", "-ojf",
           "-of", str(work / "out"), "-pp", *(["-t", str(threads)] if threads else [])]
    tail: list[str] = []
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, errors="replace")
        try:
            for line in proc.stderr:
                tail = (tail + [line.rstrip()])[-15:]
                if should_cancel and should_cancel():
                    proc.kill()
                    raise InterruptedError()
                m = re.search(r"progress =\s*(\d+)%", line)
                if m and on_progress:
                    on_progress(share + (1 - share) * int(m.group(1)) / 100, None)
        finally:
            proc.stderr.close()
            proc.wait()
        out = work / "out.json"
        if proc.returncode != 0 or not out.is_file():
            hint = " The phone may be out of memory: pick a smaller model in Settings." if proc.returncode in (-9, 137) else ""
            raise TranscriptionError(f"whisper.cpp failed (exit {proc.returncode}).{hint} " + " | ".join(tail[-4:]))
        lang, segments = parse_cpp_json(json.loads(out.read_text(encoding="utf-8", errors="replace")))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"language": lang, "model": f"{size} (whisper.cpp)", "segments": segments}
