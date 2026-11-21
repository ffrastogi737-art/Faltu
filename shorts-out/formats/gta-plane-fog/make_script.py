import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Do NOT fly a military jet to uncover the GTA 6 map!", k='Q', icon='plane', head='DON\'T DO THIS!', emo=0.88)
a("When you start, most of the map is hidden under fog.", k='I', icon='eye', head='MAP IS FOGGED', sub='MOST OF IT HIDDEN')
a("The fastest fix is flying a plane over the unexplored areas.", k='I', icon='plane', head='FLY OVER IT', sub='THAT REVEALS THE MAP', fx='hit')
a("But the plane matters.", k='I', icon='plane', head='WHICH PLANE?', sub='IT MATTERS')
a("Guides say stealing military aircraft near a base can bring a wanted level, and fighter jets after you.", k='I', icon='star', head='MILITARY = HEAT', sub='JETS CAN CHASE YOU', fx='boom', emo=0.9)
a("A civilian crop duster is the safer pick.", k='I', icon='plane', head='CROP DUSTER', sub='THE SAFER PICK', fx='hit')
a("Guides say it has plenty of fuel and doesn't attract fighter jets.", k='I', icon='eye', head='LOTS OF FUEL', sub='NO FIGHTER JETS')
a("Fly slow, scan the fog, and the map fills in.", k='I', icon='eye', head='FOG CLEARS', sub='MAP FILLS IN')
a("Some details are still early guide info, so check them in game.", k='I', icon='eye', head='EARLY GUIDES', sub='CHECK IN GAME')
a("Would you fly the safe plane, or steal the jet anyway? Comment it!", k='Q', icon='plane', head='SAFE OR JET?', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Never Use This Plane To Reveal The GTA 6 Map', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['Engadget: You can reveal the full GTA 6 map in minutes using this simple plane trick', 'Beebom: How to Remove Map Fog in GTA 6 (crop duster, civilian aircraft safer)',
                 'xboxplay.games / games.gg guides: unfog the map fast; military base jets bring a wanted level (star count differs between guides, so not stated)'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
