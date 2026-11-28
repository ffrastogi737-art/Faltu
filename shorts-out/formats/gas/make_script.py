import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("Does GTA 6 really make you stop for gas?", k='Q', icon='water', head='STOP FOR GAS?!', emo=0.9)
a("Reports say yes, there's a refueling animation, and it takes about ten seconds!", k='S', big='10 SECONDS', label='REPORTED REFUEL TIME', fx='boom', emo=0.9)
a("Rockstar North's co-head, Rob Nelson, called that pretty fast for a fill up.", k='I', icon='person', head='"PRETTY FAST"', sub='ROB NELSON, ROCKSTAR', fx='hit', emo=0.85)
a("When a YouTuber pushed back, he said, we'll see what people say.", k='I', icon='bubble', head='"WE\'LL SEE"', sub='WHAT PEOPLE SAY', fx='hit', emo=0.85)
a("Some fans worry about stopping to refuel while escaping the police.", k='I', icon='clock', head='ESCAPING COPS?', sub='FAN WORRY', fx='hit', emo=0.85)
a("Ten seconds isn't long, but in a chase it could feel like forever.", k='S', big='FOREVER?', label='10 SECONDS IN A CHASE', fx='boom', emo=0.9)
a("So is a ten second gas stop realism, or just a speed bump? Comment A for realism, or B for speed bump!", k='Q', icon='water', head='A REALISM OR B BUMP?', emo=0.9)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'GTA 6 Gas Stops Take 10 Seconds (Reported)', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['PC Gamer: GTA 6 refuelling action reportedly takes about 10 seconds, Rockstar co-studio head says pretty fast for a fill up',
                 'GamesRadar: Rockstar boss says "we will see what people say" about the refueling system',
                 'Dexerto / GamingBolt / Upcomer: refuel about 10 seconds, "you can\'t complain about that"',
                 'EarlyGame / egamers: fan concern about refueling while evading police (fan reaction, pre-release)'],
     'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
