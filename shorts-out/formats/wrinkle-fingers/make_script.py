import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Your fingers wrinkle in water, and it is not swelling!", k='Q', icon='hand', head='NOT SWELLING?!', emo=0.88)
a("Skin doesn't puff up like a sponge. Your nervous system does this on purpose!", k='I', icon='skin', head='NOT A SPONGE', sub='MYTH BUSTED', fx='hit', emo=0.85)
a("After a few minutes in water, your nerves squeeze the tiny blood vessels under your fingertips,", k='C', items=[['water', 'WATER'], ['nerve', 'NERVES'], ['hand', 'SQUEEZE']])
a("and the skin gets pulled inward, so the wrinkles pop out.", k='I', icon='skin', head='SKIN PULLS IN', sub='WRINKLES APPEAR', fx='hit')
a("Here is the proof. People with a damaged finger nerve don't wrinkle at all!", k='S', big='0 WRINKLES', label='WITH A DAMAGED NERVE', fx='boom', emo=0.9)
a("So why would your body bother? One theory says they work like tire treads.", k='Q', icon='brain', head='WHY BOTHER?')
a("The grooves channel water away, so your grip sticks to wet things.", k='I', icon='water', head='TIRE TREADS', sub='FOR YOUR FINGERS')
a("In a two thousand thirteen test, people with wrinkled fingers moved wet marbles faster!", k='S', big='2013 TEST', label='WET MARBLES MOVED FASTER', fx='hit', emo=0.85)
a("But a later study in Berlin found no difference. Scientists still argue about it.", k='I', icon='brain', head='BERLIN: NO DIFFERENCE', sub='STILL DEBATED', fx='hit', emo=0.85)
a("So are wrinkly fingers a built-in grip upgrade, or just a strange side effect?", k='Q', icon='hand', head='UPGRADE OR GLITCH?', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Why Your Fingers Wrinkle In Water', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['Smithsonian Magazine: Ask Smithsonian, why do we get prune fingers (nerve-controlled blood vessel narrowing, no wrinkles with nerve damage)',
                 'Scientific American: Water-logged prune fingers grip better (Kareklas, Nettle, Smulders 2013, Biology Letters, wet marble test)',
                 'NPR 2011 / PBS NewsHour: Changizi rain-tread theory; later Berlin replication found no grip difference'],
     'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
