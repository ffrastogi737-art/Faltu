import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("GTA 5 players: your old trick to lose the cops won't work in GTA 6!", k='Q', icon='star', head='COPS CHANGED!', emo=0.85)
a("In GTA 5, you could just hide and wait out the stars.", k='I', icon='clock', head='GTA 5: HIDE & WAIT', sub='THE OLD TRICK')
a("But previews say GTA 6 police remember what they actually saw:", k='I', icon='eye', head='POLICE REMEMBER', fx='hit')
a("your car and your clothes,", k='C', items=[['car', 'YOUR CAR'], ['shirt', 'CLOTHES']])
a("even security camera footage.", k='I', icon='camera', head='CCTV FOOTAGE', sub='ALSO TRACKED', fx='hit')
a("The stars show the chase, but a separate Heat level tracks what police know about you.", k='I', icon='star', head='STARS = CHASE', sub='HEAT = WHAT THEY KNOW')
a("So changing your clothes or your car can cool the Heat, even while the stars stay on!", k='I', icon='shirt', head='CHANGE CLOTHES!', sub='REDUCES WHAT THEY KNOW', fx='hit')
a("And at six stars, reports say police search the whole map.", k='S', big='6 STARS', label='REPORTEDLY: WHOLE-MAP SEARCH', fx='boom', emo=0.9)
a("All of this comes from previews, so reviews will tell us more.", k='I', icon='eye', head='FROM PREVIEWS', sub='NOT FINAL')
a("Which GTA 5 trick will you miss most? Comment it!", k='Q', icon='car', head='YOUR TRICK?', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'GTA 6 Police Remember Your Car And Clothes', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['Shacknews: GTA 6 goes back to a six-star Wanted Level system', 'GamesRadar / Games.gg: wanted levels and the Heat system explained (Heat tracks what police know)',
                 'Beebom, Gfinity, Dexerto: wanted system explainers (police work from clothing, vehicle, description; CCTV)', 'IBTimes UK: GTA 6 police system, erase evidence and hide vehicles instead of waiting out a timer',
                 'All preview-based; whole-map search at max wanted is reported, sources differ'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
