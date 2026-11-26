import json
L=[]
def a(text,**v): L.append({'text':text,'vis':v})
a("Jason and Lucia's apartment may be a real Miami building. And fans say it's already gone.",k='Q',icon='apt',head='A REAL BUILDING?',emo=0.9)
a("A fan started with the skyline you see through the apartment window.",k='I',icon='eye',head='THE WINDOW VIEW',sub='FAN INVESTIGATION')
a("They matched a tall teal tower in that view to real Miami landmarks.",k='I',icon='pin',head='MATCHED TO MIAMI',sub='SKYLINE CLUES',fx='hit')
a("That pointed to a condo called the Belmar, near Biscayne Bay.",k='I',icon='apt',head='THE BELMAR',sub='NEAR BISCAYNE BAY',fx='hit',emo=0.85)
a("But on today's maps, the lot looked completely empty.",k='C',items=[['apt','APARTMENT IN GAME'],['crane','TODAY: EMPTY LOT']],emo=0.88)
a("So the fan dug through old Street View photos, and the building showed up.",k='I',icon='eye',head='OLD STREET VIEW',sub='THE BUILDING WAS THERE',fx='boom',emo=0.9)
a("Reports disagree on when it was torn down, and Rockstar has not confirmed any of this.",k='I',icon='kit',head='NOT CONFIRMED',sub='AS REPORTED')
a("So did Rockstar copy a building that no longer exists?",k='Q',icon='crane',head='COPIED A GHOST?',emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':"Jason And Lucia's Apartment Was A Real Building",'lead':0.15,'outro':1.0,'gap':0.25,'music':'hype',
 'sources':['Kotaku: GTA 6 Lucia and Jason apartment, Miami / Vice City real location','Dexerto: GTA 6 fan tracks down Jason and Lucias real-life apartment years after it was demolished','Player.One: GTA 6 fans claim they found Jason and Lucias Vice City apartment in real life','GameNGuide (30 Aug 2026): fans may have found the real Miami apartment (demolition date varies between sources, so not stated; Rockstar has not confirmed)'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
