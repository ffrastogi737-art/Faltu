#!/usr/bin/env python3
"""Stream Clipper: raw gameplay / stream clips in input/ -> 9:16 YouTube Shorts + upload kit in output/<clip>/. Nothing is uploaded.

  python3 edit_clip.py                       edit every clip in input/ (split-screen: facecam on top, gameplay below)
  Facecam, in this order: --box x,y,w,h (exact) > --facecam right|left|top-right (preset) > creators.json (--creator "@name") > AUTOMATIC stationary-face search (any corner)
                 > --no-facecam fallback (stops instead with --require-facecam). cal.jpg shows which one was used. --save-preset remembers the box for --creator.
  python3 edit_clip.py --no-facecam          gameplay fills the whole 9:16 and follows the action
  python3 edit_clip.py --cal                 only write output/<clip>/cal.jpg (the crop boxes drawn on a frame): check the facecam box once, then run for real
  python3 edit_clip.py --creator "@name" --game "GTA 6" --hook "YE KYA HO GAYA?"     credit line, game name, your own hook text
  python3 edit_clip.py --test                synthetic end-to-end test

Steps: 1 trim pause-menu / dead-air, 2 find the sharp 16:9 picture (no blurred bars) + split layout, 3 local Hindi/Hinglish captions (faster-whisper),
4 hook banner for 3.5 s, 5 punch-in zoom + synthesized SFX on loud peaks and -15.5 LUFS, 6 final_short.mp4 + sheet.jpg + metadata.txt.
"""
import argparse, json, math, os, re, shutil, subprocess, sys, tempfile, unicodedata
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile
from scipy.ndimage import binary_closing

ROOT = Path(__file__).resolve().parent
W, H, TOP_H, BOT_H, FPS, SR = 1080, 1920, 670, 1250, 30, 48000
YEL = (255, 230, 0)
BIN = 0.25                                         # analysis bin in seconds (4 frames per second)
MIN_LEN, MAX_LEN = 18.0, 45.0                      # target length of a Short
LUFS, TPK = -15.5, -1.5
PUNCH, PUNCH_D, HOOK_S = 0.07, 0.45, 3.5           # punch-in +7 % over 0.45 s, hook banner seconds
FACECAM = {'right': (0.74, 0.70, 0.26, 0.30), 'left': (0.0, 0.70, 0.26, 0.30), 'top-right': (0.74, 0.0, 0.26, 0.30)}   # x, y, w, h as fractions of the picture
FACE_MODEL = ROOT / 'models/face_detection_yunet_2023mar.onnx'       # YuNet (232 KB), run with the already-installed onnxruntime
FACE_URL = 'https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx'
FACE_FRAMES = 12                                                    # frames sampled for the stationary-face search
CREATORS = ROOT / 'creators.json'
VIDEO_EXT = {'.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'}
FONT_DIR = '/usr/share/fonts/opentype/inter'
FONT_NAME = 'Inter Black'
FONT_FILE = next((f for f in (f'{FONT_DIR}/Inter-Black.otf', f'{FONT_DIR}/Inter-ExtraBold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if os.path.exists(f)), None)
if not FONT_FILE.startswith(FONT_DIR): FONT_DIR, FONT_NAME = '/usr/share/fonts/truetype/dejavu', 'DejaVu Sans'   # fallback font if Inter is missing
ev = lambda v: int(v) // 2 * 2


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode: raise SystemExit(f"{cmd[0]} failed: {r.stderr[-700:]}")
    return r


def font(size): return ImageFont.truetype(FONT_FILE, size) if FONT_FILE else ImageFont.load_default()


# ------------------------------------------------------------------ probing and analysis frames
def probe(p):
    j = json.loads(run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', str(p)]).stdout)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video'); w, h = int(v['width']), int(v['height'])
    rot = int(float(v.get('tags', {}).get('rotate', 0) or 0)) or int(float(next((d.get('rotation', 0) for d in v.get('side_data_list', []) if 'rotation' in d), 0)))
    if abs(rot) in (90, 270): w, h = h, w                       # phone clips store the rotation as metadata; ffmpeg applies it
    return dict(w=w, h=h, dur=float(j['format']['duration']), audio=any(s['codec_type'] == 'audio' for s in j['streams']))


def small_frames(p, info):
    """Gray frames at 4 per second, scaled to ~360 px wide. Returns (frames uint8 [n, h, w], (w, h))."""
    sw = 360 if info['w'] >= info['h'] else 270; sh = max(2, round(sw * info['h'] / info['w'] / 2) * 2)
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-vf', f'fps={1 / BIN},scale={sw}:{sh},format=gray', '-f', 'rawvideo', '-'], capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8); n = len(a) // (sw * sh)
    return a[:n * sw * sh].reshape(n, sh, sw), (sw, sh)


def audio16(p, info):
    if not info['audio']: return np.zeros(int(info['dur'] * 16000), np.float32)
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True)
    return np.frombuffer(r.stdout, np.float32).copy()


def _band(e):
    """Longest run of 'detailed' rows (or columns): blurred or black padding has almost no edge energy."""
    e = np.convolve(e, np.ones(5) / 5, 'same'); on = e > max(2.5 * np.percentile(e, 8), 0.15 * np.percentile(e, 90))      # above the padding's noise floor
    on = binary_closing(on, np.ones(3 + int(0.06 * len(on))))
    best, i = (0, len(on)), 0; bl = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]: j += 1
            if j - i > bl: best, bl = (i, j), j - i
            i = j
        else: i += 1
    return best


def _strip(e, lim=0.3):
    """(a, b) of the sharp band, but only if what is cut away is clearly blurred / black (under 30 % of the detail inside); otherwise keep everything."""
    a, b = _band(e)
    if a == 0 and b == len(e): return a, b
    out = np.r_[e[:a], e[b:]]
    return (a, b) if out.mean() < lim * e[a:b].mean() else (0, len(e))


def detect_active(fr, size, info):
    """(x, y, w, h) in source pixels of the sharp picture, snapped to 16:9 when it is close (strips blurred / black bars of a phone screen recording)."""
    f = fr[np.linspace(0, len(fr) - 1, min(12, len(fr))).astype(int)].astype(np.float32)
    y0, y1 = _strip(np.abs(np.diff(f, 2, axis=2)).mean(axis=(0, 2)), 0.3 if info['h'] > info['w'] else 0.05)      # phone recordings: blurred bars; landscape: only real (black) bars                              # rows first (second difference: blur removes fine detail, first differences do not)
    x0, x1 = _strip(np.abs(np.diff(f[:, y0:y1], 2, axis=1)).mean(axis=(0, 1)), 0.05)                    # then columns, inside those rows only
    sw, sh = size; kx, ky = info['w'] / sw, info['h'] / sh
    x, y, w, h = x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky
    if w * h < 0.3 * info['w'] * info['h'] or h < 0.25 * info['h'] or w < 0.25 * info['w']: x, y, w, h = 0, 0, info['w'], info['h']
    if abs(w / h - 16 / 9) / (16 / 9) < 0.15:                  # close to 16:9: make it exactly 16:9, centred on the detected band
        cy = y + h / 2; h2 = w * 9 / 16
        if h2 <= info['h']: y, h = min(max(cy - h2 / 2, 0), info['h'] - h2), h2
    if w >= info['w'] * 0.97 and h >= info['h'] * 0.97: x, y, w, h = 0, 0, info['w'], info['h']
    return ev(x), ev(y), ev(w), ev(h)


def runs(mask):
    out, i = [], 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j < len(mask) and mask[j]: j += 1
            out.append((i, j)); i = j
        else: i += 1
    return out


def analyse(fr, size, rect, info, a16):
    """Per-bin motion (centre of the picture, so a moving facecam never counts) and audio loudness."""
    sw, sh = size; kx, ky = sw / info['w'], sh / info['h']
    x0, y0, x1, y1 = int(rect[0] * kx), int(rect[1] * ky), int((rect[0] + rect[2]) * kx), int((rect[1] + rect[3]) * ky)
    cw, ch = x1 - x0, y1 - y0
    c = fr[:, y0 + int(.1 * ch):y1 - int(.1 * ch), x0 + int(.2 * cw):x1 - int(.2 * cw)].astype(np.int16)
    mot = np.r_[0.0, np.abs(np.diff(c, axis=0)).mean(axis=(1, 2))] if len(c) > 1 else np.zeros(len(c))
    k = int(BIN * 16000); n = len(fr); rms = np.zeros(n)
    for i in range(n):
        s = a16[i * k:(i + 1) * k]; rms[i] = float(np.sqrt(np.mean(s ** 2))) if len(s) else 0.0
    return mot, rms


def keep_bins(mot, rms, dur):
    """Boolean per bin: False = dead (still pause-menu frame with no loud reaction, or long dead-air). Then cap at MAX_LEN with the liveliest window."""
    n = len(mot); keep = np.ones(n, bool)
    base = np.median(mot[mot > 0]) if (mot > 0).any() else 1.0; p50 = np.median(rms) + 1e-9
    static = mot < max(0.5, 0.12 * base); silent = rms < max(0.12 * p50, 2e-4)
    for a, b in runs(static):
        if b - a >= int(1.2 / BIN) and rms[a:b].mean() < 1.6 * p50: keep[a:b] = False        # pause menu: static picture, nobody reacting
    for a, b in runs(silent):
        if b - a >= int(2.0 / BIN): keep[a:b] = False                                         # long dead air
    if keep.sum() * BIN < 3: keep[:] = True                                                    # never throw the whole clip away
    idx = np.where(keep)[0]; mx = int(MAX_LEN / BIN)
    if len(idx) > mx:                                                                          # too long: the liveliest 45 s of what is left
        sc = mot / (mot.max() + 1e-9) + rms / (rms.max() + 1e-9); cs = np.r_[0, np.cumsum(sc[idx])]
        s = int(np.argmax(cs[mx:] - cs[:-mx])); keep[:] = False; keep[idx[s:s + mx]] = True
    return keep


def segments(keep, dur):
    segs = [(a * BIN, min(b * BIN, dur)) for a, b in runs(keep)]
    segs = [(s, e) for s, e in segs if e - s >= 0.5] or [(0.0, dur)]
    return segs


def cut_audio(a, segs, sr):
    return np.concatenate([a[int(s * sr):int(e * sr)] for s, e in segs]) if segs else a


# ------------------------------------------------------------------ transcription (local, word timestamps) + Roman Hindi
V = {'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o'}
M = {'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e'}
C = {'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
     'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh',
     'स': 's', 'ह': 'h'}
NUK = {'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f'}
LEX = {'यार': 'yaar', 'भाई': 'bhai', 'क्या': 'kya', 'है': 'hai', 'हैं': 'hain', 'नहीं': 'nahi', 'अरे': 'arre', 'पागल': 'pagal', 'मैं': 'main', 'हम': 'hum', 'तू': 'tu', 'तुम': 'tum',
       'ये': 'ye', 'यह': 'ye', 'वो': 'wo', 'और': 'aur', 'कौन': 'kaun', 'बहुत': 'bahut', 'मस्त': 'mast', 'चलो': 'chalo', 'देखो': 'dekho', 'गया': 'gaya', 'गई': 'gayi', 'हो': 'ho',
       'का': 'ka', 'की': 'ki', 'के': 'ke', 'को': 'ko', 'से': 'se', 'में': 'mein', 'पे': 'pe', 'पर': 'par', 'अब': 'ab', 'ही': 'hi', 'भी': 'bhi', 'तो': 'to', 'कि': 'ki', 'जो': 'jo',
       'कुछ': 'kuch', 'सब': 'sab', 'रहा': 'raha', 'रही': 'rahi', 'मार': 'maar', 'दिया': 'diya', 'मर': 'mar', 'गए': 'gaye', 'वाला': 'wala', 'कैसे': 'kaise', 'क्यों': 'kyun',
       'हुआ': 'hua', 'हुई': 'hui', 'था': 'tha', 'थी': 'thi', 'थे': 'the', 'एक': 'ek', 'दो': 'do', 'मेरा': 'mera', 'मेरी': 'meri', 'तेरा': 'tera', 'अच्छा': 'accha', 'ठीक': 'theek'}


def _rom_word(w):
    w = unicodedata.normalize('NFD', w); syl, i = [], 0                      # syllables: [onset, vowel] (vowel None = inherent a)
    while i < len(w):
        ch = w[i]
        if ch in V: syl.append(['', V[ch]]); i += 1
        elif ch in C:
            on = C[ch]; i += 1
            if i < len(w) and w[i] == '़': on = NUK.get(ch, on); i += 1
            while i + 1 < len(w) and w[i] == '्' and w[i + 1] in C: on += C[w[i + 1]]; i += 2      # conjunct (kya, stha ...)
            if i < len(w) and w[i] == '्': i += 1; syl.append([on, '']); continue
            if i < len(w) and w[i] in M: syl.append([on, M[w[i]]]); i += 1
            else: syl.append([on, None])
        elif ch in 'ंँ' and syl: syl[-1].append('n'); i += 1
        elif ch == 'ः' and syl: syl[-1].append('h'); i += 1
        else: i += 1
    n = len(syl); out = ''
    for k, s in enumerate(syl):
        v = s[1]
        if v is None: v = '' if k == n - 1 or (k == n - 2 and n >= 3 and syl[-1][1] not in (None, '')) else 'a'   # schwa deletion: word end, and before the last syllable
        out += s[0] + v + (s[2] if len(s) > 2 else '')
    return out


def romanize(text):
    """Devanagari -> Roman Hindi (Hinglish). Latin text and punctuation pass through unchanged."""
    text = text.replace('।', '.')
    return re.sub(r'[ऀ-ॿ]+', lambda m: LEX.get(m.group(), _rom_word(m.group())), text)


def find_whisper_python():
    cands = [os.environ.get('STREAM_CLIPPER_WHISPER_PY'), sys.executable, str(Path.home() / '.faceless-shorts/venv/bin/python'), '/root/.faceless-shorts/venv/bin/python', shutil.which('python3')]
    for c in cands:
        if c and Path(c).exists() and subprocess.run([c, '-c', 'import faster_whisper'], capture_output=True).returncode == 0: return c
    return None


def collapse_loops(words, keep=3):
    """Whisper sometimes loops on one word ('chalo chalo chalo ...'): keep at most `keep` repeats in a row."""
    out, run, prev = [], 0, None
    for w in words:
        t = re.sub(r'\W', '', w['w']).lower(); run = run + 1 if t == prev else 1; prev = t
        if run <= keep: out.append(w)
    return out


def transcribe(a16_cut, lang, work, model='medium'):
    """[{'w', 's', 'e'}] on the trimmed timeline, Roman Hindi. [] (with a warning) if no faster-whisper Python is installed."""
    py = find_whisper_python()
    if not py: print('  warning: faster-whisper not found: no captions. Install it (pip install faster-whisper) or set STREAM_CLIPPER_WHISPER_PY'); return []
    wav, out = work / 'speech16k.wav', work / 'words.json'
    wavfile.write(wav, 16000, (np.clip(a16_cut, -1, 1) * 32767).astype(np.int16))
    r = subprocess.run([py, str(ROOT / 'transcribe_worker.py'), str(wav), str(out), str(ROOT / 'models'), lang], capture_output=True, text=True, env={**os.environ, 'STREAM_CLIPPER_MODEL': model})
    if r.returncode or not out.exists(): print('  warning: transcription failed:', r.stderr[-300:]); return []
    words = json.loads(out.read_text())['words']
    for w in words: w['w'] = re.sub(r'\s+', '', romanize(w['w'])).strip()
    words = collapse_loops(words)
    return [w for w in words if re.fullmatch(r"[A-Za-z0-9'.,!?\-]*[A-Za-z0-9][A-Za-z0-9'.,!?\-]*", w['w'])]      # drops stray non-Latin junk (hallucinated scripts)


# ------------------------------------------------------------------ captions (ASS) and hook
def chunk_words(words):
    """2-4 words per caption; break at punctuation, long pauses and ~22 characters."""
    out, cur = [], []
    for w in words:
        if cur and (len(cur) >= 4 or w['s'] - cur[-1]['e'] > 0.6 or sum(len(x['w']) for x in cur) + len(w['w']) > 22): out.append(cur); cur = []
        cur.append(w)
        if re.search(r'[.,!?;:]$', w['w']) and len(cur) >= 2: out.append(cur); cur = []
    if cur: out.append(cur)
    return [c for c in out if c]


def ass_t(t): return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'


def make_ass(words, cap_y):
    """Bold white words with a black outline; the word being spoken is #FFE600. Centred on the divider (cap_y)."""
    hdr = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n"
           "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
           f"Style: Cap,{FONT_NAME},82,&H00FFFFFF,&H0000E6FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,8,2,5,40,40,0,1\n\n[Events]\n"
           "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n")
    ev_ = []
    for ch in chunk_words(words):
        for i, w in enumerate(ch):
            end = ch[i + 1]['s'] if i + 1 < len(ch) else w['e'] + 0.12
            txt = ' '.join(('{\\c&H0000E6FF&\\fscx108\\fscy108}' + x['w'].upper() + '{\\r}') if j == i else x['w'].upper() for j, x in enumerate(ch))
            ev_.append(f"Dialogue: 0,{ass_t(w['s'])},{ass_t(max(end, w['s'] + 0.05))},Cap,,0,0,0,,{{\\an5\\pos({W // 2},{cap_y})}}{txt}")
    return hdr + '\n'.join(ev_) + '\n'


HYPE = {'arre', 'are', 'oh', 'wow', 'pagal', 'gaya', 'gayi', 'nahi', 'mar', 'mara', 'maut', 'chod', 'bhai', 'yaar', 'kya', 'kaise', 'kyun', 'kaun', 'bach', 'bacha', 'dekho', 'dekh', 'crazy',
        'insane', 'omg', 'bhagwan', 'khatam', 'khatarnak', 'boom', 'dead', 'kill', 'hacker', 'aag', 'bhaag', 'bhago', 'ruk', 'ruko', 'sach', 'sachi', 'abe', 'oye'}
FALLBACK_HOOKS = ['YE KYA HO GAYA IS GAME MEIN?', 'ISKE BAAD JO HUA, SHOCK HO JAOGE', 'AAKHIR YE KAISE HUA? DEKHO PURA CLIP']
FILL = ['AAGE KYA HUA?', 'AB KYA HOGA?', 'DEKHO AAGE...']


def sentences(words):
    out, cur = [], []
    for w in words:
        if cur and (w['s'] - cur[-1]['e'] > 0.7 or re.search(r'[.!?]$', cur[-1]['w'])): out.append(cur); cur = []
        cur.append(w)
    if cur: out.append(cur)
    return out


def make_hook(words, rms=None, seed=0):
    """5-7 word Hinglish curiosity hook from the funniest / craziest line (hype words, '!', '?', loud moment); generic fallback when nobody speaks."""
    ss = [s for s in sentences(words) if len(s) >= 2]
    if not ss: return FALLBACK_HOOKS[seed % len(FALLBACK_HOOKS)]
    def score(s):
        t = [re.sub(r'\W', '', x['w']).lower() for x in s]; lv = 0.0
        if rms is not None and len(rms): lv = float(np.mean(rms[int(s[0]['s'] / BIN):int(s[-1]['e'] / BIN) + 1] if int(s[0]['s'] / BIN) < len(rms) else [0])) / (float(np.max(rms)) + 1e-9)
        return 2 * sum(x in HYPE for x in t) + sum(x['w'].count('!') + x['w'].count('?') for x in s) + 3 * lv + 0.1 * len(s)
    best = max(ss, key=score); toks = [re.sub(r'[^\w?!.\'-]', '', x['w']).upper() for x in best]; toks = [t for t in toks if t]
    if len(toks) > 7:
        wins = [toks[i:i + 7] for i in range(len(toks) - 6)]
        toks = max(wins, key=lambda ww: sum(re.sub(r'\W', '', t).lower() in HYPE for t in ww))
    text = ' '.join(toks).rstrip('.,;:')
    if len(toks) < 5: text = (text + ' ' + FILL[seed % len(FILL)]).strip(); toks = text.split()
    text = ' '.join(text.split()[:7])
    return text if text[-1] in '?!.' or text.endswith('...') else text + '?'


def hook_png(text, path):
    """Yellow banner with black text, 2 lines at most."""
    f = font(74); d = ImageDraw.Draw(Image.new('RGB', (1, 1))); lines, cur = [], ''
    for wd in text.split():
        t = (cur + ' ' + wd).strip()
        if d.textlength(t, font=f) > 860 and cur: lines.append(cur); cur = wd
        else: cur = t
    lines.append(cur); lh = 92; bw, bh = 980, len(lines) * lh + 56
    im = Image.new('RGBA', (bw, bh + 14), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([6, 14, bw - 6, bh + 8], 34, fill=(0, 0, 0, 150))                       # soft shadow
    dr.rounded_rectangle([4, 4, bw - 8, bh], 34, fill=YEL + (255,), outline=(0, 0, 0, 255), width=7)
    for i, ln in enumerate(lines): dr.text((bw // 2, 28 + lh * i + lh // 2), ln, font=f, fill=(0, 0, 0, 255), anchor='mm')
    im.save(path)


# ------------------------------------------------------------------ peaks, SFX, zoom, loudness
def find_peaks(a16, dur):
    """Sudden loud moments (laugh / scream / crash): [(time, strength)] on the trimmed timeline."""
    hop = 800; n = len(a16) // hop
    if n < 40: return []
    r = np.sqrt((a16[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9
    ratio = r / (np.convolve(r, np.ones(41) / 41, 'same') + 1e-6); hi = np.percentile(r, 93)
    idx = [i for i in range(1, n - 1) if r[i] >= r[i - 1] and r[i] >= r[i + 1] and r[i] > hi and ratio[i] > 1.8]
    out = []
    for i in sorted(idx, key=lambda i: -ratio[i]):
        t = i * 0.05
        if 0.6 <= t <= dur - 0.7 and all(abs(t - p[0]) >= 2.5 for p in out): out.append((t, float(ratio[i])))
        if len(out) >= 6: break
    return sorted(out)


def zoom_expr(punches, a=PUNCH, d=PUNCH_D):
    return '1' + ''.join(f'+if(between(t,{t:.3f},{t + d:.3f}),{a}*sin(PI*(t-{t:.3f})/{d}),0)' for t in punches)


def zoom_at(punches, t, a=PUNCH, d=PUNCH_D): return 1 + sum(a * math.sin(math.pi * (t - p) / d) for p in punches if p <= t <= p + d)


def _t(d): return np.arange(int(d * SR)) / SR


def sfx_whoosh(d=0.35):
    rng = np.random.RandomState(1); n = rng.randn(int(d * SR)); k = np.sin(np.pi * np.linspace(0, 1, len(n)))
    from scipy.signal import butter, lfilter
    b, a = butter(2, [500 / (SR / 2), 4500 / (SR / 2)], 'band'); return lfilter(b, a, n) * k ** 1.6 * 0.5


def sfx_pop(d=0.12):
    t = _t(d); f = 220 + 420 * np.exp(-t * 28); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30) * 0.9


def sfx_boom(d=0.9):
    t = _t(d); f = 38 + 80 * np.exp(-t * 9); rng = np.random.RandomState(2)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2) + 0.25 * rng.randn(len(t)) * np.exp(-t * 14)) * 0.9


def make_sfx(peaks, n):
    """Mono SFX track of length n samples: whoosh into every peak, a pop on it, a boom on the big ones. Synthesized here, no audio pack."""
    x = np.zeros(n, np.float32)
    def put(s, t, g):
        i = int(max(t, 0) * SR); m = min(len(s), n - i)
        if m > 0: x[i:i + m] += (s[:m] * g).astype(np.float32)
    for t, st in peaks:
        put(sfx_whoosh(), t - 0.2, 0.30); put(sfx_pop(), t - 0.02, 0.35)
        if st >= 3.2: put(sfx_boom(), t - 0.02, 0.45)
    return x


def loudnorm_i(path, af='loudnorm=I=-15.5:TP=-1.5:LRA=11:print_format=json'):
    log = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', af, '-f', 'null', '-']).stderr
    return json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', log).group(0))


def master(src, dst):
    """Two-pass loudnorm to -15.5 LUFS (true peak -1.5). A peaky mix that linear gain cannot reach falls back to gain + limiter. Returns the measured result."""
    m = loudnorm_i(src)
    af = (f'loudnorm=I={LUFS}:TP={TPK}:LRA=11:measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:'
          f'offset={m["target_offset"]}:linear=true')
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', af, '-ar', str(SR), '-c:a', 'pcm_s16le', str(dst)]); o = loudnorm_i(dst)
    if abs(float(o['input_i']) - LUFS) > 0.5 or float(o['input_tp']) > TPK + 0.2:
        g = LUFS - float(m['input_i'])
        for _ in range(4):
            run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', f'aresample=192000,volume={g:.2f}dB,alimiter=limit={10 ** ((TPK - 0.6) / 20):.4f}:level=false:attack=1:release=60,aresample={SR}',
                 '-c:a', 'pcm_s16le', str(dst)]); o = loudnorm_i(dst); g += LUFS - float(o['input_i'])
    return float(o['input_i']), float(o['input_tp'])


# ------------------------------------------------------------------ layout
# ------------------------------------------------------------------ facecam: priority order, creators.json, automatic stationary-face search
_FACE = {}


def face_session():
    if 's' not in _FACE:
        import onnxruntime as ort
        if not FACE_MODEL.exists():
            FACE_MODEL.parent.mkdir(exist_ok=True)
            r = subprocess.run(['curl', '-fsSL', '--max-time', '60', '-o', str(FACE_MODEL), FACE_URL], capture_output=True, text=True)
            if r.returncode or not FACE_MODEL.exists() or FACE_MODEL.stat().st_size < 100000:
                FACE_MODEL.unlink(missing_ok=True); raise RuntimeError(f'could not download the face model from {FACE_URL}')
        _FACE['s'] = ort.InferenceSession(str(FACE_MODEL), providers=['CPUExecutionProvider'])
    return _FACE['s']


def box_iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3]); i = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    return i / (a[2] * a[3] + b[2] * b[3] - i + 1e-12)


def detect_faces(img, thr=0.6):
    """YuNet on one PIL image: [(x, y, w, h, score)] in pixels. The 640x640 model input is filled by scaling the longer side to 640."""
    w, h = img.size; k = 640 / max(w, h); nw, nh = round(w * k), round(h * k)
    cv = np.zeros((640, 640, 3), np.float32); cv[:nh, :nw] = np.asarray(img.convert('RGB').resize((nw, nh), Image.BILINEAR), np.float32)[..., ::-1]      # BGR, 0-255
    sess = face_session(); o = dict(zip([x.name for x in sess.get_outputs()], sess.run(None, {'input': cv.transpose(2, 0, 1)[None]}))); boxes = []
    for st in (8, 16, 32):
        cls, obj, bb = o[f'cls_{st}'][0, :, 0], o[f'obj_{st}'][0, :, 0], o[f'bbox_{st}'][0]; cols = 640 // st
        for i in np.where(np.sqrt(np.clip(cls, 0, 1) * np.clip(obj, 0, 1)) >= thr)[0]:
            r, c = divmod(int(i), cols); bw, bh = math.exp(bb[i, 2]) * st, math.exp(bb[i, 3]) * st
            boxes.append(((c + bb[i, 0]) * st - bw / 2, (r + bb[i, 1]) * st - bh / 2, bw, bh, float(math.sqrt(max(cls[i], 0) * max(obj[i], 0)))))
    keep = []
    for b in sorted(boxes, key=lambda b: -b[4]):
        if all(box_iou(b, k_) < 0.3 for k_ in keep): keep.append(b)
    return [(x / k, y / k, bw / k, bh / k, sc) for x, y, bw, bh, sc in keep]


def sample_faces(src, info, rect, n=FACE_FRAMES):
    """Faces in n frames spread over the clip, as fractions of the picture: per frame [(x, y, w, h, score)]."""
    ax, ay, aw, ah = rect; tmp = Path(tempfile.mkdtemp()); out = []
    for k, t in enumerate(np.linspace(0.05, 0.95, n) * info['dur']):
        fp = tmp / f'{k}.png'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(src), '-frames:v', '1', '-vf', f'crop={aw}:{ah}:{ax}:{ay}', str(fp)], capture_output=True)
        if fp.exists(): out.append([(x / aw, y / ah, w / aw, h / ah, sc) for x, y, w, h, sc in detect_faces(Image.open(fp))])
    shutil.rmtree(tmp); return out


def stationary_face(frames):
    """The facecam: a face that stays in about the same place (in at least half of the sampled frames) close to a picture edge or corner.
    Moving in-game faces, big close-ups and one-off hits are ignored. Returns (mean face box, frames hit, frames sampled) or None."""
    cl = []
    for fi, boxes in enumerate(frames):
        for b in boxes:
            if b[4] < 0.6: continue
            cx, cy = b[0] + b[2] / 2, b[1] + b[3] / 2
            c = next((c for c in cl if math.hypot((c['cx'] - cx) / 0.05, (c['cy'] - cy) / 0.07) < 1), None)        # anchored at the cluster's first face: a drifting face cannot drag it along
            if c is None: c = dict(cx=cx, cy=cy, hits={}); cl.append(c)
            if fi not in c['hits'] or b[4] > c['hits'][fi][4]: c['hits'][fi] = b
    best, bs = None, 0
    for c in cl:
        bx = list(c['hits'].values()); n = len(bx)
        if n < max(3, math.ceil(0.5 * len(frames))): continue
        mx, my = np.mean([b[0] + b[2] / 2 for b in bx]), np.mean([b[1] + b[3] / 2 for b in bx]); fh = np.mean([b[3] for b in bx])
        if np.std([b[0] + b[2] / 2 for b in bx]) > 0.04 or np.std([b[1] + b[3] / 2 for b in bx]) > 0.06: continue          # keeps moving: not a facecam
        if min(mx, 1 - mx, my, 1 - my) > 0.30 or fh > 0.40: continue                                                       # not at an edge / far too big
        sc = n * float(np.mean([b[4] for b in bx]))
        if sc > bs: best, bs = (tuple(float(np.mean([b[i] for b in bx])) for i in range(4)) + (float(np.mean([b[4] for b in bx])),), n, len(frames)), sc
    return best


def facecam_box_from_face(fb, aw, ah):
    """A clean facecam box around the face, inside the picture: 2.2x the face height, 1.5 wide, the face a little low in it, pushed flush to an edge it nearly touches."""
    fx, fy, fw, fh = fb[:4]; bh = min(fh * ah * 2.2, ah); bw = min(bh * 1.5, aw)
    cx, cy = (fx + fw / 2) * aw, (fy + fh / 2) * ah - 0.1 * bh
    x0, y0 = min(max(cx - bw / 2, 0), aw - bw), min(max(cy - bh / 2, 0), ah - bh)
    if x0 < 0.04 * aw: x0 = 0
    if aw - (x0 + bw) < 0.04 * aw: x0 = aw - bw
    if y0 < 0.04 * ah: y0 = 0
    if ah - (y0 + bh) < 0.04 * ah: y0 = ah - bh
    return (x0 / aw, y0 / ah, bw / aw, bh / ah)


def auto_facecam(src, info, rect):
    """(box, note): the stationary corner face turned into a facecam box, or (None, why not)."""
    try: frames = sample_faces(src, info, rect)
    except Exception as e: return None, f'face detector unavailable ({e})'
    f = stationary_face(frames)
    if not f: return None, f'no stationary face near an edge in {len(frames)} sampled frames'
    (fb, hits, n) = f; return facecam_box_from_face(fb, rect[2], rect[3]), f'stationary face in {hits}/{n} frames, score {fb[4]:.2f}'


def _handle(h): return (h or '').strip().lstrip('@').lower()


def load_creators(path=None):
    p = Path(path or CREATORS); return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}


def find_creator(handle, path=None):
    """(name, settings) from creators.json (case and @ do not matter), or (None, {})."""
    if not _handle(handle): return None, {}
    return next(((k, v) for k, v in load_creators(path).items() if _handle(k) == _handle(handle)), (None, {}))


def save_creator(handle, box, game=None, lang=None, path=None):
    d = load_creators(path); name = find_creator(handle, path)[0] or ('@' + handle.strip().lstrip('@')); cur = d.get(name, {})
    cur['box'] = ','.join(f'{v:g}' for v in box)
    if game: cur['game'] = game
    if lang: cur['lang'] = lang
    d[name] = cur; Path(path or CREATORS).write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'); return name


def parse_box(s): 
    v = tuple(float(x) for x in s.split(','))
    if len(v) != 4 or not all(0 <= x <= 1 for x in v): raise SystemExit(f'box "{s}": four fractions 0..1 expected: x,y,w,h')
    return v


def resolve_facecam(args, src, info, rect):
    """(mode, box, source). Priority: --box > --facecam preset > creators.json > automatic face search > no-facecam (or stop with --require-facecam)."""
    if args.no_facecam: return 'follow', None, 'no-facecam (--no-facecam)'
    if args.box: return 'split', parse_box(args.box), 'box (--box)'
    if args.facecam: return 'split', FACECAM[args.facecam], f'preset (--facecam {args.facecam})'
    name, cr = find_creator(args.creator, getattr(args, 'creators', None))
    if cr.get('box'): return 'split', parse_box(cr['box']), f'creators.json ({name})'
    box, note = auto_facecam(src, info, rect)
    if box: return 'split', box, f'auto ({note})'
    if getattr(args, 'require_facecam', False): raise SystemExit(f'no facecam found ({note}) and --require-facecam is set: pass --box or --facecam, or add the creator to creators.json')
    print(f'  no stationary face found ({note}): using --no-facecam (gameplay fills the screen). Pass --box to force a facecam.')
    return 'follow', None, f'no-facecam (fallback: {note})'


def cam_rect(rect, box):
    """Crop inside the facecam box with the 1080x670 aspect (cover, never stretched)."""
    ax, ay, aw, ah = rect; bx, by, bw, bh = box; px, py, pw, ph = ax + bx * aw, ay + by * ah, bw * aw, bh * ah; t = W / TOP_H
    cw, ch = (ph * t, ph) if pw / ph > t else (pw, pw / t)
    return ev(px + (pw - cw) / 2), ev(py + (ph - ch) / 2), ev(cw), ev(ch)


def game_rect(rect, shift=0.0):
    ax, ay, aw, ah = rect; gw = min(ev(ah * W / BOT_H), aw); gx = ax + (aw - gw) / 2 + shift * aw
    return ev(min(max(gx, ax), ax + aw - gw)), ay, gw, ah


def pan_expr(keys):
    if len(keys) < 2: return f'{keys[0][1]:.1f}' if keys else '0'
    terms = [f"gte(t,{t0:.2f})*lt(t,{t1:.2f})*({x0:.1f}+({x1 - x0:.1f})*(t-{t0:.2f})/{max(t1 - t0, 0.01):.2f})" for (t0, x0), (t1, x1) in zip(keys, keys[1:])]
    return '+'.join(terms + [f"gte(t,{keys[-1][0]:.2f})*{keys[-1][1]:.1f}"])


def follow_keys(fr, size, rect, info, kept_bins, cw):
    """Crop x (inside the picture) every second so the 9:16 window follows where things move. Times are on the trimmed timeline."""
    sw, sh = size; kx, ky = sw / info['w'], sh / info['h']; x0, y0, x1, y1 = int(rect[0] * kx), int(rect[1] * ky), int((rect[0] + rect[2]) * kx), int((rect[1] + rect[3]) * ky)
    xs = np.arange(x1 - x0); cx, out = 0.5, []
    for k, b in enumerate(kept_bins):
        if b > 0:
            d = np.abs(fr[b, y0:y1, x0:x1].astype(np.int16) - fr[b - 1, y0:y1, x0:x1].astype(np.int16)).mean(0)
            if d.sum() > 1e-3 * len(d): cx = 0.85 * cx + 0.15 * float((d * xs).sum() / d.sum() / len(xs))
        if k % 4 == 0: out.append((k * BIN, float(min(max(cx * rect[2] - cw / 2, 0), rect[2] - cw))))
    return out


def build_graph(segs, mode, rect, cam, game, cw_follow, keys, punches, hook, cap_png_unused=None):
    n = len(segs); g = [f"[0:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS[t{i}]" for i, (s, e) in enumerate(segs)]
    g.append((''.join(f'[t{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0[tv]') if n > 1 else '[t0]null[tv]')
    ax, ay, aw, ah = rect; g.append(f'[tv]crop={aw}:{ah}:{ax}:{ay},fps={FPS}[pic]')
    if mode == 'split':
        g.append('[pic]split=2[pa][pb]')
        g.append(f'[pa]crop={cam[2]}:{cam[3]}:{cam[0] - ax}:{cam[1] - ay},scale={W}:{TOP_H}:flags=lanczos[top]')
        g.append(f'[pb]crop={game[2]}:{game[3]}:{game[0] - ax}:{game[1] - ay},scale={W}:{BOT_H}:flags=lanczos[bot]')
        g.append('[top][bot]vstack=inputs=2[lay]')
    else:
        g.append(f"[pic]crop={cw_follow}:{ah}:x='{pan_expr(keys)}':y=0,scale={W}:{H}:flags=lanczos[lay]")
    last = 'lay'
    if punches:
        z = zoom_expr(punches)
        g.append(f"[lay]scale=w='trunc(iw*({z})/2)*2':h='trunc(ih*({z})/2)*2':eval=frame:flags=bilinear,crop={W}:{H}:x='({W}*({z})-{W})/2':y='({H}*({z})-{H})/2'[zm]"); last = 'zm'
    if mode == 'split': g.append(f'[{last}]drawbox=x=0:y={TOP_H - 3}:w={W}:h=6:color=0xFFE600:t=fill[dv]'); last = 'dv'
    g.append(f'[1:v]format=rgba,fade=t=in:st=0:d=0.15:alpha=1,fade=t=out:st={HOOK_S - 0.2}:d=0.2:alpha=1[hk]')
    g.append(f"[{last}][hk]overlay=x=(W-w)/2:y=70:enable='lte(t,{HOOK_S})':eof_action=pass[hv]")
    g.append(f'[hv]ass=cap.ass:fontsdir={FONT_DIR}[v]')
    return ';\n'.join(g)


# ------------------------------------------------------------------ metadata (rule-based from the transcript; no AI service)
STOP = {'yeh', 'woh', 'hai', 'hain', 'tha', 'thi', 'the', 'kya', 'aur', 'toh', 'bhi', 'nahi', 'main', 'mein', 'hum', 'tum', 'aap', 'par', 'pe', 'se', 'ko', 'ka', 'ki', 'ke', 'ye', 'wo', 'ho', 'hua',
        'raha', 'rahi', 'abhi', 'bas', 'kuch', 'sab', 'ek', 'the', 'and', 'the', 'you', 'that', 'this', 'with', 'for', 'are', 'was', 'have', 'jo', 'ab', 'to', 'hi', 'tu', 'mera', 'tera', 'liye', 'wala'}


def keywords(words, minc=2, k=6):
    c = {}
    for w in words:
        t = re.sub(r'\W', '', w['w']).lower()
        if len(t) >= 4 and t not in STOP: c[t] = c.get(t, 0) + 1
    return [t for t, n in sorted(c.items(), key=lambda x: (-x[1], x[0])) if n >= minc][:k]      # only words that came up at least twice (one-off words are usually mis-hearings)


def fit(s, n=59):
    if len(s) <= n: return s
    cut = s[:n].rsplit(' ', 1)[0].rstrip(' ,.-:') ; return cut


def reliable(words):
    """True when Whisper was reasonably sure of most words (mean word probability >= 0.5 and at least 8 words). Unreliable text is never quoted or mined for keywords."""
    p = [w.get('p', 1.0) for w in words]
    return len(p) >= 8 and float(np.mean(p)) >= 0.5


def make_metadata(name, words, hook, creator, game, dur):
    ok = reliable(words); words = [w for w in words if w.get('p', 1.0) >= 0.5] if ok else []
    kw = keywords(words); gm = game or 'Is Game'
    hook_t = hook.rstrip('?!.').title()
    titles = [fit(f'{hook_t} 😱'), fit(f'{gm} Mein Ye Kya Ho Gaya? 🤯'), fit(f'{(kw[0].title() + " Ka") if kw else "Is Moment Ka"} Reaction Dekh Ke Hasi Nahi Rukegi 😂')]
    seen = set(); titles = [t for t in titles if not (t in seen or seen.add(t))]
    while len(titles) < 3: titles.append(fit(f'Ye Clip Dekhne Ke Baad Kya Hua? #{len(titles)} 🔥'))
    gtag = '#' + re.sub(r'\W', '', gm) if game else '#Clips'
    tags_h = ['#Shorts', '#Gaming', '#GamingShorts', '#FunnyMoments', '#HindiGaming', '#IndianGamer', '#GamerReaction', gtag]
    line1 = f'{hook_t}? Is crazy moment ka reaction dekho!'
    desc = (f"{line1}\nGameplay mein aisa twist aaya ki reaction dekhne layak hai! Pura clip dekho aur batao, aapke saath bhi kabhi aisa hua?\n"
            f"Clip credit: {creator or '@CreatorName (add the streamer with --creator)'}\n\n{' '.join(tags_h)}")
    base = ['gaming shorts', 'hindi gaming', 'funny gaming moments', 'gaming reaction', 'indian gamer', 'stream highlights', 'live stream clips', 'hinglish gaming', 'shorts']
    tags = base + ([game.lower(), f'{game.lower()} gameplay'] if game else []) + kw
    out, tot = [], 0
    for t in tags:
        if tot + len(t) + 2 > 480: break
        out.append(t); tot += len(t) + 2
    q = f'{hook_t}? Aapke saath aisa hota to aap kya karte? Comment mein batao 👇'
    return (f"=== YOUTUBE SHORTS UPLOAD KIT: {name} ({dur:.0f}s) ===\n\n1. TITLE OPTIONS (under 60 characters)\n" + '\n'.join(f'   {i + 1}) {t}  [{len(t)}]' for i, t in enumerate(titles[:3])) +
            f"\n\n2. DESCRIPTION\n{desc}\n\n3. HASHTAGS\n{' '.join(tags_h)}\n\n4. YOUTUBE STUDIO TAGS (paste into the Tags box)\n{', '.join(out)}\n\n5. PINNED COMMENT\n{q}\n"), titles[:3]


# ------------------------------------------------------------------ sheet and calibration images
def contact_sheet(mp4, dur, peaks, out):
    ts = sorted(set([round(x, 1) for x in np.linspace(0.3, dur - 0.3, 10)] + [round(1.5, 1)] + [round(max(t, 0.3), 1) for t, _ in peaks[:2]])); tw, th = 270, 480; cols = 6
    rows = -(-len(ts) // cols); im = Image.new('RGB', (cols * (tw + 6) + 6, rows * (th + 6) + 6), (0, 0, 0)); d = ImageDraw.Draw(im); tmp = Path(tempfile.mkdtemp())
    for i, t in enumerate(ts):
        run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(mp4), '-frames:v', '1', '-vf', f'scale={tw}:{th}', str(tmp / f'{i}.png')])
        x, y = 6 + (i % cols) * (tw + 6), 6 + (i // cols) * (th + 6); im.paste(Image.open(tmp / f'{i}.png'), (x, y))
        d.text((x + 6, y + 4), f'{t:.1f}s' + (' HOOK' if t <= HOOK_S else '') + (' PEAK' if any(abs(t - p) < 0.35 for p, _ in peaks) else ''), font=font(20), fill=YEL, stroke_width=2, stroke_fill=(0, 0, 0))
    im.save(out, quality=90); shutil.rmtree(tmp)


def cal_image(src, info, rect, cam, game, mode, out, source=''):
    """The chosen boxes drawn on a real frame (left) and the resulting 9:16 layout (right). Verify the facecam box once."""
    tmp = Path(tempfile.mkdtemp()); fp = tmp / 'f.png'; run(['ffmpeg', '-v', 'error', '-y', '-ss', f"{info['dur'] * 0.3:.2f}", '-i', str(src), '-frames:v', '1', str(fp)]); fr = Image.open(fp).convert('RGB')
    k = 900 / fr.width; d = ImageDraw.Draw(fr)
    box = lambda r, col, label: (d.rectangle([r[0], r[1], r[0] + r[2], r[1] + r[3]], outline=col, width=max(4, fr.width // 240)), d.text((r[0] + 8, r[1] + 6), label, font=font(max(18, fr.width // 45)), fill=col, stroke_width=2, stroke_fill=(0, 0, 0)))
    box(rect, (255, 0, 255), 'PICTURE (16:9)')
    fs = max(20, fr.width // 40); d.rectangle([0, fr.height - fs * 2 - 8, fr.width, fr.height], fill=(0, 0, 0)); d.text((10, fr.height - fs * 2), 'FACECAM SOURCE: ' + (source or 'n/a'), font=font(fs), fill=YEL)
    if mode == 'split': box(cam, (0, 255, 255), 'FACECAM -> TOP 35%'); box(game, (120, 255, 0), 'GAMEPLAY -> BOTTOM 65%')
    left = fr.resize((900, int(fr.height * k))); lay = Image.new('RGB', (W, H), (20, 20, 20)); src_img = Image.open(fp).convert('RGB')
    if mode == 'split':
        lay.paste(src_img.crop((cam[0], cam[1], cam[0] + cam[2], cam[1] + cam[3])).resize((W, TOP_H)), (0, 0)); lay.paste(src_img.crop((game[0], game[1], game[0] + game[2], game[1] + game[3])).resize((W, BOT_H)), (0, TOP_H))
        ImageDraw.Draw(lay).rectangle([0, TOP_H - 3, W, TOP_H + 3], fill=YEL)
    else: lay = src_img.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3])).resize((W, H))
    right = lay.resize((540, 960)); sheet = Image.new('RGB', (900 + 540 + 30, max(left.height, 960) + 20), (0, 0, 0)); sheet.paste(left, (10, 10)); sheet.paste(right, (930, 10)); sheet.save(out, quality=92); shutil.rmtree(tmp)


# ------------------------------------------------------------------ one clip
def process(src, args, out_dir, words_override=None, quiet=False):
    src = Path(src); name = src.stem; od = Path(out_dir) / name; od.mkdir(parents=True, exist_ok=True); info = probe(src)
    print(f'\n[{name}] {info["w"]}x{info["h"]}, {info["dur"]:.1f}s')
    fr, size = small_frames(src, info); a16 = audio16(src, info)
    rect = detect_active(fr, size, info); print(f'  picture: {rect[2]}x{rect[3]} at ({rect[0]},{rect[1]})' + ('  (blurred/black bars removed)' if rect[2:] != (info['w'], info['h']) else ''))
    cname, cr = find_creator(args.creator, getattr(args, 'creators', None)); gname = args.game or cr.get('game'); lang = args.lang or cr.get('lang') or 'hi'
    mode, box, fc_src = resolve_facecam(args, src, info, rect); print(f'  facecam: {fc_src}')
    cam, game = (cam_rect(rect, box) if box else None), game_rect(rect, args.game_x)
    if box and args.creator and (args.save_preset or args.box) and not fc_src.startswith('creators.json'):                       # --creator + --box, or --save-preset: remember it
        print(f"  saved {save_creator(args.creator, box, args.game, args.lang, getattr(args, 'creators', None))} to creators.json")
    elif args.save_preset and not args.creator: print('  warning: --save-preset needs --creator "@name"')
    if args.cal: cal_image(src, info, rect, cam, game, mode, od / 'cal.jpg', fc_src); print(f'  calibration image: {od / "cal.jpg"}'); return None
    mot, rms = analyse(fr, size, rect, info, a16); keep = keep_bins(mot, rms, info['dur']); segs = segments(keep, info['dur']); kept = sum(e - s for s, e in segs)
    print(f'  trimmed dead parts: {info["dur"]:.1f}s -> {kept:.1f}s' + ('  (shorter than 18 s: not enough action in the clip)' if kept < MIN_LEN else ''))
    work = Path(tempfile.mkdtemp(prefix='sc_')); kb = np.where(keep)[0]
    a_cut = cut_audio(a16, segs, 16000)
    wpath = od / 'words.json'
    if words_override is not None: words = words_override
    elif wpath.exists() and not args.retranscribe: words = json.loads(wpath.read_text(encoding='utf-8')); print(f'  captions: reusing {wpath.name} (your edits are kept; --retranscribe to redo)')
    else: words = transcribe(a_cut, lang, work, args.model); wpath.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding='utf-8')
    peaks = find_peaks(a_cut, kept); hook = args.hook or make_hook(words, np.array([np.sqrt(np.mean(a_cut[i * int(BIN * 16000):(i + 1) * int(BIN * 16000)] ** 2) + 1e-12) for i in range(int(kept / BIN))]), seed=len(name))
    print(f'  words: {len(words)}   peaks: {[round(t, 1) for t, _ in peaks]}   hook: {hook}')
    # audio: trim, add synthesized SFX, master to -15.5 LUFS
    if info['audio']:
        af = ''.join(f'[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS[a{i}];' for i, (s, e) in enumerate(segs)) + ''.join(f'[a{i}]' for i in range(len(segs))) + f'concat=n={len(segs)}:v=0:a=1,aresample={SR},aformat=channel_layouts=stereo[a]'
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-filter_complex', af, '-map', '[a]', '-c:a', 'pcm_f32le', str(work / 'cut.wav')]); sr_, a = wavfile.read(work / 'cut.wav')
    else: a = np.zeros((int(kept * SR), 2), np.float32)
    sfx = make_sfx(peaks, len(a)); mix = a.astype(np.float32) + np.stack([sfx, sfx], 1); wavfile.write(work / 'mix.wav', SR, mix)
    lufs, tp = master(work / 'mix.wav', work / 'master.wav'); print(f'  audio: {lufs:.1f} LUFS, true peak {tp:.1f} dBTP')
    # picture
    cap_y = TOP_H + 20 if mode == 'split' else 1380
    (work / 'cap.ass').write_text(make_ass(words, cap_y), encoding='utf-8'); hook_png(hook, work / 'hook.png')
    cwf = ev(rect[3] * W / H); keys = follow_keys(fr, size, rect, info, kb, cwf) if mode == 'follow' else []
    graph = build_graph(segs, mode, rect, cam, game, cwf, keys, [max(t - 0.05, 0) for t, _ in peaks], hook); (work / 'graph.txt').write_text(graph)
    final = od / 'final_short.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(src.resolve()), '-loop', '1', '-framerate', str(FPS), '-t', str(HOOK_S + 0.2), '-i', 'hook.png', '-i', 'master.wav', '-filter_complex_script', 'graph.txt',
         '-map', '[v]', '-map', '2:a', '-t', f'{kept:.3f}', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k',
         '-movflags', '+faststart', str(final)], cwd=work)
    contact_sheet(final, kept, peaks, od / 'sheet.jpg'); meta, titles = make_metadata(name, words, hook, args.creator, gname, kept); (od / 'metadata.txt').write_text(meta, encoding='utf-8')
    if not args.keep_work: shutil.rmtree(work)
    print(f'  -> {final}\n  -> {od / "sheet.jpg"}\n  -> {od / "metadata.txt"}\n')
    if not quiet: print(meta)
    return dict(final=final, kept=kept, words=words, peaks=peaks, hook=hook, rect=rect, lufs=lufs, meta=meta, titles=titles, segs=segs, mode=mode, facecam=fc_src)


# ------------------------------------------------------------------ synthetic test
def synth(path, mobile=False):
    """22+ s clip: 8 s action with a loud burst, 4 s frozen pause menu in silence, 12 s action with two bursts. Facecam = solid magenta box bottom-right. mobile=True: 1080x1920 screen recording with blurred bars."""
    fc = 'drawbox=x=1421:y=756:w=499:h=324:color=0xFF00FF:t=fill'
    sa = lambda d, b: f"aevalsrc='(random(0)-0.5)*if({'+'.join(f'between(t,{x},{x + 0.25})' for x in b) or '0'},1.6,0.03)+0.03*sin(2*PI*220*t)':s={SR}:d={d}:c=stereo"
    v = [f'testsrc2=s=1920x1080:r=30:d=8,{fc}', f'color=c=0x202030:s=1920x1080:r=30:d=4,{fc}', f'testsrc2=s=1920x1080:r=30:d=12,{fc}']
    a = [sa(8, [3.0]), f'anullsrc=r={SR}:cl=stereo,atrim=0:4', sa(12, [4.0, 8.0])]
    inp = sum([['-f', 'lavfi', '-i', x] for pair in zip(v, a) for x in pair], [])
    fg = ';'.join(['[0:v][1:a][2:v][3:a][4:v][5:a]concat=n=3:v=1:a=1[v][a]'] + ([f'[v]split[p][q];[p]scale=1080:1920,boxblur=40[bg];[q]scale=1080:608[fg];[bg][fg]overlay=0:(H-h)/2[vv]'] if mobile else []))
    run(['ffmpeg', '-v', 'error', '-y', *inp, '-filter_complex', fg, '-map', '[vv]' if mobile else '[v]', '-map', '[a]', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', str(path)])


def run_test():
    T = ROOT / '.test_tmp'; shutil.rmtree(T, ignore_errors=True); T.mkdir()
    ns = argparse.Namespace(facecam='right', no_facecam=False, box=None, game_x=0.0, cal=False, hook=None, creator='@TestStreamer', game='GTA 6', lang='hi', model='small', retranscribe=False, save_preset=False, require_facecam=False, creators=str(T / 'creators_test.json'), keep_work=False)
    # --- unit checks
    assert romanize('क्या हुआ') == 'kya hua' and romanize('कमरा') == 'kamra' and romanize('आग') == 'ag' and romanize('पागल है') == 'pagal hai' and romanize('hello yaar।') == 'hello yaar.', romanize('कमरा')
    assert romanize('ये क्या हो गया') == 'ye kya ho gya' or romanize('ये क्या हो गया') == 'ye kya ho gaya'
    ws = [{'w': w, 's': i * 0.4, 'e': i * 0.4 + 0.3} for i, w in enumerate('arre bhai ye kya ho gaya, bilkul pagal scene hai ye'.split())]
    ch = chunk_words(ws); assert all(2 <= len(c) <= 4 for c in ch[:-1]) and sum(len(c) for c in ch) == len(ws), ch
    ass = make_ass(ws, 690); assert '&H0000E6FF&' in ass and '\\pos(540,690)' in ass and ass.count('Dialogue') == len(ws) and 'ARRE' in ass
    h = make_hook(ws); assert 5 <= len(h.replace('?', '').split()) <= 7 and h[-1] in '?!.', h
    assert 5 <= len(make_hook([]).replace('?', '').split()) <= 7 and all(5 <= len(x.split()) <= 7 for x in FALLBACK_HOOKS)
    assert 5 <= len(make_hook([{'w': 'Arre', 's': 0, 'e': .2}, {'w': 'bhai', 's': .3, 'e': .5}]).replace('?', '').split()) <= 7, 'short line is padded to 5-7 words'
    assert zoom_expr([]) == '1' and abs(zoom_at([1.0], 1.0 + PUNCH_D / 2) - (1 + PUNCH) < 1e-9) and abs(zoom_at([1.0], 1.0 + PUNCH_D) - 1) < 1e-9 and zoom_expr([1, 3]).count('between') == 2
    assert pan_expr([(0, 10), (1, 30), (2, 20)]).count('gte') == 3
    meta, titles = make_metadata('t', ws, h, '@x', 'GTA 6', 20); assert len(titles) == 3 and all(len(t) < 60 for t in titles) and len(set(titles)) == 3 and '@x' in meta and all(k in meta for k in ('1. TITLE', '2. DESCRIPTION', '3. HASHTAGS', '4. YOUTUBE STUDIO TAGS', '5. PINNED COMMENT')), titles
    # --- creators.json store, facecam priority order, stationary-face rules (no video needed)
    cf = str(T / 'cr.json'); assert save_creator('@Mythpat', (0.765, 0.12, 0.235, 0.3), 'GTA 5', 'hi', cf) == '@Mythpat'
    n_, c_ = find_creator('mythpat', cf); assert n_ == '@Mythpat' and c_['box'] == '0.765,0.12,0.235,0.3' and c_['game'] == 'GTA 5' and find_creator('nobody', cf) == (None, {}) and find_creator(None, cf) == (None, {})
    seeded = load_creators(); assert seeded['@Mythpat']['box'] == '0.765,0.12,0.235,0.30' and seeded['@Mythpat']['game'] == 'GTA 5', 'creators.json is pre-seeded with @Mythpat'
    base = dict(no_facecam=False, box=None, facecam=None, creator='@Mythpat', require_facecam=False, creators=cf); real_auto = auto_facecam
    R = lambda **kw: resolve_facecam(argparse.Namespace(**{**base, **kw}), None, None, (0, 0, 100, 100))
    try:
        globals()['auto_facecam'] = lambda *a: ((0.1, 0.1, 0.2, 0.2), 'fake')
        assert R(box='0.1,0.2,0.3,0.4', facecam='left')[2].startswith('box') and R(facecam='left')[2].startswith('preset') and R()[2].startswith('creators.json'), 'priority: box > preset > creators.json'
        assert R(creator='@Unknown')[2].startswith('auto') and R(creator=None)[2].startswith('auto'), 'priority: ... > auto'
        globals()['auto_facecam'] = lambda *a: (None, 'none'); m = R(creator='@Unknown'); assert m[0] == 'follow' and m[1] is None and 'fallback' in m[2], m
        try: R(creator='@Unknown', require_facecam=True); raise AssertionError('--require-facecam must stop')
        except SystemExit: pass
        assert R(no_facecam=True)[0] == 'follow' and R(no_facecam=True, box='0.1,0.1,0.2,0.2')[0] == 'follow'
        try: R(box='2,0,1,1'); raise AssertionError('a box outside 0..1 must be refused')
        except SystemExit: pass
    finally: globals()['auto_facecam'] = real_auto
    still = [[(0.84, 0.22, 0.06, 0.14, 0.9), (0.3, 0.4, 0.05, 0.1, 0.65)] for _ in range(12)]; got = stationary_face(still)
    assert got and abs(got[0][0] - 0.84) < 1e-6 and got[1] == 12, 'a corner face in every frame is the facecam; the one-off face elsewhere is ignored'
    assert stationary_face([[(0.1 + 0.07 * i, 0.4, 0.06, 0.14, 0.9)] for i in range(12)]) is None, 'a face that moves across the picture (in-game character) is not a facecam'
    assert stationary_face([[(0.47, 0.4, 0.06, 0.14, 0.9)] for _ in range(12)]) is None, 'a still face in the middle is not a facecam'
    assert stationary_face([[(0.7, 0.1, 0.3, 0.5, 0.9)] for _ in range(12)]) is None, 'a huge close-up is not a facecam'
    assert stationary_face([[(0.84, 0.22, 0.06, 0.14, 0.9)] if i < 2 else [] for i in range(12)]) is None, 'seen in only 2 of 12 frames: not stationary'
    fb = facecam_box_from_face((0.838, 0.237, 0.062, 0.138, 0.9), 1080, 606); ref = (0.765, 0.12, 0.235, 0.30)
    assert box_iou((fb[0] * 1080, fb[1] * 606, fb[2] * 1080, fb[3] * 606), (ref[0] * 1080, ref[1] * 606, ref[2] * 1080, ref[3] * 606)) > 0.8 and abs(fb[0] + fb[2] - 1.0) < 1e-6, ('face -> box matches the hand-calibrated Mythpat box', fb)
    # --- automatic face search on synthetic clips: the same facecam still in 4 corners and in the Mythpat inset position, a moving face, no face
    fx_ = ROOT / 'assets/facecam_fixture.png'; assert fx_.exists(), 'assets/facecam_fixture.png (a facecam still) is needed for the corner tests'
    def face_clip(path, x=0, y=0, kind='still'):
        ff = ['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=6']
        if kind == 'none': run(ff + ['-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', str(path)])
        else:
            ov = "overlay=x='(W-w)*t/3':y='(H-h)/2'" if kind == 'moving' else f'overlay=x={x}:y={y}'
            run(ff + ['-loop', '1', '-i', str(fx_), '-filter_complex', f'[1:v]scale=301:216[f];[0:v][f]{ov}:shortest=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', str(path)])
    pic = (0, 0, 1280, 720)
    for nm, (x, y) in {'top-left': (0, 0), 'top-right': (979, 0), 'bottom-left': (0, 504), 'bottom-right': (979, 504), 'inset': (979, 86)}.items():
        c = T / f'face_{nm}.mp4'; face_clip(c, x, y); box, note = auto_facecam(c, probe(c), pic); assert box, (nm, note)
        true = (x / 1280, y / 720, 301 / 1280, 216 / 720); assert box_iou(box, true) >= 0.45, (nm, box, true)
        cr_ = cam_rect(pic, box); assert cr_[0] <= x + 150 <= cr_[0] + cr_[2] and cr_[1] <= y + 108 <= cr_[1] + cr_[3], (nm, 'the face is inside the crop', cr_)
        print(f'  auto facecam {nm:12s}: found ({note}), overlap with the true box {box_iou(box, true):.2f}')
    for kind in ('moving', 'none'):
        c = T / f'face_{kind}.mp4'; face_clip(c, kind=kind); box, note = auto_facecam(c, probe(c), pic); assert box is None, (kind, 'must fall back', box)
        print(f'  auto facecam {kind:12s}: nothing found -> fallback ({note})')
    cc = argparse.Namespace(**{**vars(ns), 'facecam': None, 'creator': None, 'cal': True}); process(T / 'face_bottom-left.mp4', cc, T / 'out'); assert (T / 'out/face_bottom-left/cal.jpg').exists()
    process(T / 'face_none.mp4', cc, T / 'out'); assert (T / 'out/face_none/cal.jpg').exists()
    # --- synthetic clips
    A, B = T / 'in/landscape.mp4', T / 'in/mobile.mp4'; A.parent.mkdir(); synth(A); synth(B, mobile=True)
    fa, sa_ = small_frames(A, probe(A)); ra = detect_active(fa, sa_, probe(A)); assert ra == (0, 0, 1920, 1080), ra
    ib = probe(B); fb, sb = small_frames(B, ib); rb = detect_active(fb, sb, ib); assert rb[2] == 1080 and abs(rb[3] - 608) <= 16 and abs(rb[1] - 656) <= 24, rb
    print('  picture detection: landscape = full frame; mobile recording -> 1080x608 centre (blurred bars removed)')
    # --- calibration image
    c = argparse.Namespace(**{**vars(ns), 'cal': True}); process(A, c, T / 'out'); ci = Image.open(T / 'out/landscape/cal.jpg'); assert ci.width > 1400 and ci.height > 900
    # --- split-screen render with injected Hinglish words
    wd = [{'w': w, 's': 0.5 + i * 0.45, 'e': 0.8 + i * 0.45} for i, w in enumerate('Arre bhai ye kya ho gaya pagal hai ye toh seedha headshot tha dekho dekho'.split())]
    r = process(A, ns, T / 'out', words_override=wd, quiet=True); f = r['final']
    d = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height,codec_type:format=duration', '-of', 'json', str(f)]).stdout)
    assert (d['streams'][0]['width'], d['streams'][0]['height']) == (W, H) and abs(float(d['format']['duration']) - r['kept']) < 0.3, d
    assert 17 <= r['kept'] <= 22.5 and r['kept'] < 24 - 2, f"dead segments trimmed: {r['kept']}"
    assert abs(r['lufs'] - LUFS) <= 0.6, r['lufs']; assert len(r['peaks']) >= 2, r['peaks']
    ev_i = float(loudnorm_i(f)['input_i']); assert abs(ev_i - LUFS) <= 1.0, f'final file loudness {ev_i}'
    def px(t, x, y): tp = T / 'p.png'; run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(f), '-frames:v', '1', str(tp)]); return Image.open(tp).convert('RGB').getpixel((x, y))
    t0 = px(6.0, 300, 300); assert t0[0] > 200 and t0[1] < 60 and t0[2] > 200, f'facecam (magenta) fills the top 35%: {t0}'
    assert not (px(6.0, 540, 1500)[0] > 200 and px(6.0, 540, 1500)[1] < 60), 'gameplay (not facecam) in the bottom 65%'
    tp = T / 'hook.png'; run(['ffmpeg', '-v', 'error', '-y', '-ss', '1.0', '-i', str(f), '-frames:v', '1', str(tp)]); hi = Image.open(tp).convert('RGB')
    assert sum(1 for x in range(120, 960, 20) if hi.getpixel((x, 100))[0] > 220 and hi.getpixel((x, 100))[1] > 190 and hi.getpixel((x, 100))[2] < 80) > 20, 'yellow hook banner at the top in the first 3.5 s'
    tp2 = T / 'late.png'; run(['ffmpeg', '-v', 'error', '-y', '-ss', '12.0', '-i', str(f), '-frames:v', '1', str(tp2)]); lt = Image.open(tp2).convert('RGB')
    assert sum(1 for x in range(120, 960, 20) if lt.getpixel((x, 100))[0] > 220 and lt.getpixel((x, 100))[1] > 190 and lt.getpixel((x, 100))[2] < 80) < 3, 'hook banner is gone after 3.5 s'
    assert (T / 'out/landscape/sheet.jpg').exists() and (T / 'out/landscape/metadata.txt').exists()
    # --- no-facecam render of the mobile recording (blurred bars stripped, window follows the action)
    nf = argparse.Namespace(**{**vars(ns), 'no_facecam': True}); r2 = process(B, nf, T / 'out', words_override=wd, quiet=True)
    d2 = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', str(r2['final'])]).stdout); assert (d2['streams'][0]['width'], d2['streams'][0]['height']) == (W, H) and r2['rect'][3] <= 640, r2['rect']
    # --- the Whisper worker runs on this machine (nobody speaks in the test audio, so no words are expected)
    assert find_whisper_python(), 'no Python with faster-whisper found'
    wk = Path(tempfile.mkdtemp()); out = transcribe(audio16(A, probe(A))[:16000 * 8], 'hi', wk, 'small'); assert isinstance(out, list); shutil.rmtree(wk)
    shutil.rmtree(T); print('\nstream-clipper: self-check OK (synthetic clips, calibration, split-screen + no-facecam renders, -15.5 LUFS, hook, captions, metadata)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--facecam', choices=list(FACECAM), default=None, help='force a facecam preset (otherwise: creators.json, then automatic face search)'); ap.add_argument('--no-facecam', action='store_true'); ap.add_argument('--box', help='x,y,w,h as fractions of the picture, e.g. 0.74,0.7,0.26,0.3')
    ap.add_argument('--game-x', type=float, default=0.0, help='shift the gameplay crop left/right (-0.5..0.5 of the picture width)'); ap.add_argument('--cal', action='store_true')
    ap.add_argument('--hook'); ap.add_argument('--creator'); ap.add_argument('--game'); ap.add_argument('--lang', default=None, choices=['hi', 'en'], help='default: the creator\'s language in creators.json, else hi'); ap.add_argument('--model', default='medium', choices=['small', 'medium'], help='Whisper model: medium = better Hindi (about 2-3 min per clip on CPU), small = faster')
    ap.add_argument('--only', help='process only clips whose name contains this'); ap.add_argument('--input', default=str(ROOT / 'input')); ap.add_argument('--output', default=str(ROOT / 'output'))
    ap.add_argument('--retranscribe', action='store_true', help='ignore output/<clip>/words.json and transcribe again'); ap.add_argument('--save-preset', action='store_true', help='remember the facecam box used for --creator in creators.json (also done automatically when --creator and --box are both given)'); ap.add_argument('--require-facecam', action='store_true', help='stop instead of falling back to --no-facecam when no facecam is found'); ap.add_argument('--creators', default=str(CREATORS), help=argparse.SUPPRESS); ap.add_argument('--keep-work', action='store_true'); ap.add_argument('--test', action='store_true'); a = ap.parse_args()
    if a.test: return run_test()
    clips = sorted(p for p in Path(a.input).iterdir() if p.suffix.lower() in VIDEO_EXT and (not a.only or a.only in p.name)) if Path(a.input).exists() else []
    if not clips: sys.exit(f'No clips found. Put your raw .mp4/.mov/.mkv clips in {a.input} and run: python3 edit_clip.py')
    for c in clips: process(c, a, a.output)


if __name__ == '__main__':
    main()
