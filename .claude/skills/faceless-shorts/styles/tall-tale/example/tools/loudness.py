#!/usr/bin/env python3
"""Normalise the tall-tale mix to -15.5 LUFS (two-pass loudnorm, true peak -1.5 dBTP, linear gain).

  python3 tools/loudness.py [project=.] [--target -15.5]

Run it after tools/mix.py and before `capture.mjs video`: the video step muxes data/mix.wav.
data/mix_raw.wav keeps the un-normalised mix. A fresh mix.py run is detected by hash (data/mix_loudness.json
stores the hash of the normalised file), so re-running is safe and never normalises twice.
"""
import hashlib, json, os, re, shutil, subprocess, sys
from pathlib import Path

argv = sys.argv[1:]
target = -15.5
if '--target' in argv:
    i = argv.index('--target'); target = float(argv[i + 1]); del argv[i:i + 2]
P = Path(argv[0] if argv else '.').resolve()
MIX, RAW, META, TMP = P / 'data/mix.wav', P / 'data/mix_raw.wav', P / 'data/mix_loudness.json', P / 'data/mix_norm.tmp.wav'
TP = -1.5


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()


def ff(cmd):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-hide_banner', *cmd], capture_output=True, text=True)
    if r.returncode: raise SystemExit(f'ffmpeg failed: {r.stderr[-600:]}')
    return r.stderr


def measure(path):
    log = ff(['-i', str(path), '-af', f'loudnorm=I={target}:TP={TP}:LRA=11:print_format=json', '-f', 'null', '-'])
    return json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', log).group(0))


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                                capture_output=True, text=True, check=True).stdout)


if not MIX.exists(): raise SystemExit('data/mix.wav is missing: run tools/mix.py first')
meta = json.loads(META.read_text()) if META.exists() else {}
if not RAW.exists() or meta.get('sha') != sha(MIX):      # a new mix.py output: it becomes the raw input
    shutil.copyfile(MIX, RAW)

m = measure(RAW)                                          # pass 1: measure
af = (f'loudnorm=I={target}:TP={TP}:LRA=11:measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:'
      f'measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}:linear=true')
ff(['-y', '-i', str(RAW), '-af', af, '-ar', '48000', '-c:a', 'pcm_s16le', str(TMP)])   # pass 2: apply
if abs(duration(TMP) - duration(RAW)) > 0.05:             # the loudnorm look-ahead once cut the tail of a track
    os.remove(TMP); raise SystemExit('normalised mix lost audio at the end: data/mix.wav left unchanged')
os.replace(TMP, MIX)
out = measure(MIX)                                        # verify what the file now measures
META.write_text(json.dumps({'sha': sha(MIX), 'target': target, 'raw_lufs': float(m['input_i']),
                            'raw_true_peak': float(m['input_tp']), 'out_lufs': float(out['input_i']),
                            'out_true_peak': float(out['input_tp'])}, indent=1))
print(f'data/mix.wav: {m["input_i"]} -> {out["input_i"]} LUFS (target {target}) · true peak {out["input_tp"]} dBTP · raw kept in data/mix_raw.wav')
