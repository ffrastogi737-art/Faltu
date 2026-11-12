"""Face position sampling with OpenCV's bundled Haar cascade. Reads single frames by seeking, never the whole video."""
from pathlib import Path
from typing import Optional


def sample_faces(path: Path, times: list[float]) -> list[dict]:
    """For each time: {"t", "cx", "cy"} with the largest face's centre as 0..1 fractions, or None when no face."""
    import cv2

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    cap = cv2.VideoCapture(str(path))
    out = []
    try:
        for t in times:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                continue
            h, w = frame.shape[:2]
            scale = 480 / max(w, h) if max(w, h) > 480 else 1.0  # small frames keep memory and CPU low
            gray = cv2.cvtColor(cv2.resize(frame, None, fx=scale, fy=scale), cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
            if len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                out.append({"t": round(t, 2), "cx": round((x + fw / 2) / gray.shape[1], 3), "cy": round((y + fh / 2) / gray.shape[0], 3)})
            else:
                out.append({"t": round(t, 2), "cx": None, "cy": None})
    finally:
        cap.release()
    return out


def face_centre(samples: list[dict]) -> Optional[tuple[float, float]]:
    """Median face centre across samples, or None when faces were found in under a third of them."""
    hits = [s for s in samples if s["cx"] is not None]
    if not samples or len(hits) < len(samples) / 3:
        return None
    xs, ys = sorted(s["cx"] for s in hits), sorted(s["cy"] for s in hits)
    return xs[len(xs) // 2], ys[len(ys) // 2]
