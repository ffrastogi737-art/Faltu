import json
# DEMO content for the engine test only (not for publishing). Kinds: I icon+headline, Q question, S big stat, C chain, P comic panels.
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Your friend borrows your charger and never gives it back.", k='P', panels=[['person', 'Can I borrow your charger?'], ['clock', '...three weeks later.']], emo=0.85)
a("You ask for it, and he says, I lost it.", k='P', panels=[['person', 'Where is my charger?'], ['cup', 'Uh... I lost it.']], bam='?!')
a("Then his phone dies in the middle of the party.", k='P', panels=[['person', 'Bro, 1 percent!'], ['hand', 'Please, one tiny charge?'], ['eye', 'I cannot hear you.']], fx='hit')
a("And that is the exact reason why", k='P', panels=[['hand', 'Here is my charger.'], ['person', 'Wait, really?']], bam='BAM!')
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Comic Panels (demo)', 'lead': 0.3, 'outro': 1.0, 'gap': 0.25, 'music': 'hype', 'sources': ['Fiction demo, engine test only'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
