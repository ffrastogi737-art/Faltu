// Subtitles for long 16:9 videos: a lower-third bar, up to 7 words at a time, the word being said turns amber.
// Chunks break after a comma once they hold 3+ words; no "caps" field needed in script.json.
import { ctx, W, clamp } from './lib.js';
import { T, lineWords } from './timing.js';
import { K } from './kit.js';

export const CAP = { y: 962, size: 54, maxW: 1640 };
let caps = [];

export function buildCaptions(script) {
  caps = [];
  script.lines.forEach((ln, i) => {
    const ws = lineWords(i); let cur = [];
    const flush = () => { if (cur.length) { caps.push({ line: i, s: cur[0].s - 0.05, words: cur.map((w) => ({ txt: w.w, hi: false, s: w.s, e: w.e })) }); cur = []; } };
    ws.forEach((w, k) => { cur.push(w); const comma = /[,:;.?!]$/.test(w.w); if (cur.length >= 7 || (comma && cur.length >= 3)) flush(); });
    flush();
  });
  caps.forEach((c, k) => { const next = caps[k + 1], lineEnd = T.lines[c.line].end; c.e = next ? (next.line !== c.line && next.s - lineEnd > 0.7 ? lineEnd + 0.35 : next.s) : T.dur; });
  return caps;
}
export const captionList = () => caps;

export function drawCaption(t) {
  const c = caps.find((c) => t >= c.s && t < c.e); if (!c) return;
  ctx.save(); ctx.font = `800 ${CAP.size}px Inter`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width, ws = c.words.map((w) => ctx.measureText(w.txt).width), tot = ws.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
  const sc = Math.min(1, CAP.maxW / tot), bw = tot * sc + 70, by = CAP.y;
  ctx.fillStyle = 'rgba(5,7,11,0.82)'; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, by - 48, bw, 96, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,176,0,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.translate(W / 2 - tot * sc / 2, by + 3); ctx.scale(sc, sc);
  let x = 0; c.words.forEach((w, k) => { const on = t >= w.s - 0.02 && t < w.e + 0.18; ctx.fillStyle = on ? K.amber : '#E8EEF2'; ctx.fillText(w.txt, x, 0); x += ws[k] + space; });
  ctx.restore();
}
