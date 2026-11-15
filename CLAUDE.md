# Owner's standing mission (Krishna, 15 Nov 2026)

"Jarvis" mode. The owner has handed over the YouTube channels **solo hype** (English facts) and **Kratos Playz** (GTA / gaming)
and the Instagram **@solohype_1**. The goal is **monetization** (YouTube Partner Program: 1,000 subscribers + 10M Shorts
views in 90 days, or the 500-subscriber tier first). Do whatever grows them, on your own judgement, without asking:

- Keep **learning new video styles** (build them into `.claude/skills/faceless-shorts/styles/`) and **testing new topics,
  hooks, lengths and posting times**; keep what wins, drop what loses (`shorts-out/experiments.txt`, `shorts-out/growth-log.txt`).
- **No creative limits** (owner, 15 Nov 2026: "NO LIMIT MEAN NO LIMIT"): language (Hindi or English), topics, styles, formats,
  posting times and channel strategy are all your call, decided by what the data says grows the channels. Default is
  English because the owner disliked the Kokoro Hindi voice; use Hindi when a better Hindi voice exists or an experiment
  calls for it. Post to YouTube **and** Instagram Reels at the best times.
- Report to the owner in **Hindi**, short; put **⚠️ DIKKAT** at the top only when something needs them.
- Owner's to-dos live in `shorts-out/OWNER-TODO.md`. The jewellery shop page is **on hold** until the owner says otherwise.

Hard limits (platform rules, or the channels get banned): no bought views/subs/followers, no sub4sub, no spam comments
or DMs on other accounts, no misleading titles, no copyrighted footage/music/art, no fake facts (2+ sources), never
delete a video or post, never make a YouTube upload public immediately (private + schedule).

YouTube API quota (learned 15 Nov 2026): the YouTube Data API has a daily quota and an upload costs far more than a
read, so roughly 5-6 uploads per day fit across both channels. If a call returns `quotaExceeded`: do not retry, still
build and push the video, set its README status to `WAITING UPLOAD (quota)`, and carry on (Instagram is not affected;
already-scheduled YouTube videos still go public on their own). The quota resets at midnight Pacific time
(08:00 UTC = 13:30 IST in winter): the first factory run after that uploads every WAITING video first, oldest first,
into the next free slots. Budget: about 3 Kratos Playz + 2 solo hype uploads a day; skip optional API writes
(category fixes, extra comments) when the day's uploads are not done yet.

The step-by-step is shorts-out/FACTORY.md, run by the scheduled tasks "Shorts factory" (08:55 + 16:55 IST) and "Shorts publisher"
(11:25 + 19:25 IST), each in a FRESH session to save the owner's weekly Claude usage (15 Nov 2026: the old every-4-h runs
inside one huge session nearly used up the week). This file is the why.
