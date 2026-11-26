import json
L=[]
def a(text,emo=None,**v):
    d={'text':text,'vis':v}
    if emo: d['emo']=emo
    L.append(d)
a("Right now, your body is building two million new blood cells. Every single second.",0.9,k='S',big='2,000,000',label='NEW BLOOD CELLS / SECOND',fx='boom')
a("That is about one hundred seventy billion a day, made deep inside your bones.",k='I',icon='bone',head='MADE IN YOUR BONES',sub='~170 BILLION A DAY')
a("Each red cell laps your whole body about once a minute, carrying oxygen.",k='I',icon='rbc',head='1 LAP A MINUTE',fx='hit')
a("Then it wears out after about one hundred twenty days.",0.8,k='I',icon='clock',head='120-DAY LIFESPAN',sub='THEN IT IS RECYCLED')
a("So the red cells in you right now will all be gone in four months.",0.9,k='I',icon='rbc',head='ALL REPLACED',sub='IN ~4 MONTHS',fx='hit')
a("You carry about twenty-five trillion of them at any moment.",k='S',big='25 TRILLION',label='RED CELLS IN YOU',fx='boom')
a("Even after you give a pint of blood, your body usually rebuilds those red cells within weeks.",k='I',icon='drop',head='REFILLED IN WEEKS',sub='AFTER DONATING')
a("So is the blood in your veins the same blood you had last year?",0.85,k='Q',icon='rbc',head='SAME BLOOD?')
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':'Your Body Makes 2 Million Blood Cells Every Second','lead':0.3,'outro':1.0,'gap':0.3,'music':'hype',
 'sources':['Stanford Blood Center, The Life of a Red Blood Cell: marrow makes ~2 million new red cells each second, lifespan ~120 days',
  'LibreTexts Anatomy & Physiology 16.2C RBC Life Cycle: ~2 million/second, 100-120 day lifespan; textbook arithmetic ~25 trillion cells in 5 L of blood',
  'American Red Cross: red cells are replaced within about 4-8 weeks after donating blood'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
