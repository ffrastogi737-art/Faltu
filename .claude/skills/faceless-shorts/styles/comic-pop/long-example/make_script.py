import json
# (text, vis) ; vis kinds: I icon+head(+sub) · T chapter title · S stat · Q question · M myth stamp · F fact stamp · C chain · V versus
L = []
def a(text, **v): L.append({'text': text, 'vis': v})
# INTRO
a("Your body does weird stuff every single day!", k='I', icon='person', head='YOUR BODY', sub='IS WEIRD')
a("It hiccups, it yawns, it sneezes at the sun,", k='C', items=[['lungs', 'HICCUP'], ['person', 'YAWN'], ['sun', 'SUN SNEEZE']])
a("and sometimes it jolts you awake, just as you fall asleep.", k='I', icon='bed', head='JOLT!')
a("So here are ten weird things your body does, and the real reason behind each one.", k='S', big='10', label='WEIRD THINGS')
a("Some of them, even scientists are still arguing about!", k='Q', head='STILL A MYSTERY')
# 1 HICCUPS
a("Number one: hiccups!", k='T', n=1, title='HICCUPS', icon='lungs')
a("Under your lungs sits a big, dome-shaped muscle called the diaphragm.", k='I', icon='lungs', head='DIAPHRAGM', sub='UNDER YOUR LUNGS')
a("With every normal breath, it pulls down smoothly, and air flows in.", k='I', icon='lungs', head='BREATHE IN', sub='NICE AND SMOOTH')
a("But when the nerves that control it get irritated,", k='I', icon='nerve', head='NERVES IRRITATED')
a("say from eating too fast, fizzy drinks, or a sudden change in temperature,", k='C', items=[['clock', 'EAT FAST'], ['bubble', 'FIZZY'], ['thermo', 'TEMP CHANGE']])
a("the diaphragm suddenly spasms, and yanks air in!", k='I', icon='lungs', head='SPASM!', fx='hit')
a("A split second later, your vocal cords snap shut,", k='I', icon='person', head='SNAP SHUT')
a("and that sudden stop is the hic you hear!", k='S', big='HIC!', label='THE SOUND', fx='boom')
a("Most hiccups go away on their own, within minutes.", k='I', icon='clock', head='MINUTES', sub='GONE BY ITSELF')
a("But one man, Charles Osborne, hiccupped for sixty-eight years, from nineteen twenty-two to nineteen ninety!", k='S', big='68 YEARS', label='LONGEST HICCUPS EVER', fx='boom')
a("It's a world record nobody wants.", k='F', head='WORLD RECORD')
a("And here's the strange part: scientists still aren't sure why we have them at all.", k='Q', head='WHY DO WE HICCUP?')
# 2 YAWNING
a("Number two: yawning.", k='T', n=2, title='YAWNING', icon='person')
a("You've probably heard that you yawn because you need more oxygen.", k='Q', head='MORE OXYGEN?')
a("But studies haven't found a link between yawning and the oxygen in your blood.", k='M', head='NO LINK FOUND')
a("One leading idea is that a yawn cools your brain,", k='I', icon='brain', head='BRAIN COOLER', sub='ONE THEORY')
a("pulling in a big gulp of air, and pumping blood toward your head, like a radiator.", k='I', icon='brain', head='LIKE A RADIATOR', fx='hit')
a("In one study, people yawned more in cooler weather than in hot weather,", k='V', a=['COOL DAYS', 'MORE YAWNS'], b=['HOT DAYS', 'FEWER YAWNS'])
a("And that makes sense, because cooler air cools better.", k='I', icon='thermo', head='COOL AIR WORKS')
a("And yes, yawns really are contagious.", k='I', icon='person', head='CONTAGIOUS!')
a("You might even yawn just hearing about it, right now.", k='Q', head='YAWNED YET?')
# 3 SUN SNEEZE
a("Number three: sneezing at the sun!", k='T', n=3, title='SUN SNEEZE', icon='sun')
a("Step out into bright light, and some people instantly sneeze.", k='C', items=[['sun', 'BRIGHT LIGHT'], ['nose', 'ACHOO!']])
a("It's called the photic sneeze reflex,", k='I', icon='eye', head='PHOTIC SNEEZE', sub='REFLEX')
a("and estimates say somewhere between eighteen and thirty-five percent of people have it.", k='S', big='18-35%', label='OF PEOPLE', fx='boom')
a("It often runs in families.", k='I', icon='person', head='RUNS IN FAMILIES')
a("The best guess is that the nerve signals from your eyes and your nose run very close together,", k='C', items=[['eye', 'EYES'], ['nerve', 'SIGNALS'], ['nose', 'NOSE']])
a("so a blast of light gets mixed up with an itch in your nose.", k='I', icon='nose', head='MIXED SIGNALS', sub='BEST GUESS')
a("Nobody has proven exactly how it works yet.", k='Q', head='NOT PROVEN YET')
# 4 BRAIN FREEZE
a("Number four: brain freeze.", k='T', n=4, title='BRAIN FREEZE', icon='icecream')
a("You take a big bite of ice cream, and boom! A sudden pain in your forehead.", k='I', icon='icecream', head='OUCH!', fx='boom', at='boom')
a("The cold hits the roof of your mouth,", k='I', icon='icecream', head='ROOF OF MOUTH')
a("where there's a bundle of nerves called the sphenopalatine ganglion.", k='I', icon='nerve', head='NERVE BUNDLE')
a("Doctors even call it sphenopalatine ganglioneuralgia. Try saying that fast!", k='I', icon='brain', head='SPHENOPALATINE', sub='GANGLIONEURALGIA')
a("One theory is that the blood vessels there react to the sudden cold,", k='I', icon='brain', head='BLOOD VESSELS', sub='ONE THEORY')
a("and your brain reads it as pain in your head.", k='I', icon='brain', head='PAIN SIGNAL', fx='hit')
a("The fix? Press your tongue on the roof of your mouth, to warm it up,", k='I', icon='person', head='TONGUE UP!', sub='WARMS IT UP')
a("or just eat cold stuff slowly.", k='I', icon='clock', head='GO SLOW')
a("It hurts, but it's harmless, and it passes in seconds.", k='F', head='HARMLESS')
# 5 HYPNIC JERK
a("Number five: the hypnic jerk.", k='T', n=5, title='HYPNIC JERK', icon='bed')
a("You're drifting off to sleep, and suddenly it feels like you're falling,", k='I', icon='bed', head='FALLING?!')
a("and your whole body jolts you awake!", k='I', icon='bed', head='JOLT!', fx='boom')
a("That's a hypnic jerk, also called a sleep start.", k='I', icon='bed', head='SLEEP START')
a("Up to seventy percent of people get them.", k='S', big='70%', label='OF PEOPLE', fx='boom')
a("Nobody knows for sure why they happen.", k='Q', head='WHY?')
a("One idea is that as your muscles relax, your brain is switching from awake to asleep,", k='I', icon='brain', head='AWAKE > ASLEEP', sub='ONE IDEA')
a("and that switch can misfire into a quick twitch.", k='I', icon='nerve', head='MISFIRE!', fx='hit')
a("Caffeine, stress, and being very tired can make them more likely.", k='C', items=[['cup', 'CAFFEINE'], ['brain', 'STRESS'], ['bed', 'TIRED']])
a("They're harmless. Just a little rude.", k='F', head='HARMLESS')
# 6 GOOSEBUMPS
a("Number six: goosebumps.", k='T', n=6, title='GOOSEBUMPS', icon='skin')
a("Get cold, or hear an amazing song, and tiny bumps pop up all over your skin.", k='C', items=[['thermo', 'COLD'], ['note', 'MUSIC'], ['skin', 'BUMPS']])
a("Each one is a tiny muscle, pulling a hair straight up.", k='I', icon='skin', head='TINY MUSCLE', sub='PULLS A HAIR UP')
a("Doctors call them cutis anserina, which literally means goose skin.", k='I', icon='skin', head='CUTIS ANSERINA', sub='= GOOSE SKIN')
a("For furry animals, that makes their fur stand up and trap warm air,", k='I', icon='cat', head='FUR PUFF', sub='TRAPS HEAT')
a("or makes them look bigger, to scare off a threat.", k='I', icon='cat', head='LOOK BIGGER!', fx='hit')
a("We lost most of our fur, but we kept the reflex.", k='I', icon='person', head='KEPT THE REFLEX')
a("So goosebumps are just a leftover, from our hairy ancestors!", k='F', head='LEFTOVER!')
# 7 WRINKLY FINGERS
a("Number seven: wrinkly fingers in the bath.", k='T', n=7, title='PRUNE FINGERS', icon='hand')
a("Most people think your skin just soaks up water and puckers.", k='Q', head='SOAKS UP WATER?')
a("But here's the twist: it's actually your nerves doing it!", k='M', head="IT'S YOUR NERVES", stamp='TWIST')
a("Your nervous system shrinks the blood vessels in your fingertips,", k='I', icon='hand', head='VESSELS SHRINK')
a("and the skin on top folds into wrinkles.", k='I', icon='hand', head='WRINKLES!')
a("In fact, if the nerve to a finger is damaged, that finger doesn't wrinkle at all!", k='I', icon='nerve', head='NO NERVE', sub='NO WRINKLES', fx='hit')
a("One idea is that wrinkles work like tire treads, helping you grip wet things.", k='I', icon='water', head='LIKE TIRE TREADS', sub='BETTER GRIP?')
a("In one study, people with wrinkly fingers moved wet marbles about twelve percent faster,", k='S', big='12%', label='FASTER WITH WET MARBLES')
a("but a later study found no difference, so the jury's still out.", k='Q', head='JURY STILL OUT')
# 8 KNUCKLES
a("Number eight: cracking your knuckles.", k='T', n=8, title='KNUCKLE CRACK', icon='hand')
a("That pop is not your bones grinding.", k='M', head='BONES GRINDING?')
a("Your joints sit in a slippery fluid,", k='I', icon='hand', head='JOINT FLUID')
a("and when you pull the joint apart, a gas-filled bubble forms in that fluid, with a pop!", k='I', icon='bubble', head='GAS BUBBLE', sub='POP!', fx='hit')
a("Scientists actually filmed it happening inside an MRI scanner, in twenty fifteen.", k='S', big='2015', label='FILMED IN AN MRI')
a("So, will it give you arthritis?", k='Q', head='ARTHRITIS?')
a("One doctor cracked the knuckles of only one hand, for sixty years.", k='V', a=['LEFT HAND', 'CRACKED'], b=['RIGHT HAND', 'NEVER'])
a("Neither hand got arthritis.", k='F', head='NO ARTHRITIS', fx='boom')
a("He even won an Ig Nobel prize for it, in two thousand nine!", k='I', icon='hand', head='IG NOBEL PRIZE', sub='2009')
a("And bigger studies haven't found a link either.", k='F', head='NO LINK FOUND')
# 9 STOMACH GROWL
a("Number nine: your stomach growling.", k='T', n=9, title='STOMACH GROWL', icon='stomach')
a("That rumble isn't your stomach begging for food.", k='M', head='BEGGING FOR FOOD?')
a("It's gas and liquid being squeezed through your gut by waves of muscle.", k='I', icon='stomach', head='GAS + LIQUID', sub='SQUEEZED ALONG')
a("A couple of hours after your stomach empties, a cleaning wave sweeps the leftovers along,", k='I', icon='stomach', head='CLEANING WAVE', sub='EVERY FEW HOURS')
a("and with no food inside to muffle it, the sound gets loud!", k='S', big='GRRR!', label='NOTHING TO MUFFLE IT', fx='boom')
a("Your gut rumbles when you're full too; the food just muffles it.", k='I', icon='stomach', head='FULL? STILL RUMBLES')
a("Doctors even have a name for it: borborygmi.", k='I', icon='stomach', head='BORBORYGMI')
# 10 FOOT ASLEEP
a("And number ten: your foot falling asleep.", k='T', n=10, title='FOOT ASLEEP', icon='foot')
a("Most people think the blood gets cut off.", k='Q', head='BLOOD CUT OFF?')
a("But mostly, you're squashing a nerve.", k='M', head='SQUASHED NERVE', stamp='TWIST')
a("The squashed nerve stops carrying messages, so your foot goes numb.", k='I', icon='foot', head='NUMB')
a("When you move, the pressure comes off, and the nerve fires a messy burst of signals,", k='I', icon='nerve', head='SIGNAL BURST', fx='hit')
a("which your brain reads as pins and needles!", k='I', icon='foot', head='PINS + NEEDLES')
# OUTRO
a("So your body isn't broken. It's just running some very old, very weird code!", k='I', icon='person', head='OLD CODE')
a("Which one surprised you most? Tell me in the comments,", k='I', icon='person', head='COMMENT 1 TO 10')
a("and subscribe to solo hype, for a weird true fact every day!", k='I', icon='person', head='SUBSCRIBE!', fx='boom')

for x in L:
    v = x['vis']
    if v['k'] == 'T' or v.get('fx') == 'boom': x['emo'] = 0.85
    elif v['k'] in 'QM': x['emo'] = 0.75
S = {'title': '10 Weird Things Your Body Does (And Why)', 'series': '10 WEIRD THINGS YOUR BODY DOES', 'music_db': -25, 'lead': 0.35, 'outro': 1.2, 'gap': 0.42, 'music': 'hype',
     'sources': [
  'Hiccups: Mayo Clinic (Hiccups), WebMD, MedicineNet: diaphragm spasm + vocal cords close, phrenic/vagus nerves, triggers, most stop on their own',
  'Yawning: Gallup & Eldakar 2011 (Frontiers in Evolutionary Neuroscience, more yawning in cooler season), Massen et al. 2014 (Physiology & Behavior); NBC News, ScienceDaily; no link with blood oxygen',
  'Photic sneeze: PBS NewsHour (10-35%), ScienceAlert (17-35%), Science Blog (18-35%), runs in families',
  'Brain freeze: Healthline (sphenopalatine ganglioneuralgia, tongue on palate), Texas A&M Vital Record, ScienceDaily',
  'Hypnic jerk: NBC News, Sleep.com (up to 70%), 1News NZ; caffeine/stress/fatigue',
  'Goosebumps: Wikipedia (Goose bumps, arrector pili), Why Evolution Is True, Durham University repository',
  'Wrinkly fingers: Scientific American, Popular Science, UTMB Medical Discovery News (nerve-controlled vasoconstriction; no wrinkling after nerve damage; grip hypothesis, Newcastle 2013)',
  'Stomach growl: Scientific American, Wikipedia (Borborygmus, Migrating motor complex)',
  'Foot asleep: NBC News, ScienceAlert, Big Think, NINDS (paresthesia)',
  'Hiccup record: Guinness World Records, Smithsonian Magazine (Charles Osborne, 68 years, 1922-1990)',
  'Wrinkly fingers grip study: Newcastle University press release + Nature (2013, 12% faster with wet marbles); Smithsonian (2014 Berlin study found no difference)',
  'Unger Ig Nobel 2009 (Medicine): Improbable Research, Live Science, The Tech',
  'Knuckles: Kawchuk et al. 2015 PLOS ONE (MRI, gas cavity), IFLScience, JSTOR Daily; Unger letter (Arthritis & Rheumatism); Castellanos & Axelrod 1990 (300 people, no excess arthritis)'],
     'lines': L}
json.dump(S, open('script.json', 'w'), indent=1)
print(len(L), 'lines', sum(len(x['text'].split()) for x in L), 'words')
