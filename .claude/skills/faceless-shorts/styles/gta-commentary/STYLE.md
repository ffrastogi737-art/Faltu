# gta-commentary (Kratos Playz only, 3-video pilot)
GTA 6 news / leaks / details told over real gameplay with real, credited images. Not a canvas template: one ffmpeg pass (`gta_commentary.py`).
Registered in `pick_style.py` for `gta` only; after 3 videos (perf.csv rows) it is blocked until `style-verdicts.txt` says WIN.

## Run (per video)
1. Script, 65-80 words, hook in 3 s, `script.json` as usual (`lines[].text`) + `popups[]` (see the docstring in gta_commentary.py).
2. Voice: `cbx_voice.py <proj> 0.75 1.1` (tempo 1.1, dead air trimmed), then `words.py <proj>`.
3. Footage: `python3 gta_commentary.py pick <duration from data/lines.json>` returns `{file_id,name,start,len}` and reserves that range in
   `shorts-out/gta-commentary/used.json` (no repeats, 1 s margin). Put it in `script.json` as `"bg"`, download `name` from Drive `bg_pool/` into `<proj>/bg/`.
   `pool.json` (`[{"id","name","dur"}]`) is filled by the agent from the Drive folder listing; it is empty until the owner uploads clips.
   Pre-transcode pool clips to 1080-wide H.264 (a 4K download per video is slow); the render does scale 105% + crop 1080x1920 itself (`bg.cx` moves the crop 0..1).
4. Images: find the page with WebSearch (news article, Rockstar press page, Wikimedia), then
   `gta_commentary.py asset <proj> <name> --src "IGN" --page <article-url>` (takes its og:image) or `--url <image-url>`, or `--file` for a Drive `assets/` download.
   Every card shows `SOURCE: <src>`; no source, no card. Image rules are in CLAUDE.md (Fair Use stills only, about 3 s, never edited/fake).
5. Popups: one every 2-3 s, `at` = the spoken word to start on. `image` (with `label`, `mark.circle`, `mark.arrow`) or `text` callout. Render: `gta_commentary.py render <proj>`.
6. QA: extract 3 frames (`ffmpeg -ss T -i renders/out.mp4 -frames:v 1`), read them. Then DELIVER as in FACTORY.md (style id `gta-commentary` in perf.csv).

## Audio
Voice normalised to -16 LUFS, beat to -28 LUFS (12 dB under, so no ducking). Beat = `"music":"hype"` (procedural, no samples) or your own royalty-free file (`"audio/x.mp3"`). No copyrighted music.

## Pilot judging
Compare the 3 videos with the channel median at 48 h (BRAIN loop). Keep only if the median is clearly above neon-versus/comic-pop on this channel.
