# HANDOFF for the next chat (written 18 Nov 2026 by Claude; read this + CLAUDE.md + shorts-out/FACTORY.md)
Owner: Krishna. Language: Hindi, short reports; "⚠️ DIKKAT" / "दिक्कत:" first line only if the owner is needed. Owner wants Claude to decide alone, ask only for logins/keys/plans, never fake anything.

## Repos
- `ffrastogi737-art/Faltu` (this one): faceless shorts factory. Factory runs automatically from the scheduler on branch `ccr-8c1babe8-9jk0db`: DO NOT touch `shorts-out/` or the factory branch unless the owner asks. Our work from this chat is on branch `ccr-166d2041-hjam0l`.
- `ffrastogi737-art/Money-boss` (public, separate; has its own CLAUDE.md / NEXT_BATON). Daily baton run scheduled 04:42 UTC (trigger "Money-boss baton run"); Gmail connector could NOT be attached to the scheduler (org setting), so the run cannot read affiliate mails.

## Channels (Composio accounts)
- solo hype (facts, English) `youtube_maimon-mealy`; Kratos Playz (GTA) `youtube_volt-equal` (default); Instagram @solohype_1 `instagram_osiery-fun` (default IG account is the jewellery shop: never post there).
- 18 Nov numbers: Kratos Playz 4 subs, 9 videos, 1,935 views total, not monetized. solo hype: body-quirk Shorts win (Tickle 1353, Stomach 1336, Goosebumps 1251, $19k bed 1181); non-body topics <30 views. IG: GTA reels win (best 43 likes), facts reels 1-4 likes.

## Done in this chat
1. Money-boss engine continued (HRA drafts, baton, Superprofile toolkit built; publish blocked: owner declined paid Superprofile plan; Gumroad needs the owner's account: see Money-boss OWNER_ACTION #5).
2. First LONG video (16:9, 3:27) on solo hype: https://youtu.be/eC5W0w_VFs4 ("Why You Yawn, Hiccup & Sneeze at the Sun: What We Know"), uploaded private, thumbnail set, `long-form/01-body-quirks/` here. A send_later in that session sets it public ~19:28 IST 18 Nov; if still private, set public with YOUTUBE_UPDATE_VIDEO (account youtube_maimon-mealy). Judge at 7 days by watch time.
3. New style `chalk-wide` (16:9 chalk) in the skill + `scripts/words_from_lines.py` (Whisper downloads fail in this container; setup.sh must be run in a fresh container, ~5 min; voice (Kokoro) works).

## Owner's directions from the end of this chat (do these)
- STYLES: the skill has 8 local styles + `chalk-wide`, and the owner also added Nafay's 62-style library (`shorts-out/STYLE-LIBRARY.md`, rebuild rules there; needs our own `tools/render_html.mjs`, not built yet). Claude used chalk too much: USE CHALK LESS, pick the style at random each video from all styles (local + library). Read STYLE-LIBRARY.md BEFORE choosing.
- GTA channel (Kratos Playz): change the GENRE / format, not just the topic (library picks: versus-split, tier-list, top-5-countdown, quiz-countdown, breaking-desk, pixel-quest, glitch-pack, neon-line, synth-grid). Launch is 19 Nov 00:00 IST: post-launch topics (what reviews say, tips, secrets) once outlets publish; unverified walkthrough sites exist: do not trust them. Owner will give a topic; otherwise find topics that get views in the owner's time zone (IST evening) and make that.
- Long videos (16:9, 3-8 min) on both channels now and then; Shorts remain the discovery layer ("3 Shorts + 1 long a week" pattern from vendor blogs, unverified).

## Kratos Playz audit (18 Nov): what is wrong
- Channel settings are fine (description, keywords, country IN, language en, Gaming category).
- ⚠️ Two OLD videos are other people's gameplay: `dltJ6ScN2Dw` and `JqGb4VyObBM` (descriptions say "Credit: Game: Rockstar Games, Total Gaming", hashtag spam #viral #fyp). That conflicts with our copyright rule and risks the channel's monetization review (reused content). Not deleted (rule: never delete): owner should decide to set them private.
- Titles carry "#shorts" and mix English/Hinglish, so the audience signal is split; every video uses the same neon-versus template and the same A/B vote line (sameness = "inauthentic content" risk).
- 8 of 10 videos have no custom thumbnail; 4 newest videos got 0-77 views (feed gives very little to a 4-subscriber channel; early Shorts got 1226 and 453).
- Fix ideas (not applied, owner asked only for the check): one language per channel, drop "#shorts" from titles, new genres from the library, vary the vote line, one long video, make the 2 old clips private after owner OK.

## Open owner items
Zoho affiliate approval (7-10 business days from 18 Nov), Cuelinks status, Gumroad account, scheduler Gmail connector (claude.ai Routines page), Drive connector points to a different Google account (not the owner's main one).
