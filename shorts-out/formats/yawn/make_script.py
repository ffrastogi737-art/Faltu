import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("You are about to yawn, and nobody fully knows why!", k='Q', icon='person', head='YOU WILL YAWN', emo=0.9)
a("Yawns spread like a virus. About half of people catch one just from seeing it or hearing it!", k='S', big='30-60%', label='OF PEOPLE CATCH IT', fx='boom', emo=0.9)
a("Scientists first blamed empathy: you copy the yawn because you feel the other person.", k='I', icon='brain', head='EMPATHY?', sub='THE FIRST IDEA')
a("It fits. Yawns spread faster between friends and family than between strangers.", k='I', icon='person', head='FRIENDS > STRANGERS', sub='YAWNS SPREAD FASTER', fx='hit') 
a("A brain scan study saw a mirroring area light up when people watched a yawn.", k='I', icon='brain', head='BRAIN MIRRORS IT', sub='FMRI STUDY', fx='hit', emo=0.85)
a("But a study of over three hundred people found empathy barely mattered!", k='S', big='300+ PEOPLE', label='EMPATHY BARELY MATTERED', fx='boom', emo=0.9)
a("Is it just tiredness? Myth! Tiredness barely changed who caught a yawn, so the science is not settled.", k='M', head='YAWNS = JUST TIRED', verdict='MYTH', at='Myth', sub='STUDY: BARELY MATTERED', emo=0.88)
a("So we know a yawn is contagious, and we still don't know why. Are you yawning right now?", k='Q', icon='person', head='YAWNING YET?', emo=0.9)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Why You Yawn When Others Yawn', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['Psychology Today: why is yawning contagious (roughly 30-60% of people susceptible)',
                 'PLoS ONE 2011 (Norscia & Palagi, Univ. of Pisa): yawn contagion higher among kin and friends than strangers',
                 'PMC 3233580 Yawn contagion and empathy in Homo sapiens; fMRI work on inferior frontal gyrus',
                 'Cirulli et al., 328 participants: empathy, tiredness, circadian preference had little effect'],
     'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
