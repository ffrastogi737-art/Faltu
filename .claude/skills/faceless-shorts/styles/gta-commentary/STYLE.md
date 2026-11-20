# gta-commentary: a parallel track for Kratos Playz (gta) only
Not a template and NOT in `pick_style.py` (ranking is untouched). It alternates 50/50 with the Standard run on gta:
`python3 .claude/skills/faceless-shorts/styles/gta-commentary/render_commentary.py next` prints STANDARD or COMMENTARY. Strict alternation by the style
of the last gta row in perf.csv (a row is added at every upload). If a commentary is due but anything fails (pool.json empty, Drive unreachable,
clip not downloadable) the run is a STANDARD one and commentary stays due for the next run. Solo hype never uses it.

## Commentary run (what is different; everything after the render is the normal pipeline)
1. Script + `popups[]` (spec in the render_commentary.py docstring). Voice: set `"lead": 0.15, "gap": 0.12, "outro": 0.7` in script.json (150 ms clean lead-in, punchy pauses), then
   `cbx_voice.py <proj> 0.75 1.1`, then `words.py <proj>`. Chatterbox at tempo 1.1 speaks about 3.9 words/s: **target 95-115 words = 24-28 s** (render warns outside 90-120).
   One card every 1.8-2.5 s (check_popups warns outside 1.4-3.0 s), so about 10-12 cards; reuse an image with another `crop` when you run short of images.
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
3. Images (the card renderer cannot run without them): `render_commentary.py asset <proj> <name> --src "IGN" --page <article-url> | --url <image-url> | --file <path>`
   (the page's og:image; some outlets answer 403, try the next outlet; 400 px minimum). Use the same image again with another `crop` when a beat needs a new view. Every card shows `SOURCE: ...`.
4. `render_commentary.py render <proj>` -> `renders/out.mp4`. Four card phases, all parameterised: **hook** (0.0 s: yellow banner + sub strip + red badge over the main visual, stamp and
   arrow), **compare** (rounded container, two labelled images, red circles and a curved arrow), **proof** (tilted card, tag pill, source pill, yellow highlighter strokes, red arrows),
   **poll** (last card: question banner + YES / NO ballot boxes). Plus the generic **image** card for in-between beats. Cards pop 0.82x -> 1.0x in 120 ms with a drop shadow, images
   Ken-Burns 1.0x -> 1.08x, background dimmed 17 % + vignette, karaoke captions at MarginV 600. Audio: voice -16 LUFS, beat -28 LUFS (mix.py unmodified makes the beat), whoosh/pop/thud
   from mix.py on every card at about -19 dBFS.
   Fonts (owner 20 Nov): Anton for headlines, stamps and the karaoke captions (124 px, outline 9), Montserrat ExtraBold for small labels and `SOURCE:` lines; both OFL, kept in
   `gta-commentary/fonts/` (the ASS filter gets `fontsdir`). Audio runs to the very last frame: voice and beat are set with a static gain from their measured LUFS (the old `loudnorm`
   swallowed the last ~3 s of every track and `amix` stopped with it), the beat fades out only in the last 0.3 s, so the end is never silent.
   Retention polish: a 5 px glowing #FFE600 progress bar on the very top edge fills 0-100 % over the whole video; a 2-frame 3 px micro-shake pulses on the hook (0.0 s) and
   poll entrances; the closing poll card is held at least 2.0 s (`POLL_HOLD`; if the voice ends earlier the video tail is extended, which needs a `pick` segment of the longer length).
5. QA: `render_commentary.py sheet <proj>` -> `review/sheet.png` (one frame per card, labelled); read it, then check the facts once more.
6. DELIVER as usual: `backup_project.sh <proj>` (copies script.json + words/lines), slot.py gta, YouTube + IG, perf.csv row with style `gta-commentary`.
   Log these videos in `shorts-out/gta-commentary/README.md`, not in gta6-channel/README.md (keeps the Standard sameness check untouched).

## Content rules (owner 20 Nov 2026; these are hard)
- Every beat maps to a real visual asset: `kind: text` (a plain text box) is refused by check_popups. First card = `hook` at 0.0 s, last card = `poll`.
- Never state or imply a release / availability / confirmation that was not verified with a dated source in the SAME run (no "the game is out now", no "CONFIRMED" stamp). Allowed stamps:
  UNCONFIRMED, FAN THEORY, LEAK?, RUMOUR. Fan claims are worded as claims ("fans say", "reportedly"); numbers and names come from 2+ sources.
- Never fabricate a post, screenshot or quote. A `text` caption is our own words; a quote appears only if it is verbatim from a cited source.
- Always close with an open-ended viewer question: the last spoken line asks it, the `poll` card shows it (YES / NO boxes) to drive comments. Make it **loop-ready**: write the
  last line so its final words lead straight into the FIRST line (e.g. last: "...so what if it really is" -> first: "a painting in GTA Online hiding the GTA 6 map?"), the video then replays as one sentence.
- The layouts follow the owner's reference storyboard; its sample copy ("CONFIRMED?!", "2X BIGGER") is NOT reusable text, it was layout filler.

## --react-clip: timed beat-by-beat reaction over a cropped third-party gaming clip (owner request 20 Nov; Kratos Playz only; rules in CLAUDE.md)
A third gta format on demand, NOT part of the 50/50 (perf.csv style id `gta-react`; due() ignores those rows). The clip is never added to pool.json; render refuses a pool clip.
`script.json`: `"react": {"clip":"bg/x.mp4","zoom":1.15,"cy":0.5,"pill":"MODDED GTA 5 - 10/10 ROBBERY","credit":"<creator>","pill_y":250,
"beats":[{"start":0.0,"end":8.0,"text":"..."},...],"punch":{"t":17.8,"circle":[fx,fy,fr]}}` (circle = fractions of the 1080x1920 output).
1. Download the clip from Drive (Composio route above, 3 MB is fine) into `<proj>/bg/`. `ffprobe` it and look at it first: `cropdetect` shows black bars, a contact sheet shows where its own captions sit.
2. `/root/cbx/bin/python render_commentary.py react-voice <proj>`: one Chatterbox line per beat at the beat's own start (beat 1 not before the 150 ms lead-in), silence between beats
   (the clip's punchline plays there); a line longer than its window is sped up to 1.3x at most, otherwise the run stops. Then `scripts/py scripts/words.py <proj>`.
3. `render_commentary.py --react-clip <proj>`: zoom/crop (1.12-1.18x is the framing range) + top context pill with the mandatory `CLIP: <creator>` credit + 5 px #FFE600 progress bar;
   karaoke captions (Anton, MarginV 600) ONLY while the narrator speaks; the clip's audio ducks to -27 LUFS while the narrator speaks and rises to -16 LUFS in the pauses (smooth 0.12 s / 0.25 s ramps from the word timings);
   the narrator is -16 LUFS; no beat, no SFX; at `punch.t` a 7 % impact zoom and a red circle callout. Then `render_commentary.py sheet <proj>` (shows every beat, every pause and the punch).
4. QA with the sheet, in this order: (a) is the creator's own title/branding still visible (it must be); (b) no overlap between our pill, our captions and the clip's own captions; (c) black bars hidden.
   A 1.12-1.18x crop only removes text that sits within about 6-9 % of the top/bottom EDGE. Captions in the middle of the frame, or a source letterbox that comes and goes, are NOT removed by it:
   say so and ask, do not push the zoom up to hide them (and never to hide the creator's name).
5. Upload like any gta video (credit the creator in the description, "Fan reaction" wording, private + scheduled by slot.py).
