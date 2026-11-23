import json
L=[]
def a(text,**v): L.append({'text':text,'vis':v})
a("A GTA 6 player found a man who thinks the whole world is a video game.",k='Q',icon='eye',head='HE KNOWS?',emo=0.9)
a("There's a hidden hideout in Belville. Fact! Two outlets reported it, found by a fan on launch day.",k='M',head='HIDEOUT IN BELVILLE',verdict='FACT',at='Fact',sub='AS REPORTED BY 2 OUTLETS',emo=0.88)
a("Notes inside show someone sure he's living in a game.",k='I',icon='note',head='THE WALL NOTES',sub='HE KNOWS',fx='hit')
a("He spots identical NPCs, and locked doors with nothing behind them.",k='I',icon='eye',head='IDENTICAL NPCS',sub='EMPTY LOCKED DOORS',fx='hit')
a("Rockstar confirmed it. Myth! The studio hasn't said a word.",k='M',head='ROCKSTAR CONFIRMED IT',verdict='MYTH',at='Myth',sub='NO COMMENT YET',emo=0.88)
a("Clever writing, or something stranger? Comment which!",k='Q',icon='brain',head='CLEVER OR STRANGE?',emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':'The GTA 6 NPC Who Knows It Is A Game','lead':0.3,'outro':1.0,'gap':0.25,'music':'hype',
 'sources':['Dexerto: GTA 6 screenshot hidden in San Andreas back in 2021 was real, and the house has a dark secret (conspiracy theorist hideout in Belville)','games.gg: GTA 6 Belville house 2021 image (same find, discovered on launch day by Jared of the GTA VI mapping community)','GTA Wiki credits Jared of the GTA VI Mapping server. Reported by fans; Rockstar has not commented in the coverage found.'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
