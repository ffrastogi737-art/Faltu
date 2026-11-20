#!/usr/bin/env python3
"""gta-commentary (Kratos Playz only): gameplay background from the Drive Bg_pool + animated Fair Use image cards + karaoke captions + SFX, one ffmpeg pass.
  python3 render_commentary.py next                        STANDARD or COMMENTARY for the next gta video (strict alternation, see due())
  python3 render_commentary.py pool add <drive_file_id> <local_file> [name]   register a downloaded Bg_pool clip with its exact ffprobe duration
  python3 render_commentary.py pool list
  python3 render_commentary.py pick <seconds>                 random segment of the pool for a voiceover of that length, no repeats inside a lap, then recycles forever (reserves it in used.json)
  python3 render_commentary.py asset <proj> <name> --src "IGN" (--url U | --page ARTICLE_URL | --file F)   add a credited image to <proj>/assets/
  python3 render_commentary.py render <proj>                  <proj>/renders/out.mp4 from script.json + data/words.json + data/narration.wav + bg/<file>
  python3 render_commentary.py sheet <proj>                contact sheet (one frame per card) -> <proj>/review/sheet.png (read it for QA)
  python3 render_commentary.py --test                         self-check (synthetic video, voice and images; no network)
script.json: {"lead":0.15,"gap":0.12,"outro":0.7,"lines":[{"text":..}],"bg":{"file_id":..,"name":"clip.mp4","start":12.5,"len":31.0,"cx":0.5},"music":"hype"|"audio/x.mp3"|"none",
 "popups": one card per beat (1.8-2.5 s apart). EVERY card shows a real image (or the poll graphic); a text-only card is refused. Order: hook first, poll last.
   {"at":0,"kind":"hook","img":"assets/a.jpg","badge":"FAN THEORY","banner":"HIDDEN MAP?","sub":"IN GTA ONLINE","stamp":"UNCONFIRMED","mark":{"circle":[fx,fy,fr],"arrow":[fx,fy]}}
   {"at":"word","kind":"compare","title":"CLUE VS MAP","left":{"img":..,"label":..,"circle":[fx,fy,fr]},"right":{"img":..,"label":..,"circle":[fx,fy,fr]}}
   {"at":"word","kind":"proof","img":..,"tag":"FAN THEORY","text":"OUR OWN CAPTION","crop":[x0,y0,x1,y1],"hl":[[fx,fy,fw,fh]],"arrows":[[fx,fy]]}
   {"at":"word","kind":"image","img":..,"label":"LEONIDA?","mark":{..}}      {"at":"word","kind":"poll","question":"DOES IT MATCH?","sub":"TELL US BELOW"}
 (marks/crops are fractions of the image; the SOURCE line comes from assets/credits.json; `dur` overrides a card's length)
Look: cards pop in 0.82x -> 1.0x in 120 ms with a drop shadow, images Ken-Burns 1.0x -> 1.08x, the background is dimmed 17 % with a vignette while cards show,
captions are 2-3 white words (lower-centre, MarginV 600) with the spoken word in #FFE600 at 112 %. Audio: voice -16 LUFS (>= 150 ms lead-in), beat -28 LUFS,
whoosh/pop/thud SFX (mix.py, unmodified) at about -19 dBFS on every card.
Background footage (owner, 20 Nov 2026): ONLY the owner's own non-copyright gameplay clips from the Drive folder Bg_pool, registered in pool.json via `pool add`;
render refuses any other background. Stolen/ripped videos and copyrighted music stay banned (CLAUDE.md).
shortcut: the 105% zoom is a fixed crop, not a slow push; card text is not word-synced, only the card start is. Upgrade when the pilot shows it matters."""
import json, math, random, re, shutil, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

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
KINDS = ('hook', 'compare', 'proof', 'image', 'poll')

def popup_times(popups, words, total):
    """Start each card at the first spoken word matching its `at` (a number = seconds, used for the 0.0 s hook), searching forward from the previous card.
    A card stays until the next one starts (+0.08 s so the next pop covers its fade); the poll card runs to the end."""
    ws = [(norm(w['w']), w['s']) for w in words]; i = 0; out = []
    for p in popups:
        if isinstance(p['at'], (int, float)): out.append(dict(p, t=float(p['at']))); continue
        key = norm(p['at'])
        j = next((k for k in range(i, len(ws)) if ws[k][0] == key), None)
        if j is None: raise SystemExit(f"popup at '{p['at']}': word not found in the voiceover after the previous popup")
        out.append(dict(p, t=ws[j][1])); i = j + 1
    for k, p in enumerate(out):
        last = k + 1 == len(out); end = total - 0.25 if last else out[k + 1]['t'] + 0.08
        p['d'] = round(max(1.0, min(p.get('dur', 4.0 if last else 2.9), end - p['t'])), 2)
    return out

def check_popups(pops):
    """Hard rules: every beat is a real visual (no text-only box), hook first at 0.0 s, poll last."""
    if not pops: raise SystemExit('popups[] is empty: a commentary video needs a hook card first and a poll card last')
    for p in pops:
        if p['kind'] not in KINDS: raise SystemExit(f"popup kind '{p['kind']}' is not allowed (use {'/'.join(KINDS)}): text-only cards are banned, every beat needs a real visual")
    if pops[0]['kind'] != 'hook' or pops[0]['t'] > 0.3: raise SystemExit('the first card must be kind "hook" at 0.0 s ("at": 0)')
    if pops[-1]['kind'] != 'poll': raise SystemExit('the last card must be kind "poll" (open question + YES/NO boxes)')
    for k, (a, b) in enumerate(zip(pops, pops[1:])):
        if not 1.4 <= b['t'] - a['t'] <= 3.0: print(f"warning: beat {k + 1} is {b['t'] - a['t']:.1f} s long (aim for 1.8-2.5 s per card)")

# ---------------- cards (Pillow): the 4 layouts of the reference storyboard, animated frame by frame ----------------
CW, S = 1080, 2                                   # card canvas width; static layers are drawn at 2x and shrunk (smooth edges)
YEL, RED, WHT, INK = (255, 230, 0), (230, 30, 30), (255, 255, 255), (14, 14, 24)
POP_T, POP_FROM, KB_TO = 0.12, 0.82, 1.08         # pop-in seconds, start scale, Ken Burns end zoom
Y0 = {'hook': 150, 'compare': 230, 'proof': 150, 'image': 190, 'poll': 270}    # top of each card on the 1080x1920 frame: above the caption zone, clear of the Shorts UI

def font(n): return ImageFont.truetype(BOLD, int(n))
def _canvas(h): big = Image.new('RGBA', (CW * S, h * S), (0, 0, 0, 0)); return big, ImageDraw.Draw(big)
def _rr(d, box, r, fill=None, outline=None, width=0): d.rounded_rectangle([v * S for v in box], r * S, fill=fill, outline=outline, width=width * S)
def _text(d, xy, t, size, fill=WHT, stroke=0): d.text((xy[0] * S, xy[1] * S), t, font=font(size * S), fill=fill, anchor='mm', stroke_width=stroke * S, stroke_fill=(0, 0, 0))
_M = ImageDraw.Draw(Image.new('L', (1, 1)))
def _fit(t, maxw, size, lo=30):
    while size > lo and _M.textlength(t, font=font(size)) > maxw: size -= 4
    return size
def _wrap(t, maxw, size):
    lines, cur = [], ''
    for w in t.split():
        if cur and _M.textlength(f'{cur} {w}', font=font(size)) > maxw: lines.append(cur); cur = w
        else: cur = f'{cur} {w}'.strip()
    return lines + [cur] if cur else lines
def _shadow(big, box, r, blur=22, off=16, a=170):
    sh = Image.new('RGBA', big.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([box[0] * S, (box[1] + off) * S, box[2] * S, (box[3] + off) * S], r * S, fill=(0, 0, 0, a))
    big.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur * S)))
def _pill(big, d, cx, y0, y1, text, fill, tcol, size):
    w = _M.textlength(text, font=font(size)) + 70; box = (cx - w / 2, y0, cx + w / 2, y1)
    _shadow(big, box, (y1 - y0) / 2, 10, 6, 140); _rr(d, box, (y1 - y0) / 2, fill=fill); _text(d, (cx, (y0 + y1) / 2 - 2), text, size, tcol)
def _arrow(d, a, b, wd=15, bend=0):
    pts = [a, b] if not bend else [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * (a[0] + b[0]) / 2 + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * ((a[1] + b[1]) / 2 - bend) + t * t * b[1]) for t in [i / 24 for i in range(25)]]
    d.line([(x * S, y * S) for x, y in pts], fill=RED, width=wd * S, joint='curve')
    (x1, y1), (x2, y2) = pts[-2], pts[-1]; ang = math.atan2(y2 - y1, x2 - x1); L = 64
    d.polygon([(x2 * S, y2 * S)] + [((x2 - L * math.cos(ang + s)) * S, (y2 - L * math.sin(ang + s)) * S) for s in (-0.45, 0.45)], fill=RED)
def _marks(d, slot, m):
    x, y, w, h = slot
    if 'circle' in m: fx, fy, fr = m['circle']; cx, cy, r = x + fx * w, y + fy * h, fr * w; d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], outline=RED, width=10 * S)
    if 'arrow' in m: ax, ay = x + m['arrow'][0] * w, y + m['arrow'][1] * h; _arrow(d, (ax + 210, ay + 150), (ax, ay))
def _slot(im, box, rad, crop=None):
    x, y, w, h = box; m = Image.new('L', (w * S, h * S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w * S - 1, h * S - 1], rad * S, fill=255)
    return {'x': x, 'y': y, 'w': w, 'h': h, 'img': im, 'crop': crop or (0, 0, 1, 1), 'mask': m.resize((w, h), Image.LANCZOS)}
def _card(big, mk, slots, tilt=0.0, hl=()):
    return {'base': big.resize((CW, big.height // S), Image.LANCZOS), 'marks': mk.resize((CW, mk.height // S), Image.LANCZOS), 'slots': slots, 'tilt': tilt, 'hl': list(hl)}

def _load(proj, rel, credits):
    path = Path(proj) / rel
    if not path.exists(): raise SystemExit(f'popup image missing: {rel}')
    src = (credits.get(rel) or {}).get('src')
    if not src: raise SystemExit(f'{rel} has no credit in assets/credits.json: add it with the asset command (--src)')
    im = Image.open(path).convert('RGB'); im.thumbnail((1800, 1800)); return im, src

def _build(p, proj, credits):
    k = p['kind']
    if k == 'hook':
        im, src = _load(proj, p['img'], credits); ch = 960; big, d = _canvas(ch); mk, md = _canvas(ch)
        fr = (70, 330, 1010, 930); _shadow(big, fr, 34); _rr(d, fr, 34, fill=WHT); _text(d, (540, 893), f'SOURCE: {src}'.upper()[:60], 30, (70, 70, 70))
        bn = p.get('banner', '').upper(); b = (50, 60, 1030, 215); _shadow(big, b, 30); _rr(d, b, 30, fill=YEL, outline=(0, 0, 0), width=5); _text(d, (540, 138), bn, _fit(bn, 920, 128), (0, 0, 0))
        if p.get('sub'): sb = (110, 205, 970, 295); _shadow(big, sb, 24, 12, 8); _rr(d, sb, 24, fill=(8, 8, 8)); _text(d, (540, 252), p['sub'].upper(), _fit(p['sub'].upper(), 800, 58))
        if p.get('badge'): _pill(big, d, 540, 14, 74, p['badge'].upper(), RED, WHT, 38)
        if p.get('stamp'):
            sz = _fit(p['stamp'].upper(), 860, 124); st = Image.new('RGBA', (900 * S, 230 * S), (0, 0, 0, 0))
            ImageDraw.Draw(st).text((450 * S, 115 * S), p['stamp'].upper(), font=font(sz * S), fill=RED, anchor='mm', stroke_width=7 * S, stroke_fill=WHT)
            mk.alpha_composite(st.rotate(7, expand=True, resample=Image.BICUBIC), (70 * S, 590 * S))
        slot = (90, 350, 900, 500); _marks(md, slot, p.get('mark') or {})
        return _card(big, mk, [_slot(im, slot, 26, p.get('crop'))], -2.0)
    if k == 'compare':
        L, R = p['left'], p['right']; (li, ls), (ri, rs) = _load(proj, L['img'], credits), _load(proj, R['img'], credits)
        ch = 780; big, d = _canvas(ch); mk, md = _canvas(ch); box = (40, 70, 1040, 740)
        _shadow(big, box, 40); _rr(d, box, 40, fill=INK + (245,), outline=WHT, width=4)
        sl, sr = (80, 150, 420, 420), (580, 150, 420, 420)
        for s in (sl, sr): _rr(d, (s[0] - 6, s[1] - 6, s[0] + s[2] + 6, s[1] + s[3] + 6), 28, fill=WHT)
        for s, q in ((sl, L), (sr, R)): lb = q.get('label', '').upper(); _text(d, (s[0] + s[2] / 2, 608), lb, _fit(lb, 400, 44))
        _text(d, (540, 700), ('SOURCES: ' + ' / '.join(dict.fromkeys([ls, rs]))).upper()[:70], 26, (160, 160, 170))
        tt = p.get('title', '').upper(); _pill(big, d, 540, 28, 112, tt, YEL, (0, 0, 0), _fit(tt, 780, 50))
        for s, q in ((sl, L), (sr, R)): _marks(md, s, {'circle': q['circle']} if 'circle' in q else {})
        a = (sl[0] + L['circle'][0] * sl[2] + L['circle'][2] * sl[2], sl[1] + L['circle'][1] * sl[3]) if 'circle' in L else (sl[0] + sl[2] * 0.8, sl[1] + sl[3] * 0.5)
        b = (sr[0] + R['circle'][0] * sr[2] - R['circle'][2] * sr[2], sr[1] + R['circle'][1] * sr[3]) if 'circle' in R else (sr[0] - 12, sr[1] + sr[3] * 0.5)
        _arrow(md, a, b, bend=100)
        return _card(big, mk, [_slot(li, sl, 22, L.get('crop')), _slot(ri, sr, 22, R.get('crop'))])
    if k == 'proof':
        im, src = _load(proj, p['img'], credits); ch = 960; big, d = _canvas(ch); mk, md = _canvas(ch); card = (90, 120, 990, 900)
        _shadow(big, card, 40); _rr(d, card, 40, fill=WHT); slot = (130, 190, 820, 440)
        tag = p.get('tag', 'FAN THEORY').upper(); _pill(big, d, 300, 72, 150, tag, YEL, (0, 0, 0), 44)
        sc = f'SOURCE: {src}'.upper()[:26]; _pill(big, d, 760, 72, 150, sc, INK, WHT, 36)
        cap = p.get('text', '').upper(); sz = 58
        for i, ln in enumerate(_wrap(cap, 820, sz)[:2]): _text(d, (540, 706 + i * 72), ln, sz, (10, 10, 10))
        for ar in p.get('arrows', []): _marks(md, slot, {'arrow': ar})
        hl = [(slot[0] + fx * slot[2], slot[1] + fy * slot[3], fw * slot[2], fh * slot[3]) for fx, fy, fw, fh in p.get('hl', [])]
        return _card(big, mk, [_slot(im, slot, 24, p.get('crop'))], -3.5, hl)
    if k == 'image':
        im, src = _load(proj, p['img'], credits); lab = bool(p.get('label')); ch = 860; big, d = _canvas(ch); mk, md = _canvas(ch); box = (60, 60, 1020, 800)
        _shadow(big, box, 34); _rr(d, box, 34, fill=WHT)
        if lab: _rr(d, (60, 60, 1020, 150), 34, fill=RED); d.rectangle([60 * S, 110 * S, 1020 * S - 1, 150 * S], fill=RED); _text(d, (540, 104), p['label'].upper(), _fit(p['label'].upper(), 860, 50))
        slot = (90, 170 if lab else 90, 900, 520); _text(d, (540, slot[1] + 560), f'SOURCE: {src}'.upper()[:60], 32, (60, 60, 60)); _marks(md, slot, p.get('mark') or {})
        return _card(big, mk, [_slot(im, slot, 22, p.get('crop'))])
    ch = 840; big, d = _canvas(ch); mk, md = _canvas(ch); box = (60, 40, 1020, 340)             # poll
    _shadow(big, box, 38); _rr(d, box, 38, fill=INK + (240,), outline=RED, width=8)
    q = p['question'].upper(); sz = _fit(q, 860, 112); ls = _wrap(q, 860, sz)[:2]
    for i, ln in enumerate(ls): _text(d, (540, 130 + i * (sz + 8) - (sz // 2 if len(ls) > 1 else 0)), ln, sz, YEL, 4)
    if p.get('sub'): _text(d, (540, 290), p['sub'].upper(), 56)
    for cx, yes in ((340, True), (740, False)):
        col = (46, 200, 90) if yes else (230, 40, 40); bx = (cx - 140, 500, cx + 140, 770)
        _shadow(big, (cx - 80, 405, cx + 80, 560), 18, 8, 6, 120); _rr(d, (cx - 80, 405, cx + 80, 560), 18, fill=WHT)           # ballot paper
        pts = [(cx - 40, 480), (cx - 10, 515), (cx + 45, 430)] if yes else None
        if yes: d.line([(x * S, y * S) for x, y in pts], fill=col, width=16 * S, joint='curve')
        else: d.line([(cx - 38) * S, 428 * S, (cx + 38) * S, 510 * S], fill=col, width=16 * S); d.line([(cx + 38) * S, 428 * S, (cx - 38) * S, 510 * S], fill=col, width=16 * S)
        _shadow(big, bx, 26); _rr(d, bx, 26, fill=(196, 210, 232), outline=(60, 70, 95), width=6); _rr(d, (cx - 95, 525, cx + 95, 552), 12, fill=(40, 45, 60))
        _text(d, (cx, 668), 'YES' if yes else 'NO', 118, col, 6)
    for a, b in (((40, 380), (120, 450)), ((1040, 380), (960, 450)), ((60, 800), (140, 740)), ((1020, 800), (940, 740))):
        d.line([a[0] * S, a[1] * S, b[0] * S, b[1] * S], fill=WHT, width=12 * S); ang = math.atan2(b[1] - a[1], b[0] - a[0])
        d.polygon([(b[0] * S, b[1] * S)] + [((b[0] - 46 * math.cos(ang + s)) * S, (b[1] - 46 * math.sin(ang + s)) * S) for s in (-0.5, 0.5)], fill=WHT)
    return _card(big, mk, [])

def _kb(img, crop, w, h, z):
    """Cover-fit the crop window to w:h, then zoom in by z around its centre (float box = sub-pixel smooth)."""
    X0, Y0_, X1, Y1 = crop[0] * img.width, crop[1] * img.height, crop[2] * img.width, crop[3] * img.height
    cw, chh = X1 - X0, Y1 - Y0_
    if cw / chh > w / h: nw, nh = chh * w / h, chh
    else: nw, nh = cw, cw * h / w
    nw, nh = nw / z, nh / z; cx, cy = (X0 + X1) / 2, (Y0_ + Y1) / 2
    return img.resize((w, h), Image.BILINEAR, box=(cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2))

def card_frame(c, u, d):
    im = c['base'].copy(); z = 1 + (KB_TO - 1) * min(1.0, u / d)
    for s in c['slots']: im.paste(_kb(s['img'], s['crop'], s['w'], s['h'], z), (s['x'], s['y']), s['mask'])
    im.alpha_composite(c['marks'])
    for x, y, w, h in c['hl']:                                      # yellow highlighter strokes draw on over 0.5 s
        k = min(1.0, max(0.0, (u - 0.15) / 0.5))
        if k > 0: tmp = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(tmp).rectangle([x, y, x + w * k, y + h], fill=(255, 230, 0, 120)); im.alpha_composite(tmp)
    if c['tilt']: im = im.rotate(c['tilt'], resample=Image.BICUBIC)
    s = POP_FROM + (1 - POP_FROM) * (1 - (1 - min(1.0, u / POP_T)) ** 3)       # ease-out pop 0.82x -> 1.0x
    if s < 0.999:
        sm = im.resize((round(im.width * s), round(im.height * s)), Image.BILINEAR); out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.paste(sm, ((im.width - sm.width) // 2, (im.height - sm.height) // 2)); im = out
    a = min(1.0, u / 0.06) * min(1.0, max(0.0, (d - u) / 0.10))
    if a < 1: im.putalpha(im.getchannel('A').point(lambda v: int(v * a)))
    return im

def render_cards(pops, P, credits):
    """Writes data/popups/p<k>_%03d.png (RGBA frames at 30 fps) for every card; returns the card dicts."""
    out = P / 'data/popups'; shutil.rmtree(out, ignore_errors=True); out.mkdir(parents=True)
    for k, p in enumerate(pops):
        c = _build(p, P, credits); n = max(1, round(p['d'] * FPS)); p['y'] = Y0[p['kind']]
        for i in range(n): card_frame(c, i / FPS, p['d']).save(out / f'p{k}_{i:03d}.png', compress_level=1)
        p['frames'] = n

def dim_png(path):
    """Full-frame black layer: 17 % everywhere + a vignette toward the corners (alpha only), so bright gameplay never washes out the cards."""
    import numpy as np
    y, x = np.mgrid[0:H, 0:W]; r = np.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) / 1.414
    arr = np.zeros((H, W, 4), np.uint8); arr[..., 3] = ((0.17 + 0.28 * np.clip((r - 0.35) / 0.65, 0, 1) ** 2) * 255).astype(np.uint8)
    Image.fromarray(arr, 'RGBA').save(path)

# ---------------- captions (ASS, karaoke) ----------------
def ass_time(t): return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'

def make_ass(words, total):
    """2-3 heavy white words at a time, lower-centre (MarginV 600 = clear of the Shorts/Reels buttons); only the spoken word is #FFE600 at 112 %."""
    ch, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= 3 or re.search(r'[.?!]$', w['w']) or (len(cur) >= 2 and w['w'].endswith(',')): ch.append(cur); cur = []
    if cur: ch.append(cur)
    hdr = (f'[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\n\n[V4+ Styles]\n'
           'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n'
           'Style: C,Liberation Sans,100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,1,10,5,2,40,40,600,1\n\n'
           '[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n')
    ev = []
    for k, c in enumerate(ch):
        gap_ok = k + 1 < len(ch) and ch[k + 1][0]['s'] - c[-1]['e'] < 0.4
        end = ch[k + 1][0]['s'] if gap_ok else c[-1]['e'] + 0.15
        for i, w in enumerate(c):
            s = w['s']; e = c[i + 1]['s'] if i + 1 < len(c) else end
            txt = ' '.join(('{\\c&H0000E6FF&\\fscx112\\fscy112}' + x['w'].upper() + '{\\r}') if j == i else x['w'].upper() for j, x in enumerate(c))
            ev.append(f"Dialogue: 0,{ass_time(s)},{ass_time(min(max(e, s + 0.05), total))},C,,0,0,0,,{txt}")
    return hdr + '\n'.join(ev) + '\n'

# ---------------- audio ----------------
def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode: raise SystemExit(f'{cmd[0]} failed:\n{r.stderr[-1500:]}')
    return r

def _mix(P, sub, script, cues, total):
    """Run the UNMODIFIED shared mix.py in a scratch folder (no voice): returns its data/mix.wav (peak -1 dBFS)."""
    T = P / 'data' / sub; (T / 'data').mkdir(parents=True, exist_ok=True)
    (T / 'script.json').write_text(json.dumps(script)); (T / 'data/cues.json').write_text(json.dumps({'duration': total, 'cues': cues}))
    run([sys.executable, str(MIXPY), str(T)]); return T / 'data/mix.wav'

def bgm_path(P, S, total):
    m = S.get('music', 'hype')
    if m == 'none': return None
    if m not in ('bed', 'hype', 'neon', 'tension'): return P / m              # owner-supplied royalty-free track
    return _mix(P, '_bgm', {'music': m}, [], total)                            # procedural beat from mix.py (numpy, no samples)

def sfx_cues(pops):
    """whoosh + pop on every card entrance, a thud on the hook (0.0 s) and the poll."""
    cues = []
    for p in pops:
        cues += [{'t': round(max(0.0, p['t'] - 0.04), 3), 'type': 'whoosh'}, {'t': round(p['t'] + 0.10, 3), 'type': 'pop'}]
        if p['kind'] in ('hook', 'poll'): cues.append({'t': round(p['t'] + 0.02, 3), 'type': 'thud'})
    return cues

# ---------------- render ----------------
LEAD = 0.15        # seconds of clean audio before the first spoken word (the 0.0 s opening syllable is never clipped)

def render(proj, out='renders/out.mp4', pool=None):
    P = Path(proj).resolve(); S = json.loads((P / 'script.json').read_text())   # ffmpeg runs with cwd=P, so P must be absolute
    words = json.loads((P / 'data/words.json').read_text()); total = json.loads((P / 'data/lines.json').read_text())['duration']
    bg = S['bg']; seg = P / 'bg' / bg['name']
    ids = {e['id'] for e in (json.loads(POOL.read_text()) if pool is None else pool)}
    if bg.get('file_id') not in ids: raise SystemExit(f"background {bg.get('name')} is not a registered owner Bg_pool clip (pool.json): only the owner's own clips are allowed as background")
    if not seg.exists(): raise SystemExit(f'{seg} missing: download it from Drive Bg_pool first')
    pad = max(0.0, LEAD - words[0]['s'])                                          # lead-in: shift everything, delay the voice
    if pad: words = [dict(w, s=round(w['s'] + pad, 3), e=round(w['e'] + pad, 3)) for w in words]; total = round(total + pad, 3)
    if bg['len'] < total * SPEED - 0.05: raise SystemExit(f"segment {bg['len']}s is shorter than the voiceover needs ({total*SPEED:.1f}s): run pick again with {total:.2f}")
    credits = json.loads((P / 'assets/credits.json').read_text()) if (P / 'assets/credits.json').exists() else {}
    pops = popup_times(S.get('popups', []), words, total); check_popups(pops)
    (P / 'renders').mkdir(exist_ok=True); (P / 'data/caps.ass').write_text(make_ass(words, total)); render_cards(pops, P, credits); dim_png(P / 'data/dim.png')
    (P / 'data/beats.json').write_text(json.dumps([{'t': p['t'], 'd': p['d'], 'kind': p['kind']} for p in pops]))
    t0, t1 = pops[0]['t'], min(total, pops[-1]['t'] + pops[-1]['d'])
    inputs = ['-ss', str(bg['start']), '-t', str(bg['len']), '-i', str(seg), '-i', 'data/narration.wav',
              '-loop', '1', '-framerate', str(FPS), '-t', str(round(t1 - t0, 2)), '-i', 'data/dim.png']
    n = 3; bgm = bgm_path(P, S, total); sfx = _mix(P, '_sfx', {'music': 'none'}, sfx_cues(pops), total)
    ai = si = None
    if bgm: inputs += ['-i', str(bgm)]; ai = n; n += 1
    inputs += ['-i', str(sfx)]; si = n; n += 1
    cx = bg.get('cx', 0.5); f = [f"[0:v]setpts=PTS/{SPEED},fps={FPS},scale=-2:{round(H * ZOOM)},crop={W}:{H}:(in_w-{W})*{cx}:(in_h-{H})/2,setsar=1[v0]",
                                 f"[2:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st={round(t1 - t0 - 0.2, 2)}:d=0.2:alpha=1,setpts=PTS+{t0}/TB[dm]",
                                 "[v0][dm]overlay=0:0:eof_action=pass[vd0]"]
    for k, p in enumerate(pops):
        inputs += ['-framerate', str(FPS), '-i', f'data/popups/p{k}_%03d.png']; i = n + k
        f.append(f"[{i}:v]format=rgba,setpts=PTS+{p['t']}/TB[c{k}]")
        f.append(f"[vd{k}][c{k}]overlay=x=(W-w)/2:y={p['y']}:enable='between(t,{p['t']},{round(p['t'] + p['d'], 2)})':eof_action=pass[vd{k + 1}]")
    f.append(f"[vd{len(pops)}]ass=data/caps.ass[vout]")
    f.append(f"[1:a]{'adelay=' + str(round(pad * 1000)) + '|' + str(round(pad * 1000)) + ',' if pad else ''}apad,atrim=duration={total},loudnorm=I=-16:TP=-1.5:LRA=11[vo]")
    mix_in = ['[vo]']
    if bgm: f.append(f"[{ai}:a]aloop=loop=-1:size=2147483647,atrim=duration={total},loudnorm=I=-28:TP=-3:LRA=7[bm]"); mix_in.append('[bm]')   # beat -28 LUFS: 12 dB under the voice
    f.append(f"[{si}:a]atrim=duration={total},volume=-18dB[sx]"); mix_in.append('[sx]')                                                   # mix.py peaks at -1 dBFS: SFX at about -19 dBFS
    f.append(f"{''.join(mix_in)}amix=inputs={len(mix_in)}:normalize=0:duration=first[aout]")
    (P / 'data/graph.txt').write_text(';\n'.join(f))
    run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex_script', 'data/graph.txt', '-map', '[vout]', '-map', '[aout]', '-t', str(total),
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], cwd=P)
    shutil.rmtree(P / 'data/popups', ignore_errors=True)                           # ~100 MB of card frames, not needed once rendered
    print(f'{P / out} ({total:.1f}s, {len(pops)} cards)'); return P / out

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
    """Contact sheet for QA: one frame per card (shown at its fullest) when data/beats.json exists, otherwise every `every` seconds."""
    P = Path(proj).resolve(); (P / 'review').mkdir(exist_ok=True); o = P / 'review/sheet.png'; mp4 = P / 'renders/out.mp4'; bf = P / 'data/beats.json'
    if not bf.exists():
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(mp4), '-vf', f'fps=1/{every},scale=216:384,tile=5x3:padding=4:color=black', '-frames:v', '1', str(o)]); print(o); return o
    beats = json.loads(bf.read_text()); tw, th = 324, 576; cols = min(5, len(beats)); rows = -(-len(beats) // cols); T = Path(tempfile.mkdtemp())
    im = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 8) + 8), (0, 0, 0)); dr = ImageDraw.Draw(im)
    for i, b in enumerate(beats):
        t = b['t'] + min(0.9, b['d'] * 0.45); run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(mp4), '-frames:v', '1', '-vf', f'scale={tw}:{th}', str(T / f'{i}.png')])
        x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 8); im.paste(Image.open(T / f'{i}.png'), (x, y)); dr.text((x + 6, y + 4), f"{t:.1f}s {b['kind']}", font=ImageFont.truetype(BOLD, 22), fill=(255, 255, 0), stroke_width=2, stroke_fill=(0, 0, 0))
    im.save(o); shutil.rmtree(T); print(o); return o

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
    pt = popup_times([{'at': 0, 'kind': 'hook'}, {'at': 'leak', 'kind': 'image'}, {'at': 'huge', 'kind': 'poll'}], ws, 5.0)
    assert pt[0]['t'] == 0.0 and pt[1]['t'] == 1.6 and pt[2]['t'] == 4.4 and pt[1]['d'] <= 2.9 and pt[2]['d'] >= 1.0, pt
    ass = make_ass(ws, 5.0); assert 'fscx112' in ass and '&H0000E6FF&' in ass and ',2,40,40,600,1' in ass and 'ROCKSTAR' in ass, 'karaoke: yellow 112 % word, MarginV 600'
    for bad, why in (([{'at': 0, 'kind': 'text', 'text': 'x'}], 'text-only card'), ([{'at': 'leak', 'kind': 'hook'}, {'at': 'huge', 'kind': 'poll'}], 'hook not at 0.0 s'), ([{'at': 0, 'kind': 'hook'}, {'at': 'huge', 'kind': 'image'}], 'no poll last')):
        try: check_popups(popup_times(bad, ws, 5.0)); raise AssertionError(why + ' must be refused')
        except SystemExit: pass
    T = Path(tempfile.mkdtemp()); (T / 'data').mkdir(); (T / 'bg').mkdir()
    run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=12', '-pix_fmt', 'yuv420p', str(T / 'bg/t.mp4')])
    run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=6', str(T / 'data/narration.wav')])
    import numpy as np
    Image.fromarray(np.random.RandomState(3).randint(0, 255, (700, 1200, 3), dtype=np.uint8)).save(T / 'shot.jpg'); add_asset(T, 'shot', 'TEST OUTLET', file=T / 'shot.jpg')
    Image.new('RGB', (1200, 700), (40, 90, 160)).save(T / 'shot2.jpg'); add_asset(T, 'shot2', 'OTHER OUTLET', file=T / 'shot2.jpg')
    cr = json.loads((T / 'assets/credits.json').read_text()); K = {'at': 0, 'kind': 'hook', 'img': 'assets/shot.jpg', 'badge': 'TEST', 'banner': 'HOOK LINE', 'sub': 'SUB LINE', 'stamp': 'STAMP', 'mark': {'circle': [0.5, 0.5, 0.1], 'arrow': [0.7, 0.3]}}
    cards = [K, {'kind': 'compare', 'title': 'CLUE VS MAP', 'left': {'img': 'assets/shot.jpg', 'label': 'Clue', 'circle': [0.5, 0.5, 0.15]}, 'right': {'img': 'assets/shot2.jpg', 'label': 'Map', 'circle': [0.4, 0.4, 0.1]}},
             {'kind': 'proof', 'img': 'assets/shot2.jpg', 'text': 'zoom and crop it', 'hl': [[0.1, 0.2, 0.5, 0.15]], 'arrows': [[0.6, 0.5]]}, {'kind': 'image', 'img': 'assets/shot.jpg', 'label': 'LABEL', 'mark': {'circle': [0.5, 0.5, 0.1]}},
             {'kind': 'poll', 'question': 'Does it match the map?', 'sub': 'tell us below'}]
    ref = {}
    for c in cards:                                                      # all 4 layouts + the generic image card build and animate
        cd = _build(c, T, cr); f1, f2 = card_frame(cd, 0.03, 2.0), card_frame(cd, 0.5, 2.0); assert f1.size == f2.size == (CW, cd['base'].height) and f2.getchannel('A').getbbox(), c['kind']
        ref[c['kind']] = (f1.getchannel('A').getbbox(), f2.getchannel('A').getbbox())
    b1, b2 = ref['hook']; assert (b1[2] - b1[0]) < (b2[2] - b2[0]), 'card pops in: smaller at 30 ms than at full scale'
    im0 = Image.open(T / 'shot.jpg'); assert _kb(im0, (0, 0, 1, 1), 100, 100, 1.0).tobytes() != _kb(im0, (0, 0, 1, 1), 100, 100, 1.08).tobytes(), 'Ken Burns zooms'
    (T / 'data/words.json').write_text(json.dumps(ws)); (T / 'data/lines.json').write_text(json.dumps({'duration': 5.0}))
    PL = [{'id': 'tid', 'name': 't.mp4', 'dur': 12.0}]
    (T / 'script.json').write_text(json.dumps({'bg': {'file_id': 'tid', 'name': 't.mp4', 'start': 1.0, 'len': 6.0}, 'music': 'hype', 'popups': [
        K, dict(cards[1], at='dropped'), dict(cards[2], at='about'), dict(cards[4], at='huge')]}))
    try: render(T, pool=[{'id': 'other'}]); raise AssertionError('an unregistered background must be refused')
    except SystemExit as e: assert 'not a registered' in str(e)
    o = render(T, pool=PL)
    d = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height,codec_type:format=duration', '-of', 'json', str(o)]).stdout)
    assert [s['codec_type'] for s in d['streams']] == ['video', 'audio'] and (d['streams'][0]['width'], d['streams'][0]['height']) == (W, H) and abs(float(d['format']['duration']) - 5.15) < 0.1, d      # 5.0 s voice + the 150 ms lead-in
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
