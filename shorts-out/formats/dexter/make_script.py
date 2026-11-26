import json
L=[]
def a(text,**v): L.append({'text':text,'vis':v})
a("Players say they found Dexter's apartment in GTA 6. And you can steal his boat.",k='Q',icon='apt',head="DEXTER'S APARTMENT?",emo=0.9)
a("Fans first spotted it in Rockstar's extended gameplay look.",k='I',icon='eye',head='SPOTTED IN THE TRAILER',sub='EXTENDED LOOK')
a("Now the game is out, and players walked up to a waterfront building that looks just like the one from the show.",k='I',icon='apt',head='WATERFRONT BUILDING',sub='LOOKS LIKE THE SHOW',fx='hit')
a("You can reach the door, but you can't go inside.",k='I',icon='door',head='LOCKED OUT',sub='DOOR ONLY',fx='hit',emo=0.85)
a("One report calls it the Trinity Apartments, a nod to the Trinity Killer.",k='I',icon='pin',head='TRINITY APARTMENTS',sub='ONE REPORT')
a("Some players also say there is a boat nearby, and a kill kit with a knife, tape, rope and a syringe.",k='I',icon='boat',head='A BOAT TO STEAL',sub='PLAYER CLAIMS',fx='boom',emo=0.9)
a("Rockstar has not confirmed any of it, and reports even disagree on where the building is.",k='I',icon='kit',head='NOT CONFIRMED',sub='AS REPORTED')
a("So is this a real Dexter tribute, or just a very lucky apartment?",k='Q',icon='apt',head='TRIBUTE OR LUCK?',emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':"Dexter's Apartment Is In GTA 6 (Players Say)",'lead':0.15,'outro':1.0,'gap':0.25,'music':'hype',
 'sources':['Dexerto: GTA 6 players find Dexters apartment, serial killer kit and can even steal his boat','Insider Gaming: Dexter Morgans apartment in GTA 6 (Trinity Apartments, roof nod)','TheWrap: GTA VI Easter egg, players find Dexter Morgans apartment in-game','Bloody Disgusting: GTA VI contains a Dexter Easter egg (places it on Washington Island: location differs, so not stated)'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
