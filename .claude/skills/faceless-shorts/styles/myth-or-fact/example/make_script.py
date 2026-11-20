import json
# DEMO content for the engine test only (not for publishing). Kinds: I icon+headline, Q question, S big stat, C chain, M myth/fact stamp.
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Think you know the truth? Let's test three claims!", k='Q', icon='brain', head='TRUE OR FALSE?', emo=0.85)
a("Lightning never strikes the same place twice. Myth! Tall buildings get hit many times a year.", k='M', head='LIGHTNING NEVER STRIKES TWICE', verdict='MYTH', at='Myth', sub='TALL BUILDINGS GET HIT OFTEN', emo=0.85)
a("Honey never goes bad. Fact! Sealed honey can last for years.", k='M', head='HONEY NEVER GOES BAD', verdict='FACT', at='Fact', sub='SEALED HONEY LASTS YEARS', emo=0.85)
a("Goldfish remember for only three seconds. Myth! They can remember for weeks.", k='M', head='GOLDFISH: 3-SECOND MEMORY', verdict='MYTH', at='Myth', sub='THEY REMEMBER FOR WEEKS')
a("Which one surprised you? Comment below!", k='Q', icon='eye', head='WHICH SURPRISED YOU?', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Myth Or Fact (demo)', 'lead': 0.3, 'outro': 1.0, 'gap': 0.25, 'music': 'hype',
     'sources': ['DEMO ONLY, engine test; claims are common examples, check 2 sources before publishing any real claim'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
