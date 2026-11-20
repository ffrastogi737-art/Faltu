"""Chatterbox narration for LONG videos: split the lines over several CPU workers, cache each line, then assemble.
   /root/cbx/bin/python cbx_long.py <project> gen <k> <n> [exaggeration=0.7]   worker k of n (lines i % n == k)
   /root/cbx/bin/python cbx_long.py <project> join [tempo=1.0]                -> data/narration.wav + data/lines.json
Each line is cached as data/_cbx/l<i>.wav (raw 24 kHz): delete one file and re-run gen to redo just that line.
Run the n workers in parallel with OMP_NUM_THREADS=<cores / n>. Same lines.json format as voice.py / cbx_voice.py."""
import sys, json, subprocess, numpy as np
from pathlib import Path
P = Path(sys.argv[1]); MODE = sys.argv[2]
S = json.loads((P / 'script.json').read_text()); D = P / 'data/_cbx'; D.mkdir(parents=True, exist_ok=True)
if MODE == 'gen':
    import torch, torchaudio as ta
    from chatterbox.tts import ChatterboxTTS
    k, n = int(sys.argv[3]), int(sys.argv[4]); EX = float(sys.argv[5]) if len(sys.argv) > 5 else 0.7
    torch.set_num_threads(int(__import__('os').environ.get('OMP_NUM_THREADS', '2')))
    m = ChatterboxTTS.from_pretrained(device='cpu')
    for i, ln in enumerate(S['lines']):
        f = D / f'l{i}.wav'
        if i % n != k or f.exists(): continue
        torch.manual_seed(7 + i)
        w = m.generate(ln['text'], exaggeration=ln.get('emo', EX), cfg_weight=ln.get('cfg', 0.35))
        ta.save(str(D / f'_tmp{k}.wav'), w, m.sr); (D / f'_tmp{k}.wav').rename(f)
        print(k, i, ln['text'][:60], flush=True)
else:
    TEMPO = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0; SR = 24000
    lead, gap, outro = S.get('lead', 0.35), S.get('gap', 0.3), S.get('outro', 1.0)
    out = [np.zeros(int(lead * SR), np.float32)]; t = lead; lines = []
    for i, ln in enumerate(S['lines']):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(D / f'l{i}.wav'), '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse' + (f',atempo={TEMPO}' if TEMPO != 1 else ''),
                              '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
        a = np.frombuffer(raw, dtype=np.float32)
        lines.append({'i': i, 'text': ln['text'], 'start': round(t, 3), 'end': round(t + len(a) / SR, 3)}); out.append(a); t += len(a) / SR
        nxt = S['lines'][i + 1].get('vis', {}).get('k') if i + 1 < len(S['lines']) else None
        g = ln.get('gap', 0.75 if nxt == 'T' else 0.55 if ln.get('vis', {}).get('k') == 'T' else gap)
        if i < len(S['lines']) - 1: out.append(np.zeros(int(g * SR), np.float32)); t += g
    out.append(np.zeros(int(outro * SR), np.float32)); x = np.concatenate(out); x = x / (np.abs(x).max() + 1e-9) * 0.9
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', str(P / 'data/narration.wav')], input=x.tobytes(), check=True)
    (P / 'data/lines.json').write_text(json.dumps({'duration': round(len(x) / SR, 3), 'lines': lines}, indent=1))
    print(f'data/narration.wav {len(x)/SR:.2f} s, {len(lines)} lines')
