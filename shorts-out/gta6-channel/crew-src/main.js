// Boot: fonts → script + timing → 3D engine + sets → captions → shots. draw(t) renders film time t (pure function of t):
// the shot renders its 3D frame into the hidden WebGL canvas, which is copied onto the 2D canvas, then the 2D layer
// (labels, counters) and the captions go on top. window.OP is the API tools/capture.mjs drives.
import { W, H, setCtx, ctx, clamp } from './core/lib.js';
import { T, loadTiming } from './core/timing.js';
import { buildCaptions, drawCaption, captionList } from './core/captions.js';
import { makeEngine, RES, AA } from './core/engine.js';
import { buildShots } from './shots.js';

const cv = document.getElementById('cv'), GL = document.getElementById('gl');
setCtx(cv.getContext('2d'));
const OP = (window.OP = { ready: false });

function draw(t) {
  t = clamp(t, 0, T.dur - 1e-4);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  const S = OP._shots; let i = S.length - 1; while (i > 0 && S[i].at > t) i--;
  const sh = S[i], end = i < S.length - 1 ? S[i + 1].at : T.dur, d = end - sh.at, lt = t - sh.at;
  const blit = () => ctx.drawImage(GL, 0, 0, W, H);
  let shake = 0, kick = 0, flash = 0; const hits = OP._impacts || [];
  for (const h of hits) { const a = t - h.t; if (a < 0 || a > 0.7) continue; const k = Math.exp(-a * 9) * h.g; shake += k; kick += k * 0.04; if (a < 0.09) flash = Math.max(flash, (1 - a / 0.09) * 0.4 * h.g); }
  ctx.save(); if (shake > 0.001) { ctx.translate(540 + Math.sin(t * 83) * 22 * shake, 960 + Math.cos(t * 71) * 18 * shake); ctx.scale(1 + kick, 1 + kick); ctx.translate(-540, -960); }
  sh.draw(lt, d, t, blit); ctx.restore();
  for (const h of hits) { if (h.type !== 'boom') continue; const a = t - h.t; if (a < 0 || a > 1.6) continue; const COL = ['#FFE600', '#FF3FA4', '#00B8FF', '#2EE86B', '#FF8A00', '#FFFFFF'];
    for (let k = 0; k < 70; k++) { const r1 = Math.sin(k * 12.9898 + h.t * 78.233) * 43758.5453, u = r1 - Math.floor(r1), r2 = Math.sin(k * 93.989 + h.t * 7.1) * 24634.6345, v = r2 - Math.floor(r2);
      const ang = -Math.PI / 2 + (u - 0.5) * 2.6, sp = 900 + v * 1300, x = 540 + Math.cos(ang) * sp * a, y = 900 + Math.sin(ang) * sp * a + 1500 * a * a;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - a / 1.6); ctx.translate(x, y); ctx.rotate(a * (6 + k % 5) + k); ctx.fillStyle = COL[k % COL.length]; ctx.fillRect(-14, -8, 28, 16); ctx.restore(); } }
  if (flash > 0) { ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = flash; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  const fade = Math.min(clamp(t / 0.25), clamp((T.dur - t) / 0.4));
  if (fade < 1) { ctx.fillStyle = '#000'; ctx.globalAlpha = 1 - fade; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawCaption(t);
}

(async () => {
  try {
    await document.fonts.load('900 100px Inter'); await document.fonts.load('800 100px Inter');
    const script = await (await fetch('script.json', { cache: 'no-store' })).json();
    await loadTiming();
    buildCaptions(script);
    GL.width = Math.round(1080 * RES); GL.height = Math.round(1920 * RES);
    const E = makeEngine(GL, { w: GL.width, h: GL.height, samples: AA });
    const { shots, cues } = buildShots(E);
    shots.sort((a, b) => a.at - b.at);
    OP._shots = shots; OP.script = script;
    OP.duration = () => T.dur;
    OP.draw = draw;
    OP.frame = (t, q = 0.92) => { draw(t); return cv.toDataURL('image/jpeg', q); };
    OP.shots = () => shots.map((s, i) => ({ id: s.id, at: +s.at.toFixed(3), end: +(i < shots.length - 1 ? shots[i + 1].at : T.dur).toFixed(3), note: s.note || '' }));
    OP.captions = () => captionList().map((c) => ({ s: +c.s.toFixed(3), e: +c.e.toFixed(3), text: c.words.map((w) => (w.hi ? '*' : '') + w.txt).join(' ') }));
    OP._impacts = cues.filter((c) => ['boom', 'hit'].includes(c.type)).map((c) => ({ t: c.t, type: c.type, g: c.type === 'boom' ? 1 : 0.5 }));
    OP.cues = () => cues.slice().sort((a, b) => a.t - b.t);
    OP.ready = true;
    const q = new URLSearchParams(location.search);
    if (!q.has('capture')) {
      if (q.has('t')) draw(+q.get('t'));
      else {
        const audio = new Audio('data/mix.wav'); let t0 = null; const btn = document.getElementById('play'); btn.hidden = false;
        btn.onclick = () => { btn.hidden = true; t0 = performance.now(); audio.currentTime = 0; audio.play().catch(() => {}); };
        const loop = (now) => { const t = t0 == null ? 0 : (now - t0) / 1000; draw(t); if (t0 != null && t > T.dur) { t0 = null; btn.hidden = false; } requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      }
    }
  } catch (e) { OP.bootError = String(e && e.stack || e); console.error(e); }
})();
