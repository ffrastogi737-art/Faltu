// Boot: fonts -> script + timing -> captions -> shots. draw(t) renders film time t (a pure function of t).
// Effects layer (ported from the Creator Motion Graphics idea): whip / glitch / flash cuts between shots, punch zoom on every cut,
// camera shake + zoom pulse on every 'slam' cue, hook zoom + slamming headline, light leaks, film grain, progress bar.
import { W, H, setCtx, ctx, clamp, lerp, seg, eo, eio, eob, rnd } from './core/lib.js';
import { T, loadTiming } from './core/timing.js';
import { buildCaptions, drawCaption, captionList } from './core/captions.js';
import { buildShots } from './shots.js';
import { background, overlay, text, K } from './core/kit.js';

const cv = document.getElementById('cv'), MAIN = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const LA = mk(), LB = mk(), LT = mk(), LR = mk(), LG = mk();
setCtx(MAIN);
const OP = (window.OP = { ready: false });
const CD = { whip: 0.26, glitch: 0.28, flash: 0.2 };
const reset = (c) => { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.letterSpacing = '0px'; c.shadowBlur = 0; c.setLineDash([]); };
const find = (S, t) => { let i = S.length - 1; while (i > 0 && S[i].at > t) i--; return i; };

// paint shot i at film time t into canvas context c (background + camera + shot, no overlay)
function paint(c, i, t) {
  const S = OP._shots, sh = S[i], end = i < S.length - 1 ? S[i + 1].at : T.dur, d = end - sh.at, lt = Math.max(0, t - sh.at);
  setCtx(c); reset(c); background(t);
  let sc = (1 + 0.1 * (1 - eo(clamp(lt / 0.3)))) * (i % 2 ? 1 + 0.05 * (1 - eio(clamp(lt / d))) : 1 + 0.05 * eio(clamp(lt / d)));
  if (t < 1.5) sc *= 1 + 0.32 * (1 - eo(clamp(t / 1.5)));                       // hook zoom-in
  let sx = 0, sy = 0;
  for (const k of OP._slams) { const a = t - k.t; if (a >= 0 && a < 0.5) { sc *= 1 + 0.05 * k.g * Math.exp(-a * 14); const amp = 13 * k.g * Math.exp(-a * 11); sx += Math.sin(t * 93 + k.t) * amp; sy += Math.cos(t * 77 + k.t * 2) * amp * 0.7; } }
  c.save(); c.translate(W / 2 + sx, H / 2 + sy); c.scale(sc, sc); c.translate(-W / 2, -H / 2);
  sh.draw(lt, d, t); c.restore(); reset(c); setCtx(MAIN);
}
const tint = (L, src, col) => { const x = L.getContext('2d'); reset(x); x.clearRect(0, 0, W, H); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, W, H); reset(x); return L; };

function draw(t) {
  t = clamp(t, 0, T.dur - 1e-4); const S = OP._shots, i = find(S, t), sh = S[i], lt = t - sh.at, type = sh.cut || 'flash', cd = CD[type];
  setCtx(MAIN); reset(MAIN);
  if (i > 0 && lt < cd) {
    const u = lt / cd, prev = i - 1;
    if (type === 'whip') {
      paint(LA.getContext('2d'), prev, t); paint(LB.getContext('2d'), i, t); setCtx(MAIN);
      const e = eio(u), dir = i % 2 ? 1 : -1, blur = Math.sin(Math.PI * u) * 260, N = 7, T2 = LT.getContext('2d'); reset(T2); T2.clearRect(0, 0, W, H); T2.globalCompositeOperation = 'lighter'; T2.globalAlpha = 1 / N;
      for (let k = 0; k < N; k++) { const o = (k / (N - 1) - 0.5) * blur; T2.drawImage(LA, -e * W * dir + o, 0); T2.drawImage(LB, (1 - e) * W * dir + o, 0); }
      reset(T2); MAIN.fillStyle = K.bg; MAIN.fillRect(0, 0, W, H); MAIN.drawImage(LT, 0, 0);
    } else if (type === 'glitch') {
      paint(LA.getContext('2d'), u < 0.5 ? prev : i, t); setCtx(MAIN);
      const fi = Math.floor(t * 60), off = (10 + rnd(fi) * 22) * Math.sin(Math.PI * u) * 1.6;
      MAIN.fillStyle = '#000'; MAIN.fillRect(0, 0, W, H); MAIN.globalCompositeOperation = 'lighter';
      MAIN.drawImage(tint(LR, LA, '#ff0000'), off, 0); MAIN.drawImage(tint(LG, LA, '#00ffff'), -off, 0); MAIN.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 9; k++) { const y = rnd(fi * 9 + k) * H, h = 6 + rnd(fi * 5 + k + 40) * 60, dx = (rnd(fi * 3 + k + 70) - 0.5) * 160 * Math.sin(Math.PI * u); MAIN.drawImage(LA, 0, y, W, h, dx, y, W, h); }
    } else {
      paint(MAIN, u < 0.5 ? prev : i, t); MAIN.fillStyle = `rgba(255,255,255,${0.92 * (1 - Math.abs(u * 2 - 1))})`; MAIN.fillRect(0, 0, W, H);
    }
  } else paint(MAIN, i, t);
  setCtx(MAIN); reset(MAIN);
  finishing(t, sh.habit ?? 0);
  const fade = Math.min(clamp(t / 0.25), clamp((T.dur - t) / 0.35));
  if (fade < 1) { MAIN.fillStyle = '#000'; MAIN.globalAlpha = 1 - fade; MAIN.fillRect(0, 0, W, H); MAIN.globalAlpha = 1; }
  drawCaption(t);
  MAIN.fillStyle = K.amber; MAIN.fillRect(0, H - 8, W * t / T.dur, 8);          // progress bar
}

function finishing(t, habit) {
  overlay(t, habit);
  // slow warm / cool light leaks drifting across (additive)
  MAIN.save(); MAIN.globalCompositeOperation = 'lighter';
  for (const [k, col] of [[0, '255,120,40'], [1, '40,140,255']]) { const x = W * (0.5 + 0.55 * Math.sin(t * 0.21 + k * 3)), y = H * (0.45 + 0.4 * Math.cos(t * 0.17 + k * 2)), g = MAIN.createRadialGradient(x, y, 0, x, y, 620); g.addColorStop(0, `rgba(${col},0.10)`); g.addColorStop(1, `rgba(${col},0)`); MAIN.fillStyle = g; MAIN.fillRect(0, 0, W, H); }
  MAIN.restore();
  // hook headline: slams in word by word (0.2 s to 3.4 s), then slides away
  if (t < 3.6) { const out = clamp((t - 3.1) / 0.5), y = 250 - out * 260;
    if (t > 0.15) { const u = clamp((t - 0.15) / 0.16); text('GTA 5 HABITS', 960, y, 220, K.amber, { font: 'Anton', sc: lerp(2.4, 1, eo(u)), a: u, glow: 40 }); }
    if (t > 0.65) { const u = clamp((t - 0.65) / 0.16); text('= BUSTED IN GTA 6', 960, y + 175, 150, '#ff4040', { font: 'Anton', sc: lerp(2.4, 1, eo(u)), a: u, glow: 40 }); } }
}

(async () => {
  try {
    await document.fonts.load('900 100px Inter'); await document.fonts.load('800 92px Inter'); await document.fonts.load('400 100px Anton'); await document.fonts.load('700 28px "DejaVu Sans Mono"'); await document.fonts.ready;
    const script = await (await fetch('script.json', { cache: 'no-store' })).json();
    await loadTiming();
    buildCaptions(script);
    const { shots, cues } = buildShots();
    shots.sort((a, b) => a.at - b.at);
    OP._shots = shots; OP.script = script; OP._slams = cues.filter((c) => c.type === 'slam').map((c) => ({ t: c.t, g: Math.min(1.2, 0.5 + (c.gain ?? 0.6)) }));
    OP.duration = () => T.dur;
    OP.draw = draw;
    OP.frame = (t, q = 0.92) => { draw(t); return cv.toDataURL('image/jpeg', q); };
    OP.shots = () => shots.map((s, i) => ({ id: s.id, at: +s.at.toFixed(3), end: +(i < shots.length - 1 ? shots[i + 1].at : T.dur).toFixed(3), note: `${s.cut} ${s.note || ''}` }));
    OP.captions = () => captionList().map((c) => ({ s: +c.s.toFixed(3), e: +c.e.toFixed(3), text: c.words.map((w) => w.txt).join(' ') }));
    OP.cues = () => cues.slice().sort((a, b) => a.t - b.t);
    OP.ready = true;
    const q = new URLSearchParams(location.search);
    if (!q.has('capture')) {
      if (q.has('t')) draw(+q.get('t'));
      else {
        const audio = new Audio('data/mix.wav'); let t0 = null;
        const btn = document.getElementById('play'); btn.hidden = false;
        btn.onclick = () => { btn.hidden = true; t0 = performance.now(); audio.currentTime = 0; audio.play().catch(() => {}); };
        const loop = (now) => { const t = t0 == null ? 0 : (now - t0) / 1000; draw(t0 == null ? 0 : t); if (t0 != null && t > T.dur) { t0 = null; btn.hidden = false; } requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      }
    }
  } catch (e) { OP.bootError = String(e && e.stack || e); console.error(e); }
})();
