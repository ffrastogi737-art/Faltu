import json
L=[]
def a(text,emo=None,**v):
    d={'text':text,'vis':v}
    if emo: d['emo']=emo
    L.append(d)
a("You had memories as a baby. You just can't reach them.",0.9,k='I',icon='brain',head='YOU HAD MEMORIES',sub="YOU CAN'T REACH THEM",fx='boom')
a("Ask anyone for their first memory, and it usually starts around age three.",k='S',big='AGE 3',label='AVERAGE FIRST MEMORY',fx='hit')
a("Before that? Almost blank. Scientists call it infantile amnesia.",k='I',icon='eye',head='INFANTILE AMNESIA')
a("For decades, the explanation was simple: a baby brain was too young to record anything.",0.8,k='I',icon='bed',head='TOO YOUNG TO RECORD?')
a("Then in twenty twenty-five, Yale scientists scanned twenty-six babies' brains while they looked at pictures.",k='S',big='26 BABIES',label='YALE BRAIN SCANS',fx='boom')
a("The harder the memory center fired the first time, the more the baby recognized that picture later.",0.85,k='I',icon='brain',head='MEMORY CENTER LIT UP',sub='THEN THEY RECOGNIZED IT',fx='hit')
a("That worked best after about age one.",k='I',icon='bed',head='STRONGEST AFTER AGE 1')
a("Baby mice point the same way: memories that seemed lost came back when scientists switched on the right brain cells.",k='I',icon='nerve',head='LOST MEMORIES CAME BACK',sub='IN BABY MICE')
a("So the memories may be saved. The hard part may be finding them.",0.9,k='I',icon='brain',head='SAVED, NOT LOST?',sub='FINDING THEM IS THE HARD PART',fx='hit')
a("Scientists still don't know how long baby memories last.",k='I',icon='clock',head='HOW LONG THEY LAST?',sub='STILL UNKNOWN')
a("So your first year may still be in there, because",0.85,k='Q',icon='person',head='STILL IN THERE?')
for x in L:
    if 'emo' in x['vis']: x['emo']=x['vis'].pop('emo')
S={'title':"You Had Memories As A Baby (You Can't Reach Them)",'lead':0.3,'outro':1.0,'gap':0.3,'music':'hype',
 'sources':['Yale News, 20 Mar 2025 (Yates et al., Science): fMRI of 26 infants 4 months to 2 years; hippocampal activity at first viewing predicted later recognition; strongest after age 1',
  'Scientific American, "We Make Memories as Babies, So Why Do We Forget Them?": same study, memories encoded in infancy, retrieval as a possible explanation',
  'Columbia news + WebMD (20 Mar 2025): same study, 26 infants',
  'Akhtar et al. 2018 (BBC survey, 6,641 people): average earliest memory about 3.2 years; review PMC4104227: mean about 3.5 years',
  'Guskjolen et al., Current Biology 2018 + SickKids press release: infant mice forgot a fear memory, light stimulation of tagged cells brought it back'],'lines':L}
json.dump(S,open('script.json','w'),indent=1);print(len(L),sum(len(x['text'].split()) for x in L),'words')
