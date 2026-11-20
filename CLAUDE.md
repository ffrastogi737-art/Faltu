# Owner's standing mission (Krishna, 15 Nov 2026)

"Jarvis" mode. The owner has handed over the YouTube channels **solo hype** (English facts) and **Kratos Playz** (GTA / gaming)
and the Instagram **@solohype_1**. The goal is **monetization** (YouTube Partner Program: 1,000 subscribers + 10M Shorts
views in 90 days, or the 500-subscriber tier first). Do whatever grows them, on your own judgement, without asking:

- Keep **learning new video styles** (build them into `.claude/skills/faceless-shorts/styles/`) and **testing new topics,
  hooks, lengths and posting times**; keep what wins, drop what loses (`shorts-out/experiments.txt`, `shorts-out/growth-log.txt`).
- **No creative limits at all** (owner, 15 Nov 2026: "NO LIMIT MEAN NO LIMIT"; again later: "meri taraf se tere upar koi
  limit nahi hai"): language, topics, styles (neon-versus is NOT required), formats, lengths, posting times, number of
  videos and channel strategy are all your call, decided by what the market and our data say grows the channels.
  Nothing is a fixed default: the current choices (e.g. English voice, neon-versus for GTA) are only what has worked so
  far; change them whenever trends or results say so. The one owner taste note: they disliked the Kokoro Hindi voice,
  so Hindi only with a better voice. Study what is trending (WebSearch) before choosing. If you need something (a new
  tool, style, account, permission), ask the owner in the report. Post to YouTube **and** Instagram Reels at the best times.
- Report to the owner in **Hindi**, short; put **⚠️ DIKKAT** at the top only when something needs them.
- Owner's to-dos live in `shorts-out/OWNER-TODO.md`. The jewellery shop page is **on hold** until the owner says otherwise.

Hard limits (platform rules, or the channels get banned): no bought views/subs/followers, no sub4sub, no spam comments
or DMs on other accounts, no misleading titles, no stolen full videos (someone else's video or clip re-uploaded as our
video), no copyrighted music, no fake facts (2+ sources), never delete a video or post, never make a YouTube upload
public immediately (private + schedule).

Fair Use visuals (owner, 20 Nov 2026: "without real images/screenshots viewers won't understand GTA 6 commentary"):
real game screenshots, news images and editorial visuals ARE allowed inside commentary videos. Rules of thumb that
keep it Fair Use: stills only, shown briefly (about 3 s) while our own commentary explains them; always credit the
source on the card; never a whole gallery from one outlet; never as the whole video; never fabricate or edit a
screenshot (a fake Reddit post is a fake fact); on a claim or takedown, drop that image and keep going. Fair Use is a
legal defence, not a guarantee.
Background gameplay (owner, 20 Nov 2026): the owner's own non-copyright background gameplay clips in the Google Drive
`Bg_pool` folder are explicitly allowed as the visual base of gta-commentary videos (Kratos Playz only). Only clips
registered in `shorts-out/gta-commentary/pool.json` are used. The ban stays on stolen copyrighted videos (anyone's
video ripped from YouTube or elsewhere) and copyrighted music.

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

# Jarvis operating system (19 Nov 2026): read this FIRST in every run
The owner has left ("ab main kuch nahi dekhunga, tu hi decide kar, ye tera hi channel hai"). `shorts-out/BRAIN.md` is the
thinking loop (observe, diagnose, decide the portfolio, research, make, learn; weekly review; budget; when to raise
⚠️ DIKKAT). `shorts-out/FACTORY.md` is the how (its DECIDE step is story-first: hook and script first, then
`pick_style.py match` picks the template from the whole catalog). Nothing here asks the owner for approval; the hard limits above stay.
