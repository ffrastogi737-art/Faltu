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
Per shot: `mood`, `action` (stand walk run sit jump clap point shock worry fall slip lie dizzy), `talk`, `sweat`, `soot` (blackened face), `wear` (a costume change), `bg: true` (a background extra).

## 5. Framing: knee-up / waist-up (enforced)
- Every primary character fills **55-70 % of the frame height** (presets: `medium` 0.64, `two-shot` 0.58, `reaction-push` 0.58 -> 0.70, `payoff` 0.62, `wide` 0.55 for a group).
- **Hard check**: the build fails if a primary character is under **45 %** of the frame height anywhere in its shot (background extras `bg: true`: 30 %).
  Two people stand about 0.8-0.9 m apart; groups of 3 need `wide` and tight spacing.
- Safe zone: the whole body stays inside x 70..1010; the head (hat to chin) inside y 170..1300 (hat about 50 px under the top). Legs may run into the caption zone.
- The camera moves in every shot (`move`: push, pull, orbit-left, orbit-right; defaults by preset), eased, blending from the previous camera over 0.4 s. A shot whose camera cannot move fails.
- Head-size change between cuts at most 1.6x.

## 6. Sets, light and props: no lectures (enforced)
- **Banned: characters explaining in front of whiteboards, easels, boards or charts.** The prop kinds `diagram`, `whiteboard`, `board`, `easel`, `chart`, `slide` are refused.
  Posters are only signs in the set: at most 2 short lines, at most 10 % of the frame, in at most 20 % of the shots.
- **Real 3D objects tell the story**: `solid` props (box, cyl, cone, sphere parts with size, pos, rot, col, metal) in at least a third of the shots,
  **one visual comparison** (2+ solids side by side: the riddled wing vs the clean engine), and at least 2 solids that move (`motion`: `slide` [dx, dz] in,
  `spin` degrees, `grow` from a scale, `bob` metres). A solid whose centre is off screen fails the build: keep it within about 0.7 m of the people.
- **3+ looks**: change the set (`theme`) or the light (`light`: day, warm, dusk, night, alarm, spot) at least 2 times, and never stay in one set + light for 30 s or more.
  Themes: `room` (paint it: `{ "name": "room", "o": { "wall", "motif", "floor", "ceiling", "signText" } }`), `meadow` (`{ "sunset": true, "fenceOn": false }`), `street`, `coast`, `office`, `gym`, `school`, `friends`.
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

## 9. Pipeline (project = `~/faceless-shorts/<name>`, made by `scripts/new_video.sh tall-tale <name>`)
1. `script.json` (copy `script.example.json`), `python3 tools/voice.py .`, `scripts/py scripts/words.py .` (no voice yet: `scripts/estimate.py . --wps 3.9`).
2. `shot_plan.json` (copy `shot_plan.example.json`): characters first, then one shot per line.
3. `node tools/capture.mjs check` -> `CHECK OK` (format, framing, props, looks, loop). A failure names the shot and the rule.
4. `node tools/capture.mjs cues`, `python3 tools/mix.py .`, `python3 tools/loudness.py .`.
5. `node tools/capture.mjs sheet review/all.jpg 2 9` and LOOK: faces big, props on screen, 3+ looks, captions clean.
6. `SOFTWARE_GL=1 QS='&res=0.8&aa=0&shadow=1024' FPS=24 node tools/capture.mjs video renders/out.mp4` (about 1-1.5 s per frame on 4 CPU cores).

## 10. Engine map and pitfalls
`plan.js` (plan -> shots, all checks, themes, lights, cameras) · `core/toon.js` · `core/world.js` · `core/props.js` (`solid`, `poster`, ...) · `core/captions.js` ·
`tools/voice.py` · `tools/mix.py` · `tools/loudness.py` · `cast.js` (old recurring crew: legacy).
- A cut-out seen from the side becomes a sliver: falls lean at most 40 deg, slips 30 deg; `lie` is a slumped sit.
- Props behind a person are hidden by them: put the story object beside the shoulder, not behind the back.
- Cut-outs keep their state between shots; props only show in their own shot.
