# Comic Pop: bright, colourful, thumbnail-style explainers / lists / news, 9:16

Built 18 Nov 2026 because the owner and the numbers rejected the dark neon look ("thak gaya hoon isko dekh dekh ke,
log bhi nahi dekhna chahte; colourful, kuch alag, attractive CTR wala"). Kratos Playz GTA default from now on; works for
any topic (solo hype too). Example: `example/` = **GTA 6 Just Tied The Highest Score Ever** (47 s, 9 shots, vote ending).
Sheet: `style-sheet.png`.

## Look rules
- Daytime colour, never dark: every shot sets `SCENE = n` and gets its own saturated gradient pair from `BG` (orange,
  blue, pink-purple, green-teal, yellow, violet) with a slowly turning white sunburst and halftone dots. Consecutive shots
  never share a colour.
- Everything is a "sticker": white cards with a thick black ink border, a coloured rim and a hard black offset shadow;
  small rotations (-0.01 to -0.03) so nothing looks like a slide.
- Text = thumbnail text: Inter Black, white or yellow fill, very thick black outline, hard shadow (`neon()` keeps its old
  name and signature so neon-versus shots port over).
- Big reveals sit on a yellow comic `burst()`; numbers count up; ticks/crosses are fat green/red circles.
- Captions: no box, big white words, black outline, ONE yellow word, uppercase, y 1600 (`CAPLOOK` in core/kit.js).
- Same content rules as neon-versus: no real game footage, screenshots, logos, box/character art; REPORTED chip for
  anything only reported; vote ending with two `voteCard`s when it is a series.

## Kit (top of example/src/shots.js)
world(t) · neon(text,x,y,size,col,sc,rot,a) · panel · chip · burst · star · tick · consoleBox · bar · voteCard ·
scoreRing (burst + count-up ring) · critic (tiny person with a page) · clock · count(lt,t0,t1,to) · glowStroke(col,w) = ink + colour stroke.
Port a neon-versus shot: copy it, add `SCENE = n;` (done automatically if you regex `draw(lt, d, t) {`), drop `dim()`.

## QA pitfalls
- A dim placeholder at alpha 0.28 reads as grey mud on bright colours: keep placeholders white at 0.35+ or hide them.
- Labels inside bars at 52 px are the minimum readable size.

## Voice, sound, motion (owner 18 Nov 2026: "aawaz flat hai, sound effects aur graphics mein maza nahi")
- **Voice: Chatterbox TTS** (Resemble AI, MIT, runs on CPU, ~2.5 min per 35 s). One-time install (~6 GB, needs Python 3.11):
  `uv venv -p /usr/bin/python3.11 /root/cbx && VIRTUAL_ENV=/root/cbx uv pip install chatterbox-tts "setuptools<81"`.
  Then `/root/cbx/bin/python SKILL/scripts/cbx_voice.py <proj> 0.7 1.08` (exaggeration, tempo) instead of voice.py, then
  words.py as usual. Per-line `"emo"` in script.json overrides exaggeration (0.85-0.9 for hype lines, 0.5 for calm).
  Write lines with "!" and "?" where you want energy. ALWAYS re-transcribe with Whisper and compare: it can drop a short
  word ("A,") - rewrite that line ("A: what...") and regenerate. Chatterbox adds Resemble's inaudible Perth watermark.
- **Sound** (`tools/mix.py`, also in inside-out): music `"hype"` (140 BPM trap/pop bed) and hype cues `boom` (big reveal,
  max ~1 per 8 s), `riser` (dur, ends ON the reveal), `hit`, `ding`, `swoosh` (every cut), `applause` (dur), `tickclock`
  (dur), `scratch` (record-stop for a myth/twist), `coin`. Old soft cues still work.
- **Motion** (`src/main.js`): every boom/hit/slam cue auto-shakes the camera, punches in and flashes white; booms throw
  confetti; every cut gets a coloured comic wipe. Nothing to add in shots.js beyond the cues.

## Auto engine: write the script, the shots build themselves (19 Nov 2026)
Two data-driven variants: each script line carries a `vis` and `src/shots.js` turns it into a shot + sound cues, so a
new video = a new `make_script.py` (no hand-placed shots). Kinds: `I` icon + headline (+ `sub` chip) · `T` chapter title ·
`S` big stat (counts up if numeric) · `Q` question · `M` myth stamp (`stamp:` for TWIST etc.) · `F` fact stamp ·
`C` chain of 2-3 icons with arrows (each lands on its word) · `V` versus cards. `fx: 'boom' | 'hit'`, `at: '<word>'`.
Icons (drawn in code): person lungs brain nerve clock bubble thermo sun eye nose icecream bed cup skin cat note hand water
stomach foot (+ ear tube plane gum in the vertical one). Add new icons to `ICON` in the same ink-sticker look.
- `long-example/` = 16:9 1920x1080 LONG video (L01 "10 Weird Things Your Body Does", 5:10, chapter badges, captions y 985).
  Voice: `cbx_long.py <proj> gen k n` in n parallel workers (OMP_NUM_THREADS=cores/n), cached per line, then
  `cbx_long.py <proj> join 0.92` (Chatterbox talks ~4 words/s: slow to 0.92 for long-form; 980 words = 5:10).
  Render: `node SKILL/scripts/render_html.mjs <proj> renders/out.mp4 --jobs 3` (~28 fps on 4 cores), then
  `-crf 31 -tune animation` for a ~45 MB repo copy. Whisper-check with a per-line transcribe of data/_cbx/l<i>.wav.
- `auto-vertical-example/` = the same engine laid out 1080x1920 for Shorts (15 "Why Your Ears Pop On A Plane").
  `S` with a `pop`-style word holds the reveal 0.75 s before the next cut.
