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
