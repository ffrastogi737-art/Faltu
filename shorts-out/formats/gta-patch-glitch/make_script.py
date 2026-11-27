import json
L=[]
def a(text,**v): L.append({'text':text,'vis':v})
a("GTA 6's first patch fixed seven bugs. So did it fix the money glitch?",k='Q',icon='note',head='PATCH 1.002.002',emo=0.9)
a("Update 1.002.002 landed four days after launch. It fixes crashes, stuck weather, autosaves, phone calls, the wanted level, a gym bar, and partners keeping loot bags.",k='S',big='7 FIXES',label='UPDATE 1.002.002',fx='hit',emo=0.85)
a("Not one of them mentions the infinite money glitch!",k='I',icon='eye',head='NOT ON THE LIST',sub='ZERO MENTIONS',fx='hit',emo=0.88)
a("Rockstar patched the money glitch. Myth! Outlets report it still works.",k='M',head='ROCKSTAR PATCHED THE GLITCH',verdict='MYTH',at='Myth',sub='REPORTED STILL WORKING',emo=0.88)
a("Guides warn a later update could close it without warning.",k='I',icon='clock',head='COULD CLOSE ANYTIME',sub='LATER UPDATE',fx='hit')
a("So should Rockstar patch it, or leave it alone? Comment which!",k='Q',icon='brain',head='PATCH OR LEAVE IT?',emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':'GTA 6 Patch Fixed 7 Bugs, Not This One (Reported)','lead':0.15,'outro':1.0,'gap':0.12,'music':'hype',
 'sources':['PlayStation LifeStyle 23 Nov 2026: GTA 6 Update 1.002.002 rolling out (seven fixes quoted; players confirm money glitch still works)','games.gg: GTA 6 Update 1.002.002 patch notes, all 7 fixes (notes do not mention the glitch)','Notebookcheck: new GTA 6 update leaves infinite money glitch untouched (reported)'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
