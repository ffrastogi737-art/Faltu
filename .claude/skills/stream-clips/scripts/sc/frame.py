"""Turn a 16:9 frame into 9:16. Three looks, chosen per clip:

  stack  a small live face = a facecam over gameplay: cam panel on top, gameplay below
  crop   a big face (podcast, just chatting, IRL): a 9:16 window that follows the face
  blur   no usable face: the whole frame, centred over a blurred copy of itself

Faces are found on low-res frames sampled with ffmpeg (no OpenCV video decoding, so it
behaves the same on macOS and Windows). The facecam's rectangle is found from edges that
stay put across the clip (overlay borders) and falls back to a box sized from the face.
"""

import subprocess

import numpy as np

from .common import MODELS, even, say

SAMPLE_W = 640
SAMPLE_FPS = 2
MAX_SAMPLES = 90


def sample(path, start, length, info):
    """Low-res BGR frames from [start, start+length) of `path`, plus the scale factor."""
    h = even(info["height"] * SAMPLE_W / info["width"])
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{length:.3f}",
           "-i", str(path), "-an", "-vf", f"fps={SAMPLE_FPS},scale={SAMPLE_W}:{h}",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    size = SAMPLE_W * h * 3
    n = len(raw) // size
    if not n:
        return np.zeros((0, h, SAMPLE_W, 3), np.uint8), info["width"] / SAMPLE_W
    frames = np.frombuffer(raw[: n * size], np.uint8).reshape(n, h, SAMPLE_W, 3)
    if n > MAX_SAMPLES:
        frames = frames[np.linspace(0, n - 1, MAX_SAMPLES).astype(int)]
    return frames, info["width"] / SAMPLE_W


def faces(frames):
    """[(frame_index, x, y, w, h)] in sample pixels."""
    if not len(frames):
        return []
    import cv2
    try:
        cv2.setLogLevel(2)          # errors only (hides a harmless DNN backend warning)
    except AttributeError:
        pass
    h, w = frames.shape[1:3]
    model = MODELS / "face_yunet.onnx"
    out = []
    if model.exists() and hasattr(cv2, "FaceDetectorYN"):
        det = cv2.FaceDetectorYN.create(str(model), "", (w, h), 0.65, 0.3, 50)
        for i, f in enumerate(frames):
            _, found = det.detect(np.ascontiguousarray(f))
            for row in ([] if found is None else found):
                x, y, fw, fh = [float(v) for v in row[:4]]
                if fw > 6 and fh > 6:
                    out.append((i, x, y, fw, fh))
    else:
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        for i, f in enumerate(frames):
            gray = cv2.equalizeHist(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY))
            for x, y, fw, fh in cascade.detectMultiScale(gray, 1.1, 5, minSize=(14, 14)):
                out.append((i, float(x), float(y), float(fw), float(fh)))
    return out


def tracks(dets, frames):
    """Group detections that stay in the same place into tracks, with stats per track."""
    if not dets:
        return []
    n, h, w = len(frames), frames.shape[1], frames.shape[2]
    groups = []
    for d in sorted(dets):
        cx, cy = d[1] + d[3] / 2, d[2] + d[4] / 2
        for g in groups:
            if abs(cx - g["cx"]) < 0.07 * w and abs(cy - g["cy"]) < 0.10 * h:
                g["items"].append(d)
                k = len(g["items"])
                g["cx"] += (cx - g["cx"]) / k
                g["cy"] += (cy - g["cy"]) / k
                break
        else:
            groups.append({"cx": cx, "cy": cy, "items": [d]})
    gray = frames.mean(axis=3)
    out = []
    for g in groups:
        idx = sorted({d[0] for d in g["items"]})
        box = np.median(np.array([d[1:] for d in g["items"]]), axis=0)
        x, y, bw, bh = [int(v) for v in box]
        patch = gray[:, max(0, y):y + max(2, bh), max(0, x):x + max(2, bw)]
        motion = float(np.abs(np.diff(patch, axis=0)).mean()) if len(patch) > 1 else 0.0
        out.append({"box": tuple(float(v) for v in box), "presence": len(idx) / n,
                    "size": box[2] / w, "alive": motion > 1.2, "items": g["items"]})
    return sorted(out, key=lambda t: -t["presence"])


def cam_box(frames, face):
    """The facecam overlay around `face` (sample pixels): (x, y, w, h), how it was found."""
    import cv2
    n, H, W = frames.shape[:3]
    fx, fy, fw, fh = face
    persist = np.zeros((H, W), np.float32)
    for f in frames:
        persist += cv2.Canny(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), 60, 150) > 0
    persist /= max(1, n)
    # widen thin lines by a pixel so a 1-px border jittering by compression still scores
    persist = cv2.dilate(persist, np.ones((3, 3), np.uint8))

    xs = slice(int(max(0, fx - fw)), int(min(W, fx + 2 * fw)))
    ys = slice(int(max(0, fy - 0.5 * fh)), int(min(H, fy + 2 * fh)))
    rows = persist[:, xs].mean(axis=1)
    cols = persist[ys, :].mean(axis=0)

    def strongest(scores, a, b, edge):
        a, b = int(max(0, a)), int(min(len(scores), b))
        if b - a < 2:
            return edge
        seg = scores[a:b]
        k = int(np.argmax(seg))
        if seg[k] >= 0.6:
            return a + k
        return edge

    top = strongest(rows, fy - 4.0 * fh, fy - 0.3 * fh, 0 if fy - 4.0 * fh <= 0 else None)
    bottom = strongest(rows, fy + 1.4 * fh, fy + 5.0 * fh, H if fy + 5.0 * fh >= H else None)
    left = strongest(cols, fx - 6.0 * fw, fx - 0.3 * fw, 0 if fx - 6.0 * fw <= 0 else None)
    right = strongest(cols, fx + 1.3 * fw, fx + 7.0 * fw, W if fx + 7.0 * fw >= W else None)
    if None not in (top, bottom, left, right):
        bw, bh = right - left, bottom - top
        if (2.0 * fw <= bw <= 10 * fw and 1.8 * fh <= bh <= 7 * fh and bw <= 0.65 * W
                and bh <= 0.75 * H and 0.6 <= bw / bh <= 2.6):
            return (float(left), float(top), float(bw), float(bh)), "overlay edges"
    bw = min(4.5 * fw, 0.6 * W)
    bh = min(bw * 0.75, 0.7 * H)
    x0 = min(max(fx + fw / 2 - bw / 2, 0), W - bw)
    y0 = min(max(fy + fh / 2 - 0.42 * bh, 0), H - bh)
    return (x0, y0, bw, bh), "face size"


def blur_graph(cfg, info):
    W, H = cfg["width"], cfg["height"]
    return (f"[0:v]split=2[bg0][fg0];"
            f"[bg0]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
            f"boxblur=24:2,eq=brightness=-0.10[bg1];"
            f"[fg0]scale={W}:-2:flags=lanczos,setsar=1[fg1];"
            f"[bg1][fg1]overlay=0:(H-h)/2,format=yuv420p[framed]")


def stack_graph(cfg, info, cam):
    """Facecam panel on top, gameplay panel below. `cam` in source pixels."""
    W, H = cfg["width"], cfg["height"]
    top = even(H * cfg["cam_share"])
    low = H - top
    sw, sh = info["width"], info["height"]
    x, y, w, h = cam
    aim = W / top
    cw, ch = (h * aim, h) if w / h > aim else (w, w / aim)
    cx = min(max(x + (w - cw) / 2, 0), sw - cw)
    cy = min(max(y + (h - ch) / 2, 0), sh - ch)
    gw = min(sw, sh * W / low)
    gx = (sw - gw) / 2
    if gx < x + w and gx + gw > x:            # gameplay window covers the cam: slide away
        if x + w / 2 < sw / 2:
            gx = min(sw - gw, gx + min(x + w - gx, 0.5 * (sw - gw - gx)))
        else:
            gx = max(0.0, gx - min(gx + gw - x, 0.5 * gx))
    return (f"[0:v]split=2[c0][g0];"
            f"[c0]crop={even(cw)}:{even(ch)}:{even(cx)}:{even(cy)},"
            f"scale={W}:{top}:flags=lanczos,setsar=1[c1];"
            f"[g0]crop={even(gw)}:{even(sh)}:{even(gx)}:0,"
            f"scale={W}:{low}:flags=lanczos,setsar=1[g1];"
            f"[c1][g1]vstack=inputs=2,format=yuv420p[framed]"), top


def crop_graph(cfg, info, track, n_frames, scale):
    """A 9:16 window that glides after the face (keyframes once a second, eased)."""
    sw, sh = info["width"], info["height"]
    cw = even(min(sw, sh * cfg["width"] / cfg["height"]))
    limit = sw - cw
    centre = np.full(n_frames, np.nan)
    for i, x, _, w, _ in track["items"]:
        centre[i] = (x + w / 2) * scale
    known = np.where(~np.isnan(centre))[0]
    centre = np.interp(np.arange(n_frames), known, centre[known])
    k = 5
    smooth = np.convolve(np.pad(centre, k // 2, mode="edge"), np.ones(k) / k, mode="valid")
    xs = np.clip(smooth - cw / 2, 0, limit)
    keys = [(0.0, xs[0])]
    for i in range(SAMPLE_FPS, n_frames, SAMPLE_FPS):
        if abs(xs[i] - keys[-1][1]) > 0.04 * sw:
            keys.append((i / SAMPLE_FPS, xs[i]))
    keys = keys[:40]
    expr = f"{keys[-1][1]:.1f}"
    for (t0, a), (t1, b) in reversed(list(zip(keys, keys[1:]))):
        span = max(t1 - t0, 0.05)
        # (the whole expression is single-quoted in the filtergraph, so commas are safe)
        expr = (f"if(lt(t,{t1:.2f}),{a:.1f}+({b - a:.1f})*"
                f"(1-cos(PI*min(1,(t-{t0:.2f})/{span:.2f})))/2,{expr})")
    return (f"[0:v]crop={cw}:{even(sh)}:x='{expr}':y=0,"
            f"scale={cfg['width']}:{cfg['height']}:flags=lanczos,setsar=1,format=yuv420p[framed]")


def plan(part, start, length, info, cfg, memory, forced_cam=None):
    """Decide the look for one clip. Returns (filtergraph [0:v]->[framed], look, seam_y).
    `memory` is the stream's saved facecam spot (dict, updated in place)."""
    want = cfg["layout"]
    if want == "blur":
        return blur_graph(cfg, info), "blur", None
    sw, sh = info["width"], info["height"]
    if forced_cam:
        x, y, w, h = forced_cam
        cam = (x * sw, y * sh, w * sw, h * sh) if max(forced_cam) <= 1.0 else forced_cam
        g, seam = stack_graph(cfg, info, cam)
        return g, "stack", seam

    frames, scale = sample(part, start, length, info)
    found = tracks(faces(frames), frames)
    live = [t for t in found if t["alive"] and t["presence"] >= 0.3]
    big = [t for t in live if t["size"] >= cfg["big_face"]]

    if want in ("auto", "crop") and big and (len(big) == 1 or want == "crop"):
        if big[0]["presence"] >= 0.5:
            say("  look: crop (follows the face)")
            return crop_graph(cfg, info, big[0], len(frames), scale), "crop", None
    if want == "auto" and len(big) >= 2:
        say("  look: blur (more than one big face on screen)")
        return blur_graph(cfg, info), "blur", None

    small = [t for t in live if t["size"] < cfg["big_face"]]
    if small and (want in ("auto", "stack")):
        t = small[0]
        if len([s for s in small if s["presence"] >= 0.5]) > 2 and want == "auto":
            say("  look: blur (several faces, probably thumbnails)")
            return blur_graph(cfg, info), "blur", None
        box, how = cam_box(frames, t["box"])
        cam = tuple(v * scale for v in box)
        mem = memory.get("cam")
        if how == "face size" and mem and _inside(t["box"], mem, scale):
            cam, how = tuple(mem), "this stream's other clips"
        elif how == "overlay edges":
            memory["cam"] = list(cam)
        say(f"  look: stack, facecam {int(cam[2])}x{int(cam[3])} at {int(cam[0])},{int(cam[1])} "
            f"(found by {how})")
        g, seam = stack_graph(cfg, info, cam)
        return g, "stack", seam

    mem = memory.get("cam")
    if mem and want == "auto" and any(_inside(t["box"], mem, scale) for t in found):
        say("  look: stack (facecam where it was in this stream's other clips)")
        g, seam = stack_graph(cfg, info, mem)
        return g, "stack", seam
    say("  look: blur (no facecam found)")
    return blur_graph(cfg, info), "blur", None


def _inside(face_box, cam, scale):
    x, y, w, h = face_box
    cx, cy = (x + w / 2) * scale, (y + h / 2) * scale
    return cam[0] <= cx <= cam[0] + cam[2] and cam[1] <= cy <= cam[1] + cam[3]
