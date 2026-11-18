# HANDOFF: नई चैट के लिए (18 Nov 2026, ~20:20 IST)

## नई चैट में सबसे पहले
1. `cd /home/user/Faltu && git checkout ccr-fa5fa7f1-do17r2 && git pull`
2. पढ़ो: यह फ़ाइल, `CLAUDE.md`, और `shorts-out/FACTORY.md` (सिर्फ़ पढ़ने के लिए)।
3. इसी branch पर काम करो। `ccr-8c1babe8-9jk0db` और `shorts-out/` को मत छेड़ो।
4. काम खत्म होने से पहले: `git add -A && git commit && git push -u origin ccr-fa5fa7f1-do17r2`। Untracked फ़ाइल छोड़ने पर stop hook रोकता है।

## मालिक (Krishna) के नियम
- रिपोर्ट हिंदी में, छोटी। ⚠️ DIKKAT सिर्फ़ तब जब उनकी ज़रूरत हो।
- मिशन: YouTube monetization (solo hype, Kratos Playz) + Instagram @solohype_1। लक्ष्य: 1,000 subs + 10M Shorts views (90 दिन) या 500 subs वाला tier।
- कभी नहीं: नकली views/subs, sub4sub, spam, गुमराह करने वाले titles, copyrighted footage/music, बिना 2 स्रोत के fact, कुछ delete करना, upload को सीधे public करना (हमेशा private + schedule)।
- कोई creative limit नहीं (मालिक का आदेश), पर platform के नियम नहीं तोड़ने।

## Channels और accounts
| चीज़ | ID / Composio account | स्थिति |
|---|---|---|
| solo hype (English facts) | UCNtzvOyrcKhdA1HiM8frvkg / `youtube_maimon-mealy` | चालू, ~5 subs (15 Nov) |
| Kratos Playz (GTA) | UCO8lnJFO1TLtHPkn9cCNPng / `youtube_volt-equal` (default) | ~3 subs (15 Nov); phone-verify नहीं, इसलिए custom thumbnail नहीं लग सकता |
| Instagram | `instagram_osiery-fun` (@solohype_1) | जूलरी वाला default account कभी नहीं |
| नया clipping channel | अभी बना नहीं | मालिक का आइडिया अधूरा (नीचे) |

- YouTube quota: दोनों channels मिलाकर ~5-6 uploads/day। `quotaExceeded` पर retry नहीं; status `WAITING UPLOAD (quota)`। Reset 08:00 UTC (13:30 IST)।

## आज का काम (18 Nov 2026)
### Long video 01: "GTA 5 Habits That Will Get You Caught In GTA 6"
- फ़ोल्डर `long-form/01-gta5-habits-gta6/`: `gta5-habits-gta6.mp4` (v2, 52 MB, 4:19, 1920x1080, loudnorm −16 LUFS), `thumb.jpg` (पुराना, 1280x720), `script.json` (lines + sources), `lines.json`, `transcript.txt` (647 शब्द), `README.md` (title, description, chapters, tags, status), `trend-research.md`।
- **v2 `IQK5LW-4vok`** (असली वीडियो): private, publishAt `2026-11-19T11:00:00Z` = 19 Nov 16:30 IST पर public।
- **v1 `ID0o6Y-NKes`** (बिना effects, flat): private रखा; publishAt 2027-11-19 पर धकेला ताकि गलती से public न हो। Delete नहीं करना।
- Thumbnail अभी नहीं लगा। मालिक Gemini से नया thumbnail बनवाएँगे (prompt चैट में दिया गया: 16:9, original art, कोई Rockstar लोगो या असली किरदार नहीं)। फिर channel verify होने पर `YOUTUBE_UPDATE_THUMBNAIL` (videoId `IQK5LW-4vok`)।
- Experiment log: `long-form/experiments.txt`।

### Style `cctv-wide` (नया, 16:9, हमारी ओर से पहला long-form style)
- `.claude/skills/faceless-shorts/styles/cctv-wide/` (STYLE.md, example/, style-sheet.png) और SKILL.md में row।
- STYLE.md का EFFECTS section: हर cctv-wide video में ज़रूरी। Whip / glitch / flash cuts, punch zoom + shake हर slam पर, hook headline (Anton), light leaks, grain, progress bar।
- Sound (`tools/mix.py`): music "drive" (98 BPM), SFX boost 5 dB, riser और boom, glitch cue।
- Words: `scripts/words_from_lines.py` (Whisper container में download नहीं होता)।

### Working project (repo के बाहर)
- `/root/faceless-shorts/gta6-habits/` असली project है। Repo की copy `styles/cctv-wide/example/` में।
- Render: `export CHROME=/opt/pw-browsers/chromium` → `node tools/capture.mjs check` → `cues` → `py tools/mix.py .` → `sheet review/all.jpg 3 6` (ज़रूर देखो) → `nohup node tools/capture.mjs video renders/x.mp4` (~8 मिनट, background में) → ffmpeg encode `-crf 24 -preset slow -af loudnorm=I=-16:TP=-1.5:LRA=11`।
- Thumbnail frame: `PAGE=thumb.html node tools/capture.mjs frames review/thumb 0`।

### Research (18 Nov)
- GTA 6 लॉन्च 19 Nov 2026 (PS5, Xbox Series X|S), PC बाद में। अभी कोई review नहीं।
- YouTube पर "GTA 6" long videos: map guides और "N things" lists सबसे ज़्यादा views (6.4M, 3.8M, 2.8M)। छोटे चैनल पहले दिन 1k-25k।
- Video में इस्तेमाल तथ्य (2+ स्रोत): Game Informer cover story (six-star + Heat, police पहचान, मौसम, 170+ प्रजातियाँ, activities); 30 FPS target (Rob Nelson); single-player, online की तारीख नहीं; map ~2x GTA V (reported); 212 GB; PS Store midnight unlock (reported)।
- लॉन्च के बाद: 30 FPS, Heat, online, map size सब reviews से दोबारा check करो, फिर Part 2।

### Growth plan
- `long-form/GROWTH-PLAN-60-DAYS.md`। YPP (reports): अभी 1,000 subs + 4,000 public watch hours या 10M Shorts views (90 दिन)। 500-sub tier: memberships, Super Thanks, Shopping affiliate (reported)।
- **Reported:** 1 Feb 2027 से नए channels के लिए 8,000 hours या 20M Shorts views। मतलब 31 Jan 2027 से पहले qualify करना।
- Revenue (blogs, verify ज़रूरी): भारत में gaming long-form ~₹15-60 RPM; Shorts ~₹2-8 per 1,000 views।
- Rockstar fan policy: सिर्फ़ non-commercial; leak नहीं; monetized game footage grey area।

### video-suite (repo में, अभी सिर्फ़ रखा गया, कुछ run नहीं हुआ)
- `video-suite/README.md`, `COMPARE.md` (4 tools की तुलना + merge plan)
- `video-suite/ai-video-editor/` (zip का code, talking-head editor)
- `video-suite/clippers/gta6-viral-clipper/` (पूरी skill), `clippers/peakcut-clipper/SKILL.md`
- `video-suite/faceless-shorts` → symlink `.claude/skills/faceless-shorts`

### Clipping channel (नया आइडिया, अधूरा)
- मालिक: नया channel, clipping वाला। Campaign वेबसाइट (नाम अभी नहीं बताया) पर join करके source वीडियो लेना, उनसे क्लिप बनवाना, upload करना।
- मालिक की अपनी clipping skill है। कौन सी (`gta6-viral-clipper`, `peakcut-clipper`, या नई) साफ़ नहीं।
- मालिक का मैसेज बीच में कटा ("और जो तुमने")। बाकी पूछना है।
- नियम (मेरी सलाह): campaign के बाहर का footage नहीं; fake views नहीं; हर क्लिप का link और views log।

## Commands और gotchas
- Composio YouTube में कई accounts हों तो `account` ज़रूर दो।
- Upload: फ़ाइल पहले GitHub branch पर push करो; workbench में `curl` से raw URL, फिर `upload_local_file` → `s3key`; फिर `YOUTUBE_MULTIPART_UPLOAD_VIDEO` (गेमिंग categoryId "20", privacy "private")।
- Schedule: `proxy_execute PUT videos?part=status` में publishAt।
- Thumbnail: `YOUTUBE_UPDATE_THUMBNAIL` सिर्फ़ verified channel पर।

## मालिक से खुले सवाल
1. Kratos Playz को phone-verify करें (youtube.com/verify)।
2. Gemini का thumbnail file भेजें (या मुझे बताएँ)।
3. Voice: अपनी awaaz (Hindi/English) या paid TTS API key।
4. AdSense और affiliate account।
5. Monetized videos में game footage? (मेरी सलाह: नहीं)।
6. पुराने videos `dltJ6ScN2Dw` और `JqGb4VyObBM` (किसी और का gameplay): private करें? Delete कभी नहीं।
7. Clipping channel का पूरा आइडिया और campaign के नियम।
8. video-suite merge: एक command या तीन?

## Unverified / risk
- "फ़ोन नंबर से साल में 2 channels verify" का नियम मालिक का कहना है, YouTube Help से नहीं मिलाया।
- YPP 2027 बदलाव और RPM blogs से हैं।
- CLAUDE.md में Shorts factory scheduled tasks (08:55/16:55, 11:25/19:25 IST) का ज़िक्र है; इस session में उनकी स्थिति check नहीं हुई।
- Solo hype और Shorts इस session में नहीं बने।
- v2 का sound: कान नहीं हैं, levels सिर्फ़ numbers से (mean −18.2 dB, peak −1.7 dB)। मालिक एक बार सुनें।
