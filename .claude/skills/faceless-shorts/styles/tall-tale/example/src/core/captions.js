// Captions (owner 21 Nov 2026): 2-3 words on screen at a time, white heavy sans with a black outline and a soft shadow.
// The word being spoken is #FFE600 and pops to 112 %. The block sits in the lower safe zone (CAP.y), clear of the Shorts
// buttons and of the bodies (plan.js keeps the cast above y 1300). Words keep their punctuation and the script's spelling.
// A script line may set "caps": "He bet | his life | savings" to choose the chunks; otherwise they're made automatically.
import { ctx, clamp, lerp, seg, eob } from './lib.js';
import { T, lineWords } from './timing.js';

export const CAP = { y: 1400, size: 92, maxW: 980 };
const HL = '#FFE600';
let caps = [];
const SHORT = /^(a|an|the|to|of|in|on|at|by|and|but|or|so|is|it|he|she|we|i|his|her|my|no|up|for|was)$/i;

/** groups of word indices: up to 3 words, a break after punctuation, and never more than ~16 characters */
function groups(spoken) {
  const out = []; let cur = [];
  spoken.forEach((w, j) => {
    cur.push(j);
    const len = cur.reduce((n, k) => n + spoken[k].length, 0);
    if (/[,.!?;:]$/.test(w) || cur.length >= 3 || len >= 16) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}

export function buildCaptions(script) {
  caps = [];
  script.lines.forEach((ln, i) => {
    const ws = lineWords(i); if (!ws.length) return;
    const spoken = ws.map((w) => w.w);
    const mk = (idx) => ({ line: i, s: ws[idx[0]].s - 0.03, words: idx.map((j) => ({ txt: spoken[j], s: ws[j].s, e: ws[j].e })) });
    if (ln.caps) {                                   // the script chose the chunks: consume the words in order
      let from = 0;
      ln.caps.split('|').map((c) => c.replace(/\*/g, '').trim()).filter(Boolean).forEach((c) => {
        const n = c.split(/\s+/).length, idx = []; for (let j = from; j < Math.min(ws.length, from + n); j++) idx.push(j);
        from += n; if (idx.length) caps.push(mk(idx));
      });
    } else groups(spoken).forEach((g) => caps.push(mk(g)));
  });
  caps.forEach((c, k) => { const next = caps[k + 1], lineEnd = T.lines[c.line].end; c.e = next ? (next.s - lineEnd > 0.6 && next.line !== c.line ? lineEnd + 0.25 : next.s) : T.dur; });
  return caps;
}
export const captionList = () => caps.map((c) => ({ ...c, text: c.words.map((w) => w.txt).join(' ') }));

/** draw one caption text at x, y (also used by the style sheet) */
export function captionText(text, x = 540, y = CAP.y, sc = 1) {
  const size = CAP.size;
  ctx.save(); ctx.font = `900 ${size}px Inter`; ctx.letterSpacing = '0px';
  const fit = Math.min(1, CAP.maxW / ctx.measureText(text).width);
  ctx.translate(x, y); ctx.scale(sc * fit, sc * fit); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(text, 3, 9);
  ctx.lineWidth = 15; ctx.strokeStyle = '#0B0B10'; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, 0, 0);
  ctx.restore();
}
/** one chunk: each word white, the word spoken right now #FFE600 at 112 %. t = film time. */
export function drawChunk(words, t, y = CAP.y, pop = 1) {
  ctx.save(); ctx.font = `900 ${CAP.size}px Inter`; ctx.letterSpacing = '0px'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const sp = ctx.measureText(' ').width, ws = words.map((w) => ({ ...w, wd: ctx.measureText(w.txt).width }));
  const total = ws.reduce((n, w) => n + w.wd, 0) + sp * (ws.length - 1), fit = Math.min(1, CAP.maxW / total) * pop;
  ctx.translate(540, y); ctx.scale(fit, fit);
  let x = -total / 2;
  for (const w of ws) {
    const active = t >= w.s && t < w.e + 0.04;
    ctx.save(); ctx.translate(x + w.wd / 2, 0); if (active) ctx.scale(1.12, 1.12); ctx.translate(-w.wd / 2, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(w.txt, 3, 8);
    ctx.lineWidth = 15; ctx.strokeStyle = '#0B0B10'; ctx.strokeText(w.txt, 0, 0);
    ctx.fillStyle = active ? HL : '#FFFFFF'; ctx.fillText(w.txt, 0, 0);
    ctx.restore(); x += w.wd + sp;
  }
  ctx.restore();
}
export function drawCaption(t) {
  const c = caps.find((c) => t >= c.s && t < c.e); if (!c) return;
  const lt = t - c.s; drawChunk(c.words, t, CAP.y, lt < 0.1 ? lerp(0.86, 1, eob(seg(lt, 0, 0.1))) : 1);
}
