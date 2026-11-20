# gta-commentary: a parallel track for Kratos Playz (gta) only
Not a template and NOT in `pick_style.py` (ranking is untouched). It alternates 50/50 with the Standard run on gta:
`python3 .claude/skills/faceless-shorts/styles/gta-commentary/render_commentary.py next` prints STANDARD or COMMENTARY. Strict alternation by the style
of the last gta row in perf.csv (a row is added at every upload). If a commentary is due but anything fails (pool.json empty, Drive unreachable,
clip not downloadable) the run is a STANDARD one and commentary stays due for the next run. Solo hype never uses it.

## Commentary run (what is different; everything after the render is the normal pipeline)
1. Script, 65-80 words, hook in 3 s, `script.json` + `popups[]` (docstring in render_commentary.py). Voice: `cbx_voice.py <proj> 0.75 1.1`, then `words.py <proj>` (same as always).
2. Footage: `render_commentary.py pick <seconds>` returns `{file_id,name,start,len}` and reserves the range in `shorts-out/gta-commentary/used.json`
   (non-repeating, 27.5-38.5 s source = 25-35 s on screen at 1.1x). Put it in `script.json` as `"bg"`, download `name` from the Drive folder into `<proj>/bg/`.
   Drive folder `Bg_pool` (neerajjewellers88; search is case-insensitive); its 6 clips are indexed in `drive-clips.json`. Only the owner's own non-copyright
   clips, registered with `render_commentary.py pool add <drive_file_id> <downloaded file>` (exact ffprobe duration; Drive gives none), can be a background:
   `render` refuses anything not in `pool.json` (CLAUDE.md, owner 20 Nov 2026).
   FETCH ROUTE (works, checked 20 Nov): the Drive MCP connector refuses files over 10 MB, so use Composio's googledrive account `googledrive_keened-heap`
   (neerajjewellers88): in COMPOSIO_REMOTE_WORKBENCH `run_composio_tool('GOOGLEDRIVE_DOWNLOAD_FILE', {'fileId': id}, account='googledrive_keened-heap')` ->
   `downloaded_file_content.s3url` (valid 1 h) -> `curl -o <proj>/bg/<name> '<s3url>'` in the container (size matched Drive exactly). Never commit a clip or an s3url.
   Pool today: 6 clips, 30-41 s, 1080x1920 60 fps with their own audio (the render drops it). The pool LOOPS FOREVER: each clip serves one non-overlapping
   segment per lap; when all clips are used the history recycles (`_cycle` + 1 in used.json) and the next lap starts at a different offset (at least 2 s from
   the previous lap's start where the clip has room; the 30 s clip has only ~2.5 s of room, so it repeats closely). `pick` never runs out and never causes a
   STANDARD fallback. More clips = more variety: download the new Bg_pool clip, `pool add <drive_id> <file>`, and it joins the lap in progress at once.
3. Images: `render_commentary.py asset <proj> <name> --src "IGN" --page <article-url> | --url <image-url> | --file <path>`; every card shows `SOURCE: ...`
   (CLAUDE.md Fair Use rules: stills, about 3 s, credited, never edited).
4. `render_commentary.py render <proj>` -> `renders/out.mp4` (ffmpeg only: crop 105% zoom 1080x1920, 1.1x, popups, ASS captions). Beat: mix.py's procedural
   `"music":"hype"` (mix.py is used unmodified, only to make the beat) normalised to -28 LUFS under the voice at -16 LUFS.
5. QA: `render_commentary.py sheet <proj>` -> `review/sheet.png`; read it like any contact sheet.
6. DELIVER as usual: `backup_project.sh <proj>` (copies script.json + words/lines), slot.py gta, YouTube + IG, perf.csv row with style `gta-commentary`.
   Log these videos in `shorts-out/gta-commentary/README.md`, not in gta6-channel/README.md (keeps the Standard sameness check untouched).
