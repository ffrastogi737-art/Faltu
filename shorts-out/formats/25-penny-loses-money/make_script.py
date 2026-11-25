import json
L=[]
def a(text,emo=None,**v):
    d={'text':text,'vis':v}
    if emo: d['emo']=emo
    L.append(d)
a("A one-cent coin that costs almost four cents to make?",0.85,k='Q',icon='coin',head='1¢ COSTS 3.7¢?!')
a("In 2024, the U.S. Mint paid three point six nine cents to make and ship every single penny.",k='G',head='LOSS: 2.69¢ EACH',fx='hit',rows=[{'label':'WORTH 1¢','n':1,'col':'#1F6F8B'},{'label':'COST 3.69¢','n':3.69,'col':'#D6402B'}])
a("It made nearly three point two billion of them, and lost eighty-five million dollars.",0.9,k='S',big='-$85M',label='LOST IN ONE YEAR',fx='boom')
a("A decade earlier, a penny cost only one point four cents.",k='I',icon='drop',head='2014: 1.4¢',sub='THEN IT KEPT CLIMBING')
a("The price tag kept climbing, but the coin was still worth one cent.",k='I',icon='coins',head='STILL WORTH 1¢')
a("So on November twelfth, twenty twenty-five, the Mint struck the last one for circulation.",0.85,k='I',icon='cal',head='THE LAST PENNY',sub='PHILADELPHIA MINT',fx='hit')
a("After two hundred thirty-two years.",k='I',icon='press',head='232 YEARS',sub='ENDED')
a("Your old pennies still work, though. Check your couch!",k='I',icon='coin',head='STILL LEGAL',sub='CHECK THE COUCH')
a("So if a coin costs four cents to make, what is it really worth?",0.85,k='Q',icon='coins',head='WORTH WHAT?')
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':'The US Spent 3.7 Cents To Make Every Penny','lead':0.3,'outro':1.0,'gap':0.3,'music':'hype',
 'sources':['US Mint FAQ/press release (usmint.gov): penny cost 1.42 -> 3.69 cents over a decade; Treasurer struck the final circulating penny 12 Nov 2025 at Philadelphia',
  'St. Louis Fed Page One Economics (May 2026): penny costs more than a penny, 3.69 cents',
  'NBC News: Mint lost $85.3 million on nearly 3.2 billion pennies in fiscal 2024; Mint annual report via CoinNews: unit cost $0.0369'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
