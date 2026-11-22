import json
L=[]
def a(text,**v): L.append({'text':text,'vis':v})
a("A seven-minute climb, just to throw an egg.",k='Q',icon='tower',head='7-MINUTE CLIMB',emo=0.88)
a("GTA 6 players found a secret at the top of a huge communications tower.",k='I',icon='tower',head='TOP OF THE TOWER',sub='HIDDEN SECRET')
a("Up there is a bird's nest full of painted eggs.",k='I',icon='egg',head='PAINTED EGGS',sub='IN A NEST',fx='hit')
a("Throw one off the edge, and a secret cutscene plays!",k='I',icon='egg',head='THROW AN EGG',sub='SECRET CUTSCENE',fx='boom',emo=0.9)
a("It smashes right onto a driver's windscreen.",k='I',icon='car',head='SPLAT!',sub='DRIVER NOT HAPPY',fx='hit')
a("Reports say it echoes a classic Vice City Easter egg.",k='I',icon='star',head='VICE CITY CALLBACK',sub='AS REPORTED')
a("A player on X shared the find first.",k='I',icon='eye',head='FOUND ON X',sub='PLAYER REPORT')
a("Outlets disagree on exactly where the tower is, so these are early reports.",k='I',icon='eye',head='LOCATION UNCLEAR',sub='EARLY REPORTS')
a("Would you do the climb? Comment yes or no!",k='Q',icon='egg',head='WORTH THE CLIMB?',emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':'The GTA 6 Egg Secret That Takes 7 Minutes To Reach','lead':0.15,'outro':1.0,'gap':0.25,'music':'hype',
 'sources':['GamingBible: GTA 6 players discover secret cutscene hidden behind ridiculous seven-minute climb (19 Nov 2026)','IBTimes UK: GTA 6 Easter egg is literally an egg, throwing it from a tower unlocks a secret cutscene','ComicBook.com: 5 most exciting GTA 6 Easter eggs found after launch (location differs between outlets, so not stated)'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
