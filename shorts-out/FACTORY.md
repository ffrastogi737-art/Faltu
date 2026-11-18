# Shorts factory: step by step

## RUNNER MODE (from 16 Nov 2026; overrides anything below that conflicts)
Scheduled routines cannot push to GitHub, so the factory now runs in sessions created with create_session (repo attached,
push works) by a small scheduler session. In such a session:
- You MAY and SHOULD use send_later again for timed work: the solo hype public switch (YOUTUBE_UPDATE_VIDEO public at the
  slot time) and each Instagram reel at its `at` time, with the messages described in step P (include the entry id and
  tell the woken turn to git pull, post, mark DONE, commit, push). Also still write the PENDING lines/entries so a later
  run can recover them.
- Solo hype slots may be any time then (09:00, 11:30, 17:00, 19:30 IST).
- The session ends after its report; wake-ups from its send_later calls keep it alive just long enough to post.

The scheduled tasks "Shorts factory" (08:55 and 16:55 IST) and "Shorts publisher" (11:25 and 19:25 IST) each start a
FRESH cloud session and follow this file. The why is in /home/user/Faltu/CLAUDE.md: read it first.

Owner (15 Nov 2026): both YouTube channels and Instagram @solohype_1 are yours to grow to monetization ("tujhe puri
azaadi hai", "NO LIMIT MEAN NO LIMIT"). The owner is not watching: never ask questions or wait. Topic, style, script,
build, upload, scheduling, the timed public switch, Instagram posting, CHANNEL CARE and EXPERIMENTS are pre-approved.
Jewellery shop page: ON HOLD, do nothing for it.

Hard limits: no bought views/subs/followers, no sub4sub, no comments or DMs on other people's accounts, no misleading
titles, no copyrighted footage/music/art, no fake facts (2+ sources), never delete a video or post, never make a YouTube
upload public at upload time (private, then publishAt or the timed switch).

## USAGE SAVER (the owner's Claude plan has a weekly limit; running out stops everything)
- Fresh session per run; keep it lean: read only the files a step needs (use `tail`, `grep`, `sed -n`), never re-read
  big files, no extra WebSearch beyond the 2-source fact check, at most 2 QA fix rounds, no optional API writes.
- From 18 Nov 2026 (the weekly limit ran out on 16 Nov, so stay lean): each factory run makes **ONE** video (rule 0 picks
  the channel), two runs a day. Use Sonnet. Watch usage; if a later week shows spare room, raise to two per run.
- GTA phase 2 (launch, 19 Nov - 10 Dec) starts tomorrow: follow the phase text below.
- If the plan's limit is hit mid-run, stop cleanly after pushing what is done.

## Git
Work in /home/user/Faltu on branch `ccr-8c1babe8-9jk0db` (not the session's own branch):
`git fetch origin ccr-8c1babe8-9jk0db && git checkout -B ccr-8c1babe8-9jk0db origin/ccr-8c1babe8-9jk0db`.
Commit on top, `git push -u origin ccr-8c1babe8-9jk0db` (retry network errors). Never the default branch, no PRs.
Commit lines end with the session attribution the system gives you.

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
  words, 40-55 s, a picture change every 1.5-3 s; title under 60 characters. Style differs from the previous README
  entry unless it is the test (2D: stick-story, paper-atlas, inside-out, chalk-talk, ...).
- Deliver shorts-out/<NN>-<slug>.mp4 + README entry (number, file, style, Title, Description: two factual sentences,
  "Sources: ...", 6-8 hashtags starting #shorts; Tags: 8-12 phrases; Experiment; status).

### B · GTA / GAMING (Kratos Playz; language, style, format: your call from trends and data)
- Current style neon-versus (any style may replace it if trends/data say so, incl. library styles). For neon-versus:
  `new_video.sh neon-versus <name>`, then copy
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
  words, music "neon"; numbered list or versus; end with "Part 2 is your call: A, ... or B, ...?" "Comment A or B." + voteCards.
- Deliver shorts-out/gta6-channel/<NN>-<slug>.mp4 + README entry like entry 05 (Title, Description with the vote line,
  Sources, hashtags #shorts #gta6 ..., Tags, A/B options, phase, language, POST BEFORE if time-sensitive).

### AUTHENTIC CONTENT (YouTube monetization policy, "inauthentic content", July 2025)
Mass-produced look-alike videos from one template can be demonetized. AI is allowed; sameness is not. Each video needs
its own research, its own angle and opening, and the format / opening style / structure should vary from the previous
few videos on that channel. Never reuse an old script with names swapped.

### EXPERIMENTS (logs: shorts-out/experiments.txt, shorts-out/gta6-channel/experiments.txt)
1. Judge logged videos public 48 h+ without a verdict: views vs median of the channel's last 10 (WIN = 2x+, OK, weak).
   A change that WON twice rewrites CURRENT BEST FORMULA. Keep the IDEA BANK fresh.
2. About 2 of 3 videos follow the best formula; the 3rd changes ONE thing (topic kind, hook, length, slot, language,
   style). Log `<title> | <goes public IST> | <what is tested> | | `.
3. Owner suggestion (15 Nov 2026, not a rule): make a 3D-style video (deep-dive / tall-tale / night-file, or a library 3D style)
   now and then, about 1 in 4 videos, when usage allows (3D renders slowly without a GPU; see the 3D notes in the skill).
   Everything else stays your call.
3. New style when none was tested in the last 2 days (not in saver mode). FIRST CHOICE: a vertical style from the
   owner's Nafay 3D Style Library, see shorts-out/STYLE-LIBRARY.md (picks per channel, how to rebuild and render;
   never commit their source to this repo). Otherwise a new 2D style of our own: original look, built like chalk-talk
   (copy the closest 2D style folder, own kit, this video as example, STYLE.md, style-sheet.png, SKILL.md row).
4. A style or idea that loses twice: stop using it, note it.

## DELIVER
- Videos over 20 MB: re-encode `-crf 23 -preset slow`. Commit video + README + logs, push.
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
- Slot (shorts-out/slots.txt, best first; UTC: 09:00=03:30Z, 11:30=06:00Z, 16:30=11:00Z, 17:00=11:30Z, 19:30=14:00Z):
  earliest day with a free slot 1 h+ from now, best free slot that day; one video per slot.
- Kratos Playz: workbench `proxy_execute` uses the DEFAULT YouTube account. GET channels?part=id&mine=true; if it is
  UCO8lnJFO1TLtHPkn9cCNPng, PUT videos?part=status {"id", "status": {"privacyStatus": "private", "publishAt": <UTC ISO>,
  "selfDeclaredMadeForKids": False, "embeddable": True, "license": "youtube", "publicStatsViewable": True}}; confirm with
  YOUTUBE_GET_VIDEO_DETAILS_BATCH (account youtube_volt-equal). Status `SCHEDULED <date> <time> IST (<url>)`. Else use the
  solo hype method.
- Solo hype: stays private; append `<slot UTC>  <videoId>  <title>  PENDING` to publish-queue.txt (a later run's step P
  makes it public; slot must be 09:00, 11:30, 17:00 or 19:30 IST). Status `QUEUED: goes public <date> <time> IST (<url>)`.
  Do NOT create send_later reminders.
- Push the status changes.

## INSTAGRAM (every new video)
Add to shorts-out/ig-queue.json `{"id": "ig-<slug>", "at": <its YouTube slot UTC; +15 min if taken>, "file": <repo
path>, "status": "PENDING", "caption": ...}`. Caption: 1-2 sentence hook, key facts, GTA: "Comment for Part 2: A = ...,
B = ... 👇", normal: "Follow for a weird true fact every day 🧠", 6-8 plain # hashtags ending #reels #explore.
Step P of a later run posts it. No send_later. Backfill: max 1 older video a day into 19:30 IST when a run has spare time.

## CHANNEL CARE (16:55 IST run only; short)
- Stats for both channels + Instagram (INSTAGRAM_GET_IG_USER_MEDIA fields id,caption,permalink,timestamp,like_count,
  comments_count; INSTAGRAM_GET_USER_INFO followers_count; account instagram_osiery-fun) -> one dated block at the top
  of shorts-out/growth-log.txt (keep 14 days): what wins (topic, slot, language, platform), distance to monetization.
- Title refresh: a public video 2-3 days old with views under half the channel median gets ONE better title
  (YOUTUBE_UPDATE_VIDEO title, only after the day's uploads are done: it costs quota); log old -> new title and the
  result in experiments.txt. A good title cannot save a topic nobody wants: if it still loses, drop the topic kind.
- Slots: if 2+ videos clearly show another hour beating a slot, swap ONE slot in slots.txt with a reason.
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
