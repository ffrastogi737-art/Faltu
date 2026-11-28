import json
L=[]
def a(text,**v):
    e=v.pop('emo',None); d={'text':text,'vis':v}
    if e: d['emo']=e
    L.append(d)
a("Did Rockstar hide an insult for fans who paid a hundred dollars?",k='Q',icon='eye',head='A SECRET JAB?',emo=0.9)
a("Fans found a sticker in a promo screenshot of the GTA 6 Ultimate Edition.",k='I',icon='note',head='THE STICKER',sub='ULTIMATE EDITION PROMO',fx='hit')
a("It reportedly says: buy more useless stuff. Only ruder.",k='I',icon='eye',head='BUY MORE USELESS...',sub='AS REPORTED',fx='boom',emo=0.9)
a("The Ultimate Edition costs ninety nine ninety nine. Standard costs seventy nine ninety nine.",k='S',big='$99.99',label='ULTIMATE (STANDARD $79.99)')
a("And some single player shops and side missions are reportedly locked behind it.",k='I',icon='water',head='LOCKED BEHIND IT?',sub='REPORTED',fx='hit')
a("So some fans are furious, and call the sticker a wink at the buyers.",k='I',icon='person',head='FANS ARE ANGRY',fx='boom')
a("But some outlets say it may just be decoration, and nobody confirmed it was on purpose.",k='I',icon='cup',head='ON PURPOSE?',sub='NOBODY CONFIRMED',fx='hit',emo=0.88)
a("So is it a secret jab, or just a sticker? Comment A for jab, B for sticker.",k='A',head='JAB OR STICKER?',a='SECRET JAB',b='JUST A STICKER',emo=0.88)
S={'title':'GTA 6 Ultimate Edition Sticker Mocks Buyers? (Reported)','lead':0.15,'gap':0.12,'outro':1.0,'music':'hype',
 'sources':['mein-mmo: GTA 6 fans discover a secret message in the expensive edition (sticker in promo screenshot)','OpenCritic news 33881: GTA 6 Screenshot Mocks Ultimate Edition Buyers, Fans Believe','GamesRadar: exclusive single-player shops and side missions locked to the $100 Ultimate Edition (reported); Rockstar has not confirmed any intent'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
