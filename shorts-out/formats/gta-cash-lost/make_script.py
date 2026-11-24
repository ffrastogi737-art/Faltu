import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Die in GTA 6 with your pockets full, and that cash can be gone for good.", k='Q', icon='eye', head='CASH GONE?!', emo=0.9)
a("Guides say cash you carry is lost when you die or get arrested.", k='I', icon='hand', head='CASH ON YOU', sub='LOST IF YOU DIE', fx='hit')
a("Mistake one: carrying it around.", k='N', rank=3, head='HOARDING CASH', sub='MISTAKE ONE', fx='hit')
a("It only counts once you deposit it at an ATM.", k='C', items=[['hand', 'CASH'], ['person', 'ATM'], ['brain', 'SAFE']])
a("Mistake two: your pockets cap out at twenty thousand dollars!", k='N', rank=2, head='$20,000 POCKET CAP', sub='MISTAKE TWO', emo=0.9)
a("Mistake three: stealing the first car you see.", k='N', rank=1, head='ANY CAR YOU SEE', sub='MISTAKE THREE')
a("A phone scanner shows its security, trackers, and resale value first.", k='I', icon='eye', head='SCAN IT FIRST', sub='SECURITY - TRACKER - VALUE')
a("Check before you steal, and you keep more of your money.", k='I', icon='brain', head='CHECK FIRST')
a("So tell us below, what's the most cash you ever lost when you", k='Q', icon='person', head='YOUR WORST LOSS?', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'GTA 6 Mistakes That Cost You Cash', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['FandomWire: GTA 6 best beginner tips: cash carried is permanently lost after dying or getting arrested; deposits via Buck Me; Focus Mode alarm hints',
                 'games.gg GTA 6 money guide: death or arrest can cost all carried cash; deposit at a physical ATM; vehicle scanner app shows security, trackers, resale value',
                 'Inven Global: 13 tips for GTA 6: $20,000 cash carry cap, deposit via Buck Me ATM (cash-loss on death hedged there). Reported by outlets; Rockstar has not published these details in the coverage found.'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
