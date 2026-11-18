# Comparison: 4 tools, aur merge plan

Maine teeno ke code aur SKILL.md padhe. Koi tool abhi is session mein run nahi kiya gaya (sirf padha gaya), isliye neeche "kaam karta hai" ka dava nahi, sirf code aur docs ki baat hai.

## 1. Ek nazar mein

| | faceless-shorts (hamara) | ai-video-editor (zip) | gta6-viral-clipper | peakcut-clipper |
|---|---|---|---|---|
| Input | script / topic | aapki recording | lamba gameplay video | lamba video (+ captions file best) |
| Kaam | video banana | cut + graphics | clips chunna | clips chunna + edit |
| Voice | Kokoro (local, free) | aapki awaaz | video ki awaaz | video ki awaaz |
| Captions | canvas, auto, 1 yellow word | ASS/whisper | ASS (2 styles) | ASS word-bounce, 3 styles |
| Effects | cctv-wide: whip/glitch/flash, shake, hook, beat music (v2) | creator-motion-graphics (kinetic type, whip, glitch, SFX, music) | punch zoom, fade, hook | zoom, progress bar, fade, animated hook, SFX+music, lower third |
| Loudness | `loudnorm` (v2 mein) | haan | `loudnorm -16` | `loudnorm` |
| Speech-to-text | words_from_lines (no Whisper) / Whisper | Whisper | faster-whisper | Whisper ONNX |
| Footage ki zaroorat | nahi (sab drawn) | haan | haan | haan |
| Rockstar risk | nahi | nahi (apni recording) | haan (game footage) | haan (game footage) |
| Setup | Chrome + Kokoro (setup.sh) | Playwright + Whisper | ffmpeg + faster-whisper | PeakCut GitHub + Whisper ONNX + numpy |

## 2. Kya achha hai (keep karne layak)
- **faceless-shorts**: drawn-only (koi footage nahi, policy safe), script se pura pipeline, QA loop (contact sheet), 9 styles, cctv-wide 16:9. Hamare channels ka base. Sabse kaam ka.
- **ai-video-editor**: `edits.json` se word-level cut (retake, false start, silence) — ye hamare paas nahi hai. Creator Motion Graphics ke effects (whip, glitch, flash, punch zoom, shake, light leak) ka source yahi hai; cctv-wide mein pehle se port ho chuke hain.
- **gta6-viral-clipper**: clip scoring (keywords + loudness spike + scene density + silence), ranking prompt (`prompts/moment_ranking.md`), upload_plan.csv. Ye hamare paas nahi tha: lamba video se clips nikalne ka logic.
- **peakcut-clipper**: V2 edit pass (animated hook, synthesized SFX+music, lower third, cover) aur loudness-mode (captions ke bina bhi clip chunna). Bahut bada (52 KB), par kaam ka reference.

## 3. Duplicate / kya hata dein
- **Teen caption renderers** (clippers ka ASS, PeakCut ka ASS, hamara canvas): ek hi rakhna. Drawn videos ke liye canvas, footage clips ke liye ASS. Baaki hata dein.
- **Teen loudnorm/fade code**: ek function (`common.py` style) mein.
- **Do clipper** (gta6 + peakcut) ka scoring/render overlap: gta6 ka scoring + render rakhein; peakcut ke sirf V2 effects (animated hook, lower third) lein.
- **PeakCut skill**: uska code "as-is" likhne ko kehta hai aur GitHub se engine fetch karta hai. Engine ko seedha chalane ki bajaye, sirf idea lein. Ye copy karne se pehle code padhna zaroori hai.

## 4. Merge plan (ek pipeline, teen entry points)
1. `make shorts <topic>` → faceless-shorts (roz ka kaam, drawn). **Primary.**
2. `make edit <video>` → ai-video-editor (sirf jab aap khud bolte hain).
3. `make clips <lamba.mp4>` → gta6 scoring + render, peakcut ke V2 effects ke saath. **Sirf apna footage ya permission wala, aur Rockstar niyam check hone ke baad.**

Ye abhi sirf plan hai. Code merge karne se pehle: (a) har tool ka ek chhota test video par chalana, (b) effects ko ek hi shared `effects.js` mein rakhna, (c) owner ka faisla ki kaunsa entry point chahiye.

## 5. Kya owner se chahiye
- Kya aapke paas apna lamba gameplay ya talking-head video hai? Nahi to 2 aur 3 abhi kaam ke nahi.
- Kratos Playz ke monetized videos mein game footage chalega? Meri salah: nahi.
- Kya merge ke baad ek hi command chahiye, ya teen alag? (Mera sujhav: ek command, teen sub-command.)

## Ponytail note
Maine tools chalaye nahi, sirf padhe. Merge plan ka code abhi nahi likha. Risk: PeakCut ka engine GitHub se aata hai aur kuch scripts skill ke text se banane hain, ye check nahi hua.
