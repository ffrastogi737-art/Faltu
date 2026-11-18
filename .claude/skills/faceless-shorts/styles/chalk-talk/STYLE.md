# Chalk Talk: "why does your body do that?" at a chalkboard, 9:16

Friendly teacher energy: a green chalkboard in a wooden frame, everything drawn in chalk and drawing itself on as the
voice explains. Stick people, cross-section diagrams, labels with underlines, arrows, little chalk-dust bursts.
Example: `example/` = **WHY YOU GET GOOSEBUMPS** (43 s, 12 shots). Sheet: `style-sheet.png`.
Engine (main.js, captions, timing, tools) is the Inside Out engine; only the kit, palette and caption colours differ.

## 1. Rules
- **Everything is chalk.** No flat fills except the board and the wooden frame/ledge. Colour things in with `hatch`, not fills.
- Palette (`K.CH`): chalk white for drawings, **yellow = the key thing / the label that matters**, pink = skin and feelings,
  blue = cold and calm, orange = action (a muscle firing, heat). One accent colour per shot plus white.
- Things **draw themselves on** (pass `p = on(lt, a, b)`), a new element on each beat of the voice; labels appear on the
  word that names them. Cut every 2-4 s; the engine adds a punch-in and a soft chalk-dust flash on each cut.
- Keep drawings between y 230 and ~1250: captions sit at y 1400, the wooden ledge at the bottom.
- Captions: Inter Black, chalk white with a dark board-green outline, one chalk-yellow word (`caps` like Inside Out).
- Narration: calm, curious, second person ("you"), Kokoro `am_michael` x1.0, music `"bed"`. Sounds: slide while
  something is drawn, pop on labels, boing / sparkle on reveals.
- Facts: well-established science only, checked against 2+ sources; say "mostly" / "may" where science is still debated.

## 2. Kit (`example/src/core/kit.js`, `import * as K`)
- `K.board()` the board (smudges, grain, frame, chalk on the ledge). Call first in every shot.
- Strokes: `K.chalk(points, col, width, p, seed)`, `K.arc(x, y, r, a0, a1, n, ry)` (points for curves), `K.circleC`,
  `K.hatch(x, y, r, col, alpha, p)`, `K.arrowC(x0, y0, x1, y1, col, p)`, `K.poof(x, y, r, alpha)` (dust burst).
- Words: `K.write(text, x, y, size, col, p, rot)` (chalk lettering revealed left to right), `K.label(...)` (with underline).
- Figures/props: `K.person(x, y, s, { p, mood: 'calm'|'wow'|'cold', arms: {L, R}, headphones, shiver, t, bumps })`,
  `K.note`, `K.snowflake`, `K.bolt`, `K.skin(x, y, w, s, hairUp, bump, p, muscleOn)` (skin cross-section with follicle,
  hair and arrector muscle), `K.fluff(x, y, r, puff)` (round furry animal), `K.cat(x, y, s, puff)`.
- New diagrams: build them from `chalk` + `arc` in shots.js; move them to the kit when a second video needs them.

## 3. QA pitfalls we've hit
- Labels placed low (y > 1150) collide with the captions: put labels above the drawing.
- Long strokes (hair, tails) run off the frame at large scales: check the widest pose.
- Figures with legs below y ~1250 touch the caption; raise them or scale down.
- `ctx.globalAlpha` set before `chalk()` multiplies into the stroke alpha (that is how faded/ghost strokes are made).
