# Myth Or Fact: quick "is this true?" claims with a MYTH / FACT stamp, 9:16

Built 20 Nov 2026 (library id `myth-or-fact` ported on our comic-pop engine; original look, no library source copied).
Fast, punchy, quiz-show energy: a big claim on a dark card, a red MYTH or green FACT stamp slams on a word, one chip explains why.
Example: `example/` (DEMO claims, engine test only). 24 s for 3 claims.

## Look rules
- Same sunburst colour world as comic-pop (a new colour per shot); a gold "MYTH OR FACT?" chip on top of every claim shot.
- Claim = dark navy card, rim in the shot colour, big white Inter Black text, 1-3 lines (auto-shrinks). Stamp = red MYTH / green FACT.
- One claim per script line; the line says the claim, then the verdict word, then the reason ("... Myth! Tall buildings get hit ...").

## Shot kinds (script.json `lines[i].vis`, see example/make_script.py)
`M` claim + stamp: `head` (the claim, short caps), `verdict` 'MYTH' | 'FACT', `at` (the spoken word where the stamp lands, e.g. 'Myth'), `sub` (reason chip).
`Q` question, `I` icon + headline, `S` big stat, `C` chain: unchanged from comic-pop (use Q for the opener and the comment ending).

## When to use
Facts, rumours, "reports say", GTA 6 rumour checks (say "reported" for anything unconfirmed), psychology and health myths (no medical
advice). Every claim needs 2+ reliable sources listed in script.json `sources`; a FACT stamp on something unconfirmed is a fake fact.

## Voice, sound
Chatterbox `cbx_voice.py <proj> 0.8 1.12`; hype cues come from `M` itself (boom on the stamp, scratch for MYTH, ding for FACT).

## QA pitfalls
- The `at` word must exist in that line (case and punctuation ignored); if it does not, the stamp falls back to the end of the line.
- Keep claims under ~40 characters so the card stays at 2-3 lines.
