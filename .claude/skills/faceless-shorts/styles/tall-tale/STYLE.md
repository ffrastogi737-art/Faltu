# Tall Tale 3D: cinematic mini-movies (the @aiwithcb formula), 9:16, 45-60 s

A gripping true story played out by story-dressed 2D cartoon characters (thick ink outlines, big round white heads) inside matching
3D sets full of real objects. Knee-up / waist-up framing, characters in conflict who talk in the moment, a camera that never stops,
3+ looks (sets or lighting), a suspense underscore, and a last line that loops into the first. No lectures, no whiteboards, no sitcom cast.
Reference build: `example/script.example.json` + `example/shot_plan.example.json` (**The Bullet Holes That Fooled The Generals**: runway at dusk,
hangar, war room at night, a diner street for the analogy; dramatized, its sources must be re-checked with 2 fresh sources before publishing).
`example/script.json` + `src/shots.js` (the mailed-girl story) is the old hand-coded way, kept only as an engine reference.

## 1. Topics
True historical paradoxes, bizarre real-world mysteries, mind-bending science, and "What Happens If..." survival stories, told as a mini-movie
with people in it. Every fact checked against 2+ reliable sources in `script.json` "sources"; dramatized scenes are fine, invented facts are not.
Not for: office / gym / school sitcom skits, jokes about real people, anything that cannot be sourced.

## 2. Script: a mini-movie, not a summary (the build checks the numbers)
- **45-60 s, 135-175 words, 14-18 lines** (one cut per line). Preview timing with `scripts/estimate.py <proj> --wps 3.9` (Chatterbox at tempo 1.03 speaks about 4 words/s).
- **0:00 in medias res**: line 1 is already inside the conflict. No greeting, no "today", no setup, no date-first intro.
- **Dialogue and conflict in the moment**: at least 3 lines where a character speaks in quotes (`"Bolt armor on every spot that got hit!"`); someone wants something, someone pushes back.
- **Concrete stakes** (crews' lives, a fortune, a city) and **one relatable everyday analogy, shown on screen** (judging a diner only by the people who walk out smiling).
- **Banned**: Wikipedia-style summaries and textbook definitions ("is known as", "is called", "has a name", "refers to", "according to", "in summary"): the build stops on them.
  Show the idea happening to the characters instead of naming it.
- **Seamless loop**: the last line stops mid-sentence and flows grammatically into line 1 ("...remember that sometimes" -> "the bullet holes are lying."). No fade anywhere.
- Shape: the hook line, the situation, the obvious (wrong) plan, the outsider's question, a held silence, the analogy, the reveal, the stakes, the payoff, the loop line.

## 3. Voice and sound
- `python3 tools/voice.py .` (Chatterbox, **tempo 1.03**: natural dramatic delivery), then `scripts/py scripts/words.py .`.
  `script.json`: `"tempo": 1.03`, `"exaggeration": 0.75`, `"gap": 0.3`; per line `"emo"` (0.85-0.95 on the hook and the dialogue) and `"pause"`
  (0.4-0.9 s of held silence BEFORE a reveal or a punchline).
- Music: **`"suspense"`** (default): a subtle cinematic underscore (slow minor string pads, a soft heartbeat pulse, a faint shimmer), ducked under
  the voice, no fade in or out (it loops). Set the same name in `script.json` and `shot_plan.json`. Others: `tension`, `bed`, `neon`, `hype`, `none`.
- Sounds only on the words that earn them (`slam`, `boom`, `hit`, `thud`, `scratch`, `heartbeat`, `riser`, `ding`, `gulp`; a soft `whoosh` on cuts).
- Final mix **-15.5 LUFS** integrated, true peak -1.5 dBTP: `python3 tools/loudness.py .` after `tools/mix.py`.

## 4. Characters: dressed for THIS story
`shot_plan.json` `characters`: each has a `role` and a `look` with 3+ costume parts (hat, hair, beard, neck, pattern, extra). A look copied from
`cast.js` is refused. Pieces: hats (fedora, police, cap, crown, helmet, wizard, bowler, tophat, boater, beanie, cowboy, hood, ...), beards, ties /
bowtie / scarf, `pattern: coat` (lab coat or uniform), `overalls`, `vest`, `check`, `stripes`, extras (glasses, goggles, mustache, monocle, headset ...).
Per shot: `mood` (neutral smug **smirk** happy laugh shock **wide** worried angry sad sly proud tired dizzy), `action` (stand walk run sit jump clap point shock worry fall slip lie dizzy,
and the dramatic stances **recoil triumph accuse facepalm cower slump smug-stand**), **`fx`** (a list: `steam` = angry steam puffs off both sides of the head, `sweat` = a drop, `sweat-fly` = sweat flying off
the face), `talk`, `sweat`, `soot` (blackened face), `wear` (a costume change), `bg: true` (a background extra). A stance brings its own mood: `accuse` = angry + steam, `cower` = saucer eyes + flying sweat,
`smug-stand` = smirk with folded arms, `recoil` = wide eyes and a lean back. Unknown moods, actions or fx stop the build.
The cut-out is a card: it turns up to 32 deg toward the camera (a 3/4 view) and has two dark layers behind it (card thickness), so it never goes edge-on. A contact shadow sits under every pair of shoes.

## 5. Framing: knee-up / waist-up (enforced)
- Every primary character fills **55-70 % of the frame height** (presets: `medium` 0.64, `two-shot` 0.58, `reaction-push` 0.58 -> 0.70, `payoff` 0.62, `wide` 0.55 for a group).
- **Hard check**: the build fails if a primary character is under **45 %** of the frame height anywhere in its shot (background extras `bg: true`: 30 %).
  Two people stand about 0.8-0.9 m apart; groups of 3 need `wide` and tight spacing.
- Safe zone: the whole body stays inside x 70..1010; the head (hat to chin) inside y 170..1300 (hat about 50 px under the top). Legs may run into the caption zone.
- The camera moves in every shot (`move`, defaults by preset), eased, blending from the previous camera over 0.4 s so it never stops across a cut. A shot whose camera cannot move fails.
  `push` / `pull` (head 1.1x), **`dolly-in` / `dolly-out` (1.22x, a real move of the lens position)**, `orbit-left` / `orbit-right` (+-7 deg), **`track-left` / `track-right`** (the camera slides 0.22 m sideways while its look-at
  follows half of it: parallax), **`crane-up`** (rises 0.9 m and tilts down: a high angle), **`crane-down`** (sinks from a high angle), **`tilt-up`** (a fixed camera tilts from the feet to the face).
  Every move is checked against the framing rules at 5 points of the shot; a tracking or dolly shot that pushes a two-shot out of the safe zone, or a solid off screen, fails with the shot named. Two-shots and groups: use orbit / push / crane.
- Head-size change between cuts at most 1.6x.

## 6. Sets, light and props: no lectures (enforced)
- **Banned: characters explaining in front of whiteboards, easels, boards or charts.** The prop kinds `diagram`, `whiteboard`, `board`, `easel`, `chart`, `slide` are refused.
  Posters are only signs in the set: at most 2 short lines, at most 10 % of the frame, in at most 20 % of the shots.
- **Characters are 2D, everything else is 3D** (owner 28 Nov 2026). The story's THINGS are real 3D models from the library `core/models.js`
  (`{ "kind": "model", "model": "pig", ... }`): shaped parts, lit by the set's light rig, with a dark ink outline so they sit next to the inked cast.
  Library: **pig** (`col` '#3A3640' = black pig, `mood` angry / scared / happy / x, `pose` stand / dead (on its back, legs up) / side, `mud`),
  **cannon** (`fire` = flash + smoke, `balls`), **flag** (`design` uk / us / stripes / tricolor with `cols` / plain with `col` / pirate; the cloth waves),
  **ship** (sailing warship, `col`, `pennant`), **tank** (riveted storage tank, `label`, `crack` = cracks + oozing liquid, `drip` colour), **wave**
  (a 3D wall of liquid, molasses by default, `col` for water), **potatoes** (`basket: false` = a heap), **barrel** (`label`), **crate** (`label`),
  **plane** (WWII bomber, `holes`, `smoke`); animals **cow horse dog chicken sheep rat** (`mood`, `pose` dead / side; horse `mane`); vehicles **cart**
  (`load` hay / crates), **carold** (1910s car), **train** (steam, smoking), **rowboat**; things **sack** (`label`), **money**, **gold**, **coins**, **letter**
  (`label`), **newspaper** (`label` = headline), **bomb** (lit fuse), **fire** (campfire), **tree**, **rock**, **tent**, **lantern**, **bucket** (`fill`), **bottle** (`label`).
  Wheels turn with `anim: "roll"`. Weak spots to check on the frames: coins read as a lump at small size, gold / coins / lantern brightness under night or alarm light.
  Common options: `h` (height in m, default = real size), `ry` (yaw in degrees; default -25 = 3/4 view toward the camera), `flip` (face left),
  `anim` (bob wobble hop shake sway roll spin), plus `motion` like a solid. Preview every model: serve `example/` and open `sheet-models.html`
  (`?v=[["pig",{"pose":"dead"}]]`). **A story about a thing that is not in the library: build its model in `core/models.js` first** (copy the pig:
  capsules / lathes / extrusions / tubes, real proportions, `eyes()` for animals), check it on the sheet, then use it.
  **Never assemble an animal, a vehicle, a weapon or a building from loose `solid` spheres and boxes** (the 29-pig-war pig read as "a round egg").
  `solid` stays for plain geometry only (a table top, a slab, a pole).
- **Placement**: `"side": "left" | "right"` stands the model next to the outermost person on that side, a step in front and overlapping the legs a
  little (knee-up framing), so it is never hidden; `"side": "front"` puts a small thing (at most 0.8 m: a basket, a dead pig, coins) on the ground in
  front of the knees; `"pos": [x, z]` places set dressing, usually far behind the cast (a ship at sea, flags over the shoulders).
  Models placed with `side` (or within 1.2 m of the cast) are framed WITH the cast, so a wide model makes the people smaller: one model per side,
  small things `front`, a smaller `h`, or a big model far back with `pos`. A model wider than about 0.8 m beside a person in a `medium` shot pushes
  the person under 45 % and fails the build.
- **Checks on every model** (the build names the shot): at least half of it (up to head height) on screen, at least 12 % of the frame height,
  not more than 40 % hidden behind a person, not covering more than 25 % of a face. At least **3 shots show a model**, a third of the shots show a
  story object (model or solid), one shot has 2+ side by side (the comparison), and 2+ of them move (`motion`, `anim`, or a waving flag / wave / fire / crack).
- **3+ looks**: change the set (`theme`) or the light (`light`) at least 2 times, and never stay in one set + light for 30 s or more.
- **Lighting is a real 3D rig per shot** (`engine.js` LIGHT_RIGS), not a tint: `day`, `warm` (low gold key), `dusk` (the key swings low and orange, blue rim), `night` (blue moon key, deep blue frame, warm lamps),
  `alarm` (red key and points that pulse, red frame), `spot` (one hard top light, the rest dark). A rig swings the key light around its target, recolours rim / sky / ground bounce / point lights, drifts the key a few degrees across the shot,
  and sets exposure, vignette, bloom and a whole-frame tint (the sky too). Contact shadows under the people get darker in dusk, night, alarm and spot. In a room the key is the window light, so it moves less.
- **Diegetic story props** (the story's details live INSIDE the 3D set, never as text overlays): `calendar` (`month`, `mark` = circled day, `cross` = days crossed out one by one across the shot), `sign` (`lines`, 1-2 short), `breaker` (`flip: true`
  = the lever throws and the lamp turns red), `clock` (`hour`, `min`, `spin` = minute-hand turns across the shot, `hang` = ceiling height to hang it from a rod), `phone` (`lines`: [sender, message], pops in), `marker` (`label`, a striped measuring pole with a flag),
  `papers` (`lines`, fan out across the shot). Options `pos` [x, z], `y` (hang height; defaults 1.4-2.6 m for wall props), `ry`, `w`, `h`. Text is 18 characters per line at most, 2 lines at most.
  The narrow 9:16 frame shows only about +-2 m of the back wall: hang wall props near x +-2, or put them free in the scene next to the cast (a hanging clock, a floating phone, a pole, papers on the ground).
- **Depth layers** (`world.depthLayers`, automatic in every set): rooms get ceiling beams, wall pilasters, a runner rug to the back wall, furniture, plants and standing lamps flanking the window; outdoor sets get tree / lamp / palm rows on
  both sides at several depths and foreground bushes, so every camera move shows parallax.
  Themes: `room` (paint it: `{ "name": "room", "o": { "wall", "motif", "floor", "ceiling", "signText" } }`), `meadow` (`{ "sunset": true, "fenceOn": false }`), `street`, `coast`, `office`, `gym`, `school`, `friends`.
  **Period stories** (before about 1900): `street` and `coast` take `"o": { "era": "old" }` (no cars, no power poles or wires, a dirt road; the coast becomes a
  harbour without beach umbrellas, surfboards or a billboard). A modern asphalt road with cars in an 1859 story is a wrong fact on screen.
- Something new at least every 3rd shot (a prop, a set or light change, a costume or soot change).

## 7. Captions
2-3 words, clean bold white (Inter Black, black edge, soft shadow), centred in the lower safe zone (y 1400, max width 920); the spoken word turns
#FFE600 at 105 %. Words keep the script's spelling and punctuation.

## 8. Shot plan (`shot_plan.json`, one shot per script line)
```json
{ "setting": { "name": "meadow", "o": { "sunset": true, "fenceOn": false } }, "track": "TALL-TALE", "music": "suspense",
  "characters": { "general": { "role": "WWII Air Force general", "look": { "body": "#5C6B3E", "pattern": "coat", "hat": "police", "neck": "tie", "extra": ["mustache"] } } },
  "shots": [ { "line": 2, "theme": { "name": "room", "o": { "wall": "#8A8F6A", "signText": "HANGAR 3 · 1943" } }, "light": "warm", "cam": "medium", "move": "push", "focus": "general",
               "cast": [ { "who": "general", "pos": [-0.3, -5.2], "mood": "angry", "action": "point", "talk": true } ],
               "props": [ { "kind": "solid", "pos": [0.5, -6.0], "motion": { "grow": 0.3 }, "parts": [ { "shape": "box", "size": [1.6, 0.8, 0.1], "pos": [0, 1.25, 0], "col": "#7C8A5C" } ] } ],
               "cues": [ { "word": "slams", "type": "slam" } ] } ] }
```
`pos`: `[x, z]` metres (camera on +z; rooms: people near z -5, back wall z -9; outdoors: people near z -3). Cue `word` must be in the line.

Keys added 22 Nov 2026 (all validated at build time): shot `light` = one of day warm dusk night alarm spot; shot `move` = one of push pull orbit-left orbit-right dolly-in dolly-out track-left track-right crane-up crane-down tilt-up; cast `mood`, `action`, `fx` as in section 4;
props `kind` = model solid poster lockers barbell desk calendar sign breaker clock phone marker papers (section 6).
Example model props: `{ "kind": "model", "model": "pig", "col": "#3A3640", "mood": "angry", "side": "right", "anim": "wobble" }`,
`{ "kind": "model", "model": "pig", "pose": "dead", "mood": "x", "side": "front", "h": 0.5 }`, `{ "kind": "model", "model": "flag", "design": "uk", "pos": [-0.75, -5.5], "h": 3.0, "flip": true }`. Example: `{ "kind": "breaker", "pos": [-2.0, -8.82], "y": 1.55, "flip": true, "w": 0.55, "h": 0.78 }`,
`{ "kind": "phone", "pos": [-0.72, -4.6], "ry": 14, "lines": ["HQ", "Bolt armor NOW"] }`, cast `{ "who": "general", "action": "accuse", "fx": ["steam"], "talk": true }`.

## 9. Pipeline (project = `~/faceless-shorts/<name>`, made by `scripts/new_video.sh tall-tale <name>`)
1. `script.json` (copy `script.example.json`), `python3 tools/voice.py .`, `scripts/py scripts/words.py .` (no voice yet: `scripts/estimate.py . --wps 3.9`).
2. `shot_plan.json` (copy `shot_plan.example.json`): characters first, then one shot per line.
3. `node tools/capture.mjs check` -> `CHECK OK` (format, framing, props, looks, loop). A failure names the shot and the rule.
4. `node tools/capture.mjs cues`, `python3 tools/mix.py .`, `python3 tools/loudness.py .`.
5. `node tools/capture.mjs sheet review/all.jpg 2 9` and LOOK: faces big, props on screen, 3+ looks, captions clean.
6. `SOFTWARE_GL=1 QS='&res=0.8&aa=0&shadow=1024' FPS=24 node tools/capture.mjs video renders/out.mp4` (about 1-1.5 s per frame on 4 CPU cores).

## 10. Engine map and pitfalls
`plan.js` (plan -> shots, all checks, themes, lights, cameras) · `core/toon.js` · `core/world.js` · `core/models.js` (the 3D story models) · `core/props.js` (`solid`, `poster`, ...) · `core/captions.js` ·
`tools/voice.py` · `tools/mix.py` · `tools/loudness.py` · `cast.js` (old recurring crew: legacy).
- Cut-outs always turn toward the camera (3/4 view, never edge-on); a fall leans up to 55 deg, a slip 30 deg; `lie` is a slumped sit. Big leans widen the group and can push a two-shot out of the safe zone: keep stances in two-shots calm (accuse, cower lean only 2 deg).
- Camera moves are checked: dolly is 1.22x and tracking 0.22 m on purpose (more pushes the story solids or the second person out of frame). A `solid` that leaves the frame during a move fails the build: put it within 0.7 m of the people.
- Alarm and night are dark on purpose; keep a light prop (papers, a phone, a lamp) in those shots so the story object still reads.
- Props behind a person are hidden by them: put the story object beside the shoulder, not behind the back.
- Cut-outs keep their state between shots; props only show in their own shot.
