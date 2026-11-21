"""Inside Out soundtrack: narration + soft procedural sound effects + a quiet music bed, all made here with numpy.
No samples, no AI audio, no downloads.

  python3 tools/mix.py [project=.]          → data/mix.wav (48 kHz stereo)

Reads data/cues.json (node tools/capture.mjs cues), data/narration.wav if it exists (voice.py or words.py --audio),
and script.json "music": "suspense" (tall-tale default: cinematic underscore) · "bed" (the procedural score) · "none" · "audio/your-track.mp3" (your own royalty-free
track, any format ffmpeg reads). The music ducks under the voice.

Sound rules (STYLE.md): every effect is soft and rounded, nothing above ~5 kHz, no ticks / hats / glitches / beeps.
Cue types: whoosh slide pop plop gulp boing bubbles sizzle sparkle thud slam tock zip alarm  (+ gain, dur)
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from scipy import signal
from scipy.io import wavfile

P = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
SR = 48000
rng = np.random.default_rng(11)
cj = json.loads((P / 'data/cues.json').read_text())
script = json.loads((P / 'script.json').read_text())
DUR = float(cj['duration'])
N = int(DUR * SR) + SR // 10


def lp(x, f, o=2): b, a = signal.butter(o, min(f, SR / 2 - 100) / (SR / 2), 'low'); return signal.lfilter(b, a, x)
def hp(x, f, o=2): b, a = signal.butter(o, f / (SR / 2), 'high'); return signal.lfilter(b, a, x)
def bp(x, f0, f1, o=2): b, a = signal.butter(o, [f0 / (SR / 2), f1 / (SR / 2)], 'band'); return signal.lfilter(b, a, x)
def db(x): return 10 ** (x / 20)
def tt(d): return np.arange(int(d * SR)) / SR
def env(n, a=0.005, r=None):
    """attack a seconds then exponential release over the rest"""
    e = np.ones(n); na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    rest = n - na; e[na:] = np.exp(-np.linspace(0, r or 5, rest)) if rest > 0 else 1; return e
def sweep(f0, f1, d, shape='exp'):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d) if shape == 'exp' else f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def noise(d): return rng.standard_normal(int(d * SR))


# ---------- the effects ----------
def whoosh(d=0.38, **_):
    n = noise(d); lo, hi = lp(n, 500), lp(n, 2200)
    k = np.sin(np.pi * np.linspace(0, 1, len(n))); x = (lo * (1 - k) + hi * k) * k ** 1.5
    return x / (np.abs(x).max() + 1e-9) * 0.5
def slide(d=1.0, **_):
    n = lp(noise(d), 700); e = np.sin(np.pi * np.linspace(0, 1, len(n))) ** 2
    return n / (np.abs(n).max() + 1e-9) * e * 0.35 + sweep(260, 120, d) * e * 0.08
def pop(**_): x = sweep(560, 240, 0.11) * env(int(0.11 * SR), 0.002, 6); return lp(x, 3000) * 0.7
def plop(**_): x = sweep(700, 180, 0.14) * env(int(0.14 * SR), 0.002, 5); return lp(x, 2500) * 0.6
def gulp(**_):
    a = sweep(320, 140, 0.16) * env(int(0.16 * SR), 0.01, 4); b = sweep(240, 90, 0.2) * env(int(0.2 * SR), 0.01, 4)
    x = np.concatenate([a, np.zeros(int(0.04 * SR)), b]); return lp(x, 1800) * 0.8
def boing(**_):
    d = 0.42; t = tt(d); f = 200 * (1 + 0.6 * t / d) * (1 + 0.08 * np.sin(2 * np.pi * 18 * t))
    return lp(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.004, 4), 2000) * 0.55
def bubbles(d=2.0, **_):
    x = np.zeros(int(d * SR))
    for _ in range(int(d * 7)):
        st = rng.integers(0, max(1, len(x) - int(0.08 * SR))); f = rng.uniform(380, 900); b = sweep(f, f * 1.6, 0.06) * env(int(0.06 * SR), 0.003, 5)
        x[st:st + len(b)] += b * rng.uniform(0.2, 0.5)
    return lp(x, 2500) * 0.5
def sizzle(d=1.0, **_):
    n = bp(noise(d), 1800, 4500); crack = (rng.random(len(n)) < 0.002).astype(float); crack = lp(crack, 300) * 40
    e = np.minimum(1, np.linspace(0, 6, len(n))) * np.linspace(1, 0.2, len(n)); return n * (0.4 + crack) * e * 0.12
def sparkle(d=1.2, **_):
    notes = [784, 880, 1047, 1175, 1319, 1568]; x = np.zeros(int(d * SR) + SR // 2)
    for k, f in enumerate(notes):
        st = int(k * d / len(notes) * SR); n = int(0.4 * SR); t = tt(0.4)
        x[st:st + n] += (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env(n, 0.004, 6) * 0.22
    return lp(x, 4500)
def thud(**_):
    d = 0.35; t = tt(d); x = np.sin(2 * np.pi * (70 + 40 * np.exp(-t * 30)) * t) * env(len(t), 0.002, 7)
    return x * 0.9 + lp(noise(d), 220) * env(len(t), 0.001, 12) * 0.3
def slam(**_):
    d = 0.5; t = tt(d); x = np.sin(2 * np.pi * (60 + 60 * np.exp(-t * 25)) * t) * env(len(t), 0.002, 6)
    return np.tanh(1.6 * (x + lp(noise(d), 1200) * env(len(t), 0.001, 10) * 0.6)) * 0.9
def tock(**_): d = 0.09; t = tt(d); return (np.sin(2 * np.pi * 420 * t) + 0.3 * np.sin(2 * np.pi * 840 * t)) * env(len(t), 0.001, 9) * 0.35
def zip_(**_):
    d = 0.32; n = bp(noise(d), 400, 3000); k = np.linspace(0, 1, len(n))
    return (n / (np.abs(n).max() + 1e-9) * 0.35 + sweep(300, 1100, d) * 0.12) * np.sin(np.pi * k) ** 1.2
def alarm(d=2.0, **_):
    x = np.zeros(int(d * SR)); one = np.sin(2 * np.pi * 150 * tt(0.22)) * env(int(0.22 * SR), 0.02, 5)
    for st in np.arange(0, d - 0.25, 0.5): i = int(st * SR); x[i:i + len(one)] += one
    return lp(x, 900) * 0.55

def inhale(d=1.0, **_):
    n = bp(noise(d), 300, 2600); k = np.linspace(0, 1, len(n)); e = np.sin(np.pi * np.minimum(1, k * 1.15)) ** 1.5 * (0.6 + 0.4 * k)
    return n / (np.abs(n).max() + 1e-9) * e * 0.5
def heartbeat(**_):
    one = lambda d, f: np.sin(2 * np.pi * f * tt(d)) * env(int(d * SR), 0.004, 7)
    x = np.concatenate([one(0.16, 58), np.zeros(int(0.09 * SR)), one(0.2, 52) * 0.75]); return lp(x, 300) * 1.0

FX = dict(inhale=inhale, heartbeat=heartbeat, whoosh=whoosh, slide=slide, pop=pop, plop=plop, gulp=gulp, boing=boing, bubbles=bubbles, sizzle=sizzle,
          sparkle=sparkle, thud=thud, slam=slam, tock=tock, zip=zip_, alarm=alarm)
LEVEL = dict(inhale=-15, heartbeat=-8, whoosh=-17, slide=-19, pop=-14, plop=-15, gulp=-11, boing=-15, bubbles=-21, sizzle=-18, sparkle=-17,
             thud=-11, slam=-9, tock=-18, zip=-14, alarm=-17)


# ---------- the music bed: soft pad + plucked arpeggio, 100 BPM, I–vi–IV–V ----------
def music_bed():
    bpm = 100; beat = 60 / bpm; bar = beat * 4
    chords = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]]
    x = np.zeros(N)
    nb = int(np.ceil(DUR / bar)) + 1
    for b in range(nb):
        ch = chords[b % 4]; st = int(b * bar * SR); n = int(bar * SR)
        if st >= N: break
        t = tt(bar); e = np.minimum(1, t / 0.4) * np.minimum(1, (bar - t) / 0.4)
        pad = sum(np.sin(2 * np.pi * f / 2 * t) + 0.25 * np.sin(2 * np.pi * f * t) for f in ch) * e * 0.10
        x[st:st + n] += pad[:max(0, min(n, N - st))]
        for k in range(8):                                                       # eighth-note pluck arpeggio
            f = ch[[0, 1, 2, 1, 2, 0, 1, 2][k]] * (2 if k % 4 == 2 else 1); ps = st + int(k * beat / 2 * SR); pn = int(0.5 * SR)
            if ps + pn >= N: continue
            pt = tt(0.5); pl = (np.sin(2 * np.pi * f * pt) + 0.35 * np.sin(4 * np.pi * f * pt)) * env(pn, 0.003, 7) * 0.12
            x[ps:ps + pn] += pl
    x = lp(x, 3200)
    fade = np.ones(N); fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo)
    return x / (np.abs(x).max() + 1e-9) * fade

def music_neon():
    """synthwave bed: four-on-the-floor kick, pulsing eighth-note bass, minor pad, 108 BPM (script.json "music": "neon")"""
    bpm = 108; beat = 60 / bpm; bar = beat * 4
    roots = [110.0, 87.31, 130.81, 98.0]                       # A2, F2, C3, G2
    x = np.zeros(N); nb = int(np.ceil(DUR / bar)) + 1
    for b in range(nb):
        st = int(b * bar * SR); r = roots[b % 4]
        if st >= N: break
        t = tt(bar); e = np.minimum(1, t / 0.3) * np.minimum(1, (bar - t) / 0.3)
        pad = sum(signal.sawtooth(2 * np.pi * f * t) for f in (r * 2, r * 2.378, r * 3)) * e * 0.035
        n = min(len(pad), N - st); x[st:st + n] += lp(pad, 1400)[:n]
        for k in range(8):
            ps = st + int(k * beat / 2 * SR); pn = int(beat / 2 * SR)
            if ps + pn >= N: continue
            bt = tt(beat / 2); x[ps:ps + pn] += lp(signal.sawtooth(2 * np.pi * r * bt) * env(pn, 0.004, 3) * 0.16, 700)
        for k in range(4):
            ks = st + int(k * beat * SR); kn = int(0.25 * SR)
            if ks + kn >= N: continue
            x[ks:ks + kn] += sweep(140, 45, 0.25) * env(kn, 0.002, 6) * 0.5
            hs = ks + int(beat / 2 * SR); hn = int(0.05 * SR)
            if hs + hn < N: x[hs:hs + hn] += hp(noise(0.05), 6000) * env(hn, 0.001, 8) * 0.12
    fade = np.ones(N); fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo)
    return x / (np.abs(x).max() + 1e-9) * fade

def music_tension():
    """low drone + slow minor pulse, for mysterious / tense explainers (script.json "music": "tension")"""
    t = np.arange(N) / SR; x = np.zeros(N)
    for f, g in [(55, 0.5), (82.4, 0.3), (110, 0.2), (130.8, 0.12)]: x += np.sin(2 * np.pi * f * t + np.sin(t * 0.3) * 0.5) * g
    x *= 0.55 + 0.45 * np.sin(2 * np.pi * t / 8) ** 2
    beat = 60 / 84; ping = lambda f: (np.sin(2 * np.pi * f * tt(1.2)) + 0.3 * np.sin(4 * np.pi * f * tt(1.2))) * env(int(1.2 * SR), 0.01, 5)
    seq = [220.0, 261.6, 196.0, 174.6]
    for k in range(int(DUR / (beat * 2))):
        i = int(k * beat * 2 * SR); pg = ping(seq[(k // 2) % 4]) * 0.35
        if i + len(pg) < N: x[i:i + len(pg)] += pg
    x = lp(x, 2200); fade = np.ones(N); fo = int(1.5 * SR); fade[-fo:] = np.linspace(1, 0, fo); fi = int(0.8 * SR); fade[:fi] *= np.linspace(0, 1, fi)
    return x / (np.abs(x).max() + 1e-9) * fade

def music_suspense():
    """tall-tale default (owner 21 Nov 2026): a subtle cinematic suspense underscore. Slow minor string pads (Am-F-Dm-E, 4 s each,
    cross-faded), a soft heartbeat pulse, a faint high shimmer. No fade in or out, so the video loops (script.json "music": "suspense")"""
    t_all = np.arange(N) / SR; x = np.zeros(N)
    chords = [[110.0, 130.81, 164.81], [87.31, 110.0, 130.81], [73.42, 87.31, 110.0], [82.41, 103.83, 123.47]]
    seg, xf = 4.0, 1.0
    for b in range(int(np.ceil(DUR / seg)) + 1):
        st = int((b * seg - xf / 2) * SR); n = int((seg + xf) * SR); a0, a1 = max(0, st), min(N, st + n)
        if a1 <= a0: continue
        tl = (np.arange(a0, a1) - st) / SR; tg = np.arange(a0, a1) / SR
        e = np.minimum(np.clip(tl / xf, 0, 1), np.clip((seg + xf - tl) / xf, 0, 1)); e = np.sin(e * np.pi / 2) ** 2
        y = np.zeros(a1 - a0)
        for f in chords[b % 4]:
            for d in (0.997, 1.003):
                for h in range(1, 6): y += np.sin(2 * np.pi * f * d * h * tg) / h
        x[a0:a1] += y * e * 0.05
    x = lp(x, 900)
    k = 0
    while True:                                                                   # heartbeat: lub-dub every 1.4 s
        st = int((0.6 + k * 1.4) * SR)
        if st >= N: break
        for off, g in ((0.0, 1.0), (0.22, 0.6)):
            s0 = st + int(off * SR); th = np.sin(2 * np.pi * 48 * tt(0.18)) * env(int(0.18 * SR), 0.004, 14) * g * 0.6; n = min(len(th), N - s0)
            if n > 0: x[s0:s0 + n] += th[:n]
        k += 1
    x += np.sin(2 * np.pi * 659.3 * t_all) * (0.5 + 0.5 * np.sin(2 * np.pi * t_all / 6)) * 0.015
    r = int(0.02 * SR); x[:r] *= np.linspace(0, 1, r); x[-r:] *= np.linspace(1, 0, r)   # 20 ms edges only: no audible fade at the loop point
    return x / (np.abs(x).max() + 1e-9)

# ---------- punchy "hype" effects (comic-pop, 18 Nov 2026): brighter and louder than the soft set ----------
def reverb(x, d=1.2, mix=0.35):
    ir = noise(d) * np.exp(-np.linspace(0, 7, int(d * SR))); ir = lp(ir, 6000); w = signal.fftconvolve(x, ir)[:len(x) + int(d * SR)]
    y = np.zeros(len(w)); y[:len(x)] = x; return y + w / (np.abs(w).max() + 1e-9) * np.abs(x).max() * mix
def boom(**_):
    d = 1.6; t = tt(d); sub = np.sin(2 * np.pi * (38 + 90 * np.exp(-t * 9)) * t) * np.exp(-t * 2.6)
    crack = hp(noise(d), 1500) * np.exp(-t * 28) * 0.7 + lp(noise(d), 400) * np.exp(-t * 6) * 0.5
    return reverb(np.tanh(2.2 * (sub + crack)), 1.4, 0.3)
def riser(d=1.0, **_):
    t = tt(d); k = t / d; n = noise(d); x = np.zeros(len(n))
    for f0 in (400, 1200, 3500): x += bp(n, f0 * (0.5 + 1.5 * k.mean()), min(f0 * 3, 15000)) * 0.4
    x = hp(n, 300) * (k ** 2) * 0.6 + sweep(180, 1400, d) * (k ** 3) * 0.35
    return x * np.minimum(1, (1 - k) * 40)
def ding(**_):
    d = 1.4; t = tt(d); x = sum(np.sin(2 * np.pi * f * t) * g * np.exp(-t * dec) for f, g, dec in [(1568, 0.6, 3.5), (2349, 0.3, 5), (3136, 0.25, 7), (4699, 0.12, 9)])
    return x * env(len(t), 0.001, 0.1)
def hit(**_):
    d = 0.45; t = tt(d); body = np.sin(2 * np.pi * (180 + 120 * np.exp(-t * 40)) * t) * np.exp(-t * 14); sn = bp(noise(d), 1500, 9000) * np.exp(-t * 16)
    return reverb(np.tanh(2 * (body * 0.8 + sn * 0.9)), 0.6, 0.25)
def swoosh(d=0.45, **_):
    n = noise(d); k = np.linspace(0, 1, len(n)); x = np.zeros(len(n)); seg_ = 12
    for j in range(seg_):
        a, b = j * len(n) // seg_, (j + 1) * len(n) // seg_; fc = 600 * (12 ** np.sin(np.pi * j / seg_)); x[a:b] = bp(n, fc * 0.6, min(fc * 1.6, 16000))[a:b]
    return x * np.sin(np.pi * k) ** 2
def applause(d=2.0, **_):
    x = np.zeros(int(d * SR) + SR)
    for _ in range(int(d * 180)):
        st = int(rng.uniform(0, d) * SR); c = bp(noise(0.03), rng.uniform(800, 2500), 9000) * env(int(0.03 * SR), 0.0005, 9)
        x[st:st + len(c)] += c * rng.uniform(0.2, 1)
    k = np.linspace(0, 1, len(x)); return x * np.minimum(1, k * 8) * np.minimum(1, (1 - k) * 2.5)
def tickclock(d=1.0, **_):
    x = np.zeros(int(d * SR) + SR // 4); one = hp(noise(0.02), 2500) * env(int(0.02 * SR), 0.0005, 10)
    for k, st in enumerate(np.arange(0, d, 0.25)): i = int(st * SR); x[i:i + len(one)] += one * (1 if k % 2 == 0 else 0.6)
    return x
def scratch(**_):
    d = 0.5; t = tt(d); f = 300 + 900 * np.abs(np.sin(2 * np.pi * 3 * t)); x = bp(noise(d), 300, 4000) * 0.6 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4
    return x * env(len(t), 0.005, 2)
def coin(**_):
    a = np.sin(2 * np.pi * 1976 * tt(0.08)) * env(int(0.08 * SR), 0.001, 2); b = np.sin(2 * np.pi * 2637 * tt(0.5)) * env(int(0.5 * SR), 0.001, 6)
    return np.concatenate([a, b]) * 0.6
HYPE = dict(boom=(boom, -6), riser=(riser, -13), ding=(ding, -14), hit=(hit, -9), swoosh=(swoosh, -14), applause=(applause, -15),
            tickclock=(tickclock, -16), scratch=(scratch, -14), coin=(coin, -15))

def music_hype():
    """energetic trap / pop bed, 140 BPM half-time: punchy kick, clap, rolling hats, 808 bass, bright stabs (script.json "music": "hype")"""
    x = np.zeros(N); beat = 60 / 140; t16 = beat / 4
    kick = lambda: np.sin(2 * np.pi * (50 + 120 * np.exp(-tt(0.35) * 30)) * tt(0.35)) * np.exp(-tt(0.35) * 9)
    clap = lambda: bp(noise(0.18), 900, 6000) * np.exp(-tt(0.18) * 22)
    hat = lambda: hp(noise(0.04), 7000) * np.exp(-tt(0.04) * 80)
    prog = [55.0, 55.0, 43.65, 49.0]; stab = [(440, 523.3, 659.3), (440, 523.3, 659.3), (349.2, 440, 523.3), (392, 493.9, 587.3)]
    bar = beat * 4; K = int(DUR / t16) + 1
    def put(sig, tsec, g):
        i = int(tsec * SR); n = min(len(sig), N - i)
        if n > 0: x[i:i + n] += sig[:n] * g
    for s in range(K):
        tsec = s * t16; pos = s % 16; ch = (s // 16) % 4
        if pos in (0, 7, 10): put(kick(), tsec, 1.0)
        if pos in (4, 12): put(clap(), tsec, 0.55)
        put(hat(), tsec, 0.18 if pos % 2 else 0.28)
        if pos in (14, 15) and (s // 16) % 2: put(hat(), tsec + t16 / 2, 0.15)
        if pos == 0:
            d = bar; tt_ = tt(d); f = prog[ch]; bass = np.tanh(2.5 * np.sin(2 * np.pi * f * tt_)) * np.exp(-tt_ * 0.9); put(lp(bass, 400), tsec, 0.55)
        if pos in (0, 3, 6, 10):
            ch3 = stab[ch]; d = 0.22; tt_ = tt(d); st = sum(signal.sawtooth(2 * np.pi * f * tt_) for f in ch3) / 3 * np.exp(-tt_ * 14); put(lp(st, 3500), tsec, 0.16)
    fade = np.ones(N); fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo); fi = int(0.3 * SR); fade[:fi] *= np.linspace(0, 1, fi)
    return x / (np.abs(x).max() + 1e-9) * fade

def load_audio(f):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(out, dtype=np.float32).reshape(-1, 2).astype(np.float64); return a


mix = np.zeros((N, 2))
# voice
vf = P / 'data/narration.wav'
voice = None
if vf.exists():
    v = load_audio(vf)[:N]; voice = np.zeros((N, 2)); voice[:len(v)] = v
    rms = np.sqrt(np.mean(voice ** 2) + 1e-12); voice *= db(-19) / rms
    mix += voice
# music
mus = script.get('music', 'bed')
if mus and mus != 'none':
    m = music_suspense() if mus == 'suspense' else music_bed() if mus == 'bed' else music_tension() if mus == 'tension' else music_neon() if mus == 'neon' else music_hype() if mus == 'hype' else None
    if m is None:
        a = load_audio(P / mus)[:N]; m = np.zeros(N); m[:len(a)] = a.mean(1); m /= np.abs(m).max() + 1e-9
    m = np.stack([m, m], 1) * db((-21 if mus == 'hype' else -26 if mus == 'suspense' else -24) if voice is not None else -20)
    if voice is not None:                                                        # duck under the voice
        lev = np.abs(voice.mean(1)); lev = signal.lfilter([1 - 0.9995], [1, -0.9995], lev); lev /= lev.max() + 1e-9
        m *= (1 - 0.55 * np.clip(lev * 3, 0, 1))[:, None]
    mix += m
# effects
for c in cj['cues']:
    kw = {'d': c['dur']} if c.get('dur') else {}
    if c['type'] in HYPE:
        fn, lvl = HYPE[c['type']]; x = fn(**kw); x = x * db(lvl) * c.get('gain', 1.0) / (np.abs(x).max() + 1e-9) * 0.9
    else:
        fn = FX.get(c['type'])
        if not fn: print('unknown cue type, skipped:', c['type']); continue
        x = fn(**kw); x = lp(x, 5000) * db(LEVEL[c['type']]) * c.get('gain', 1.0) / (np.abs(x).max() + 1e-9) * 0.9
    i = int(c['t'] * SR); n = min(len(x), N - i)
    if n > 0 and i >= 0: pan = c.get('pan', 0.0); mix[i:i + n, 0] += x[:n] * (1 - max(0, pan)); mix[i:i + n, 1] += x[:n] * (1 + min(0, pan))
# master: gentle soft-clip, peak -1 dBFS
mix = np.tanh(mix * 1.2) / 1.2
mix *= db(-1) / (np.abs(mix).max() + 1e-9)
wavfile.write(P / 'data/mix.wav', SR, (mix * 32767).astype(np.int16))
print(f"data/mix.wav: {DUR:.2f} s · voice: {'yes' if voice is not None else 'NO (captions-only)'} · music: {mus} · {len(cj['cues'])} cues")
