# Neon Versus: gaming comparisons and news in a synthwave Vice City look, 9:16

Loud, fast, glowing. A night sky with a striped sunset sun, a magenta perspective grid floor and palm silhouettes; on top,
dark glass panels with neon borders, neon text, chips and simple glowing icons. Built for "X vs Y" comparisons, top-5
lists and launch countdowns (games, phones, cars), and for Hindi narration with Hinglish (Roman) captions.
Example: `example/` = **GTA 5 vs GTA 6: 13 SAAL MEIN KYA BADLA?** (54 s, 12 shots, Hindi voice, vote ending). Sheet: `style-sheet.png`.

## 1. Rules
- **Never use real game footage, screenshots, logos, box art or character art.** Everything is drawn in `shots.js`:
  generic skylines, blob maps, faceless silhouettes, plain console boxes. Names of games and characters as plain text are fine.
- **Colour = side.** The older / left thing is teal-green (`V5`), the newer / right thing is pink (`V6`); orange for
  section chips (`#1 SHEHAR`), gold for numbers and warnings, red for "no", cyan as a third accent.
- A fixed header (`GTA V  vs  GTA VI`) at y 230 on comparison shots. Section chip at y 350. Panels from y 400 to ~1300.
  Keep everything above y 1500: the caption bar sits at y 1660.
- **No empty panels.** Every item a line will name is already on screen as a dim placeholder (`a = 0.28`) and lights up
  on its word. Never leave a panel or a frame empty for more than ~0.5 s.
- Only facts from good sources; anything only "reported" gets a gold `REPORTED · NOT OFFICIAL` chip and the narration says
  "reports ke mutabik". Time-sensitive claims ("this Thursday") go in the description's notes so the owner posts in time.
- **Vote ending (series format):** the last two lines ask the viewer to pick Part 2: `PART 2?` then two `voteCard`s
  (A and B) and `COMMENT KARO  A / B`. Options must be things you can actually make next.
- Music `"neon"` (synthwave kick + bass, 108 BPM, in `tools/mix.py`). Effects: `slam` for big reveals, `pop` per item,
  `whoosh` on cuts, `sparkle` on payoffs.

## 2. Hindi voice
- Voices: `hm_omega` (male, default), `hm_psi`, `hf_alpha`, `hf_beta`; `voice.py` switches to `lang: "hi"` for them.
- Write each line twice: `"say"` in Devanagari (what the voice reads; English words spelled the way they are said:
  जीटीए सिक्स, पीएस फाइव) and `"text"` in Roman Hinglish (what timing and captions use; `Wd('word', i)` looks up these).
- There is no Devanagari font here, so captions and on-screen text are Roman Hinglish / English.
- `speed` 1.05-1.1 keeps a 12-line script under ~55 s.

## 3. Kit (all in `example/src/shots.js`, top of the file)
| function | draws |
|---|---|
| `world(t, { sun, palms })` | sky, stars, striped sun, moving grid floor, swaying palms |
| `header(sc)` | the `GTA V vs GTA VI` bar (edit the names for another pair) |
| `neon(text, x, y, size, col, sc, rot, a)` | white text with a coloured glow and outline |
| `panel(x, y, w, h, col, sc)` · `chip(text, x, y, col, sc, size)` · `dim(a)` | glass card · solid pill label · darken |
| `skyline(x0, x1, y, col, seed, a)` | a generic glowing skyline |
| `blob(cx, cy, r, col, seed, sc, label)` | an invented map shape; area grows with r² (use r·√2 for "2X") |
| `figure(x, y, s, col, name, sc, bob, a)` | a faceless silhouette with a name chip |
| `consoleBox` · `monitor` · `tick(x, y, s, ok)` · `mapIcon` | devices, check / cross, a map icon |
| `voteCard(x, y, 'A', [line1, line2], col, sc, pulse, icon)` | the vote buttons |
| `WdX(word, i)` | exact-word timing (use for one-letter words like `A` that `Wd` would match inside `aap`) |

## 4. QA pitfalls we've hit
- The camera push crops the top: nothing important above y 200.
- A panel that waits 2 s for its first word looks empty: draw dim placeholders from the start.
- `Wd('A', i)` matches the first word *starting* with "a"; use `WdX`.
