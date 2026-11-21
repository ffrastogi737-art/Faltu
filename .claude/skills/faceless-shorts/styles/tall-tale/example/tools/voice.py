#!/usr/bin/env python3
"""Tall-tale narration (owner 21 Nov 2026): Chatterbox at a natural dramatic pace, with held breaths before reveals.

  python3 tools/voice.py [project=.]          then: scripts/py scripts/words.py <project>

script.json: "tempo" (default 1.03), "exaggeration" (default 0.75), "gap" between lines (0.3 suits the format); per line
"emo" (exaggeration for that line) and "pause" (seconds of silence BEFORE that line: 0.4-0.9 before a reveal or a punchline).
It runs the shared scripts/cbx_voice.py unchanged (gta uses it with its own arguments), then inserts the pauses into
data/narration.wav and shifts data/lines.json. Skill folder: $FACELESS_SKILL, else the usual checkouts. Chatterbox python: $CBX_PY.
"""
import json, os, subprocess, sys
from pathlib import Path

P = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
S = json.loads((P / 'script.json').read_text())
tempo, ex = float(S.get('tempo', 1.03)), float(S.get('exaggeration', 0.75))
skills = [os.environ.get('FACELESS_SKILL'), '/home/user/Faltu/.claude/skills/faceless-shorts', str(Path.home() / '.claude/skills/faceless-shorts')]
cbx = next((Path(d) / 'scripts/cbx_voice.py' for d in skills if d and (Path(d) / 'scripts/cbx_voice.py').exists()), None)
if not cbx: raise SystemExit('scripts/cbx_voice.py not found: set FACELESS_SKILL to the faceless-shorts skill folder')
py = os.environ.get('CBX_PY', '/root/cbx/bin/python')
subprocess.run([py, str(cbx), str(P), str(ex), str(tempo)], check=True)

pauses = {i: float(l.get('pause', 0)) for i, l in enumerate(S['lines']) if float(l.get('pause', 0)) > 0}
if pauses:
    import numpy as np
    wav, lj = P / 'data/narration.wav', P / 'data/lines.json'
    sr = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', str(wav)],
                            capture_output=True, text=True, check=True).stdout)
    a = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', str(wav), '-f', 'f32le', '-ac', '1', '-'], capture_output=True, check=True).stdout, dtype=np.float32)
    L = json.loads(lj.read_text())
    for i in sorted(pauses, reverse=True):                    # from the end, so earlier indices stay valid
        cut = int(L['lines'][i]['start'] * sr); a = np.concatenate([a[:cut], np.zeros(int(pauses[i] * sr), np.float32), a[cut:]])
        for ln in L['lines'][i:]: ln['start'] = round(ln['start'] + pauses[i], 3); ln['end'] = round(ln['end'] + pauses[i], 3)
    L['duration'] = round(len(a) / sr, 3)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', str(wav)], input=a.tobytes(), check=True)
    lj.write_text(json.dumps(L, indent=1))
    print(f"pauses before lines {sorted(pauses)}: +{sum(pauses.values()):.2f} s -> {L['duration']:.2f} s")
print(f'voice: Chatterbox tempo {tempo}, exaggeration {ex}')
