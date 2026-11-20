#!/usr/bin/env python3
"""Style + topic-kind advisor (after research, before BUILD). It ranks; the agent decides.
   python3 shorts-out/pick_style.py solo|gta [topic-kind]   ranking and performance summary
   python3 shorts-out/pick_style.py solo|gta --verdicts     append automatic WIN/LOSE lines to style-verdicts.txt
A perf.csv row counts when it has a real view count and video id, is public by now (IST), and its views were
measured after it went public. Rows that do not count are printed with the reason, never dropped silently."""
import re, sys, pathlib, csv, statistics as st, datetime as dt
D = pathlib.Path(__file__).parent
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
LOCAL = {'chalk-talk', 'comic-pop', 'deep-dive', 'inside-out', 'neon-versus', 'night-file', 'paper-atlas', 'stick-story', 'tall-tale'}
PORTED = set()  # library ids whose render_html port is built and tested (none yet)
SLOW3D = {'deep-dive', 'night-file', 'tall-tale'}
# library ids (STYLE-LIBRARY.md, vertical): listed only once in PORTED
LIB = set('''size-lineup cosmic-scale bio-glow iso-cutaway exploded-view myth-or-fact comic-panels storybook marker-board blueprint
evidence-board isotype timeline-rail parchment-map chat-story shadow-puppets woodcut-tale rubber-hose-reel versus-split tier-list
top-5-countdown quiz-countdown breaking-desk pixel-quest glitch-pack neon-line synth-grid zine-collage globe-arcs low-poly-atlas
market-tape swiss-grid data-city doc-cinema vhs-camcorder sticker-pop punch-captions'''.split())
FITS = {  # topic kind -> styles that suit it (agent may still choose outside this list, with a reason)
 'body-science': 'inside-out chalk-talk comic-pop deep-dive bio-glow iso-cutaway exploded-view myth-or-fact',
 'history': 'paper-atlas parchment-map timeline-rail woodcut-tale storybook tall-tale doc-cinema',
 'weird-jobs': 'paper-atlas stick-story comic-panels rubber-hose-reel tall-tale chat-story',
 'mystery': 'night-file evidence-board shadow-puppets doc-cinema vhs-camcorder',
 'survival': 'stick-story chat-story comic-panels',
 'funny-story': 'tall-tale rubber-hose-reel comic-panels chat-story storybook',
 'space-scale': 'cosmic-scale size-lineup blueprint isotype deep-dive',
 'money-stats': 'isotype top-5-countdown tier-list market-tape swiss-grid comic-pop data-city',
 'animals-nature': 'storybook marker-board bio-glow zine-collage',
 'places': 'parchment-map globe-arcs low-poly-atlas paper-atlas',
 'psychology-myth': 'myth-or-fact chat-story marker-board comic-pop',
 'tech-invention': 'blueprint exploded-view isotype timeline-rail sticker-pop',
 'skit-karma': 'tall-tale comic-pop stick-story chat-story comic-panels rubber-hose-reel',
 'gaming-news': 'comic-pop breaking-desk tall-tale',
 'gaming-versus': 'versus-split comic-pop tier-list neon-versus',
 'gaming-list': 'top-5-countdown tier-list quiz-countdown pixel-quest comic-pop'}

def now_ist():
    return dt.datetime.now(IST).replace(tzinfo=None)

def perf_rows(ch, now=None):
    """(counted rows, skipped reasons) for one channel. No calendar cap: the clock decides what is public."""
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
        ok.append({'style': r['style'], 'hour': pub[11:13], 'views': int(v), 'kind': r['kind'], 'file': r['file']})
    return ok, skipped

def entries(readme):
    out, cur = [], None
    for line in (D / readme).read_text().splitlines():
        m = re.match(r'## \S+ · `[^`]*` · (.*)', line)
        if m: cur = {'styles': {s for s in LOCAL | LIB if re.search(r'(?<![\w-])%s(?![\w-])' % s, m.group(1).lower())}, 'title': ''}; out.append(cur)
        elif cur is not None and line.startswith('**Title:**') and not cur['title']: cur['title'] = line[10:].strip()
    return out

def verdict_hist():
    """(key, verdict) in file order; key is 'style' (both channels) or 'style@channel'."""
    h = []
    for l in (D / 'style-verdicts.txt').read_text().splitlines():
        p = l.split()
        if not l.startswith('#') and len(p) >= 2 and p[1] in ('WIN', 'OK', 'LOSE'): h.append((p[0], p[1]))
    return h

def current(style, ch, hist):
    v = None
    for key, verdict in hist:
        if key in (style, f'{style}@{ch}'): v = verdict  # the last applicable line wins
    return v

def auto_verdicts(ch, ok, hist, today):
    """WIN if a style's median >= 1.5 x channel median, LOSE if < 0.3 x, with 2+ counted videos. Writes changes only."""
    med = st.median([r['views'] for r in ok]) if ok else 0
    by = {}
    for r in ok: by.setdefault(r['style'], []).append(r['views'])
    lines = []
    for style, vs in sorted(by.items()):
        if len(vs) < 2 or med == 0: continue
        m = st.median(vs)
        v = 'WIN' if m >= 1.5 * med else 'LOSE' if m < 0.3 * med else 'OK'
        cur = current(style, ch, hist)
        if v == cur or (v == 'OK' and cur in (None, 'OK')): continue
        lines.append(f'{style}@{ch} {v} {today} auto: n={len(vs)} median {m:.0f} vs channel median {med:.0f}')
    return lines

def main():
    channel = sys.argv[1]
    want = sys.argv[2] if len(sys.argv) > 2 else ''
    ok, skipped = perf_rows(channel)
    hist = verdict_hist()
    if want == '--verdicts':
        lines = auto_verdicts(channel, ok, hist, dt.date.today().isoformat())
        if lines:
            with (D / 'style-verdicts.txt').open('a') as f: f.write('\n'.join(lines) + '\n')
        print('\n'.join(lines) or 'verdicts: no change'); return

    E = entries('README.md' if channel == 'solo' else 'gta6-channel/README.md')
    if channel == 'solo': E = [e for e in E if 'gta' not in e['title'].lower()]  # README 04 is a GTA video on solo hype
    used = {}
    for e in E:
        for s in e['styles']: used[s] = used.get(s, 0) + 1
    last = E[-1]['styles'] if E else set()
    last2 = set().union(*[e['styles'] for e in E[-2:]]) if E else set()
    med = st.median([r['views'] for r in ok]) if ok else 0
    def by(key):
        d = {}
        for r in ok: d.setdefault(r[key], []).append(r['views'])
        return {k: (len(v), st.median(v)) for k, v in d.items()}
    SM, TM, KM = by('style'), by('hour'), by('kind')
    blocked = {s for s in LOCAL | LIB if current(s, channel, hist) == 'LOSE'}
    first = {}
    for i, e in enumerate(E):
        for sty in e['styles']: first.setdefault(sty, i)
    explore = not any(i >= len(E) - 3 for i in first.values())
    kinds = [r['kind'] for r in csv.DictReader((D / 'perf.csv').open()) if r['channel'] == channel][-5:]
    print(f'channel={channel}  videos={len(E)}  last kinds={kinds}')
    if want and kinds.count(want) >= 3: print(f'!! TOPIC SATURATED: "{want}" is {kinds.count(want)} of the last {len(kinds)}. Pick another kind.')
    print('kinds not in the last 5:', ', '.join(k for k in FITS if k not in kinds and k.startswith('gaming') == (channel == 'gta')))
    print('EXPLORE MODE: no first-time style in the last 3 videos; next one must be never-used (2D first, 3D only if no 2D is left).' if explore
          else 'explore quota met; best-scoring style may repeat (not the last one).')
    fit = set(FITS.get(want, '').split())
    cands = []
    for s in sorted(LOCAL | LIB):
        if s in blocked or s in last2: continue  # HARD: never the last two styles on this channel
        if s in LIB and s not in PORTED: continue
        if fit and s not in fit: continue
        cands.append(s)
    if explore:
        unused = [s for s in cands if not used.get(s)]
        cands = [s for s in unused if s not in SLOW3D] or unused or cands
        if not unused: print('EXPLORE NOTE: no never-used style fits this kind; the best-scoring fit below is used.')
    rows = []
    for s in cands:
        sc = 3 * (s in fit) + 3 * (not used.get(s)) + (used.get(s, 0) == 1) - 2 * (s in last2) + (s in LOCAL) - (s in SLOW3D) - (s in LIB)
        n, m = SM.get(s, (0, 0))
        sc += (2 if m >= 1.5 * med else -2 if m < 0.3 * med else 0) * (n >= 2) + (1 if m >= 1.5 * med else 0) * (n == 1)
        rows.append((sc, s))
    for sc, s in sorted(rows, reverse=True)[:6]:
        print(f'{sc:>3}  {s:<18} used {used.get(s, 0)}x  {"fits " + want if s in fit else "no fit":<14} {"ready" if s in LOCAL else "library: port via render_html"}{" (slow 3D)" if s in SLOW3D else ""}')
    print(f'\nPERFORMANCE (counted public videos: {len(ok)}, channel median {med:.0f} views)')
    if skipped: print(' not counted:', '; '.join(skipped[:8]) + (' ...' if len(skipped) > 8 else ''))
    print(' styles:', '  '.join(f'{k} n={n} med={m:.0f}' for k, (n, m) in sorted(SM.items(), key=lambda x: -x[1][1])))
    print(' hours IST:', '  '.join(f'{k} n={n} med={m:.0f}' for k, (n, m) in sorted(TM.items(), key=lambda x: -x[1][1]) if k))
    print(' kinds:', '  '.join(f'{k} n={n} med={m:.0f}' for k, (n, m) in sorted(KM.items(), key=lambda x: -x[1][1])))
    print('blocked (LOSE):', ', '.join(sorted(blocked)) or '-')

if __name__ == '__main__':
    main()
