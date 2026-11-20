#!/usr/bin/env python3
"""gta-commentary (Kratos Playz only): gameplay background from the Drive bg_pool + Fair Use image cards + word-synced captions, one ffmpeg pass.
  python3 render_commentary.py next                        STANDARD or COMMENTARY for the next gta video (strict alternation, see due())
  python3 render_commentary.py pool add <drive_file_id> <local_file> [name]   register a downloaded Bg_pool clip with its exact ffprobe duration
  python3 render_commentary.py pool list
  python3 render_commentary.py pick <seconds>                 random segment of the pool for a voiceover of that length, no repeats inside a lap, then recycles forever (reserves it in used.json)
  python3 render_commentary.py asset <proj> <name> --src "IGN" (--url U | --page ARTICLE_URL | --file F)   add a credited image to <proj>/assets/
  python3 render_commentary.py render <proj>                  <proj>/renders/out.mp4 from script.json + data/words.json + data/narration.wav + bg/<file>
  python3 render_commentary.py sheet <proj>                contact sheet of the render -> <proj>/review/sheet.png (read it for QA)
  python3 render_commentary.py --test                         self-check (synthetic video, voice and image; no network)
script.json: {"lines":[{"text":..}], "bg":{"name":"clip.mp4","start":12.5,"len":31.0,"cx":0.5,"file_id":".."}, "music":"hype"|"audio/x.mp3"|"none",
  "popups":[{"at":"word","kind":"image","img":"assets/a.jpg","label":"LEAKED?","mark":{"circle":[0.5,0.4,0.12],"arrow":[0.7,0.3]},"dur":2.6},
            {"at":"word","kind":"text","text":"110 MILLION","sub":"PRE-ORDERS"}]}    (marks are fractions of the image; the credit comes from assets/credits.json)
Background footage (owner, 20 Nov 2026): ONLY the owner's own non-copyright gameplay clips from the Drive folder Bg_pool, registered in pool.json via `pool add`;
render refuses any other background. Stolen/ripped videos and copyrighted music stay banned (CLAUDE.md).
shortcut: popups fade in and slide up (no scale pop); the beat has no pop SFX; the 105% zoom is a fixed crop, not a slow push. Upgrade when the pilot shows it matters."""
import json, random, re, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
POOL, USED = REPO / 'shorts-out/gta-commentary/pool.json', REPO / 'shorts-out/gta-commentary/used.json'
MIXPY = REPO / '.claude/skills/faceless-shorts/styles/comic-pop/example/tools/mix.py'
SPEED, ZOOM, W, H, FPS = 1.1, 1.05, 1080, 1920, 30
SEG_MIN, SEG_MAX, MARGIN = 27.5, 38.5, 1.0            # source seconds: 25-35 s on screen at 1.1x
BOLD = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
norm = lambda w: re.sub(r'[^a-z0-9]+', '', w.lower())

# ---------------- pool slicer (infinite loop over the registered clips) ----------------
VARY = 2.0        # a new lap should not start within this many seconds of where the previous lap used the same clip

def _free(dur, L, ranges):
    """Allowed start offsets [lo, hi] for an L-second segment of a dur-second clip that keep MARGIN away from every used range."""
    iv = [(0.0, dur - L)]
    for a, b in ranges:
        iv = [x for lo, hi in iv for x in ((lo, min(hi, a - L - MARGIN)), (max(lo, b + MARGIN), hi))]
    return [x for x in iv if x[1] - x[0] >= 0.05] if ranges else iv

def _draw(iv, rng):
    t = rng.uniform(0, sum(hi - lo for lo, hi in iv))
    for lo, hi in iv:
        if t <= hi - lo: return round(lo + t, 2)
        t -= hi - lo
    return round(iv[-1][1], 2)

def pick(dur, pool=None, used=None, rng=random, reserve=True, used_file=None):
    """Segment of a pool clip covering `dur` output seconds at 1.1x, never overlapping a range used in the current lap (1 s margin).
    When every clip is used up the history is recycled (a new lap, `_cycle` + 1) and picking starts again, preferring a start offset
    at least VARY s away from the previous lap's. New clips added with `pool add` are free at once and join the current lap.
    used.json = {clip_id: [[start, end], ...], "_cycle": laps_done, "_prev": {clip_id: last start}}."""
    uf = used_file or USED
    pool = json.loads(POOL.read_text()) if pool is None else pool
    used = (json.loads(uf.read_text()) if uf.exists() else {}) if used is None else used
    if not pool: raise SystemExit(f'{POOL} is empty: add clips with `render_commentary.py pool add <drive_id> <file>`')
    L = round(min(SEG_MAX, max(SEG_MIN, dur * SPEED + 0.4)), 2)
    if dur * SPEED > SEG_MAX: raise SystemExit(f'voiceover {dur:.1f}s needs a {dur*SPEED:.1f}s source, max segment is {SEG_MAX}s: shorten the script')
    clips = [c for c in pool if c['dur'] >= L]
    if not clips: raise SystemExit(f'no pool clip is {L}s or longer: shorten the script or add a longer clip')
    for lap in (0, 1):
        opts = []
        for c in clips:
            iv = _free(c['dur'], L, used.get(c['id'], [])); p = used.get('_prev', {}).get(c['id'])
            if p is not None and iv:
                far = [x for lo, hi in iv for x in ((lo, min(hi, p - VARY)), (max(lo, p + VARY), hi)) if x[1] - x[0] >= 0.05]
                iv = far or iv
            if iv: opts.append((c, iv))
        if opts: break
        last = {i: v[-1][0] for i, v in used.items() if not i.startswith('_') and v}   # every clip used: start a new lap
        for i in [i for i in used if not i.startswith('_')]: del used[i]
        used['_prev'] = {**used.get('_prev', {}), **last}; used['_cycle'] = used.get('_cycle', 0) + 1
    c, iv = rng.choices(opts, weights=[max(0.01, sum(hi - lo for lo, hi in i)) for _, i in opts])[0]
    s = _draw(iv, rng)
    if reserve:
        used.setdefault(c['id'], []).append([s, round(s + L, 2)]); uf.parent.mkdir(parents=True, exist_ok=True); uf.write_text(json.dumps(used, indent=1))
    return {'file_id': c['id'], 'name': c['name'], 'start': s, 'len': L, 'lap': used.get('_cycle', 0) + 1}

# ---------------- assets (credited stills) ----------------
def fetch(url, out):
    r = subprocess.run(['curl', '-fsSL', '--max-time', '30', '--max-filesize', '25000000', '-A', 'Mozilla/5.0', '-o', str(out), url], capture_output=True, text=True)
    if r.returncode: raise SystemExit(f'download failed: {r.stderr.strip()[:200]}')

def og_image(page):
    t = Path(tempfile.mkdtemp()) / 'p.html'; fetch(page, t); html = t.read_text(errors='ignore')
    m = re.search(r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+content=["\']([^"\']+)', html) or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image', html)
    if not m: raise SystemExit('no og:image on that page: pass the image with --url')
    return m.group(1).replace('&amp;', '&')

def add_asset(proj, name, src, url=None, page=None, file=None):
    if not src.strip(): raise SystemExit('--src is required: every image card shows its source')
    A = Path(proj) / 'assets'; A.mkdir(exist_ok=True); out = A / f'{name}.jpg'
    if file: im = Image.open(file)
    else:
        url = url or og_image(page); tmp = A / f'_{name}.dl'; fetch(url, tmp); im = Image.open(tmp)
    im.verify()
    im = Image.open(file or tmp).convert('RGB')
    if min(im.size) < 400: raise SystemExit(f'image too small {im.size}: find a bigger one')
    im.thumbnail((2000, 2000)); im.save(out, quality=90)
    if not file: tmp.unlink()
    cr = A / 'credits.json'; d = json.loads(cr.read_text()) if cr.exists() else {}
    d[f'assets/{name}.jpg'] = {'src': src, 'url': url or page or str(file)}; cr.write_text(json.dumps(d, indent=1)); return out

# ---------------- popup timing ----------------
def popup_times(popups, words, total):
    """Start each popup at the first spoken word matching its `at`, searching forward from the previous popup; ends before the next one."""
    ws = [(norm(w['w']), w['s']) for w in words]; i = 0; out = []
    for p in popups:
        key = norm(p['at'])
        j = next((k for k in range(i, len(ws)) if ws[k][0] == key), None)
        if j is None: raise SystemExit(f"popup at '{p['at']}': word not found in the voiceover after the previous popup")
        out.append(dict(p, t=ws[j][1])); i = j + 1
    for k, p in enumerate(out):
        nxt = out[k + 1]['t'] - 0.12 if k + 1 < len(out) else total - 0.3
        p['d'] = round(max(0.8, min(p.get('dur', 2.6), nxt - p['t'])), 2)
    return out

# ---------------- cards (Pillow) ----------------
def font(n): return ImageFont.truetype(BOLD, n)

def card_image(p, proj, credits):
    CW = 940; S = 2                       # draw at 2x, shrink: smooth edges
    if p['kind'] == 'text':
        im = Image.new('RGBA', (CW * S, 380 * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, CW * S - 1, 380 * S - 1], 40 * S, fill=(12, 12, 20, 235), outline=(255, 230, 0, 255), width=8 * S)
        t = p['text'].upper(); fs = 150 * S
        while d.textlength(t, font=font(fs)) > (CW - 80) * S: fs -= 6 * S
        d.text((CW * S / 2, 170 * S), t, font=font(fs), fill=(255, 230, 0), anchor='mm', stroke_width=4 * S, stroke_fill=(0, 0, 0))
        if p.get('sub'): d.text((CW * S / 2, 300 * S), p['sub'].upper(), font=font(64 * S), fill=(255, 255, 255), anchor='mm')
        return im.resize((CW, 380), Image.LANCZOS)
    path = Path(proj) / p['img']
    if not path.exists(): raise SystemExit(f"popup image missing: {p['img']}")
    src = (credits.get(p['img']) or {}).get('src')
    if not src: raise SystemExit(f"{p['img']} has no credit in assets/credits.json: add it with the asset command (--src)")
    IW, IH, PAD, BAR = CW - 40, 560, 20, 70
    img = Image.open(path).convert('RGB'); r = max(IW / img.width, IH / img.height)
    img = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    ox, oy = (img.width - IW) // 2, (img.height - IH) // 2; img = img.crop((ox, oy, ox + IW, oy + IH)).resize((IW * S, IH * S), Image.LANCZOS)
    dd = ImageDraw.Draw(img); m = p.get('mark') or {}
    if 'circle' in m:
        cx, cy, rr = m['circle']; dd.ellipse([(cx - rr) * IW * S, (cy - rr * IW / IH) * IH * S, (cx + rr) * IW * S, (cy + rr * IW / IH) * IH * S], outline=(255, 30, 30), width=10 * S)
    if 'arrow' in m:                      # arrow from the lower right toward the point
        ax, ay = m['arrow'][0] * IW * S, m['arrow'][1] * IH * S; bx, by = ax + 220 * S, ay + 170 * S
        dd.line([bx, by, ax + 18 * S, ay + 14 * S], fill=(255, 30, 30), width=16 * S)
        dd.polygon([(ax, ay), (ax + 70 * S, ay + 18 * S), (ax + 18 * S, ay + 72 * S)], fill=(255, 30, 30))
    th = IH + 2 * PAD + BAR + (60 if p.get('label') else 0); top = 60 if p.get('label') else 0
    im = Image.new('RGBA', (CW * S, th * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, CW * S - 1, th * S - 1], 32 * S, fill=(255, 255, 255, 250))
    if p.get('label'):
        d.rounded_rectangle([0, 0, CW * S - 1, 90 * S], 32 * S, fill=(220, 20, 20, 255)); d.rectangle([0, 50 * S, CW * S - 1, 90 * S], fill=(220, 20, 20, 255))
        d.text((CW * S / 2, 34 * S), p['label'].upper(), font=font(46 * S), fill=(255, 255, 255), anchor='mm')
    im.paste(img, (PAD * S, (top + PAD) * S))
    d.text((CW * S / 2, (top + PAD * 2 + IH + BAR / 2 - 6) * S), f'SOURCE: {src}'.upper()[:60], font=font(34 * S), fill=(60, 60, 60), anchor='mm')
    return im.resize((CW, th), Image.LANCZOS)

# ---------------- captions (ASS, word highlight) ----------------
def ass_time(t): return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'

def make_ass(words, total):
    ch, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= 3 or re.search(r'[.?!,]$', w['w']): ch.append(cur); cur = []
    if cur: ch.append(cur)
    hdr = (f'[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\n\n[V4+ Styles]\n'
           'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n'
           'Style: C,Liberation Sans,104,&H0000E6FF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,9,3,5,40,40,0,1\n\n'
           '[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n')
    ev = []
    for k, c in enumerate(ch):
        s = c[0]['s']; e = ch[k + 1][0]['s'] if k + 1 < len(ch) and ch[k + 1][0]['s'] - c[-1]['e'] < 0.4 else c[-1]['e'] + 0.15
        txt = ''.join(f"{{\\k{max(1, round(((c[i + 1]['s'] if i + 1 < len(c) else c[i]['e']) - w['s']) * 100))}}}{w['w'].upper()} " for i, w in enumerate(c)).strip()
        ev.append(f"Dialogue: 0,{ass_time(s)},{ass_time(min(e, total))},C,,0,0,0,,{{\\an5\\pos({W // 2},1180)}}{txt}")
    return hdr + '\n'.join(ev) + '\n'

# ---------------- audio ----------------
def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode: raise SystemExit(f'{cmd[0]} failed:\n{r.stderr[-1500:]}')
    return r

def bgm_path(P, S, total):
    m = S.get('music', 'hype')
    if m == 'none': return None
    if m not in ('bed', 'hype', 'neon', 'tension'): return P / m              # owner-supplied royalty-free track
    T = P / 'data/_bgm'; (T / 'data').mkdir(parents=True, exist_ok=True)     # procedural beat from mix.py (numpy, no samples), no voice, no SFX
    (T / 'script.json').write_text(json.dumps({'music': m})); (T / 'data/cues.json').write_text(json.dumps({'duration': total, 'cues': []}))
    run([sys.executable, str(MIXPY), str(T)]); return T / 'data/mix.wav'

# ---------------- render ----------------
def render(proj, out='renders/out.mp4', pool=None):
    P = Path(proj).resolve(); S = json.loads((P / 'script.json').read_text())   # ffmpeg runs with cwd=P, so P must be absolute
    words = json.loads((P / 'data/words.json').read_text()); total = json.loads((P / 'data/lines.json').read_text())['duration']
    bg = S['bg']; seg = P / 'bg' / bg['name']
    ids = {e['id'] for e in (json.loads(POOL.read_text()) if pool is None else pool)}
    if bg.get('file_id') not in ids: raise SystemExit(f"background {bg.get('name')} is not a registered owner Bg_pool clip (pool.json): only the owner's own clips are allowed as background")
    if not seg.exists(): raise SystemExit(f'{seg} missing: download it from Drive bg_pool/ first')
    if bg['len'] < total * SPEED - 0.05: raise SystemExit(f"segment {bg['len']}s is shorter than the voiceover needs ({total*SPEED:.1f}s): run pick again with {total:.2f}")
    credits = json.loads((P / 'assets/credits.json').read_text()) if (P / 'assets/credits.json').exists() else {}
    pops = popup_times(S.get('popups', []), words, total)
    gaps = [b['t'] - a['t'] for a, b in zip(pops, pops[1:])]
    if pops and (pops[0]['t'] > 4 or (gaps and max(gaps) > 4)): print('warning: popups are more than ~3-4 s apart; add one for the quiet stretch')
    (P / 'data/popups').mkdir(parents=True, exist_ok=True); (P / 'renders').mkdir(exist_ok=True)
    (P / 'data/caps.ass').write_text(make_ass(words, total))
    inputs = ['-ss', str(bg['start']), '-t', str(bg['len']), '-i', str(seg), '-i', 'data/narration.wav']
    bgm = bgm_path(P, S, total)
    if bgm: inputs += ['-i', str(bgm)]
    ai = 2 if bgm else None; ni = 3 if bgm else 2
    cx = bg.get('cx', 0.5); f = [f"[0:v]setpts=PTS/{SPEED},fps={FPS},scale=-2:{round(H * ZOOM)},crop={W}:{H}:(in_w-{W})*{cx}:(in_h-{H})/2,setsar=1[v0]"]
    for k, p in enumerate(pops):
        png = P / f'data/popups/p{k}.png'; card_image(p, P, credits).save(png)
        inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(p['d']), '-i', str(png)]
        i = ni + k; y = 170 if p['kind'] == 'image' else 330
        f.append(f"[{i}:v]format=rgba,fade=t=in:st=0:d=0.18:alpha=1,fade=t=out:st={p['d'] - 0.18}:d=0.18:alpha=1,setpts=PTS+{p['t']}/TB[c{k}]")
        f.append(f"[v{k}][c{k}]overlay=x=(W-w)/2:y='{y}+70*pow(max(0,1-(t-{p['t']})/0.2),2)':enable='between(t,{p['t']},{p['t'] + p['d']})':eof_action=pass[v{k + 1}]")
    f.append(f"[v{len(pops)}]ass=data/caps.ass[vout]")
    f.append(f"[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[vo]")
    if bgm:   # music bed at -28 LUFS: 12 dB under the voice, no ducking needed
        f.append(f"[{ai}:a]aloop=loop=-1:size=2147483647,atrim=duration={total},loudnorm=I=-28:TP=-3:LRA=7[bm]"); f.append("[vo][bm]amix=inputs=2:normalize=0:duration=first[aout]")
    else: f.append("[vo]anull[aout]")
    (P / 'data/graph.txt').write_text(';\n'.join(f))
    run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex_script', 'data/graph.txt', '-map', '[vout]', '-map', '[aout]', '-t', str(total),
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], cwd=P)
    print(f'{P / out} ({total:.1f}s, {len(pops)} popups)'); return P / out

# ---------------- pool registration (owner's Bg_pool clips only) ----------------
def probe_duration(path):
    d = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', str(path)]).stdout)
    if not d.get('streams'): raise SystemExit(f'{path} has no video stream')
    return round(float(d['format']['duration']), 2), d['streams'][0]['width'], d['streams'][0]['height']

def pool_add(file_id, path, name=None, pool_file=None):
    pf = pool_file or POOL; pool = json.loads(pf.read_text()) if pf.exists() else []
    dur, w, h = probe_duration(path)
    if dur < SEG_MIN + 1: raise SystemExit(f'{path} is only {dur}s: a segment needs {SEG_MIN}s+')
    entry = {'id': file_id, 'name': name or Path(path).name, 'dur': dur, 'size': f'{w}x{h}', 'source': 'owner Bg_pool (non-copyright, owner-provided)'}
    pool = [e for e in pool if e['id'] != file_id] + [entry]; pf.parent.mkdir(parents=True, exist_ok=True); pf.write_text(json.dumps(pool, indent=1)); return entry

# ---------------- alternation (gta only, parallel to pick_style.py which is untouched) ----------------
PERF = REPO / 'shorts-out/perf.csv'

def due(rows):
    """STANDARD, COMMENTARY, STANDARD, ... by the style of the last gta perf row (a row is added at every upload). No history: STANDARD first."""
    gta = [r for r in rows if r['channel'] == 'gta']
    return 'STANDARD' if not gta or gta[-1]['style'] == 'gta-commentary' else 'COMMENTARY'

def next_track(rows=None, pool=None):
    import csv
    rows = list(csv.DictReader(PERF.open())) if rows is None else rows
    pool = (json.loads(POOL.read_text()) if POOL.exists() else []) if pool is None else pool
    want = due(rows)
    if want == 'COMMENTARY':
        if not [c for c in pool if c['dur'] >= SEG_MIN]: return 'STANDARD', 'commentary is due but pool.json has no usable clip: fallback'
        return 'COMMENTARY', f'due (the last gta video was a standard one); the pool loops forever, {len(pool)} clip(s). Next: reach Drive Bg_pool and download the clip; any failure there = STANDARD'
    return 'STANDARD', 'due (first video, or the last gta video was a commentary one)'

def sheet(proj, every=2.5):
    P = Path(proj).resolve(); (P / 'review').mkdir(exist_ok=True); o = P / 'review/sheet.png'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(P / 'renders/out.mp4'), '-vf', f'fps=1/{every},scale=216:384,tile=5x3:padding=4:color=black', '-frames:v', '1', str(o)])
    print(o); return o

# ---------------- self-check ----------------
def _test():
    import random as R, tempfile, shutil
    pool = [{'id': 'a', 'name': 'a.mp4', 'dur': 100.0}, {'id': 'b', 'name': 'b.mp4', 'dur': 60.0}]; used = {}; seen = []
    for _ in range(3):                                  # 3 non-overlapping segments out of 160 s of footage
        s = pick(29.0, pool, used, R.Random(len(seen)), reserve=False); s0, L = s['start'], s['len']
        assert SEG_MIN <= L <= SEG_MAX and L >= 29.0 * SPEED, s
        assert all(not (s0 < b + MARGIN and a < s0 + L + MARGIN) for i, a, b in [(x['file_id'], *x['r']) for x in seen] if i == s['file_id']), s
        used.setdefault(s['file_id'], []).append([s0, s0 + L]); seen.append(dict(s, r=(s0, s0 + L)))
    try: pick(36.0, pool, {}, reserve=False); raise AssertionError('over-long voiceover must be refused')
    except SystemExit: pass
    import random as R2
    uf = Path(tempfile.mkdtemp()) / 'used.json'; P2 = [{'id': 'a', 'name': 'a.mp4', 'dur': 40.0}, {'id': 'b', 'name': 'b.mp4', 'dur': 38.2}]   # one segment per clip
    laps = {}; starts = {}
    for n in range(12):                                                  # 12 picks from 2 clips: must never raise, must recycle
        r = pick(26.0, P2, None, R2.Random(n), used_file=uf); laps.setdefault(r['lap'], []).append(r['file_id']); starts.setdefault(r['file_id'], []).append(r['start'])
    assert len(laps) == 6 and all(sorted(v) == ['a', 'b'] for v in laps.values()), laps          # each lap uses every clip exactly once
    assert json.loads(uf.read_text())['_cycle'] == 5
    for i, v in starts.items(): assert all(abs(x - y) >= VARY - 0.01 for x, y in zip(v, v[1:])), (i, v)    # a new lap starts elsewhere in the clip
    u3 = {}; [pick(26.0, P2, u3, R2.Random(n), used_file=uf) for n in range(2)]
    fresh = {'id': 'c', 'name': 'c.mp4', 'dur': 40.0}                    # a clip added later joins the lap in progress, no recycle yet
    r = pick(26.0, P2 + [fresh], u3, R2.Random(9), used_file=uf); assert r['file_id'] == 'c' and u3.get('_cycle', 0) == 0, (r, u3)
    assert next_track([{'channel': 'gta', 'style': 'comic-pop'}], P2)[0] == 'COMMENTARY' and next_track([{'channel': 'gta', 'style': 'comic-pop'}], [])[0] == 'STANDARD'
    assert next_track([{'channel': 'gta', 'style': 'gta-commentary'}], P2)[0] == 'STANDARD', 'strict alternation, the pool never changes it'
    ws = [{'w': w, 's': i * 0.4, 'e': i * 0.4 + 0.3} for i, w in enumerate('Rockstar just dropped a leak about Vice City and it is huge'.split())]
    pt = popup_times([{'at': 'leak', 'kind': 'text', 'text': 'x'}, {'at': 'huge', 'kind': 'text', 'text': 'y'}], ws, 5.0)
    assert pt[0]['t'] == 1.6 and pt[1]['t'] == 4.4 and pt[0]['d'] <= 2.7, pt
    assert '{\\k' in make_ass(ws, 5.0) and 'ROCKSTAR' in make_ass(ws, 5.0)
    T = Path(tempfile.mkdtemp()); (T / 'data').mkdir(); (T / 'bg').mkdir()
    run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=12', '-pix_fmt', 'yuv420p', str(T / 'bg/t.mp4')])
    run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=6', str(T / 'data/narration.wav')])
    Image.new('RGB', (1200, 700), (40, 90, 160)).save(T / 'shot.jpg'); add_asset(T, 'shot', 'TEST OUTLET', file=T / 'shot.jpg')
    (T / 'data/words.json').write_text(json.dumps(ws)); (T / 'data/lines.json').write_text(json.dumps({'duration': 5.0}))
    PL = [{'id': 'tid', 'name': 't.mp4', 'dur': 12.0}]
    (T / 'script.json').write_text(json.dumps({'bg': {'file_id': 'tid', 'name': 't.mp4', 'start': 1.0, 'len': 6.0}, 'music': 'hype', 'popups': [
        {'at': 'leak', 'kind': 'image', 'img': 'assets/shot.jpg', 'label': 'LEAKED?', 'mark': {'circle': [0.5, 0.5, 0.1], 'arrow': [0.7, 0.3]}}, {'at': 'huge', 'kind': 'text', 'text': 'HUGE', 'sub': 'test'}]}))
    try: render(T, pool=[{'id': 'other'}]); raise AssertionError('an unregistered background must be refused')
    except SystemExit as e: assert 'not a registered' in str(e)
    o = render(T, pool=PL)
    d = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height,codec_type:format=duration', '-of', 'json', str(o)]).stdout)
    assert [s['codec_type'] for s in d['streams']] == ['video', 'audio'] and (d['streams'][0]['width'], d['streams'][0]['height']) == (W, H) and abs(float(d['format']['duration']) - 5.0) < 0.2, d
    assert sheet(T).exists()
    clip = T / 'bg/long.mp4'; pf = T / 'pool.json'
    run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=10:d=30', '-pix_fmt', 'yuv420p', str(clip)])
    e = pool_add('tid', clip, pool_file=pf); assert abs(e['dur'] - 30.0) < 0.2 and e['size'] == '320x180', e     # exact ffprobe duration, not an estimate
    try: pool_add('short', T / 'bg/t.mp4', pool_file=pf); raise AssertionError('a clip shorter than one segment must be refused')
    except SystemExit: pass
    pool_add('tid', clip, pool_file=pf); assert len(json.loads(pf.read_text())) == 1, 'same id is replaced, not duplicated'
    try: pool_add('x', T / 'data/narration.wav', pool_file=pf); raise AssertionError('audio-only file must be refused')
    except SystemExit: pass
    mk = lambda *st: [{'channel': 'gta', 'style': x} for x in st]
    assert due([]) == 'STANDARD' and due(mk('comic-pop')) == 'COMMENTARY' and due(mk('comic-pop', 'gta-commentary')) == 'STANDARD' and due(mk('gta-commentary', 'neon-versus')) == 'COMMENTARY'
    assert due([{'channel': 'solo', 'style': 'gta-commentary'}] + mk('comic-pop')) == 'COMMENTARY', 'solo rows never count'
    shutil.rmtree(T); print('render_commentary.py: self-check OK')

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--test']: _test()
    elif a[:1] == ['pool'] and a[1:2] == ['add']: print(json.dumps(pool_add(a[2], a[3], a[4] if len(a) > 4 else None)))
    elif a[:1] == ['pool'] and a[1:2] == ['list']: [print(f"{e['id']}  {e['dur']}s  {e['size']}  {e['name']}") for e in json.loads(POOL.read_text())] or print('pool.json is empty')
    elif a[:1] == ['next']: t, why = next_track(); print(f'{t}\n{why}')
    elif a[:1] == ['sheet']: sheet(a[1])
    elif a[:1] == ['pick']: print(json.dumps(pick(float(a[1]))))
    elif a[:1] == ['render']: render(a[1])
    elif a[:1] == ['asset']:
        o = {a[i]: a[i + 1] for i in range(3, len(a) - 1, 2)}
        print(add_asset(a[1], a[2], o.get('--src', ''), o.get('--url'), o.get('--page'), o.get('--file')))
    else: sys.exit(__doc__)
