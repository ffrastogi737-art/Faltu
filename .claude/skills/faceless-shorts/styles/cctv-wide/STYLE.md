# CCTV Dossier (`cctv-wide`): long-form 16:9 explainers in a surveillance-room look, 1920x1080

Made 18 Nov 2026 for Kratos Playz long video 01 ("GTA 5 Habits That Will Get You Caught In GTA 6", 4:19, 40 lines, ~55 shots).
Dark slate screens, a REC dot, a running timecode, amber corner brackets, scanlines and film specks on every frame; on top, dark
"evidence" cards with a coloured edge, stamps (CONFIRMED / REPORTED / UNCONFIRMED), chips and simple drawn icons.
Made for "N things" / checklist / fact-file videos of 4-6 minutes where each item can be a card, a gauge or an icon, and for any
topic where "confirmed vs reported" matters (the stamps carry the sourcing on screen). Sheet: `style-sheet.png`.

## Rules
- Never real game footage, screenshots, logos, box art or character art. Everything is drawn in `src/shots.js` + `src/core/kit.js`
  (silhouettes are faceless; maps are invented blobs, labelled "illustrative shapes, not real maps").
- Colour = meaning: green = confirmed, amber = reported / my plan / the current habit, red = danger / no / caught, cyan = info, white = text.
- Safe area: content between y 130 and y 880, x 120 to 1800. The subtitle bar sits at y 962. HUD (REC, timecode, habit pips) is drawn
  by `overlay()` in `main.js` for every shot; pass `habit` (1-8) to `scene()` to light the progress pip.
- No empty frame for more than ~0.5 s: draw dim placeholders (alpha 0.25) and light them on their word.
- A plan / opinion is labelled "MY PLAN" or "OUR GUESS"; anything unconfirmed carries a chip ("NOT EXPLAINED", "UNCONFIRMED").
- One shot every 3-6 s; every spoken line is its own shot, long lines are split with `scene(line, 'startWord', ...)`.

## Format
1920x1080, 30 fps, 4-5 min = ~650 words (Kokoro `am_michael`, speed 1.0 is ~2.5 words/s). `script.json` lines only need `"text"`:
subtitles are built automatically (`captions.js`: up to 7 words, the word being said turns amber).
Music `"tension"` (low drone + slow pulse) from `tools/mix.py`; cues: whoosh on every cut, pop / tock on reveals, slam on stamps.

## Build
1. `bash scripts/new_video.sh cctv-wide <name>`, rewrite `script.json`, then `scripts/py scripts/voice.py <proj>`.
2. No Whisper (download blocked in the cloud container)? `scripts/py scripts/words_from_lines.py <proj>` spreads each line's words
   over the line's time by letter count (good to about +-0.3 s inside a line). With Whisper use `words.py` instead.
3. Rewrite `src/shots.js` with `scene(line, startWord|null, habit, note, fn, cues)`; `fn({lt, d, t, w, A, E})`:
   `w('word')` = local time of that word, `A('word', dur)` = pop-in 0..1 on that word, `E('word')` = has it been said.
4. `node tools/capture.mjs check` -> `cues` -> `py tools/mix.py .` -> `sheet review/all.jpg 3 6` (LOOK at it) -> `video`.
   Thumbnail: `PAGE=thumb.html node tools/capture.mjs frames review/thumb 0` (1920x1080 JPEG, scale to 1280x720).

## Kit (`src/core/kit.js`)
`text · card · chip · stamp · brackets · ln · star · qmark` (UI) · `car · copCar · person · shirt · camera · cloud · bolt ·
hurricane · rain · gator · manatee · flamingo · bird · disk · clock · eye · trash · landmass · marker` (icons) ·
`background(t)` + `overlay(t, habit)` (the always-on layer). In `shots.js`: `streetBase` (night street feed), `planCard`
(MY PLAN rows with strike-through), `titleCard` (big habit number + auto-fit title), `gauge`, `tiers`.

## QA pitfalls we hit
- `text()` sets its own alpha: inside a `ctx.globalAlpha` block use `ctx.fillText` directly or the item shows at full alpha.
- Icons drawn without an alpha gate show before their card (gate with `E('word')`).
- Long titles run off the right edge: `titleCard` now fits the font to 900 px.
- A card that appears on one word and its text on a later word shows an empty card: gate both on the same word.
