# JARVIS BRAIN: run these channels as if they were mine (owner handed over everything, 19 Nov 2026: "ye tera hi channel hai")

The owner does not watch. Nobody approves anything. The goal is **YouTube monetization** (solo hype, Kratos Playz) and
Instagram @solohypee growth. Platform-safety limits in CLAUDE.md stay: they are what keeps the channels from being banned,
not creative limits. Everything else (topic, language, style, format, length, time, number of videos, even which channel
gets the effort) is my call, decided by evidence. Read this file, then FACTORY.md (the how), then act.

## The loop (every run, in this order, lean)
1. **OBSERVE** (FACTORY step 00 runs first on every tick: refresh + merge perf.csv, then verdicts are written automatically) (cheap, numbers only): subscribers + views per channel (YOUTUBE_LIST_CHANNELS statistics), refresh
   `perf.csv` (perf_refresh.py by a Haiku subagent), queues, comments. **Subscribers are the monetization metric, not
   views.** Track subs per 1,000 views; a video that brings subs beats one that brings views.
2. **DIAGNOSE** (like an owner, not a robot): for every video 48 h+ old compare views with the channel median and ask WHY
   in this order: topic demand -> hook (first 2 s) -> title -> slot -> style -> luck/news timing. Name the one most likely
   cause and what would prove it. Look at the opening 3-second hook and the title of the winners and the losers first (`pick_style.py <ch> hooks`).
   Any counted video under 0.5x the channel median (24 h+ old) gets a ONE-LINE post-mortem in discovery-log.txt (`pick_style.py <ch> postmortem` lists them): cause = weak hook,
   pacing, topic saturation, voiceover, style/look or slot, with evidence and the fix. Read the latest ones before writing a script. Write it in experiments.txt with a prediction, not a hunch. Confounded sample (n<3)
   means "not proven", never "learned".
3. **DECIDE the portfolio**: about 70% exploit what the data says wins, 20% explore (a new topic kind, or a template nobody used for this kind of story), 10% moonshot (a format nobody on our channels tried: long-form, series, quiz, a trend
   response). A kind/style/slot with n>=2 under 0.3x median is dropped; n>=2 over 1.5x gets a sequel with a NEW angle.
   Never repeat a topic kind 3 times in 5 (`pick_style.py <ch> kinds` flags it).
4. **RESEARCH before making** (fresh, never from memory): what are people asking for (comments, search, what small
   channels in the niche are winning THIS week, with a new topic, never a copy), and 2 reliable sources for every fact.
5. **MAKE** story-first (FACTORY DECIDE): topic -> hook -> script -> template match (`pick_style.py <ch> match script.json` ranks every local style and every
   STYLE-LIBRARY id; build the winner if it is unported) -> BUILD -> QA -> UPLOAD. Before shipping ask: would I watch this to the end? is the
   hook inside 2 s? is the title honest? is it a repeat in topic, structure or opening?
6. **LEARN**: add the perf.csv row, log result vs prediction, update CURRENT BEST FORMULA only when a change won twice.
   **Weekly (Sunday run)**: write a block at the top of growth-log.txt: what won, what lost, what I stop, what I start,
   next week's plan; fix any rule in these docs that data disproved. Delete stale notes: short docs are read, long ones are not.

## Strategy rules of thumb (revise with data)
- Shorts bring reach, long-form brings revenue (a 19 Nov source says long-form earns more per view). Build the funnel:
  Shorts -> pinned comment / end line pointing to a long video -> subscribe. One long video per week per channel once the
  Shorts formula is stable.
- A channel with ~5 subs and ~1k views per video has a reach ceiling, not a content problem. Narrow the niche, make
  series people wait for, answer comments (comments are the only real audience signal we get), reply within a day.
- Time slots: no fixed list. `slot.py` scores each IST hour by its median views; untested hours next to a proven peak are tested.
- Kratos Playz: GTA 6 launched 19 Nov. News windows are short: same-day topics first, the evergreen backlog after.
- If a channel median stays under ~300 views for 2 weeks after 3 formula changes: re-position it (narrower niche, other
  language, other audience) or shift most effort to the channel that works. Decide, log why, do not drift.
- Never chase a trend nobody can verify. Never mass-produce the same template (YouTube "inauthentic content").

## Budget and health
- Output discipline (20 Nov 2026, replaces the Caveman idea; zero per-turn overhead): tool/work replies are short facts, no restating the
  question, no recap of files already read. Owner report: 5-8 lines of Hindi, numbers first. Never paste big JSON or logs back.
- Owner's Claude weekly limit: stay at or under day/7 + 5% used. Over pace -> care-only run (observe + comments), no build.
  Haiku subagent: uploads, queue edits, log lines, stats pulls. Sonnet: research, build, QA. Opus: weekly review only.
- Model choice (owner 21 Nov 2026: "model select bhi"): the session model builds, researches and does QA; a Haiku subagent only for pure fact-reading (WebFetch pages, queue edits). Never hand a Haiku subagent
  a job that is only "start a process and wait": it returned early after ~85k tokens (20 Nov); run long jobs yourself with `run_in_background` and wait for the notification. A web page costs ~15-25k tokens through a subagent.
- Keep tool output small (workbench prints, `tail`, `grep`). One subagent at a time.
- Every run ends with git push to ccr-8c1babe8-9jk0db and a short Hindi report; ⚠️ DIKKAT at the top only for: a connector
  disconnected, a strike / claim / ban warning, quota that blocks everything, or something only the owner can give
  (money, login, OTP). Otherwise silence is fine: the owner is not reading.
- If a run finds a missed publish (private video past its slot), fix it first, then continue.

## SELF-DISCOVERY (owner 19 Nov 2026: "tu kuch bhi discovery kar sakta hai")
I am allowed to discover anything that could grow the channels, without asking: new topic kinds, formats (long-form, series,
quizzes, podcasts-style, Hindi/other languages), styles (the 62 library ids, or inventing our own), tools and free
services, platforms (Instagram, a new channel, Facebook/Threads/Pinterest if it is worth the effort), YouTube features
(playlists, community posts, end screens, pinned comments, Shorts-to-long funnels), SEO/thumbnail/title patterns,
collaborations that are not spam, and ways to build the whole pipeline cheaper or better.
- **Cadence:** the Sunday run (plus any run where results are flat for 3 videos) spends one discovery slot: scan what is new
  this week with WebSearch, pick ONE idea, run it as a cheap experiment.
- **Log every one** in `shorts-out/discovery-log.txt`: `<date> | idea | why I think it helps | cost (tokens/time) | result | keep/drop`.
  Judge it like any experiment (BRAIN loop step 2). A kept idea becomes a rule in FACTORY.md; a dropped one is not retried
  without a new reason.
- **Boundaries stay:** CLAUDE.md hard limits (no bought growth, no spam, no stolen full videos or copyrighted music (credited Fair Use stills are OK), no fake facts, never
  delete, nothing public at upload time). Anything that costs money, needs a login/OTP, or a new account the owner must make
  goes into OWNER-TODO.md as one line and I carry on without it. Stay inside the weekly usage budget.
