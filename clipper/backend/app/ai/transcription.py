"""Speech recognition with faster-whisper. CPU works everywhere; CUDA is used when asked for and available."""
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
        return {"installed": False, "cuda": False, "error": str(e)}


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
