# Stream Clipper (स्ट्रीम क्लिपर)

कच्चे गेमप्ले / स्ट्रीम क्लिप को अपने आप 9:16 YouTube Short में बदलता है और upload के लिए पूरा metadata तैयार करता है।
**यह कहीं upload नहीं करता**: सिर्फ़ फ़ाइलें बनाता है। यह फ़ोल्डर बाकी किसी प्रोजेक्ट से जुड़ा नहीं है।

## इस्तेमाल (3 कदम)
1. अपने क्लिप (`.mp4 .mov .mkv .webm`) इस फ़ोल्डर में डालो: `tools/stream-clipper/input/`
2. (चाहो तो) facecam का डिब्बा जाँचो: `python3 edit_clip.py --cal` → `output/<क्लिप>/cal.jpg` खोलो। नीचे लिखा है कि डिब्बा कहाँ से आया (box / preset / creators.json / auto / no-facecam)।
   बाईं तरफ़ रंगीन डिब्बे हैं (cyan = facecam, हरा = gameplay), दाईं तरफ़ नतीजा। गलत हो तो `--facecam left` या `--facecam top-right` या `--box 0.7,0.6,0.3,0.4` आज़माओ।
3. असली एडिट: `python3 edit_clip.py --creator "@streamer_ka_naam" --game "GTA 6"`

हर क्लिप के लिए `output/<क्लिप>/` में बनता है:
- `final_short.mp4`: 1080x1920 Short, upload के लिए तैयार
- `sheet.jpg`: पूरे वीडियो की झलकियाँ (facecam, gameplay, hook, captions जाँचने के लिए)
- `metadata.txt`: 3 titles (60 अक्षर से कम), description (credit सहित), hashtags, YouTube Studio tags, pinned comment। यही terminal में भी छपता है।

## विकल्प
| विकल्प | मतलब |
|---|---|
| `--facecam right\|left\|top-right` | facecam का preset ज़बरदस्ती लगाओ (right = नीचे-दाएँ कोना)। न दो तो नीचे वाला अपने-आप चलता है |
| `--box x,y,w,h` | facecam का सटीक डिब्बा (तस्वीर के हिस्से, 0 से 1) |
| `--no-facecam` | facecam के बिना: gameplay पूरी 9:16 स्क्रीन भरता है और एक्शन के साथ चलता है |
| `--hook "..."` | अपना hook (5-7 शब्द), नहीं दिया तो क्लिप की सबसे मज़ेदार लाइन से अपने आप बनता है |
| `--creator "@naam"` | credit लाइन + `creators.json` से उस creator का box, game और भाषा |
| `--game "नाम"` | titles, hashtags और tags में game का नाम |
| `--lang hi\|en` | बोली की भाषा (default hi = Hindi/Hinglish) |
| `--only नाम` | सिर्फ़ वो क्लिप जिनके नाम में यह शब्द हो |
| `--game-x 0.1` | gameplay वाला crop थोड़ा दाएँ/बाएँ खिसकाओ |
| `--test` | synthetic क्लिप से पूरा टेस्ट |

## यह क्या करता है
1. **Dead हिस्से हटाता है**: pause-menu जैसे रुके हुए फ्रेम (जिनमें कोई ज़ोर से रिएक्शन न दे रहा हो) और 2 सेकंड से लंबी चुप्पी। लक्ष्य 18-45 सेकंड; 45 से लंबा हो तो सबसे ज़्यादा एक्शन वाले 45 सेकंड चुनता है।
2. **सही 16:9 तस्वीर ढूँढता है**: मोबाइल स्क्रीन-रिकॉर्डिंग के blurred / काले पट्टे हटाता है। फिर ऊपर 35% (1080x670) facecam, नीचे 65% (1080x1250) gameplay।
3. **Captions**: Hindi/Hinglish बोली को लोकल `faster-whisper` से word-timestamps के साथ लिखता है (Roman में), 2-4 शब्द प्रति लाइन, मोटा सफ़ेद फ़ॉन्ट + काली outline, बोला जा रहा शब्द पीला (#FFE600), बीच की रेखा (divider) पर।
4. **Hook banner**: शुरू के 3.5 सेकंड ऊपर पीला banner।
5. **तेज़ आवाज़ (हँसी/चीख/धमाका) पर**: हल्का 1.07x punch-in zoom + whoosh/pop/boom SFX (कोड से खुद बनाए, कोई audio pack नहीं)। पूरी आवाज़ -15.5 LUFS पर।
6. **Package**: ऊपर बताई तीन फ़ाइलें।

## जो पहले से मौजूद चीज़ें इस्तेमाल होती हैं (कुछ नया install नहीं किया)
- `ffmpeg`, `python3` (numpy, scipy, Pillow), फ़ॉन्ट Inter Black।
- Whisper के लिए: जिस Python में `faster-whisper` पहले से है (`~/.faceless-shorts/venv` मिला)। दूसरा Python चुनना हो तो `STREAM_CLIPPER_WHISPER_PY=/path/to/python` सेट करो। यह सिर्फ़ एक Python interpreter है, किसी प्रोजेक्ट का कोड नहीं।
- सिर्फ़ एक चीज़ डाउनलोड हुई: Whisper `small` (बहुभाषी) मॉडल, इसी फ़ोल्डर में `models/` (≈460 MB)। मशीन पर पहले सिर्फ़ अंग्रेज़ी-वाला `small.en` था, जो Hindi नहीं समझता।

## सीमाएँ (ईमानदारी से)
- Hindi की शुद्धता आवाज़ की साफ़ाई और game की आवाज़ पर निर्भर है; गलत शब्द आ सकते हैं। Roman में बदलने का नियम-आधारित तरीका है, इसलिए कुछ शब्दों की spelling अलग हो सकती है।
- Titles, description और tags नियमों से transcript के शब्दों पर बनते हैं (कोई AI सर्विस नहीं), इसलिए upload से पहले एक नज़र डालकर बदल लो।
- Facecam की जगह अपने आप नहीं पहचानी जाती: एक बार `--cal` से जाँच लो।
- क्लिप में एक्शन 18 सेकंड से कम हो तो वीडियो छोटा रहेगा (लंबा नहीं किया जाता)।
- असली स्ट्रीम फ़ुटेज पर अभी बड़ा टेस्ट नहीं हुआ: टेस्ट synthetic क्लिप और एक बोले हुए नमूने पर है।

## Facecam अपने-आप कैसे मिलता है (नया)
क्रम (ऊपर वाला जीतता है): `--box` > `--facecam` preset > `creators.json` (`--creator`) > **अपने-आप चेहरा खोज** > `--no-facecam`।
- **चेहरा खोज:** 12 फ्रेम में छोटा ONNX face-मॉडल (YuNet, 232 KB, `models/`) चलता है। जो चेहरा आधे से ज़्यादा फ्रेम में लगभग एक ही जगह, किनारे/कोने के पास रहे, वही facecam है। गेम के चलते-फिरते किरदारों के चेहरे, बीच के बड़े close-up और एक-दो बार दिखे चेहरे छोड़ दिए जाते हैं। फिर चेहरे के चारों तरफ़ साफ़ margin वाला डिब्बा बनता है (किनारे के पास हो तो किनारे तक)।
- **चेहरा न मिले:** अपने-आप `--no-facecam` (साफ़ संदेश के साथ)। रुकना हो तो `--require-facecam` लगाओ।
- **creators.json:** हर creator का `box`, `game`, `lang`। `--creator "@naam" --box x,y,w,h` देने पर या `--save-preset` देने पर अपने-आप सेव होता है। `@Mythpat` पहले से भरा है (box `0.765,0.12,0.235,0.30`, game `GTA 5`, lang `hi`)। `--game` देने पर वह creators.json वाले game को बदल देता है।
- `assets/facecam_fixture.png` सिर्फ़ टेस्ट के लिए (आपके अपने क्लिप का एक facecam-चित्र); `python3 edit_clip.py --test` उसे चारों कोनों में रखकर जाँचता है।
- सीमा: avatar/mask/VTuber में चेहरा नहीं मिलेगा, तब fallback या `--box` चाहिए। दो facecam हों तो ज़्यादा स्थिर वाला चुना जाता है।
