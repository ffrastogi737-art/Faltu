import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Why do you sneeze when you walk into bright sunlight?", k='Q', icon='sun', head='SUN SNEEZE?!', emo=0.85)
a("If you do, you're not weird. Studies say up to one in three people do it!", k='S', big='1 IN 3', label='SNEEZE IN BRIGHT LIGHT', fx='hit')
a("It even has a name: the photic sneeze reflex.", k='I', icon='eye', head='PHOTIC SNEEZE', sub='AKA ACHOO SYNDROME')
a("Here's the weird part. Your eyes and your nose share nerve neighbours.", k='C', items=[['eye', 'EYES'], ['nerve', 'NERVES'], ['nose', 'NOSE']])
a("One leading theory is crossed wires: a flash of light sets off the nerve that senses an itchy nose,", k='I', icon='nerve', head='CROSSED WIRES?', sub='LEADING THEORY')
a("so your brain thinks something is tickling your nose,", k='I', icon='nose', head='TICKLE ALERT!', fx='hit')
a("and fires a sneeze. Achoo!", k='S', big='ACHOO!', label='SNEEZE FIRED', fx='boom', emo=0.9)
a("And the twist? Scientists still haven't proven exactly how it works.", k='I', icon='brain', head='STILL A MYSTERY', sub='UNSOLVED', fx='hit', emo=0.85)
a("It often runs in families, and it's harmless.", k='I', icon='person', head='RUNS IN FAMILIES', sub='AND HARMLESS')
a("Next time you step into the sun, count your sneezes!", k='Q', icon='sun', head='COUNT THEM!', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Why Sunlight Makes You Sneeze', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['PBS NewsHour: Does the sun make you sneeze? (photic sneeze reflex, 10 to 35 percent of people, mechanism unclear)',
                 'Cleveland Clinic: Why does bright light make me sneeze (18 to 35 percent, crossed nerve signals theory, harmless)',
                 'ScienceBlog / PubMed 27568353 review: prevalence estimates, optic-trigeminal theories not confirmed, family and genome studies'],
     'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
