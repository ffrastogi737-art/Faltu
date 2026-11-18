---
name: gta6-viral-clipper
description: GTA 6 Viral Clip Factory — long GTA 6 / GTA V / GTA RP gameplay, stream, or reaction video (local file, or a YouTube link the user has rights to) se 20-30 vertical Shorts/Reels/TikTok clips banata hai, top 3-4 VIP clips mark karta hai, aur bold subtitles, hook text, punch-in zoom, fade, loudness normalization, thumbnails, titles, hashtags aur upload plan deta hai. Use this skill whenever the user wants to clip, cut, or find viral/highlight/funny/fail/chase/crash moments from a gaming video, make Shorts or Reels from a long video, or mentions GTA clips, even if they don't say "skill".
---

# GTA 6 Viral Clip Factory

Long gaming video → ranked vertical clips. Heavy kaam scripts karte hain; tumhara (Claude ka) kaam
hai input sahi lena, pipeline chalana, aur render se pehle hooks/titles ko insaan jaisa polish karna.

## Requirements
- `ffmpeg` + `ffprobe` (libass ke saath — `ffmpeg -filters | grep ass` check karo)
- Python 3.9+, `pip install -r requirements.txt` (numpy, yt-dlp, faster-whisper)
- faster-whisper na ho to bhi chalega (audio + scene signals se), par subtitles nahi banenge.

## Rules
- **URL input**: pehle user se poocho ki video ka right/permission hai (apna video, ya creator ki permission).
  "Haan" ho tabhi `--confirm-rights` lagao. Nahi to local file maango. DRM/restriction bypass kabhi nahi.
- Copyrighted music ya kisi aur ka content as-is repost na karne ki ek line warning do.
- Scores relative hain (best clip = 100). Views/retention ka koi promise mat karo.

## Workflow

### 1. Input lo
User se (agar nahi bataya): source, clips count (default 30), VIP count (default 4),
clip length (default 15-45s), language (`hi`, `en`, ya auto).

### 2. Analyze + rank (render se pehle ruko)
```bash
python scripts/auto_clip.py --source <file|url> [--confirm-rights] --output ./output/<name> \
  --clips 30 --top 4 --language hi --analyze-only
```
Ye banata hai `output/<name>/work/`: audio.wav, energy.json, silence.json, scenes.json,
transcript.json, ranked.json. 2-3 ghante ke video pe transcription me time lagta hai
(CPU pe `--whisper-model base` fast, GPU pe `small`/`medium` better).

### 3. Polish (important — yahi quality banata hai)
`prompts/moment_ranking.md` padho aur uske hisaab se `work/ranked.json` edit karo:
boring VIP hatao, hook_text/title/hashtags transcript ke basis pe rewrite karo, cut points theek karo.

### 4. Render
```bash
python scripts/auto_clip.py --source <same file> --output ./output/<name> --render-only
```
Fast preview chahiye to pehle `--vip-only`. Effects: `--effects zoom,fade,subs,hook`
(koi bhi hata sakte ho). VIP clips pe zoom/punch-in zyada strong hota hai.

### 5. Report
Output: `clips/*.mp4` (1080x1920, H.264 veryfast (best quality ke liye `--preset medium`)/AAC, -16 LUFS), `subtitles/*.ass`, `thumbnails/*.jpg`,
`metadata.json`, `top_clips.json`, `upload_plan.csv`.
User ko batao: total clips, 4 VIP clips (id, hook, kyun), QA issues (`qa_issues` field), upload order.

## Kaise detect hota hai (agar user pooche)
Har second ka score = keywords (English + Hinglish: "no no no", "oh my god", "bhai", "crash", "police"...)
+ audio loudness + sudden loudness spike + scene-cut density + speech density − silence.
Top peaks ke around window (6s pehle, 14s baad), sentence boundary pe snap, overlapping/duplicate hatao.
Limit: game ke andar pixels se crash/police nahi pehchanta — reaction ya awaaz chahiye.
Bina commentary ke trailer pe sirf loudness/scene cuts kaam aate hain.

## Scripts
- `scripts/analyze.py` — audio, energy, silence, scenes, transcript
- `scripts/rank.py` — candidates, score, VIP, draft metadata (keywords yahan edit karo)
- `scripts/render.py` — vertical render, subtitles, hook, zoom, fade, thumbnail, QA
- `scripts/auto_clip.py` — sab ek command me
