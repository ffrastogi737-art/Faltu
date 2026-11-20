# Comic Panels: skits and stories as stacked comic panels with speech bubbles, 9:16

Built 20 Nov 2026 (library id `comic-panels` ported on our comic-pop engine; original look, no library source copied).
Light, fast, funny: 1-3 cream panels per shot pop down the page, each with an icon "actor" and a speech bubble, optional BAM burst.
Example: `example/` (DEMO skit, engine test only). 16 s for 4 shots.

## Look rules
- Sunburst colour world behind (a new colour per shot); panels are cream with a thick ink border and a hard offset shadow.
- Icon (left) = who speaks, bubble (right) = what they say, short (3-8 words). The narration carries the story, bubbles carry the gag.
- Panels land one by one (first at the start of the line, the next ones spread along the line).

## Shot kinds (script.json `lines[i].vis`, see example/make_script.py)
`P` panels: `panels` = [[icon, 'bubble text'], ...] (1-3 entries; 3 shrink to 360 px tall), optional `bam` ('BAM!', '?!') on the last panel, `fx: 'hit'`.
`Q` question, `I` icon + headline, `S` big stat, `C` chain: unchanged from comic-pop.
Icons are the comic-pop set (person, eye, hand, clock, cup, brain, bubble, ...); add new ones to `ICON` in shots.js in the same ink-sticker look.

## When to use
Skits, relatable situations, instant-karma stories, step-by-step "what to do" with a joke, GTA 6 "player situations" (our own generic
characters only, never game art). Fiction is labelled "(Skit)" in the title; facts still need 2+ sources.

## Voice, sound
Chatterbox `cbx_voice.py <proj> 0.8 1.12`; `P` pops a cue per panel and a hit on `bam`.

## QA pitfalls
- Bubble text over ~10 words shrinks until it is hard to read: split into two panels.
- The area y 1300-1550 stays empty with 2 panels (captions sit at y 1600): fine, do not fill it with clutter.
