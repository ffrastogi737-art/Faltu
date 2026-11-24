import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("This shrimp is only as long as your hand, and it punches at eighty kilometers an hour. Underwater!", k='Q', icon='hand', head='SHRIMP PUNCH?!', emo=0.9)
a("Water is thick, so a normal punch crawls. But its club speeds up like a bullet.", k='S', big='80 KM/H', label='FASTEST PUNCH ON EARTH', fx='hit')
a("It's called the mantis shrimp, and its punch hits with about fifteen hundred newtons.", k='I', icon='hand', head='MANTIS SHRIMP', sub='1,500 NEWTONS')
a("That is enough to smash a snail shell, or crack a crab like a nut.", k='S', big='CRACK!', label='SHELLS BREAK', fx='boom', emo=0.9)
a("But here is the twist. The club moves so fast that the water can't keep up,", k='I', icon='water', head="WATER CAN'T KEEP UP", sub='THE TWIST', fx='hit', emo=0.85)
a("so it tears into tiny bubbles. And those bubbles collapse in a snap,", k='I', icon='bubble', head='BUBBLES!', sub='THEN THEY COLLAPSE')
a("hitting the prey a second time!", k='S', big='HIT TWICE', label='ONE SWING', fx='boom', emo=0.9)
a("One swing, two hits. Now imagine what that shrimp does when it's angry!", k='Q', icon='hand', head='TWO HITS!', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'This Shrimp Punches Twice With One Swing', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['Natural History Museum London: Mantis shrimp, the crustacean that packs a punch (club strike, cavitation)',
                 'Wikipedia: Mantis shrimp (strike over 80 km/h, about 1,500 newtons, cavitation adds a second force)',
                 'Patek et al., Nature 2004: Deadly strike mechanism of a mantis shrimp (cavitation bubbles collapse after the strike)'],
     'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
