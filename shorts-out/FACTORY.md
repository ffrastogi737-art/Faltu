# Shorts factory: step by step

> Thinking loop and weekly review: shorts-out/BRAIN.md (read it before this file). Style/topic choice: DECIDE section below.

> HOW THE RUNS START (fixed 20 Nov 2026): the old "Shorts factory" routine started sessions WITHOUT the repo (git 403, nothing ran).
> It is OFF. The trigger "Shorts factory tick (this session)" (08:55 + 16:55 IST) wakes the long-lived Jarvis chat, which calls
> create_session with source_url Faltu + outcome_branch ccr-8c1babe8-9jk0db, so every factory run has the repo and push works. A Haiku "Shorts
> scheduler" session cannot do this (auto-mode denies create_session there): do not rebuild that. Quota: YouTube uploads/switches fail after the
> daily quota (resets 13:30 IST); a timed retry via send_later at 13:35 IST handles a missed public switch.

## RUN ORDER (owner, 19 Nov 2026: check first, then research, then comments, then new videos)
Every factory run does these in this order. Stop a step if the tokens or the time are tight; never skip CHECK.
1. CHECK (Haiku, light): today's live count per channel (IST day): Kratos Playz target 3, solo hype target 2, plus the
   weekly long video. Check what is due (step P), what is private with no publishAt (fix it or report it), duplicates,
   and the Instagram reels that are due. Fix what the records say is wrong. Keep tool output small.
2. RESEARCH + HOOK + SCRIPT (Sonnet, heavy): only after CHECK. Fresh WebSearch for the strongest topic, then the hook and the script (DECIDE 1-2),
   THEN the template match (DECIDE 3). Never the other way round.
3. COMMENTS (Haiku): read new comments on the last 4 days of videos on both channels; reply to at most 3 per channel.
4. BUILD + UPLOAD (Sonnet for build and QA, Haiku for upload, Instagram posts and logs).
- Target shortfall (SAME-DAY QUOTA GUARANTEE, 21 Nov 2026): `slot.py <ch>` checks today's count first (videos public or scheduled
  for today's IST date, catch-up rows included) against DAILY (solo 2, gta 3). While today is short it returns `mode=catchup`: the earliest
  open IST slot today (>= now + 20 min, rounded to 5 min, 30 min clear of every taken time, before 23:30 IST). Tomorrow's explore/exploit
  bins are used only when today is full, or after 23:30 IST (then the note `catchup: none ...` is printed; the shortfall stays visible).
  Record a catch-up upload with slot_mode = catchup. Do not switch a tomorrow video to public just to fill today unless slot.py says catch-up.
- Tokens: Haiku for every mechanical step, Sonnet only for research, scripting, build and QA. One sub-agent at a time.

## CURRENT PLAN (owner, 18 Nov 2026 evening: "video bana band kar do", then this quota)
- STOP making new videos now. Only these remain, then stop:
  - Kratos Playz (GTA): 3 more Shorts.
  - Solo hype: 1 more Short.
- After those, ONE LONG 16:9 video per channel per week (one for Kratos Playz, one for solo hype), using the long-video
  tools (scripts/render_html.mjs, scripts/cbx_long.py). Pick the week's topic from the channel's best performer.
- Each week, change the formula from the numbers: copy what won, drop what lost (growth-log.txt, experiments.txt).
- Scheduled posts already queued stay as they are (no new ones) until the owner says otherwise.
- The old CONTINUOUS MODE (non-stop daily shorts) is OFF. Do not chain new runs unless the owner asks.

## RUNNER MODE (from 16 Nov 2026; overrides anything below that conflicts)
Scheduled routines cannot push to GitHub, so the factory now runs in sessions created with create_session (repo attached,
push works) by a small scheduler session. In such a session:
- You MAY and SHOULD use send_later again for timed work: the solo hype public switch (YOUTUBE_UPDATE_VIDEO public at the
  slot time) and each Instagram reel at its `at` time, with the messages described in step P (include the entry id and
  tell the woken turn to git pull, post, mark DONE, commit, push). Also still write the PENDING lines/entries so a later
  run can recover them.
- Slots: `slot.py` is the only scheduler for both channels (section SLOT below). No fixed hours anywhere.
- The session ends after its report; wake-ups from its send_later calls keep it alive just long enough to post.

The scheduled tasks "Shorts factory" (08:55 and 16:55 IST) and "Shorts publisher" (11:25 and 19:25 IST) each start a
FRESH cloud session and follow this file. The why is in /home/user/Faltu/CLAUDE.md: read it first.

Owner (15 Nov 2026): both YouTube channels and Instagram @solohype_1 are yours to grow to monetization ("tujhe puri
azaadi hai", "NO LIMIT MEAN NO LIMIT"). The owner is not watching: never ask questions or wait. Topic, style, script,
build, upload, scheduling, the timed public switch, Instagram posting, CHANNEL CARE and EXPERIMENTS are pre-approved.
Jewellery shop page: ON HOLD, do nothing for it.

Hard limits: no bought views/subs/followers, no sub4sub, no comments or DMs on other people's accounts, no misleading
titles, no stolen full videos, no copyrighted music (credited Fair Use stills are allowed, see CLAUDE.md), no fake facts (2+ sources), never delete a video or post, never make a YouTube
upload public at upload time (private, then publishAt or the timed switch).

## CONTINUOUS MODE (owner, 18 Nov 2026: "jab tak main mana na karun, lagatar banate raho")
- Make videos non-stop for BOTH channels until the owner says stop or the Claude usage limit is hit. Best quality:
  research sound effects / music fit, hooks, styles; keep trying new styles (incl. shorts-out/STYLE-LIBRARY.md) and
  new topics, keep what wins (experiments.txt).
- Each run: ONE Short per channel (solo hype + Kratos Playz). Every 3rd run also ONE LONG video (6-10 min, 16:9
  1920x1080, alternate channels; GTA 6 launch guides/tips for Kratos, a deep "everything about X" for solo hype).
  Long video: use a 16:9 Nafay library style (creator-motion, data-story, clean-tech, pop-info, chalk-talk; see
  STYLE-LIBRARY.md) or adapt our kit to 1920x1080; Kokoro narration + words.json; chapters in the description; render in
  background segments; same QA. First long video: build tools/render_html.mjs (seek per frame + SFX.render) into the
  skill and commit it.
- CHAIN: at the very end of each run (after the report), start the next run yourself with
  mcp__claude-code-remote__create_session (source_url https://github.com/ffrastogi737-art/Faltu, source_revision
  ccr-8c1babe8-9jk0db, clone_depth 20, title "Shorts factory run", model claude-sonnet-5-5, the same prompt you got).
  Before starting work, call list_sessions: if another "Shorts factory run" session is WORKING, do only step P and exit
  without chaining (one chain at a time). If you hit a usage-limit error, stop; the scheduler restarts the chain later.
- YouTube upload quota (~5-6 uploads/day): when an upload returns quotaExceeded, do not wait: add the video to
  shorts-out/MANUAL-UPLOAD.md (channel, file raw link https://raw.githubusercontent.com/ffrastogi737-art/Faltu/
  ccr-8c1babe8-9jk0db/<path>, title, description, tags, suggested time IST), SendUserFile the MP4 with caption
  "MANUAL UPLOAD: <channel> · <title>", and keep making videos. Instagram is separate: keep posting reels there.
- If the plan's limit is hit mid-run, stop cleanly after pushing what is done.

## QUALITY BAR (owner, 18 Nov 2026 night: "neon se thak gaya", "aawaz flat hai", "sound effects, graphics mein maza nahi")
- VOICE: never plain Kokoro again. Use Chatterbox (expressive, MIT): install once per fresh session (~6 min, 6 GB):
  `uv venv -q -p /usr/bin/python3.11 /root/cbx && VIRTUAL_ENV=/root/cbx uv pip install -q chatterbox-tts "setuptools<81"`
  (run it in the background at the START of the run), then `/root/cbx/bin/python .claude/skills/faceless-shorts/scripts/cbx_voice.py
  <proj> 0.7 1.08` instead of voice.py, then words.py. Per-line "emo" 0.5-0.9; write "!" / "?" for energy; Whisper-check every
  word (it can drop "A,"). Shorter, punchier: ~30-40 s.
- SOUND: music "hype" + hype cues (boom on the big reveals with a riser into them, hit, ding, swoosh on every cut,
  applause, scratch for a myth/twist). Copy tools/mix.py from styles/comic-pop/example if a style lacks them.
- GRAPHICS: bright colours, never dark/neon. GTA = comic-pop. Any style: copy the impacts block (shake, flash, confetti,
  wipe) from styles/comic-pop/example/src/main.js into the project's main.js.

## TOKEN BUDGET (owner, 18 Nov 2026: weekly usage must last until next Wednesday; 17% already used)
- Runs and chained sessions use **claude-sonnet-5-5** (never Opus). Easy, mechanical work goes to a **haiku** subagent
  (Agent tool, model "haiku"): uploads/scheduling, Instagram posting, README/log/queue edits, git commit+push, stats reads.
- Save tokens: view ONE contact sheet per video (0.5-1 s step, small), not many full frames; short reports; no repeated
  WebSearch for facts already in the READMEs; reuse styles/scripts instead of writing new kits.

## CLOUD SETUP (owner, 18 Nov 2026: "naye cloud computer par sab apne aap download ho jaaye")
- The environment's setup script runs `.claude/skills/faceless-shorts/scripts/cloud_bootstrap.sh` on every fresh container:
  Kokoro + Whisper (setup.sh), numpy/scipy, uv, Chatterbox venv (/root/cbx, Python 3.11) and its model weights.
  Log: /tmp/cloud_bootstrap.log. If `chatterbox` is missing at run start, run that script yourself (about 1 minute once cached).
- Add any new heavy tool to cloud_bootstrap.sh (repo), not to the environment script, so it is versioned with the code.

## Git
Work in /home/user/Faltu on branch `ccr-8c1babe8-9jk0db` (not the session's own branch):
`git fetch origin ccr-8c1babe8-9jk0db && git checkout -B ccr-8c1babe8-9jk0db origin/ccr-8c1babe8-9jk0db`.
Commit on top, `git push -u origin ccr-8c1babe8-9jk0db` (retry network errors). Never the default branch, no PRs.
Commit lines end with the session attribution the system gives you.

## 00. FEEDBACK (every factory tick, FIRST, before P and DECIDE; the system learns from its own numbers)
1. Refresh views: a Haiku subagent runs `shorts-out/perf_refresh.py` in COMPOSIO_REMOTE_WORKBENCH (both YouTube channels)
   and saves the printed lines to a file, then `python3 shorts-out/perf_merge.py < that-file` (updates views, likes and the
   checked date; prints any video id that has no perf row: add that row by hand). Quota blocked: skip, use last numbers, say so.
2. Verdicts, automatic: `python3 shorts-out/pick_style.py solo --verdicts` and `... gta --verdicts` append WIN/LOSE lines to
   `style-verdicts.txt` (style@channel, 2+ counted videos, median vs channel median: >= 1.5x WIN, < 0.3x LOSE). Owner's
   manual lines are kept and read in file order; a LOSE blocks that style for that channel in DECIDE.
3. Post-mortems: `python3 shorts-out/pick_style.py solo postmortem` and `... gta postmortem` list counted videos (24 h+ old) under 0.5x the channel
   median that have no line yet. Write ONE line each in discovery-log.txt (format printed by the tool; cause = weak-hook | pacing | topic-saturation |
   voiceover | style-look | slot | other, with evidence and the fix), at most 5 per run, newest first. Past mistakes must not repeat.
4. Commit `perf.csv`, `style-verdicts.txt` and `discovery-log.txt` with the run.
Honest limit: the tick is an agent session, so step 00 is its first instruction; no OS job runs it without the agent.

## P. PUBLISH DUE (every run, factory and publisher; first)
FIRST check you can push: `git push --dry-run origin ccr-8c1babe8-9jk0db`. If it fails (routine sessions start without the
repo attached), call the claude-code-remote tool `add_repo` {owner: "ffrastogi737-art", repo: "Faltu", access: "push"},
re-clone if it says so, and check again. If it still fails, change NOTHING outside the repo
(no upload, no post, no public switch: an unsaved status makes the next run post it twice), report ⚠️ DIKKAT and stop.
No Composio tools (ToolSearch "+composio" finds nothing): skip step P and all uploads, still build and push the video,
mark it `WAITING UPLOAD (no Composio)`, and start the report with "⚠️ DIKKAT: Composio connector is routine par nahi laga".
If /home/user/Faltu is missing: `git clone https://github.com/ffrastogi737-art/Faltu /home/user/Faltu`.
Load Composio tools with ToolSearch "+composio", start with COMPOSIO_SEARCH_TOOLS.
1. Solo hype timed switch: for each `PENDING` line in shorts-out/publish-queue.txt whose UTC time is <= now + 10 min:
   YOUTUBE_UPDATE_VIDEO {"video_id": <id>, "privacy_status": "public"} account `youtube_maimon-mealy`; read back with
   YOUTUBE_GET_VIDEO_DETAILS_BATCH parts ["status"]; line -> DONE, README status -> `PUBLIC <date> <time> IST`.
2. Instagram: for each `PENDING` entry in shorts-out/ig-queue.json whose `at` <= now + 10 min (oldest first, max 3 per
   run): in COMPOSIO_REMOTE_WORKBENCH download
   https://raw.githubusercontent.com/ffrastogi737-art/Faltu/ccr-8c1babe8-9jk0db/<file>, `upload_local_file(path)` for an
   s3key, `run_composio_tool("INSTAGRAM_POST_IG_USER_MEDIA", {"ig_user_id": "me", "video_file": {"name", "mimetype":
   "video/mp4", "s3key"}, "caption": <caption>, "media_type": "REELS", "share_to_feed": True}, account="instagram_osiery-fun")`.
   Publish with COMPOSIO_MULTI_EXECUTE_TOOL INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH {"ig_user_id": "me", "creation_id",
   "max_wait_seconds": 50} (account instagram_osiery-fun); on timeout / 408 call publish again with the SAME creation_id
   (a new container only if the first reached ERROR). Permalink via INSTAGRAM_GET_IG_MEDIA. Status -> `DONE <permalink>`
   or `FAILED <reason>`. ALWAYS account `instagram_osiery-fun` (the default Instagram is the jewellery shop: never post there).
3. Commit and push. The **publisher** run stops here and replies in one Hindi line.

## 0. WHICH VIDEO (factory runs)
- Count per channel what goes public from now to the end of TOMORROW (IST): solo hype = PENDING lines in
  publish-queue.txt + its videos with a future publishAt; Kratos Playz = future publishAt (YOUTUBE_LIST_CHANNEL_VIDEOS
  mine=true + YOUTUBE_GET_VIDEO_DETAILS_BATCH parts ["status"], each with its own account) + WAITING UPLOAD entries.
- Saver mode (one video): make it for the channel with fewer lined up (ties: GTA until 10 Dec, then normal).
  After saver mode: one of each.
- Both channels full through tomorrow: skip building, do CHANNEL CARE only.
- After delivering append to shorts-out/factory-log.txt: `<kind>  <file name> (<YYYY-MM-DD>)`.

## DECIDE: story first, template second (owner 20 Nov 2026; replaces "pick the style first")
Order of every video: RESEARCH the strongest topic -> HOOK (the first 3 seconds) -> SCRIPT -> TEMPLATE MATCH -> BUILD -> QA -> UPLOAD.
The script chooses the template; a template never forces the script.
1. Topic. `python3 shorts-out/pick_style.py solo|gta kinds` lists saturated and unused topic kinds (3 of the last 5 = saturated: change
   kind). solo = open discovery channel: any true topic or a clearly labelled skit (body/science, viral facts, history, comedy skits, stories, myths).
   gta = GTA 6 news, leaks (only as "reported"), details and comparisons. Fresh WebSearch, 2 reliable sources for every fact.
2. Hook first. Run `python3 shorts-out/pick_style.py <ch> hooks 5` and read the title and opening line of the best and the worst counted videos
   (question? number? second person? conflict word? short?). Read the latest POSTMORTEM lines in discovery-log.txt (what not to repeat). Write 3
   openings for the first 3 seconds, keep the strongest, then write the whole script as script.json (optional key "demand": "<style>", see 3).
3. Template match. `python3 shorts-out/pick_style.py <ch> match <script.json>` reads the FINISHED script (mood tags, pacing, hook) and ranks the whole
   catalog: every style in `.claude/skills/faceless-shorts/styles/` plus all 55 vertical ids of STYLE-LIBRARY.md. Read the top 3 and choose by hook and
   mood, not by habit. No "not the last style" lock; the only explore rule is the gta one in step 4. If the best match repeats a recent style the tool prints SAMENESS RISK: still
   allowed, but the hook shape, structure, characters and colours must differ (AUTHENTIC CONTENT). The one hard block is a LOSE verdict (a proven dead
   format); a script that truly needs a blocked or untested format names it with "demand".
   gta STANDARD runs only (owner 21 Nov 2026; solo is untouched): a style used in the last 3 STANDARD runs cannot win (the tool prints COOLDOWN), and the
   match prints the Top-3 line you copy into the README entry (step 6).
4. gta STANDARD EXPLORE (mandatory, owner 21 Nov 2026): when `pick_style.py gta match` prints `EXPLORE RUN`, the run MUST build the template it names
   (the highest-scoring UNPORTED library id that fits the script's angle), even if a local style ranks higher. The next gta STANDARD run is one, then every
   3rd one. If the tool says no library id fits, invent and build a NEW custom visual template on the comic-pop base (port_style.sh), and log it as NEW STYLE.
   Solo never explores this way (its own rules above).
   Port on the fly. If the winner is UNPORTED (a library id), build it now, do not settle for a weaker local style:
   `bash .claude/skills/faceless-shorts/scripts/port_style.sh <id> comic-pop`, edit its shots.js and make_script.py, write STYLE.md, check with `estimate.py`
   + `capture.mjs check` + one contact sheet, add the id to LOCAL and PORTED in pick_style.py, note it in STYLE-LIBRARY.md. Rebuild in our own engine,
   never commit a library source file. 3D ids render slowly (render_html.mjs route): only when no 2D template fits the story.
5. Channel routing. solo: match every script to the template that holds attention for that genre (tall-tale or comic-panels for character skits; comic-pop,
   myth-or-fact or comic-panels for fast facts and stories; inside-out / chalk-talk for body science; ...). gta: the topic stays GTA 6, the template is matched
   per video from the script's angle (comic-pop; myth-or-fact for rumour checks; comic-panels for player situations; a ported library id when it fits better;
   neon-versus only if its LOSE is lifted or demanded).
5b. **gta only: 50/50 with the commentary track** (owner 20 Nov 2026; solo never does this, pick_style.py is not involved).
   Run `python3 .claude/skills/faceless-shorts/styles/gta-commentary/render_commentary.py next` right after the topic is chosen. STANDARD = steps 1-6 here as always.
   COMMENTARY = skip `match`, follow `.claude/skills/faceless-shorts/styles/gta-commentary/STYLE.md` (own script, Drive footage, image cards), then the SAME
   BUILD-QA (contact sheet), DELIVER, UPLOAD, INSTAGRAM, perf.csv steps. The clip pool loops forever (used segments recycle), so running out of clips is never a reason to fall back. Fallback: Drive folder `Bg_pool` (Composio account googledrive_keened-heap, route in STYLE.md) missing, empty,
   unreachable or the clip not downloadable = do a STANDARD run on that same script instead; never fail an upload for it.
   Commentary rules (details in STYLE.md): every beat (one per 1.8-2.5 s) shows a real credited image, text-only cards are refused; hook card at 0.0 s, poll card last; script.json
   `lead` 0.15 / `gap` 0.12; never claim a release or confirmation you did not verify with a dated source in this run (no "the game is out now", no "CONFIRMED"); always end on an
   open question that the poll card shows, written so its last words flow into the first line (loop-ready). Script target 95-115 words (24-28 s); poll card held >= 2 s.
   Voice -16 LUFS, beat -28 LUFS, SFX about -19 dBFS (mix.py itself is never changed). Top progress bar + 2-frame micro-shake are built into the renderer; fonts are Anton + Montserrat ExtraBold (in the style folder), audio plays to the last frame.
   Reaction mode (`render_commentary.py --react-clip`, STYLE.md, rules in CLAUDE.md) is an extra gta format only when the owner asks for it: perf style `gta-react`, creator credit mandatory, not part of the 50/50.
5c. **solo only: 50/50 TALL-TALE <-> STANDARD** (owner 21 Nov 2026; gta keeps its own 5b and pick_style.py's gta rules are untouched).
   The track of the next solo video is the OPPOSITE of the track of the last solo upload in perf.csv (rows with a real video id; planned rows do not count). No history: TALL-TALE.
   `python3 shorts-out/pick_style.py solo match script.json` prints `TRACK (solo 50/50): TALL-TALE|STANDARD`. `--track tall|standard` is a dry run only (prints "simulated").
   - TALL-TALE turn: match keeps only tall-tale. Build from a shot plan (`styles/tall-tale/STYLE.md`: section 8 pipeline). Content (owner 21 Nov 2026, the @aiwithcb formula): a true historical paradox,
     bizarre real mystery, mind-bending science idea or "what happens if" story as a cinematic mini-movie: 45-60 s, 135-175 words, 14-18 cuts, 2+ sources, in-the-moment dialogue,
     knee-up framing, real 3D props (no whiteboards), 3+ sets or lights, a loop-ready last line, characters dressed for THIS story (all checked by `capture.mjs check`; STYLE.md). The setting/cast line that pick_style.py prints is an old rotation hint: ignore it.
   - STANDARD turn: tall-tale is removed from the ranking, and the last 3 STANDARD solo styles cannot win (COOLDOWN), unless fewer than 2 would remain. The rest of step 5 as before.
   - This choice replaces the solo routing in step 5 for the track only; the template inside the track is still picked by the match.
   - Backup: `backup_project.sh` copies `shot_plan.json` and writes `track.txt` (TALL-TALE) into formats/<project>/.
   - Record: perf.csv style `tall-tale` on a TALL-TALE upload, the matched id on a STANDARD one. The next run reads it from there.
6. Record. README header names the style id exactly (pick_style reads it); on delivery add the perf.csv row with `style`, `kind`, `title`, `hook` and `slot_mode`
   (the first spoken line); first use of a template -> experiments.txt `NEW STYLE`. Verdicts are written automatically in step 00.
   EVERY gta build: one line in its gta6-channel/README.md entry, copied from the match output: `Top-3 (match): <style score> | <style score> | <style score>`
   (for a commentary or react build, the line goes into gta-commentary/README.md). This is the audit trail for why a template was chosen.

## BUILD (skill `.claude/skills/faceless-shorts`; follow its build + QA sections, skip its ask/confirm steps)
- `export CHROME=/opt/pw-browsers/chromium`; the environment's setup script already ran setup.sh. New project:
  `bash .claude/skills/faceless-shorts/scripts/new_video.sh <style> <name>`.
- Read the style's STYLE.md and its example src/shots.js. In the project's src/main.js add `await document.fonts.ready;`
  after the fonts.load line (stick-story: also `await document.fonts.load('800 92px Inter');`).
- 2D: `node tools/capture.mjs check` (CHECK OK), `cues`, `py tools/mix.py .`, `sheet review/all.jpg 0.5 10`, LOOK at it
  (empty frames > 1 s, anything under the captions at y ~1400, label collisions, people cut by the edge, misspellings,
  pictures not matching the line), fix, then `video`. Mean volume (ffmpeg volumedetect) above -40 dB.
- 3D styles cost a long render: in saver mode use 2D only.
- Facts: every fact and number agrees across 2+ reliable sources (WebSearch; WebFetch is mostly blocked). List them in
  script.json "sources". Unverifiable: drop it or change topic. Reported claims are said as reported.

### A · NORMAL (solo hype; language, style, format: your call from trends and data)
- EXPERIMENTS 1-2 first. Topic: true, evergreen; no breaking news, politics, allegations about living people, medical
  advice, gore, or mocking any group. Not already in shorts-out/README.md.
- Format: second person present tense, hook in 2 s, escalate, twist that explains why, short looping last line; 95-120
  words, 40-55 s, a picture change every 1.5-3 s; title under 60 characters. Template: matched from the finished
  script (DECIDE 3); there is no "different from the previous entry" rule, vary the hook and the structure instead.
- Deliver shorts-out/<NN>-<slug>.mp4 + README entry (number, file, style, Title, Description: two factual sentences,
  "Sources: ...", 6-8 hashtags starting #shorts; Tags: 8-12 phrases; Experiment; status).

### B · GTA / GAMING (Kratos Playz; language, style, format: your call from trends and data)
- Template: matched per video from the finished script (DECIDE 3); comic-pop is the proven default so far (owner, 18 Nov 2026: the neon look
  is tiring, viewers skip it; colourful, different, high-CTR). `new_video.sh <style> <name>` and rewrite script + shots. Do NOT go back to the
  dark neon look (neon-versus is LOSE-blocked). Old neon-versus notes, for reference only: `new_video.sh neon-versus <name>`, then copy
  `.claude/skills/faceless-shorts/styles/neon-versus/gta-example/{src,script.json}` over it (the newest GTA video:
  priceTag, clockFace, moon, progress, leonida map, scenes, regionShot, voteCards). Never real game footage, screenshots,
  logos or character art.
- Phase by IST date: until 18 Nov hype (release time incl. India, price incl. rupees, platforms, editions, pre-load,
  countdown, GTA 5 vs 6, official characters/places); 19 Nov-10 Dec launch (what reviews and reliable outlets say: map,
  characters, missions, secrets, tips, records; newest news first; never leaked or pirated material); from 11 Dec ~70%
  GTA 6 / ~30% nearby gaming topics (log tests in shorts-out/gta6-channel/experiments.txt).
- Fresh WebSearch each time; rumours only as "reports" with the REPORTED chip. Not already in gta6-channel/README.md.
- GTA PLAYBOOK (owner's research notes, Lucro video "Tiny Channels Are Blowing Up on GTA 6"; treat as hypotheses, verify
  with our own data):
  - PLAYER, not news: tell the viewer what happens TO THEM in the game ("GTA 6 will punish these players", "GTA 5 habits
    that get you killed in GTA 6", "GTA 5 problems GTA 6 finally fixes"). Start titles from GTA 5 when it fits (huge
    audience). Every claim still needs 2+ sources: before launch only confirmed or clearly "reported" features; after
    launch, what reviews/outlets confirm.
  - Promise + deadline titles before launch: "<N> days left: everything to know before you play".
  - One strong title word/pattern may repeat (e.g. "impossible": map, police AI) while the TOPIC changes.
  - Same-day news (new screenshots, trailers, announcements): Shorts only, fast. Do not chase news nobody plays.
  - A video that wins: make its sequel next (same theme, new angle), before others copy it. Never copy a pattern late
    on the same topic someone else already won with: copy the pattern, bring a NEW topic.
  - Write 3 opening hooks, keep the strongest. Read the script aloud test: cut lines nobody would say to a friend.
  - Game-specific test: any line that could fit a video about another game gets cut or replaced with a real GTA fact.
  - Long-form (9-20 min) is where small GTA channels broke out; consider a long-form test once usage allows (log it).
- Part 2 rule: a clear A/B winner (3+ votes and ahead, YouTube + Instagram) -> make that next, hook "You voted, so
  here's Part 2".
- What has worked so far (change freely when data says): voice am_michael (am_onyx dark) ~1.05, English, 40-58 s, 95-125
  words, comic-pop look (since 18 Nov), music "neon"; numbered list or versus; end with "Part 2 is your call: A, ... or B, ...?" "Comment A or B." + voteCards.
- Deliver shorts-out/gta6-channel/<NN>-<slug>.mp4 + README entry like entry 05 (Title, Description with the vote line,
  Sources, hashtags #shorts #gta6 ..., Tags, A/B options, phase, language, POST BEFORE if time-sensitive).

### AUTHENTIC CONTENT (YouTube monetization policy, "inauthentic content", July 2025)
Mass-produced look-alike videos from one template can be demonetized. AI is allowed; sameness is not. Each video needs
its own research, its own angle and opening, and when the best template repeats a recent one (pick_style prints
SAMENESS RISK) the hook shape, structure, characters and colours must still differ. Never reuse an old script with names swapped.

### EXPERIMENTS (logs: shorts-out/experiments.txt, shorts-out/gta6-channel/experiments.txt)
1. Judge logged videos public 48 h+ without a verdict: views vs median of the channel's last 10 (WIN = 2x+, OK, weak).
   A change that WON twice rewrites CURRENT BEST FORMULA. Keep the IDEA BANK fresh.
2. Each video may test ONE thing (topic kind, hook shape, length, slot, language, template); there is no fixed ratio. Log
   `<title> | <goes public IST> | <what is tested> | | `.
3. Owner suggestion (15 Nov 2026, not a rule): make a 3D-style video (deep-dive / tall-tale / night-file, or a library 3D style)
   now and then, about 1 in 4 videos, when usage allows (3D renders slowly without a GPU; see the 3D notes in the skill).
   Everything else stays your call.
3. New templates come from the matching step: a script whose best match is an unported library id gets that template built (DECIDE 4). Log its
   first use as NEW STYLE in experiments.txt.
4. A style or idea that loses twice: stop using it, note it.

## DELIVER
- Videos over 20 MB: re-encode `-crf 23 -preset slow`. Commit video + README + logs, push.
- Back up the source of every finished build: `bash shorts-out/backup_project.sh <proj>` copies script.json, make_script.py,
  src/shots.js, src/main.js, data/words.json, data/lines.json from /root/faceless-shorts/<proj> into shorts-out/formats/<proj>/
  (renders and audio are not copied). Commit it, so a container reset never loses the work.
- SendUserFile the MP4 (caption = title).

## UPLOAD (YouTube Data API quota: ~5 uploads per Pacific day, resets 08:00 UTC = 13:30 IST)
- Accounts: normal -> `youtube_maimon-mealy` (solo hype, UCNtzvOyrcKhdA1HiM8frvkg); GTA -> `youtube_volt-equal`
  (Kratos Playz, UCO8lnJFO1TLtHPkn9cCNPng). COMPOSIO_MANAGE_CONNECTIONS "list": ACTIVE, else do not upload, say so.
- Upload every `WAITING UPLOAD` entry first (oldest first), then the new video. On `quotaExceeded`: do not retry; set
  README status `WAITING UPLOAD (quota)` and carry on (Instagram is unaffected). The 08:55 IST run usually has no quota
  left: mark WAITING without trying when the 16:55 run already uploaded 5 that Pacific day (count in factory-log).
- Stage: workbench downloads the raw GitHub URL, `upload_local_file` -> s3key. `run_composio_tool(
  "YOUTUBE_MULTIPART_UPLOAD_VIDEO", {title, description, tags, categoryId "27" (GTA "20"), privacyStatus "private",
  videoFile {name, mimetype "video/mp4", s3key}}, account=...)`. Check snippet.channelId. Upload exactly once: on an
  error list the channel's uploads before retrying.
- SLOT (owner 21 Nov 2026: slot.py is the single source of truth; the fixed-hour lists were removed). `python3 shorts-out/slot.py solo`
  (Kratos: `slot.py gta`) prints the time, `mode=explore|exploit` and the bin. Rules, all inside slot.py: hours 09-21 IST on the hour, 60 min
  ahead, within 3 days, 30 min clear of every taken time (solo: publish-queue.txt; both channels: every scheduled time in perf.csv).
  Time bins (IST): morning 09-10, midday 11-13, afternoon 14-16, evening 17-19, night 20-21.
  - slot_mode = catchup (21 Nov 2026): a same-day catch-up upload. It counts toward today's quota and blocks its time (taken_utc, 30 min), but it is
    EXCLUDED from the timing experiment: clean() drops it, so it never enters the bin counts, fair medians, the explore cadence (explore_due) or the
    exploit proof. The explore/exploit test stays clean; a catch-up never counts as an explore or exploit sample.
  - EXPLORE: every 3rd upload per channel, starting with the next one. The least-tested bin, and the hour in it with the fewest samples.
    Never 13:00-13:59 (quota-reset publishes land there). Copy the printed HYPOTHESIS line to experiments.txt before uploading.
  - EXPLOIT (the other uploads): the best bin with 3+ fair rows and a median >= 1.5x the reference. It replaces the current winner only if it
    beats the winner's median by 1.5x. If no bin is proven yet, the best bin so far.
  - Write the perf.csv row with `slot_mode` = `explore` or `exploit` (the mode slot.py printed). A publish forced by the YouTube quota reset is
    `quota-forced` (never counted for timing). Hand-chosen times are `manual`.
  - Kratos: publishAt at the slot time (PUT, read back), and the perf row carries the scheduled `public_ist`, so slot.py sees the booking.
  - Solo hype: the publish-queue line is the booking (step P makes it public; its slot is slot.py's time, not a fixed one).
  - Instagram: ig-queue `at` = slot + 15 min (ig-queue.json stores no metrics, so IG does not score the slot).
  - Not-yet-uploaded rows: video_id `TBD`, views and likes blank, never 0 (a 0 placeholder once dragged gta's median from 283 to 114).
  - views_24h and views_72h are filled by perf_merge.py at the first refresh 1-2 days and 3+ days after the public day. slot.py reads only views_72h.
- Kratos Playz: workbench `proxy_execute` uses the DEFAULT YouTube account. GET channels?part=id&mine=true; if it is
  UCO8lnJFO1TLtHPkn9cCNPng, PUT videos?part=status {"id", "status": {"privacyStatus": "private", "publishAt": <UTC ISO>,
  "selfDeclaredMadeForKids": False, "embeddable": True, "license": "youtube", "publicStatsViewable": True}}; confirm with
  YOUTUBE_GET_VIDEO_DETAILS_BATCH (account youtube_volt-equal). Status `SCHEDULED <date> <time> IST (<url>)`. Else use the
  solo hype method.
- Solo hype: stays private; append `<slot UTC>  <videoId>  <title>  PENDING` to publish-queue.txt (a later run's step P
  makes it public; its slot is slot.py's time). Status `QUEUED: goes public <date> <time> IST (<url>)`.
  Do NOT create send_later reminders.
- Push the status changes.

## INSTAGRAM (every new video)
Add to shorts-out/ig-queue.json `{"id": "ig-<slug>", "at": <its YouTube slot UTC; +15 min if taken>, "file": <repo
path>, "status": "PENDING", "caption": ...}`. Caption: 1-2 sentence hook, key facts, GTA: "Comment for Part 2: A = ...,
B = ... 👇", normal: "Follow for a weird true fact every day 🧠", 6-8 plain # hashtags ending #reels #explore.
Step P of a later run posts it. No send_later. Backfill: max 1 older video a day, at a slot.py slot, when a run has spare time.

## CHANNEL CARE (16:55 IST run only; short)
- Refresh `shorts-out/perf.csv`: a Haiku subagent runs `shorts-out/perf_refresh.py` in COMPOSIO_REMOTE_WORKBENCH, saves the printed
  lines, then `python3 shorts-out/perf_merge.py < lines.txt`. A 48 h+ video with n>=2 evidence goes to style-verdicts.txt.
- Stats for both channels + Instagram (INSTAGRAM_GET_IG_USER_MEDIA fields id,caption,permalink,timestamp,like_count,
  comments_count; INSTAGRAM_GET_USER_INFO followers_count; account instagram_osiery-fun) -> one dated block at the top
  of shorts-out/growth-log.txt (keep 14 days): what wins (topic, slot, language, platform), distance to monetization.
- Title refresh: a public video 2-3 days old with views under half the channel median gets ONE better title
  (YOUTUBE_UPDATE_VIDEO title, only after the day's uploads are done: it costs quota); log old -> new title and the
  result in experiments.txt. A good title cannot save a topic nobody wants: if it still loses, drop the topic kind.
- Timing: read the bins in `slot.py <ch>` (the bin counts are in its output). Promotions are automatic; nothing to swap by hand.
- Votes: public GTA videos from the last 4 days: count A/B in YouTube (YOUTUBE_LIST_COMMENT_THREADS2, account
  youtube_volt-equal) and Instagram comments; write counts into the gta6 README entry. If the channel has not commented
  on a video yet, post ONE comment (YOUTUBE_POST_COMMENT channelId UCO8lnJFO1TLtHPkn9cCNPng): "You decide Part 2 👇\nA =
  <A>\nB = <B>\nReply with just A or B, the winner gets the next video! 🔥".
- Replies: up to 3 genuine new viewer comments per channel (YouTube: YOUTUBE_CREATE_COMMENT_REPLY; Instagram: read with
  INSTAGRAM_GET_IG_MEDIA_COMMENTS {ig_media_id}, reply with INSTAGRAM_REPLY_TO_COMMENT {ig_comment_id, message}; skip
  comments we already replied to): short, friendly, true, no
  links, no begging; ignore spam. Good questions -> topic ideas in growth-log.txt.

## REPORT (Hindi, short)
⚠️ DIKKAT at the top only if something failed or needs the owner (Composio/Instagram disconnected, a post FAILED twice).
Then: video kind + title + style + length + test, when it goes public on YouTube and Instagram (IST) with links,
what each channel has lined up, best video of the last day, subscribers / followers and distance to monetization.
Also one line each: the hook shape used, the template chosen and why, post-mortems written (count).
