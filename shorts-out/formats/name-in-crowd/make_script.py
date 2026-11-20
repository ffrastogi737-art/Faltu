import json
L = []
def a(text, emo=None, **v):
    d = {'text': text, 'vis': v}
    if emo: d['emo'] = emo
    L.append(d)
a("You're deep in a loud party, and somewhere behind you, someone says your name.", k='P', panels=[['note','LOUD MUSIC...'],['bubble','Hey, Sam!'],['ear','Wait... ME?!']], bam='?!', emo=0.9)
a("You weren't even listening to them. So how did you hear it?", k='P', panels=[['person','I was not listening!'],['brain','...but I heard it.']])
a("It's called the cocktail party effect.", k='I', icon='bubble', head='COCKTAIL PARTY', sub='EFFECT', fx='hit')
a("Your brain secretly scans the noise you ignore, hunting for words that matter to you, like your name.", k='C', items=[['note','NOISE'],['brain','SCAN'],['person','YOUR NAME']])
a("When scientists tested it in nineteen fifty-nine, only about one in three people noticed their name.", k='S', big='1 IN 3', label='NOTICED THEIR NAME', fx='hit')
a("But here's the twist!", k='S', big='TWIST!', label='WAIT FOR IT', fx='boom', emo=0.9)
a("Later studies found people with weaker focus noticed it way more: sixty-five percent!", k='S', big='65%', label='WEAKER FOCUS', fx='hit', emo=0.85)
a("Strong focusers? Just twenty percent.", k='S', big='20%', label='STRONG FOCUS')
a("So hearing your name means your brain let a little extra sound slip in.", k='I', icon='brain', head='SOUND SLIPS IN', sub='EXTRA NOISE', fx='hit')
a("Next time someone calls your name, you'll know why!", k='P', panels=[['bubble','Sam!'],['ear','Oh! I know why.']], bam='BAM!', emo=0.85)
S = {'title':'Why You Hear Your Name In A Noisy Room','lead':0.3,'outro':1.0,'gap':0.25,'music':'hype',
 'sources':["Moray 1959, Quarterly Journal of Experimental Psychology 11:56-60 (about a third heard own name in the ignored ear)",
 "Wood & Cowan 1995, J. Exp. Psychology: Learning, Memory & Cognition 21:255-260 (replication, ~35 percent)",
 "Conway, Cowan & Bunting 2001, Psychonomic Bulletin & Review 8:331-335 (65 percent low vs 20 percent high working memory capacity)"],'lines':L}
json.dump(S, open('script.json','w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L),'words')
