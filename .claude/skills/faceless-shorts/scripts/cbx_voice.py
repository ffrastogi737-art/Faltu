"""Expressive narration with Chatterbox TTS (Resemble AI, MIT) on CPU -> data/narration.wav + data/lines.json.
   /root/cbx/bin/python cbx_voice.py <project> [exaggeration=0.75] [tempo=1.08]
Per line: script.json lines[i].emo (optional exaggeration override) ; same lines.json format as voice.py."""
import sys, json, subprocess, numpy as np, torch, torchaudio as ta
from pathlib import Path
from chatterbox.tts import ChatterboxTTS
P = Path(sys.argv[1]); EX = float(sys.argv[2]) if len(sys.argv) > 2 else 0.75; TEMPO = float(sys.argv[3]) if len(sys.argv) > 3 else 1.08
S = json.loads((P / 'script.json').read_text()); torch.manual_seed(7)
m = ChatterboxTTS.from_pretrained(device='cpu'); SR = m.sr
lead, gap, outro = S.get('lead', 0.35), S.get('gap', 0.24), S.get('outro', 1.0)
out = [np.zeros(int(lead * SR))]; t = lead; lines = []
for i, ln in enumerate(S['lines']):
    w = m.generate(ln['text'], exaggeration=ln.get('emo', EX), cfg_weight=ln.get('cfg', 0.35)).squeeze().numpy()
    tmp = P / f'data/_l{i}.wav'; ta.save(str(tmp), torch.tensor(w).unsqueeze(0), SR)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(tmp), '-af', f'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,atempo={TEMPO}',
                          '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32); tmp.unlink()
    lines.append({'i': i, 'text': ln['text'], 'start': round(t, 3), 'end': round(t + len(a) / SR, 3)}); out.append(a); t += len(a) / SR
    if i < len(S['lines']) - 1: out.append(np.zeros(int(gap * SR))); t += gap
    print(i, f"{lines[-1]['start']:.2f}-{lines[-1]['end']:.2f}", ln['text'][:60], flush=True)
out.append(np.zeros(int(outro * SR))); x = np.concatenate(out); x = x / (np.abs(x).max() + 1e-9) * 0.9
ta.save(str(P / 'data/narration.wav'), torch.tensor(x, dtype=torch.float32).unsqueeze(0), SR)
(P / 'data/lines.json').write_text(json.dumps({'duration': round(len(x) / SR, 3), 'lines': lines}, indent=1))
print(f'data/narration.wav {len(x)/SR:.2f} s (chatterbox, exaggeration {EX})')
