import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Why do your ears pop on a plane?", k='Q', icon='plane', head='EARS POP?!', emo=0.85)
a("Behind each eardrum, there's a tiny pocket of air,", k='I', icon='ear', head='AIR POCKET', sub='BEHIND THE EARDRUM')
a("connected to your throat by a thin tube.", k='I', icon='tube', head='TINY TUBE', sub='EAR TO THROAT')
a("When the plane climbs, the air in the cabin gets thinner,", k='I', icon='plane', head='CLIMBING', sub='THINNER AIR')
a("so the air trapped in your ear pushes your eardrum outward!", k='I', icon='ear', head='PUSHED OUT!', fx='hit')
a("That's the full, muffled feeling.", k='I', icon='ear', head='MUFFLED...')
a("Then you swallow or yawn, and the tube opens for a split second,", k='C', items=[['person', 'SWALLOW'], ['tube', 'TUBE OPENS']])
a("the pressure evens out, and... pop!", k='S', big='POP!', label='PRESSURE EVENED OUT', fx='boom', emo=0.9)
a("That's why chewing gum helps on a flight:", k='I', icon='gum', head='CHEW GUM')
a("every swallow opens the tube again.", k='I', icon='tube', head='OPEN AGAIN!')
a("Try it right now: swallow, and listen!", k='Q', icon='ear', head='TRY IT NOW', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Why Your Ears Pop On A Plane', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['Mayo Clinic: Airplane ear (ear barotrauma): cabin pressure changes on climb/descent, eustachian tube, swallowing, yawning, chewing gum',
                 'Merck / MSD Manual: Barotrauma of the ear (eustachian tube equalizes middle-ear pressure)',
                 'Altru Health / Frommer\'s: airplane ear, open the tube by yawning, swallowing, chewing gum'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
