"""Word timings WITHOUT Whisper: data/lines.json (from voice.py) + script.json -> data/words.json.
  scripts/py scripts/words_from_lines.py <project>
Each line's words are spread over the line's [start, end] by letter count (+ a pause after commas). Good enough for
captions that change every few words; use words.py when the Whisper model can be downloaded (exact word times)."""
import json, re, sys
from pathlib import Path
P = Path(sys.argv[1]); S = json.loads((P / 'script.json').read_text()); LN = json.loads((P / 'data/lines.json').read_text())['lines']
out = []
for i, ln in enumerate(LN):
    toks = S['lines'][i]['text'].split()
    wt = [len(re.sub(r'[^A-Za-z0-9]', '', w)) + 2.5 + (3 if w.endswith(',') else 0) + (5 if re.search(r'[.?!:]$', w) else 0) for w in toks]
    tot, t = sum(wt), ln['start']; span = ln['end'] - ln['start']
    for w, k in zip(toks, wt):
        d = span * k / tot; out.append({'w': w, 'line': i, 's': round(t, 3), 'e': round(t + d * 0.9, 3)}); t += d
(P / 'data/words.json').write_text(json.dumps(out, indent=1)); print(f'{len(out)} words -> data/words.json')
