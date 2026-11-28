# Nafay 3D Style Library (owner's pick, 15 Nov 2026)

Source: https://nafay3d.com/#library (the creator whose faceless-shorts skill we use). Site terms: "Style Library prompts
are free to use for your own videos." Use them for OUR videos only; do NOT commit their source files to this public repo
(keep them in the project folder outside the repo; commit only our rendered MP4 and our own notes/tools).

Each style: `https://nafay3d.com/styles/<id>/source.html` = one self-contained HTML animation (canvas, CM helpers, SFX
sound kit, scenes, timeline TL, player). It exposes `window.seek(t)`, `window.DURATION`, `window.scoreSound`,
`window.SFX`. Their own render recipe: headless Chrome, `seek(i/30)` per frame, capture the canvas, ffmpeg; effects audio
from `SFX.render(scoreSound, DURATION, 48000, {voiceover: true})` mixed under our narration. Rebuild rule: keep CM, SFX,
player and the style's helpers; replace only the story (TL, scenes, words, props); every frame a pure function of t
(CM.rng / CM.noise1, never Math.random); captions/timing from our Kokoro narration + data/words.json.

## Vertical 720x1280 styles (Shorts-ready), our picks
- solo hype (facts / body / history / mysteries): myth-or-fact, comic-panels, storybook, marker-board, blueprint,
  evidence-board, isotype, timeline-rail, parchment-map, chat-story, shadow-puppets, woodcut-tale, rubber-hose-reel;
  3D (slower render without GPU): size-lineup, cosmic-scale, bio-glow, iso-cutaway, exploded-view.
- Kratos Playz (GTA; any of these may replace neon-versus if they win): versus-split, tier-list,
  top-5-countdown, quiz-countdown, breaking-desk, pixel-quest, glitch-pack, neon-line; 3D: synth-grid.

## All 62 ids
16:9 (not for Shorts unless re-laid out): creator-motion, chalk-talk, clean-tech, software-walkthrough, data-story,
warm-canvas, pop-info.
720x1280: clay-diorama, bio-glow, cosmic-scale, exploded-view, low-poly-atlas, size-lineup, data-city, glass-icons,
iso-cutaway, globe-arcs, physics-toybox, deep-layers, synth-grid, product-turntable (3D); paper-craft, marker-board,
blueprint, zine-collage, comic-panels, parchment-map, timeline-rail, isotype, evidence-board, storybook, pixel-quest,
terminal, swiss-grid, math-canvas, tactics-board, market-tape, quiz-countdown, top-5-countdown, tier-list, chat-story,
versus-split, myth-or-fact, recipe-steps, quote-cinema, breaking-desk, podcast-clip, punch-captions, karaoke-subs,
callout-kit, lower-thirds, headline-backdrop, stack-split, sticker-pop, glitch-pack, doc-cinema, vhs-camcorder,
shadow-puppets, visual-novel, rubber-hose-reel, woodcut-tale, neon-line.

## Status
- BANNED (owner 26 Nov 2026): `chalk-talk` (blackboard look). Deleted from styles/, excluded in pick_style.py (BANNED). Never use it again.
- Tried: none yet. Log each one in experiments.txt as "NEW STYLE (library): <id>".
- First library video needs `tools/render_html.mjs` (our own, commit it to the skill): seek-per-frame capture at
  720x1280 upscaled to 1080x1920, plus the SFX render mixed under narration. Build it once, then reuse.
- Ported (20 Nov 2026): `myth-or-fact` and `comic-panels` as local styles on the comic-pop engine (`styles/<id>/`: STYLE.md + a working example, checked with
  estimate.py + capture.mjs check + a contact sheet; our own look, no library source copied). Both are in LOCAL and PORTED in pick_style.py.
- Any other id: `bash .claude/skills/faceless-shorts/scripts/port_style.sh <id> comic-pop` scaffolds it in minutes, and FACTORY DECIDE step 4 builds the
  winner on the fly whenever `pick_style.py match` ranks an unported id first. `pick_style.py` reads this file's `720x1280` block as the library catalog.

- pixel-quest: PORTED 28 Nov 2026 as a restyle of comic-pop (Press Start 2P, square cards, pixel sky + ground). First use: gta 32 gas stops.
