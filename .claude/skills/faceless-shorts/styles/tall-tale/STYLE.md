# Tall Tale 3D: funny true stories and fictional skits, 9:16

Playful, clever, a little cheeky. Flat 2D cartoon people (thick ink outlines, big round white heads, bean bodies, stick
limbs) acting inside a sunny, saturated 3D world: offices, gyms, school corridors, streets, a friend's flat. The camera
moves, faces react on every beat, captions come 2-3 words at a time with the spoken word lit in yellow.
Reference: `example/` = **THE GIRL WHO WAS MAILED TO GRANDMA** (hand-coded shots, the old way; 52 s). Sheet: `style-sheet.png`.
New videos are built from a **shot plan** (section 3), not from hand-coded shot functions.

## 1. Rules
- **Two kinds of story, both 25-35 s, 9:16.**
  - *True story*: punchy and sourced. 2+ reliable sources (museums, encyclopaedias, major outlets) listed in `script.json`
    "sources". If sources disagree on a number, use the one most give and keep the wording simple.
  - *Fictional skit*: a made-up comedy sketch. No real person named, no claim that it happened, and the first line must not
    say it is true.
  - Settings rotate (one new setting per video, never the same as the last two): `office`, `gym`, `school` (school or
    college), `street`, `friends` (a friend group in a flat). Map: `THEMES` in `src/plan.js`.
- **People are 2D, the world is 3D.** Every person is a `Toon` cut-out that turns to face the camera and casts a real
  shadow. Never build people in 3D; never draw sets flat.
- **Every shot needs a character.** No text-only shots, no full-screen text slides. Posters are props on a 3D wall, never more
  than 45 % of the frame. The build refuses a shot without a character.
- **Faces do the acting.** Change the mood on the beat: `smug` when someone's clever, `shock` on the reveal, `laugh` /
  `happy` for the payoff, `worried` + `sweat` for trouble. Blink and talk are automatic.
- **Safe zone.** Every character stays inside x 70..1010, y 170..1300 of the 1080x1920 frame in every frame of the shot,
  falls and slips included. The framing solver dollies out or widens the lens to make that true; if the cast cannot fit at
  70 deg, the build stops with a message: move the cast closer together or use fewer people.
- **No size jumps.** The head size changes by at most 1.6x from one shot to the next (measured, not requested). Cameras
  blend from the previous shot over 0.4 s.
- **Captions**: 2-3 words per chunk, white Inter Black with a black edge, in the lower safe zone (y 1400, size 92). The spoken
  word turns **#FFE600** and grows to 112 %. Words keep their punctuation and spelling.
- Bright midday sun outside, warm bulbs inside, pink sunset for endings or flashbacks.
- Story shape: open on the most surprising line (inside 2 s), then the setup, one picture per clause, short reaction beats,
  and a punchline that flips the opening.
- Narration: upbeat storyteller (`cbx_voice.py`, Chatterbox, tempo 1.12). Lots of small sounds on the words that call for them
  (`pop`, `boing`, `stamp`, `ding`, `whoosh`, `thud`, `slide`). Music `"bounce"` (light comedy).
- **Loudness**: the final mix is -15.5 LUFS (integrated), true peak -1.5 dBTP (`tools/loudness.py`, section 4).

## 2. Engine map (`example/src/`)
| file | gives you |
|---|---|
| `plan.js` | `buildPlanShots(E, plan)`: turns `shot_plan.json` into shots, cues and a report; `validatePlan`; `THEMES` (sets), `CAMS` (camera presets), `SAFE` (the safe zone) |
| `core/engine.js` | `makeEngine` (tone curve, soft shadows, bloom, depth of field, saturation grade), `camera(fov)` |
| `core/toon.js` | `new Toon(look, { height })` (cut-out: `.at(x,y,z)`, `.set(st)`, `.face(cam)`), `drawToon` (2D drawing) |
| `core/world.js` | sets: `interior(E, o)` (room: `w`, `depth`, `wall`, `motif`, `floor`, `ceiling`, `signText`), `mainStreet`, `coast`, `meadow`; `snapshot(E, scene, cam)` |
| `core/props.js` | `poster(lines, {w,h,bg,fg,accent})`, `lockers(n, col)`, `barbell()`, `desk(w)`, `house()`, `train()`, and more |
| `core/captions.js` | `buildCaptions(script)` (2-3 word chunks with word timings), `drawCaption(t)` (active word #FFE600) |
| `cast.js` | `CREW`: 12 original characters (`rookie`, `cop`, `tony`, `lucy`, `hank`, `gus`, `rex`, `dee`, `max`, `pete`, `moe`, `nia`); `cast.html` is the sheet. Never real GTA character art |

**Toon look**: `{ body, pattern, patCol, hat, hatCol, neck, neckCol, hair, hairCol, beard, beardCol, extra: [sunglasses, glasses, headset, earring, scar, snout, bignose, mustache, freckles, blush, pencil, monocle], kid }`.
**Toon state**: `{ mood: neutral│smug│happy│laugh│shock│worried│angry│sad│sly│proud│tired│dizzy, look, blink, talk, sweat, armL / armR, legs: stand│walk│run│sit│jump, lean, bob, holdL / holdR }`.

## 3. Shot plan (`shot_plan.json`, one shot per script line)
Copy `example/shot_plan.example.json` into the project and edit it. Its shots are the 10-shot office skit (`lines` must match
`script.json`; `line` is the index of the script line the shot starts on).
```json
{ "setting": "office", "track": "TALL-TALE", "cast_keys": ["moe", "nia"],
  "shots": [ { "line": 0, "theme": "office", "cam": "medium", "focus": "moe", "yaw": 0,
               "cast": [ { "who": "moe", "pos": "left", "mood": "smug", "action": "walk", "to": [-1.2, -2.8], "dir": "left",
                           "talk": true, "look": [0, 0] } ],
               "props": [ { "kind": "poster", "pos": "back", "lines": ["THE BIG IDEA"], "w": 2.2, "h": 1.3 } ],
               "cues": [ { "word": "stole", "type": "boom", "gain": 0.9 }, { "at": "start", "type": "whoosh" } ] } ] }
```
- `cam`: `wide` (fov 60, heads about 0.10-0.15 of the frame), `two-shot` (2 characters, 0.17), `medium` (0.24), `reaction-push`
  (0.17 → 0.23 on the beat), `payoff` (low camera, 0.20).
- `cast[]`: `who` (a `CREW` key), `pos` (`left centre right far-left far-right back front`, or `[x, z]` in metres: keep multi-person
  shots 2-3 m apart), `mood`, `action` (`stand walk run sit jump clap point shock worry fall slip lie dizzy`), `to` (walk to
  `[x, z]`), `dir` (`left` / `right` for falls and slips), `kid`, `talk`, `look`.
  A fall leans at most 40 deg, a slip at most 30 deg (the cut-out goes edge-on beyond that); `lie` is a slumped sit.
- `props[]`: `poster` (`lines`, `w`, `h`, `pos`), `lockers`, `barbell`, `desk`. Posters are the on-screen text: short, big.
- `cues[]`: `{ "word": "...", "type": ..., "gain": ... }` (sound on a word; the word must be in the line) or `{ "at": "start" | seconds, "type": ... }`.
  Types: the ones `tools/mix.py` plays (`whoosh`, `pop`, `boom`, `thud`, `ding`, `boing`, `slide`, ...), listed in `plan.js` `CUE_TYPES`.
- Themes are `office`, `gym`, `school`, `street`, `friends`, `coast`, `meadow` (interior themes take `lockers` and `poster` props on walls).

## 4. Pipeline (project = `~/faceless-shorts/<name>`, made by `scripts/new_video.sh tall-tale <name>`)
1. `script.json` (lines, `sources`, `lead` 0.15, `gap` 0.12, `outro` 0.7), `cbx_voice.py`, `words.py`.
2. `shot_plan.json` from the example; one shot per line.
3. `node tools/capture.mjs check` → `CHECK OK` (every shot in the safe zone, head sizes within 1.6x). A failure names the shot and the rule.
4. `node tools/capture.mjs cues`, `python3 tools/mix.py .` (raw mix, `data/mix.wav`).
5. `python3 tools/loudness.py .` → `data/mix.wav` at -15.5 LUFS, true peak -1.5 dBTP; the raw mix is kept as `data/mix_raw.wav`.
   It detects a fresh mix.py run by hash, so running it twice is safe. It refuses to write if the duration changes.
6. `node tools/capture.mjs sheet review/all.jpg 1 9`: look at it (captions correct and in the lower zone, no empty frames over 1 s,
   characters readable, no cut-outs cut by the frame edge, posters legible).
7. `SOFTWARE_GL=1 QS='&res=0.8&aa=0&shadow=1024' FPS=24 node tools/capture.mjs video renders/out.mp4` (muxes `data/mix.wav`).
   Render speed ≈ 1.5-3 s per frame without a GPU.

## 5. QA pitfalls
- A cut-out seen from the side becomes a sliver: the camera stays within ~60° of facing people (`.face(cam)` handles the rest).
- People inside furniture: check the feet heights (boardwalk 0.18, counter top 1.18 + scale 0.08).
- Shadows only fall inside the sun's shadow box: move `sun.key.target` near the action when you build a new set.
- Cut-outs keep their state from shot to shot: move unused people out of frame and reset moving props each shot.
- The room is small: a medium shot inside a room needs the camera at z ≤ 1.6 (the solver widens the lens instead of getting closer).
