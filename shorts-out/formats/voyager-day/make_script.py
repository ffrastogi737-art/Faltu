import json
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
a("If you shout at Voyager 1 right now, it hears you tomorrow.", k='Q', icon='clock', head='HEARS YOU TOMORROW', emo=0.9)
a("On November eighteenth, it reached one light-day from Earth.", k='S', big='1 LIGHT-DAY', label='NASA, NOV 18', fx='boom', emo=0.9)
a("That's about sixteen billion miles. Light itself needs a whole day to cross it.", k='I', icon='sun', head='LIGHT: 24 HOURS', sub='16 BILLION MILES')
a("It launched in nineteen seventy-seven, so the trip took forty-nine years.", k='S', big='49 YEARS', label='ONE-WAY TRIP', fx='hit')
a("Send it a command today, and it arrives tomorrow.", k='I', icon='note', head='SENT TODAY', sub='ARRIVES TOMORROW')
a("Then its reply needs another full day to get back.", k='I', icon='clock', head='REPLY: +1 DAY', fx='hit')
a("Two whole days, just to say hello!", k='S', big='2 DAYS', label='FOR ONE HELLO', fx='boom', emo=0.9)
a("And it's the first human-made thing ever to get this far.", k='I', icon='eye', head='FIRST EVER', sub='HUMAN-MADE')
a("Its twin, Voyager 2, won't get there until twenty thirty-five.", k='I', icon='clock', head='VOYAGER 2: 2035')
a("Would you wait two days for a reply?", k='Q', icon='note', head='WAIT 2 DAYS?', emo=0.85)
for x in L:
    if 'emo' in x['vis']: x['emo'] = x['vis'].pop('emo')
S = {'title': 'Voyager 1 Is One Light-Day Away', 'lead': 0.3, 'outro': 1.0, 'gap': 0.3, 'music': 'hype',
     'sources': ['NASA Scientific Visualization Studio: How Far Away Is Voyager 1? One Light-Day, Explained (reached 1 light-day Nov 18 2026, 16.094 billion miles, Voyager 2 in Nov 2035)',
                 'Space.com: 1 light-day from Earth! NASA\'s Voyager 1 probe hits huge milestone in interstellar space',
                 'Popular Science: Voyager 1 is one light-day away from Earth, according to NASA estimate (about a day each way for messages)'], 'lines': L}
json.dump(S, open('script.json', 'w'), indent=1); print(len(L), sum(len(x['text'].split()) for x in L), 'words')
