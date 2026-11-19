#!/usr/bin/env python3
"""Style + topic-kind advisor. The agent runs it AFTER research and BEFORE building, then decides.
   python3 shorts-out/pick_style.py solo|gta <topic-kind>
Reads usage from the README headers (the single source of truth), blocks from style-verdicts.txt.
It ranks; it does not decide. Pick one, say why in experiments.txt ("NEW STYLE" when first use)."""
import re, sys, pathlib
D = pathlib.Path(__file__).parent
LOCAL = {'chalk-talk', 'comic-pop', 'deep-dive', 'inside-out', 'neon-versus', 'night-file', 'paper-atlas', 'stick-story', 'tall-tale'}
SLOW3D = {'deep-dive', 'night-file', 'tall-tale'}
# library ids (STYLE-LIBRARY.md, vertical): usable but need a render_html port, so a small penalty
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
 'gaming-news': 'comic-pop breaking-desk tall-tale',
 'gaming-versus': 'versus-split comic-pop tier-list neon-versus',
 'gaming-list': 'top-5-countdown tier-list quiz-countdown pixel-quest comic-pop'}
KEYS = [('body-science', r'^why (you|your)'), ('weird-jobs', r'job|paid \$|pinboy|alarm'), ('history', r'emperor|dancing|town|war'),
        ('gaming-news', r'gta|metacritic|reviews?')]

def entries(readme):
    out, cur = [], None
    for line in (D / readme).read_text().splitlines():
        m = re.match(r'## \S+ · `[^`]*` · (.*)', line)
        if m: cur = {'styles': {s for s in LOCAL | LIB if re.search(r'(?<![\w-])%s(?![\w-])' % s, m.group(1).lower())}, 'title': ''}; out.append(cur)
        elif cur is not None and line.startswith('**Title:**') and not cur['title']: cur['title'] = line[10:].strip()
    return out

def kind(title):
    t = title.lower()
    return next((k for k, p in KEYS if re.search(p, t)), 'other')

channel, want = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '')
E = entries('README.md' if channel == 'solo' else 'gta6-channel/README.md')
if channel == 'solo': E = [e for e in E if 'gta' not in e['title'].lower()]  # README 04 is a GTA video on solo hype
used = {}
for e in E:
    for s in e['styles']: used[s] = used.get(s, 0) + 1
last = E[-1]['styles'] if E else set()
last2 = set().union(*[e['styles'] for e in E[-2:]]) if E else set()
blocked = {l.split()[0] for l in (D / 'style-verdicts.txt').read_text().splitlines() if ' LOSE' in l and not l.startswith('#')}
first = {}
for i, e in enumerate(E):
    for st in e['styles']: first.setdefault(st, i)
first_use_in_last3 = any(i >= len(E) - 3 for i in first.values())
explore = not first_use_in_last3
kinds = [kind(e['title']) for e in E[-5:]]
print(f'channel={channel}  videos={len(E)}  last kinds={kinds}')
if want and kinds.count(want) >= 3: print(f'!! TOPIC SATURATED: "{want}" is {kinds.count(want)} of the last {len(kinds)}. Pick another kind.')
print('kinds not in the last 5:', ', '.join(k for k in FITS if k not in kinds and k.startswith('gaming') == (channel == 'gta')))
print('EXPLORE MODE: no first-time style in the last 3 videos, so the next one MUST be a never-used style.' if explore else 'explore quota met; best-scoring style may repeat (not the last one).')
fit = set(FITS.get(want, '').split())
rows = []
for s in sorted(LOCAL | LIB):
    if s in blocked or s in last: continue
    if explore and used.get(s): continue
    if fit and s not in fit: continue  # only styles that suit the topic kind
    sc = 3 * (s in fit) + 3 * (not used.get(s)) + (used.get(s, 0) == 1) - 2 * (s in last2) + (s in LOCAL) - (s in SLOW3D) - (s in LIB)
    rows.append((sc, s))
for sc, s in sorted(rows, reverse=True)[:6]:
    print(f'{sc:>3}  {s:<18} used {used.get(s, 0)}x  {"fits " + want if s in fit else "no fit":<14} {"ready" if s in LOCAL else "library: port via render_html"}{" (slow 3D)" if s in SLOW3D else ""}')
print('blocked:', ', '.join(sorted(blocked)) or '-')
