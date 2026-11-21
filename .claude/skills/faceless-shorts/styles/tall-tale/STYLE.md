# Tall Tale 3D: visual fables (the @aiwithcb formula), 9:16, 30-60 s

A gripping true story told like a fable: story-dressed 2D cartoon characters (thick ink outlines, big round white heads) acting inside
a matching 3D set full of story props, drawn diagrams and cut-aways. The camera moves in every shot, the first sentence starts inside the
action, and the last line loops back into the first. No sitcom cast, no gag skits.
Reference build for the formula: `example/script.example.json` + `example/shot_plan.example.json` (**The Bullet Holes That Fooled The
Generals**, Abraham Wald and survivorship bias; its sources must be re-checked with 2 fresh sources before anything is published).
`example/script.json` + `src/shots.js` (the mailed-girl story) is the old hand-coded way, kept only as an engine reference.

## 1. Topics (what a tall-tale is about)
- True historical paradoxes (the bomber armor, the Monty Hall argument), bizarre real-world mysteries, mind-bending
  science explainers, and "What Happens If..." survival stories told as a visual fable with a person in them.
- Every fact checked against 2+ reliable sources, listed in `script.json` "sources". Hypotheticals ("what happens if") stay scientifically grounded and say so.
- Not for: office / gym / school sitcom skits, invented jokes about real people, anything that cannot be sourced. Pick topics by `pick_style.py solo kinds` and the hook data like any other solo video.

## 2. Narrative structure (30-60 s, about 90-150 words)
- **0:00 in medias res.** Sentence 1 is already inside the action or the paradox. No greeting, no "today", no setup.
- **New visual every 2-3 lines.** A prop, a drawn diagram, a cut-away metaphor, a costume change (`wear`) or a state change (`soot`: a soot-black face after an
  explosion; a pinboard that fills up; a comparison board). The build refuses 3 shots in a row with nothing new.
- **Camera moves in every shot** (eased push, pull or orbit); no static scene. The build refuses a shot whose camera cannot move.
- **Shape**: paradox or hook, the obvious (wrong) answer, the twist, the evidence, the payoff, then one line that names the lesson.
- **Seamless loop.** The final line stops mid-sentence and flows into line 1 ("...we only ever hear from the" -> "bombers that came home, riddled with bullet holes!").
  No fade in or out anywhere (the last frame cuts straight to the first); `script.json` `lead` 0.15, `outro` 0.15. The build refuses a last line ending in `. ! ?` (`"loop": false` opts out).
- Narration: Chatterbox (`cbx_voice.py`, per-line `emo` 0.8-0.9 on the hook and the twist, tempo 1.1). Write the way you talk to a friend; read it aloud.

## 3. Characters: dressed for THIS story
Every episode defines its own cast in `shot_plan.json` `characters`: a `role` (who they are in the story) and a `look`. No recurring crew, no sitcom archetypes;
the build refuses a look copied from `cast.js` and any look with fewer than 3 costume parts.
- Costume parts: `hat` (cap, bowler, boater, beanie, visor, tophat, baseball, backcap, police, cowboy, fedora, bandana, hood, **crown, helmet, wizard**), `hair`, `beard`
  (full goatee stubble long chops), `neck` (bowtie tie scarf collar chain), `pattern` (check stripes overalls vest apron **coat** = lab coat / uniform), `extra` (glasses
  monocle mustache freckles sunglasses headset earring scar goggles ...), plus `body`/`patCol`/`hatCol`/`band` colours.
- Dress by period and job: WWII mathematician (fedora, glasses, coat) + mechanic (cap, goggles, overalls) + general (peaked cap, gold band); alchemist (wizard hat, long beard,
  coat) + emperor (crown, beard, rich colours); scientist (coat, goggles, glasses); climber (helmet, beanie, scarf); a historical figure in their signature outfit.
- States per shot: `mood`, `action` (stand walk run sit jump clap point shock worry fall slip lie dizzy), `soot` (0-1), `wear` (a look patch for that shot, e.g. `{ "hat": "none" }`), `talk`, `look`.
- Faces do the acting: `smug`, `shock`, `worried`, `happy`, `laugh`, `proud`, `sad`, `angry`, `dizzy` on the beat.

## 4. The world: a custom 3D set + story props
- `setting` / shot `theme`: a name (`room`, `office`, `gym`, `school`, `friends`, `street`, `coast`, `meadow`) or `{ "name": "room", "o": { "wall", "motif", "floor", "ceiling", "signText" } }`
  to paint your own interior (a hangar, a lab, a throne room). Outdoor stories use `street`, `coast`, `meadow`.
- Props per shot (`props[]`): `diagram` (a board you draw with `ops`: rect, ellipse, dot, line, arrow, poly, text; each op can carry `k0` 0-1 to appear during the shot), `solid` (your own 3D prop from
  `parts`: box, cyl, cone, sphere with size, pos, rot, colour, metal), `poster`, `lockers`, `barbell`, `desk`.
- **Every shot needs a character with 3D depth around them. No text-only shots, no full-screen text slides.** A poster or diagram covers at most 45 % of the frame.
- Place props so they are in the picture: a board behind the focus character (z about -6.3, 0.4-0.9 m to the side), a solid within 1 m of them, a diagram between the two people of a two-shot.

## 5. Camera and framing (enforced when the plan is built)
- Presets (`cam`): `wide`, `two-shot`, `medium`, `reaction-push`, `payoff` (head = the figure's height as a share of the frame: 0.15 / 0.22 / 0.31 / 0.24 to 0.33 / 0.27).
- `move`: `push`, `pull`, `orbit-left`, `orbit-right` (defaults: wide orbit-left, two-shot orbit-right, medium push, payoff pull). All eased (eio); each shot blends from the previous camera over 0.4 s.
- Safe zone: every character inside x 70..1010, y 170..1300 in every frame (falls included). Head size changes at most 1.6x between cuts. The solver dollies, shifts the lens and widens the fov to make it so, or stops with a message.
- Inside a room the camera stays at z <= 1.6 (the lens widens instead of getting closer).

## 6. Captions, music, loudness
- Captions: 2-3 words, **clean bold white** (Inter Black, black edge, soft shadow), centred in the lower safe zone (y 1400, size 92, max width 920 so it stays inside x 70..1010); the spoken
  word turns #FFE600 and grows only to 105 % (subtle). Words keep their punctuation and the script's spelling.
- **Default music: `tension`** (a low drone with a slow minor pulse; mix.py). Set it the same in `script.json` `"music"` and `shot_plan.json` `"music"`. Others: `bed`, `neon`, `hype`, `none`
  (there is no "bounce"). Sounds sit on the words that earn them (`hit`, `boom`, `thud`, `slam`, `ding`, `riser`, `scratch`, `whoosh` on cuts).
- Loudness: the final mix is -15.5 LUFS integrated, true peak -1.5 dBTP (`tools/loudness.py`).

## 7. Shot plan (`shot_plan.json`, one shot per script line)
```json
{ "setting": { "name": "room", "o": { "wall": "#8A8F6A", "signText": "HANGAR 3 · 1943" } }, "track": "TALL-TALE", "music": "tension",
  "characters": { "wald": { "role": "1943 mathematician", "look": { "body": "#7A6A58", "pattern": "coat", "hat": "fedora", "neck": "bowtie", "extra": ["glasses", "mustache"] } } },
  "shots": [ { "line": 0, "cam": "medium", "move": "push", "focus": "wald",
               "cast": [ { "who": "wald", "pos": [-0.8, -5.4], "mood": "shock", "action": "shock", "talk": true, "soot": 1, "wear": { "hat": "none" } } ],
               "props": [ { "kind": "diagram", "pos": [0.1, -6.3], "w": 1.5, "h": 1.1, "title": "RETURNED BOMBER", "ops": [ { "t": "dot", "x": 0.4, "y": 0.5, "r": 0.02, "col": "#D8343F", "k0": 0.3 } ] },
                          { "kind": "solid", "pos": [0.3, -4.6], "parts": [ { "shape": "cyl", "size": [0.4, 0.6], "pos": [0, 0.7, 0], "rot": [90, 0, 0], "col": "#4A4F55", "metal": true } ] } ],
               "cues": [ { "word": "riddled", "type": "hit" }, { "at": "start", "type": "whoosh" } ] } ] }
```
`pos`: `left centre right far-left far-right back front` or `[x, z]` metres (camera on +z, back wall at z = -9). Keep people in one shot 2-3 m apart. Cue `word` must be in the line.

## 8. Pipeline (project = `~/faceless-shorts/<name>`, made by `scripts/new_video.sh tall-tale <name>`)
1. `script.json` (lines, `sources`, `music: "tension"`, `lead` 0.15, `outro` 0.15), then `/root/cbx/bin/python scripts/cbx_voice.py <proj>` and `scripts/words.py <proj>` (no voice yet: `scripts/estimate.py <proj>`).
2. `cp shot_plan.example.json shot_plan.json` and rewrite it for the story (characters first, then one shot per line).
3. `node tools/capture.mjs check` -> `CHECK OK`. A failure names the shot and the rule.
4. `node tools/capture.mjs cues`, `python3 tools/mix.py .`, then `python3 tools/loudness.py .` (`data/mix.wav` at -15.5 LUFS; the raw mix stays in `data/mix_raw.wav`; safe to repeat).
5. `node tools/capture.mjs sheet review/all.jpg 1.5 9` and LOOK: characters readable, props in frame, captions correct and in the lower zone, something new every 2-3 lines.
6. `SOFTWARE_GL=1 QS='&res=0.8&aa=0&shadow=1024' FPS=24 node tools/capture.mjs video renders/out.mp4` (about 1.5-3 s per frame without a GPU).

## 9. Engine map (`example/src/`)
`plan.js` (plan -> shots, validation, themes, cameras) · `core/toon.js` (2D cut-out drawing + `Toon`) · `core/world.js` (interior, mainStreet, coast, meadow) · `core/props.js` (`diagram`, `solid`,
`poster`, `lockers`, `barbell`, `desk`, ...) · `core/captions.js` · `core/engine.js` (tone curve, shadows, bloom, depth of field) · `cast.js` (the old recurring crew: legacy, not used by plans).

## 10. QA pitfalls
- A cut-out seen from the side becomes a sliver (falls lean at most 40 deg, slips 30 deg; `lie` is a slumped sit).
- Shadows only fall inside the sun's shadow box; a new set may need `sun.key.target` moved near the action.
- Cut-outs keep their state between shots: unused people are hidden, props only show in their own shot.
- A push or pull needs room: when the cast already fills the frame the build asks for an orbit instead.
- Check the facts again after the script is final; the example's sources are placeholders for the format, not a verified publish.
