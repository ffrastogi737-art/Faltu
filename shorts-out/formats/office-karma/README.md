# Format: chaos skit, "instant karma" (owner brief 20 Nov 2026), style tall-tale (2D cartoon cast in a 3D office)
Rebuild: `bash .claude/skills/faceless-shorts/scripts/new_video.sh tall-tale <name>`, copy `src/shots.js`, `src/main.js`, `script.json`, `data/words.json` from this folder over the project (backup_project.sh keeps them current),
copy `styles/comic-pop/auto-vertical-example/tools/mix.py` over tools/mix.py (hype SFX), add `await document.fonts.ready;` after the fonts.load line in
src/main.js, voice `/root/cbx/bin/python SKILL/scripts/cbx_voice.py . 0.8 1.12` then words.py, `capture.mjs check|cues`, `mix.py .`, sheet, and render with
`SOFTWARE_GL=1 QS='&res=0.8&aa=0&shadow=1024' FPS=24 node tools/capture.mjs video renders/x.mp4` (618 frames for 26 s, ~15-25 min).
Brief rules kept: hook = conflict in the first line, a cut every 2-3 s, instant-karma twist, last sentence left open so it loops into the hook,
a NEW cast every video (change LOOK in shots.js: hat, neck, extras, body colour), Chatterbox x1.12, hype SFX on beats, one-word captions.
Our own rules on top: fiction is labelled "(Skit)" in the title and description (no fact claims, no sources needed), own characters and sets only
(never another channel's cast or look, e.g. the "Rick's Clips" reference), sounds come from our own mix.py, topic and story differ every video.
Lessons (first build): a lying/falling cut-out is edge-on and invisible (lean pitches the card): use hops, dizzy looks and low-angle shots instead;
keep slides dark with white text (bright posters bloom out); keep coworkers off the camera path; centre the slide on the camera target.
