# Moment polish prompt (Claude ke liye — render se pehle)

`work/ranked.json` padho. Har clip me `transcript`, `category`, `score_parts` hain.
Script ka scoring heuristic hai (audio loudness + keywords + scene cuts). Tumhara kaam:

1. **Galat VIP hatao**: agar VIP clip ka transcript boring hai (sirf driving, menu, loading) to `vip=false`,
   aur next best interesting clip ko `vip=true` karo. Total VIP = user ka `--top`.
2. **hook_text** rewrite karo (max 6-7 words, curiosity/shock, 1 emoji max). Pehle 2.5 sec screen pe dikhta hai.
   Transcript se hi nikalo — jo hua hi nahi wo promise mat karo.
3. **title**: short, Hinglish ya English (user jaisa chahe), clickbait ho par jhooth nahi.
4. **hashtags**: 4-6, hamesha #GTA6 aur #Shorts.
5. **start/end** adjust kar sakte ho (max ±5s) agar transcript dikhata hai ki setup ya payoff kat raha hai;
   `duration` bhi update karo.
6. `reason` me ek line likho kyun ye clip chalega.

Sirf ranked.json edit karo (valid JSON), phir render-only chalao.

Hook examples: "He really said watch this 💀", "Police se bachna impossible tha...",
"Bro forgot GTA physics exist 😭", "Wait for the ending", "NPC was not ready for this".
