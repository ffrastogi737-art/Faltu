#!/usr/bin/env python3
"""Story-first template matching (owner 20 Nov 2026) and the performance memory. Script first, template second; the tool ranks, the agent decides.
  python3 shorts-out/pick_style.py solo|gta kinds [kind]       topic planning BEFORE the script: saturated / unused topic kinds
  python3 shorts-out/pick_style.py solo|gta match script.json  rank ALL templates (local styles + every vertical id in STYLE-LIBRARY.md) for a finished script
  python3 shorts-out/pick_style.py solo|gta hooks [N]          titles and opening hooks of the best and worst counted videos
  python3 shorts-out/pick_style.py solo|gta postmortem         videos under 0.5x the channel median that still need a post-mortem line
  python3 shorts-out/pick_style.py solo|gta --verdicts         append automatic WIN/LOSE lines to style-verdicts.txt
  python3 shorts-out/pick_style.py --test                      self-check
Left as rules: a LOSE verdict blocks a style unless script.json names it ("demand": "<style>"). Repeating one of the last two styles
is only a soft penalty plus a SAMENESS RISK note.
gta STANDARD runs only (owner 21 Nov 2026; solo is untouched): a style used in the last 3 STANDARD runs cannot win (while 2+ alternatives are left);
every 3rd STANDARD run is an EXPLORE run (the highest-scoring UNPORTED template is built, or a new custom one if no library id fits); a style with 5+ counted
videos gets +1 instead of +2 for being proven. Commentary and react rows are other tracks, so they never count as STANDARD runs. A perf.csv row counts when it has a real view count and video id, is public by now
(IST) and its views were measured after it went public; skipped rows are printed with the reason.
shortcut: script features are keyword counts, not a language model; the agent reads the ranking and overrides it when the story says so."""
import re, sys, pathlib, csv, json, collections, statistics as st, datetime as dt
D = pathlib.Path(__file__).parent
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
LOCAL = {'chalk-talk', 'comic-pop', 'deep-dive', 'inside-out', 'neon-versus', 'night-file', 'paper-atlas', 'stick-story', 'tall-tale',
         'myth-or-fact', 'comic-panels'}
PORTED = {'myth-or-fact', 'comic-panels'}  # library ids rebuilt as local styles (20 Nov 2026); more via port_style.sh
KINDS = ['body-science', 'history', 'weird-jobs', 'mystery', 'survival', 'funny-story', 'space-scale', 'money-stats', 'animals-nature', 'places',
         'psychology-myth', 'tech-invention', 'skit-karma', 'gaming-news', 'gaming-versus', 'gaming-list', 'gaming-guide', 'gaming-reaction']
# Template catalog: what each template is good at, in the same words the script analysis produces ('3d' = slow render, many minutes).
TAGS = {}
for _line in '''chalk-talk: body science question calm
comic-pop: list news versus stat gaming myth quiz fast funny
deep-dive: body science whatif calm 3d
inside-out: body science whatif question
neon-versus: gaming versus news dark
night-file: mystery dark story calm 3d
paper-atlas: history places story calm
stick-story: steps whatif story funny
tall-tale: story skit funny dialogue 3d
myth-or-fact: myth question quiz fast science gaming news
comic-panels: skit funny story dialogue steps fast
clay-diorama: story animals places 3d
bio-glow: body science animals 3d
cosmic-scale: space stat science 3d
exploded-view: tech science steps 3d
low-poly-atlas: places history stat 3d
size-lineup: stat versus list 3d
data-city: stat data 3d
glass-icons: tech list 3d
iso-cutaway: body science tech 3d
globe-arcs: places stat news 3d
physics-toybox: science whatif funny 3d
deep-layers: science whatif 3d
synth-grid: gaming dark tech 3d
product-turntable: tech list 3d
paper-craft: story history calm
marker-board: science steps animals question calm
blueprint: tech science steps calm
zine-collage: funny story list animals
parchment-map: history places story
timeline-rail: history list stat steps
isotype: stat data list
evidence-board: mystery story question
storybook: story history animals calm
pixel-quest: gaming list funny story
terminal: tech list dark
swiss-grid: stat data news calm
math-canvas: science stat steps
tactics-board: gaming versus steps
market-tape: stat news data
quiz-countdown: quiz list question gaming fast
top-5-countdown: list gaming fast stat
tier-list: list versus gaming fast
chat-story: story skit funny dialogue
versus-split: versus gaming list stat
recipe-steps: steps list
quote-cinema: quote story calm
breaking-desk: news gaming fast
podcast-clip: quote dialogue calm
punch-captions: fast funny quote
karaoke-subs: quote fast
callout-kit: tech steps list
lower-thirds: news quote
headline-backdrop: news story
stack-split: versus list
sticker-pop: funny list fast
glitch-pack: gaming dark fast tech
doc-cinema: history mystery story calm
vhs-camcorder: mystery story dark funny
shadow-puppets: mystery story history dark
visual-novel: story dialogue skit
rubber-hose-reel: skit funny story fast
woodcut-tale: history story dark calm
neon-line: gaming dark list'''.splitlines():
    _k, _v = _line.split(':', 1); TAGS[_k.strip()] = set(_v.split())

def library_ids():
    """Every vertical id listed in STYLE-LIBRARY.md ('All 62 ids', 720x1280 block); the 16:9 ones are not for Shorts."""
    m = re.search(r'720x1280:(.*?)\n\s*\n', (D / 'STYLE-LIBRARY.md').read_text(), re.S)
    return set(re.findall(r'\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*\b', m.group(1))) if m else set()

def catalog():
    return LOCAL | library_ids()

def now_ist():
    return dt.datetime.now(IST).replace(tzinfo=None)

def perf_rows(ch, now=None):
    """(counted rows, skipped reasons) for one channel. The clock decides what is public, no calendar cap."""
    now_s = (now or now_ist()).strftime('%Y-%m-%d %H:%M')
    ok, skipped = [], []
    for r in csv.DictReader((D / 'perf.csv').open()):
        if r['channel'] != ch: continue
        v, pub, chk = r['views'].strip(), r['public_ist'].strip(), r['checked'].strip()
        why = ('no video id yet' if r['video_id'].strip() == 'TBD' else
               'no view count' if not v.isdigit() else
               'not public yet' if pub and pub > now_s else
               'views measured before it went public, refresh it' if pub and chk and chk < pub[:10] else None)
        if why:
            skipped.append(f"{r['file']} ({why})"); continue
        ok.append({'style': r['style'], 'hour': pub[11:13], 'pub': pub, 'views': int(v), 'kind': r['kind'], 'file': r['file'],
                   'title': (r.get('title') or '').strip(), 'hook': (r.get('hook') or '').strip()})
    return ok, skipped

def entries(readme):
    out, cur = [], None
    for line in (D / readme).read_text().splitlines():
        m = re.match(r'## \S+ · `[^`]*` · (.*)', line)
        if m: cur = {'styles': {s for s in catalog() if re.search(r'(?<![\w-])%s(?![\w-])' % s, m.group(1).lower())}, 'title': ''}; out.append(cur)
        elif cur is not None and line.startswith('**Title:**') and not cur['title']: cur['title'] = line[10:].strip()
    return out

def verdict_hist():
    """(key, verdict) in file order; key is 'style' (both channels) or 'style@channel'."""
    h = []
    for l in (D / 'style-verdicts.txt').read_text().splitlines():
        p = l.split()
        if not l.startswith('#') and len(p) >= 2 and p[1] in ('WIN', 'OK', 'LOSE'): h.append((p[0], p[1]))
    return h

def pinned_keys():
    """Keys the owner pinned ('owner-pinned' in the line): automatic verdicts never change these."""
    return {l.split()[0] for l in (D / 'style-verdicts.txt').read_text().splitlines() if 'owner-pinned' in l and not l.startswith('#')}

def current(style, ch, hist):
    v = None
    for key, verdict in hist:
        if key in (style, f'{style}@{ch}'): v = verdict  # the last applicable line wins
    return v

def auto_verdicts(ch, ok, hist, today, pinned=()):
    """WIN if a style's median >= 1.5 x channel median, LOSE if < 0.3 x, with 2+ counted videos. Writes changes only."""
    med = st.median([r['views'] for r in ok]) if ok else 0
    by = {}
    for r in ok: by.setdefault(r['style'], []).append(r['views'])
    lines = []
    for style, vs in sorted(by.items()):
        if len(vs) < 2 or med == 0 or style in pinned or f'{style}@{ch}' in pinned: continue
        m = st.median(vs)
        v = 'WIN' if m >= 1.5 * med else 'LOSE' if m < 0.3 * med else 'OK'
        cur = current(style, ch, hist)
        if v == cur or (v == 'OK' and cur in (None, 'OK')): continue
        lines.append(f'{style}@{ch} {v} {today} auto: n={len(vs)} median {m:.0f} vs channel median {med:.0f}')
    return lines

# ---------- script analysis (mood, pacing, hook) ----------
PAT = {  # tag -> regex counted over the whole script; weight = hits capped at 3
    'myth': r'\bmyths?\b|\bfacts?\b|true or false|\bnot true\b|debunk|\bactually\b',
    'list': r'\b(number|tips?|habits?|types?|things|reasons|ways|first|second|third|fourth|fifth)\b|\b[1-9]\)',
    'steps': r'\bstep (one|two|three|four|1|2|3|4)\b|\bhow to\b|\bdo this\b',
    'versus': r'\bvs\.?\b|\bversus\b|\bcompared\b|better than|worse than|\bthan\b',
    'stat': r'\d|percent|million|billion|thousand|\b(twice|double)\b',
    'news': r'\b(reportedly|reports?|announced|confirmed|launch(ed)?|released?|reviews?|trailer|leaks?|patch)\b',
    'gaming': r'\b(gta|games?|rockstar|playstation|ps5|xbox|players?|console|fps|missions?|leonida)\b',
    'body': r'\b(body|brain|heart|blood|nerves?|skin|stomach|sneez\w*|muscles?|bones?|sleep|eyes?|ears?|fingers?|foot)\b',
    'science': r'\b(scientists?|stud(y|ies)|research|experiment|cells?|pressure|temperature|theory|nerve)\b',
    'whatif': r'\bwhat (if|happens|would)\b|\bimagine\b|\bwould you\b',
    'history': r'\b(1[0-9]{3}|century|ancient|war|emperor|king|empire|history|centuries)\b',
    'places': r'\b(country|city|island|border|capital|continent|town)\b',
    'mystery': r'\b(mystery|unsolved|disappeared|vanished|strange|nobody knows|never found|case)\b',
    'funny': r'\b(boss|friend|karma|prank|funny|slipped|clapping|dramatic|stole|fake|lol|awkward)\b',
    'dialogue': r'\b(said|says|asked|replied|shouted)\b|["“”]',
    'quote': r'["“][^"”]{12,}["”]',
    'tech': r'\b(phone|app|computer|ai|robot|machine|engine|battery|internet|software|charger)\b',
    'space': r'\b(space|planets?|galaxy|moon|universe|nasa)\b',
    'animals': r'\b(animals?|dog|cat|bird|fish|shark|bees?|ants?|snake|whale|lion|goldfish)\b',
}
PAST = r'\b\w+ed\b|\b(was|were|had|went|got|took|saw|came|made|ran|fell|stole|said)\b'

def hook_flags(t):
    t = t.lower().strip(); fl = []
    if '?' in t or re.match(r'(why|what|how|can|could|do|does|did|is|are|would|will|should)\b', t): fl.append('question')
    if re.search(r'\d', t): fl.append('number')
    if re.search(r"\b(you|your|you're)\b", t): fl.append('second-person')
    if re.search(r'\b(stole|never|just|worst|dramatic|killed|banned|hidden|secret|shock|lost|warn\w*|not)\b', t): fl.append('conflict-word')
    if len(t.split()) <= 10: fl.append('short')
    return fl

def features(texts, channel):
    """(tag weights, notes). Weights come from keyword hits, pacing from words per line, narration from past tense."""
    low = [t.lower() for t in texts]; allt = ' '.join(low); f = collections.Counter()
    for tag, pat in PAT.items():
        h = len(re.findall(pat, allt))
        if h: f[tag] = min(3, h if tag in ('myth', 'steps', 'whatif', 'mystery') else (h + 1) // 2)
    if 'question' in hook_flags(texts[0]): f['question'] += 2
    if allt.count('?') >= 2 or ('comment' in allt and '?' in allt): f['quiz'] += 1
    past = len(re.findall(PAST, allt)); f['story'] = min(3, past // 4)
    if f['story'] >= 2 and (f['funny'] or f['dialogue']): f['skit'] = 2 + (f['funny'] >= 2)
    if f['body']: f['science'] += 1
    avg = sum(len(t.split()) for t in texts) / len(texts)
    if avg <= 9.5 or (len(texts) >= 9 and avg <= 11): f['fast'] = 2
    elif avg >= 13: f['calm'] = 2
    if channel == 'gta': f['gaming'] += 2   # the GTA channel is a gaming channel: gaming-tagged templates get the home advantage
    return f, {'avg_words': round(avg, 1), 'lines': len(texts)}

GTA_NOT_STANDARD = {'gta-commentary', 'gta-react'}   # the 50/50 commentary track and the react format are not STANDARD runs
COOLDOWN = 3       # gta STANDARD: a style used in the last 3 STANDARD runs cannot win (only while 2+ alternatives are left)
EXPLORE_EVERY = 3  # gta STANDARD: the next run explores, then every 3rd one (15 done -> run 16, then 19, 22...)

def gta_standard_styles(channel):
    """Styles of the gta STANDARD runs in perf.csv, oldest first (empty for solo)."""
    if channel != 'gta': return []
    return [r['style'] for r in csv.DictReader((D / 'perf.csv').open()) if r['channel'] == 'gta' and r['style'] not in GTA_NOT_STANDARD]

def explore_due(std):
    """True when the next gta STANDARD run must explore: the count of STANDARD runs so far is a multiple of EXPLORE_EVERY."""
    return len(std) % EXPLORE_EVERY == 0

def apply_cooldown(res, std):
    """(ranking, recent set): styles of the last COOLDOWN STANDARD runs are dropped, unless fewer than 2 alternatives would remain."""
    recent = set(std[-COOLDOWN:]); alt = [r for r in res if r['style'] not in recent]
    return (alt, recent) if len(alt) >= 2 else (res, set())

def rank(f, channel, hist, ok, E, demand=None):
    """Pure ranking of the whole catalog for features f. Returns dicts sorted best first."""
    med = st.median([r['views'] for r in ok]) if ok else 0
    by = {}
    for r in ok: by.setdefault(r['style'], []).append(r['views'])
    used = collections.Counter(s for e in E for s in e['styles']); last2 = [e['styles'] for e in E[-2:]]
    out = []
    for s in sorted(catalog()):
        if current(s, channel, hist) == 'LOSE' and s != demand: continue          # the only hard block
        tags = TAGS.get(s, set()); hit = sorted(t for t in tags if f.get(t))
        sc = sum(f[t] for t in hit); why = list(hit)
        unported = s not in LOCAL and s not in PORTED
        if '3d' in tags: sc -= 1; why.append('3D slow render (-1)')
        if unported: sc -= 1.5; why.append('needs a port (-1.5)')
        vs = by.get(s, []); n, m = len(vs), (st.median(vs) if vs else 0)
        if n >= 2 and m >= 1.5 * med:
            bonus = 1 if channel == 'gta' and n >= 5 else 2     # gta decay (21 Nov): 5+ videos -> +1, so old hits stop monopolising
            sc += bonus; why.append(f'proven n={n} med={m:.0f} (+{bonus})')
        elif n == 1 and m >= 1.5 * med: sc += 1; why.append(f'one hit {m:.0f} (+1)')
        rep = sum(1 for x in last2 if s in x)
        if rep: sc -= rep; why.append(f'used in {rep} of the last 2 (-{rep}, soft)')
        if not used.get(s): sc += 0.3
        if s == demand: sc += 5; why.append('demanded by the script')
        out.append({'style': s, 'score': round(sc, 1), 'why': why, 'unported': unported, 'slow': '3d' in tags, 'repeat': bool(rep), 'n': n, 'med': m})
    return sorted(out, key=lambda r: (-r['score'], r['style']))

# ---------- solo 50/50: TALL-TALE <-> STANDARD (owner 21 Nov 2026). gta has its own rule (render_commentary.due); nothing here touches gta. ----------
TALL = 'tall-tale'
SOLO_STD_COOLDOWN = 3                                   # a STANDARD solo style used in the last 3 STANDARD uploads cannot win (if 2+ remain)
SOLO_SETTINGS = ['office', 'gym', 'school', 'street', 'friends']        # tall-tale settings, rotated
SOLO_CASTS = ['tony', 'lucy', 'hank', 'gus', 'rex', 'dee', 'max', 'pete', 'moe', 'nia', 'rookie', 'cop']   # the 12 characters of cast.js
TRACK_OVERRIDE = None                                   # --track standard|tall: dry-run only, prints "simulated"

def solo_uploads(rows):
    """solo rows that have a real video id (planned, not-yet-uploaded rows do not count)."""
    return [r for r in rows if r['channel'] == 'solo' and r['video_id'].strip() not in ('', 'TBD')]

def solo_track_next(rows):
    """The track of the next solo upload = the opposite of the track of the last solo upload. No history: TALL-TALE first."""
    ups = solo_uploads(rows)
    if not ups: return 'TALL-TALE'
    return 'STANDARD' if ups[-1]['style'] == TALL else 'TALL-TALE'

def solo_filter(res, track, rows):
    """(ranking, notes) for the solo track. TALL-TALE turn: only tall-tale. STANDARD turn: never tall-tale, and the last 3 STANDARD styles blocked."""
    if track == 'TALL-TALE':
        keep = [r for r in res if r['style'] == TALL]
        return (keep or res), ([] if keep else ['tall-tale is not in the ranking (LOSE or missing): the TALL-TALE turn cannot run; decide with the owner'])
    std = [r['style'] for r in solo_uploads(rows) if r['style'] != TALL]
    recent = set(std[-SOLO_STD_COOLDOWN:])
    alt = [r for r in res if r['style'] != TALL and r['style'] not in recent]
    if len(alt) >= 2: return alt, [f"COOLDOWN (solo STANDARD, last {SOLO_STD_COOLDOWN} uploads cannot win): {', '.join(sorted(recent))}"]
    return [r for r in res if r['style'] != TALL], ['cooldown skipped: fewer than 2 alternatives']

def tall_history():
    """settings and casts of the tall-tale videos already made: formats/*/shot_plan.json, plus #18 (office, built before shot plans)."""
    settings, casts = ['office'], []
    for f in sorted((D / 'formats').glob('*/shot_plan.json')):
        try:
            d = json.loads(f.read_text()); settings.append(d.get('setting', '')); casts += d.get('cast_keys', [])
        except Exception: pass
    return settings, casts

def tall_suggestion():
    """A fresh setting and cast for a TALL-TALE turn: not used by the last 2 tall-tale videos (rotation, no repeats)."""
    settings, casts = tall_history()
    setting = next((x for x in SOLO_SETTINGS if x not in settings[-2:]), SOLO_SETTINGS[0])
    recent = set(casts[-6:])
    cast = [c for c in SOLO_CASTS if c not in recent][:3] or SOLO_CASTS[:3]
    return setting, cast

def cmd_match(channel, path):
    script = json.load(open(path)); lines = script['lines']
    texts = [l['text'] if isinstance(l, dict) else str(l) for l in lines]
    f, info = features(texts, channel)
    ok, skipped = perf_rows(channel); hist = verdict_hist()
    E = entries('README.md' if channel == 'solo' else 'gta6-channel/README.md')
    if channel == 'solo': E = [e for e in E if 'gta' not in e['title'].lower()]
    res = rank(f, channel, hist, ok, E, script.get('demand'))
    std = gta_standard_styles(channel); recent = set()
    if channel == 'gta': res, recent = apply_cooldown(res, std)
    track = None
    if channel == 'solo':
        rows = list(csv.DictReader((D / 'perf.csv').open()))
        track = TRACK_OVERRIDE or solo_track_next(rows)
        res, solo_notes = solo_filter(res, track, rows)
    print(f"SCRIPT: {info['lines']} lines, {info['avg_words']} words/line ({'fast' if f['fast'] else 'calm' if f['calm'] else 'medium'} pacing)")
    print(f"HOOK: \"{texts[0]}\"  flags: {', '.join(hook_flags(texts[0])) or 'none'}")
    if channel == 'solo':
        print(f"TRACK (solo 50/50): {track}{'  (simulated with --track)' if TRACK_OVERRIDE else ''}")
        if track == 'TALL-TALE':
            setting, cast = tall_suggestion()
            print(f"  TALL-TALE turn: use the upgraded tall-tale template. Setting: {setting}. Cast: {', '.join(cast)} (not used by the last 2 tall-tale videos). Write shot_plan.json by hand.")
        for n in solo_notes: print('  ' + n)
    print('MOOD tags:', ', '.join(f'{t}={w}' for t, w in f.most_common() if w) or 'none')
    if channel == 'gta' and not re.search(PAT['gaming'], ' '.join(texts).lower()): print('!! gta channel: this script has no GTA / gaming content (topic focus is GTA 6 news, leaks, details, comparisons).')
    print(f"CATALOG: {len(res)} templates ranked ({len(LOCAL)} local styles + the library ids; LOSE-blocked ones are left out)")
    for r in res[:8]:
        tag = 'UNPORTED' if r['unported'] else ('slow 3D' if r['slow'] else 'ready')
        print(f"{r['score']:>5}  {r['style']:<17} {tag:<9} {'; '.join(r['why'])[:110]}")
    top = res[0]
    if len(res) > 1 and top['score'] - res[1]['score'] < 1: print(f"CLOSE CALL: {top['style']} vs {res[1]['style']}: decide on the hook and mood, not on the score.")
    if top['repeat']: print('SAMENESS RISK: the best match repeats a recent style. Allowed because it fits best: change the hook shape, the structure, the characters and the colours.')
    if top['unported']: print(f"PORT NEEDED: build it now, do not settle: bash .claude/skills/faceless-shorts/scripts/port_style.sh {top['style']} {'comic-pop' if not top['slow'] else '<3D base: see STYLE-LIBRARY.md, render_html.mjs>'}  (then edit shots.js, estimate.py + capture.mjs check, add to LOCAL and PORTED here).")
    if channel == 'gta':
        if recent: print(f"COOLDOWN (gta, last {COOLDOWN} STANDARD runs cannot win): {', '.join(sorted(recent))}")
        if explore_due(std):
            ex = [r for r in res if r['unported'] and r['score'] > 0]
            print('EXPLORE RUN (mandatory, gta STANDARD): ' + (f"build {ex[0]['style']} now (highest-scoring unported template that fits): bash .claude/skills/faceless-shorts/scripts/port_style.sh {ex[0]['style']} comic-pop, then add it to LOCAL and PORTED here." if ex else 'no library id fits: invent and build a NEW custom template on the comic-pop base (port_style.sh), log it as NEW STYLE.'))
        print('TOP3 for the README line: ' + ' | '.join(f"{r['style']} {r['score']}" for r in res[:3]))
    if skipped: print('perf rows not counted:', '; '.join(skipped[:6]))
    print('blocked (LOSE):', ', '.join(sorted(s for s in catalog() if current(s, channel, hist) == 'LOSE')) or '-')

def cmd_kinds(channel, want):
    kinds = [r['kind'] for r in csv.DictReader((D / 'perf.csv').open()) if r['channel'] == channel][-5:]
    print(f'channel={channel} last kinds={kinds}')
    if want and kinds.count(want) >= 3: print(f'!! TOPIC SATURATED: "{want}" is {kinds.count(want)} of the last {len(kinds)}. Pick another kind.')
    print('kinds not in the last 5:', ', '.join(k for k in KINDS if k not in kinds and k.startswith('gaming') == (channel == 'gta')))

def cmd_hooks(channel, n):
    ok, _ = perf_rows(channel); ok = [r for r in ok if r['title'] or r['hook']]
    ok.sort(key=lambda r: -r['views']); top, bot = ok[:n], ok[-3:] if len(ok) > n else []
    def show(tag, rs):
        for r in rs:
            print(f"{tag} {r['views']:>5}  {r['file']:<26} {r['style']:<12} h{r['hour'] or '--'}  title: {r['title'][:60]}  hook: {r['hook'][:70] or '(not stored)'}  [{', '.join(hook_flags(r['hook'])) if r['hook'] else ''}]")
    show('TOP', top); show('LOW', bot)
    def pat(rs):
        t = [r['title'].replace('#shorts', '').strip() for r in rs if r['title']]
        if not t: return 'no titles'
        q, num, wh = sum(x.endswith('?') for x in t), sum(bool(re.search(r'[0-9]', x)) for x in t), sum(x.lower().startswith(('why', 'how')) for x in t)
        return f'avg title len {sum(map(len, t)) / len(t):.0f}, question {q}/{len(t)}, number {num}/{len(t)}, starts Why/How {wh}/{len(t)}'
    print('title pattern TOP:', pat(top)); print('title pattern LOW:', pat(bot))

def cmd_postmortem(channel):
    ok, _ = perf_rows(channel); med = st.median([r['views'] for r in ok]) if ok else 0
    log = (D / 'discovery-log.txt').read_text(); cut = (now_ist() - dt.timedelta(hours=24)).strftime('%Y-%m-%d %H:%M')
    todo = [r for r in ok if r['views'] < 0.5 * med and f"POSTMORTEM {r['file']}" not in log and (not r['pub'] or r['pub'] <= cut)]
    todo.sort(key=lambda r: r['pub'], reverse=True)
    print(f'channel median {med:.0f}; below 0.5x = under {0.5 * med:.0f} views; {len(todo)} without a post-mortem (newest 5 shown)')
    for r in todo[:5]:
        print(f"{dt.date.today()} | POSTMORTEM {r['file']} | {r['views']} views vs median {med:.0f} | cause: weak-hook|pacing|topic-saturation|voiceover|style-look|slot|other | evidence (hook \"{r['hook'][:40]}\", style {r['style']}, hour {r['hour'] or '?'}) | fix for next time")

def _test():
    f, _ = features(['Think you know the truth? Lets test three claims.', 'Lightning never strikes twice. Myth! Tall buildings get hit.', 'Honey never goes bad. Fact! Sealed honey lasts.', 'Goldfish remember for three seconds. Myth! Weeks.', 'Which one surprised you? Comment!'], 'solo')
    assert f['myth'] >= 2 and f['question'] >= 2, f
    r = rank(f, 'solo', [], [], [], None); assert r[0]['style'] == 'myth-or-fact', r[0]
    g, _ = features(['Your boss just stole your idea and called it his own!', 'He said, chill, you are so dramatic.', 'You stared at him.', 'He slipped on the carpet.', 'Everyone clapped for you.', 'And that is why'], 'solo')
    top = [x['style'] for x in rank(g, 'solo', [], [], [], None)[:3]]; assert 'comic-panels' in top or 'tall-tale' in top, top
    blocked = [x['style'] for x in rank(g, 'solo', [('comic-panels', 'LOSE'), ('tall-tale', 'LOSE')], [], [], None)]
    assert 'comic-panels' not in blocked and 'tall-tale' not in blocked                       # LOSE is a hard block ...
    assert rank(g, 'solo', [('comic-panels', 'LOSE')], [], [], 'comic-panels')[0]['style'] == 'comic-panels'   # ... unless the script demands it
    assert any(x['unported'] for x in rank(g, 'solo', [], [], [], None)), 'unported library ids must stay in the ranking'
    good = [{'style': 'x', 'views': 900}, {'style': 'x', 'views': 950}, {'style': 'y', 'views': 100}]           # x would be WIN
    assert auto_verdicts('solo', good, [('x', 'LOSE')], '2026-11-20') and not auto_verdicts('solo', good, [('x@solo', 'LOSE')], '2026-11-20', {'x@solo'})   # owner-pinned lines never flip
    assert hook_flags('Why do you sneeze in bright sunlight?') == ['question', 'second-person', 'short']
    assert len(library_ids() - LOCAL) >= 40 and 'tier-list' in library_ids(), len(library_ids())
    assert all(s in TAGS for s in catalog()), [s for s in catalog() if s not in TAGS]
    assert {'gaming-guide', 'gaming-reaction'} <= set(KINDS)
    ok6 = [{'style': 'comic-pop', 'views': 900}] * 6 + [{'style': 'chalk-talk', 'views': 100}] * 6          # median 500: comic-pop 900 is proven
    sg = {x['style']: x['score'] for x in rank({'gaming': 2}, 'gta', [], ok6, [], None)}; ss = {x['style']: x['score'] for x in rank({'gaming': 2}, 'solo', [], ok6, [], None)}
    assert sg['comic-pop'] == ss['comic-pop'] - 1 and sg['chalk-talk'] == ss['chalk-talk'], 'gta: 5+ videos -> +1 (decay); solo keeps +2'
    assert explore_due(['a'] * 15) and not explore_due(['a'] * 16) and not explore_due(['a'] * 17) and explore_due(['a'] * 18)
    assert apply_cooldown([{'style': 'comic-pop'}, {'style': 'a'}, {'style': 'b'}], ['comic-pop'])[1] == {'comic-pop'}
    assert apply_cooldown([{'style': 'comic-pop'}, {'style': 'a'}], ['comic-pop'])[1] == set(), 'fewer than 2 alternatives: no cooldown'
    assert gta_standard_styles('solo') == []
    assert solo_track_next([]) == 'TALL-TALE'
    tl = {'channel': 'solo', 'video_id': 'a', 'style': TALL}; sd = {'channel': 'solo', 'video_id': 'b', 'style': 'comic-panels'}
    assert solo_track_next([tl]) == 'STANDARD' and solo_track_next([tl, sd]) == 'TALL-TALE', 'strict alternation, last upload decides'
    assert solo_track_next([tl, {'channel': 'solo', 'video_id': 'TBD', 'style': 'chalk-talk'}]) == 'STANDARD', 'planned rows do not count'
    assert solo_track_next([tl, {'channel': 'gta', 'video_id': 'g', 'style': 'comic-pop'}]) == 'STANDARD', 'gta rows never count for solo'
    ranked = [{'style': TALL, 'score': 1}, {'style': 'comic-pop', 'score': 2}, {'style': 'chalk-talk', 'score': 1.5}, {'style': 'myth-or-fact', 'score': 1}, {'style': 'inside-out', 'score': 0.5}]
    rows_std = [{'channel': 'solo', 'video_id': str(i), 'style': x} for i, x in enumerate(['inside-out', 'chalk-talk', 'comic-panels'])]
    keep, notes = solo_filter(ranked, 'STANDARD', rows_std)
    assert [r['style'] for r in keep] == ['comic-pop', 'myth-or-fact'], keep     # the last 3 STANDARD styles blocked, tall-tale never
    keep, _ = solo_filter(ranked, 'TALL-TALE', rows_std); assert [r['style'] for r in keep] == [TALL]
    setting, cast = tall_suggestion(); assert setting in SOLO_SETTINGS and len(cast) == 3 and all(c in SOLO_CASTS for c in cast)
    print('pick_style.py: self-check OK')

def main():
    global TRACK_OVERRIDE
    if '--track' in sys.argv:
        i = sys.argv.index('--track'); TRACK_OVERRIDE = {'tall': 'TALL-TALE', 'standard': 'STANDARD'}[sys.argv[i + 1].lower()]
        del sys.argv[i:i + 2]
    if sys.argv[1:2] == ['--test']: return _test()
    channel, mode = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'kinds')
    if mode == '--verdicts':
        ok, _ = perf_rows(channel); lines = auto_verdicts(channel, ok, verdict_hist(), dt.date.today().isoformat(), pinned_keys())
        if lines:
            with (D / 'style-verdicts.txt').open('a') as f: f.write('\n'.join(lines) + '\n')
        print('\n'.join(lines) or 'verdicts: no change')
    elif mode == 'match': cmd_match(channel, sys.argv[3])
    elif mode == 'hooks': cmd_hooks(channel, int(sys.argv[3]) if len(sys.argv) > 3 else 5)
    elif mode == 'postmortem': cmd_postmortem(channel)
    else: cmd_kinds(channel, (sys.argv[3] if len(sys.argv) > 3 else '') if mode == 'kinds' else mode)   # old form still works: pick_style.py solo <kind>

if __name__ == '__main__':
    main()
