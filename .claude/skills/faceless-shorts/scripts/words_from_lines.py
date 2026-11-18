"""Fallback when Whisper cannot download: estimate data/words.json from data/lines.json (exact line times from voice.py).
usage: python3 words_from_lines.py <project>   (captions can drift by a fraction of a second inside long lines)"""
import json, re, sys
from pathlib import Path
P = Path(sys.argv[1]); d = json.loads((P / 'data/lines.json').read_text()); out = []
for ln in d['lines']:
    ws = ln['text'].split(); wt = [max(2, len(re.sub(r'[^A-Za-z0-9]', '', w))) + (4 if re.search(r'[,.:?!]$', w) else 0) for w in ws]
    t, span, tot = ln['start'], ln['end'] - ln['start'], sum(wt)
    for w, x in zip(ws, wt):
        e = t + span * x / tot; out.append({'w': w, 'line': ln['i'], 's': round(t, 3), 'e': round(e, 3)}); t = e
(P / 'data/words.json').write_text(json.dumps(out)); print(len(out), 'words')
