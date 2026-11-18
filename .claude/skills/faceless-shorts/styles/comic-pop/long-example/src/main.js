// Boot: fonts → script + timing → captions → shots. Then draw(t) renders film time t (pure function of t).
// window.OP is the API tools/capture.mjs drives: ready, bootError, duration(), draw(t), frame(t, q), cues(), shots().
import { W, H, setCtx, ctx, clamp, eo, eio } from './core/lib.js';
import { T, loadTiming } from './core/timing.js';
import { buildCaptions, drawCaption, captionList } from './core/captions.js';
import { buildShots } from './shots.js';

const cv = document.getElementById('cv');
setCtx(cv.getContext('2d'));
const OP = (window.OP = { ready: false });

function draw(t) {
  t = clamp(t, 0, T.dur - 1e-4);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const S = OP._shots; let i = S.length - 1; while (i > 0 && S[i].at > t) i--;
  const sh = S[i], end = i < S.length - 1 ? S[i + 1].at : T.dur, d = end - sh.at, lt = t - sh.at;
  // camera: punch-in on the cut + a slow push across the shot ("camera always moving")
  const punch = 1 + 0.06 * (1 - eo(clamp(lt / 0.25)));
  const drift = 1 + (sh.zoom ?? 0.06) * eio(clamp(lt / d));
  const [cx, cy] = sh.cam || [W / 2, H * 0.45];
  // impacts (comic-pop): every boom / hit / slam cue shakes the camera, punches in and flashes; booms also throw confetti
  let shake = 0, kick = 0, flash = 0; const hits = OP._impacts || [];
  for (const h of hits) { const a = t - h.t; if (a < 0 || a > 0.7) continue; const k = Math.exp(-a * 9) * h.g; shake += k; kick += k * 0.05; if (a < 0.09) flash = Math.max(flash, (1 - a / 0.09) * 0.45 * h.g); }
  const sx = Math.sin(t * 83) * 26 * shake, sy = Math.cos(t * 71) * 22 * shake;
  ctx.save(); ctx.translate(cx + sx, cy + sy); ctx.scale(punch * drift * (1 + kick), punch * drift * (1 + kick)); ctx.rotate(Math.sin(t * 57) * 0.012 * shake); ctx.translate(-cx, -cy);
  sh.draw(lt, d, t);
  ctx.restore();
  for (const h of hits) { if (h.type !== 'boom') continue; const a = t - h.t; if (a < 0 || a > 1.6) continue;
    const COL = ['#FFE600', '#FF3FA4', '#00B8FF', '#2EE86B', '#FF8A00', '#FFFFFF'];
    for (let k = 0; k < 70; k++) { const r1 = Math.sin(k * 12.9898 + h.t * 78.233) * 43758.5453, u = r1 - Math.floor(r1), r2 = Math.sin(k * 93.989 + h.t * 7.1) * 24634.6345, v = r2 - Math.floor(r2);
      const ang = -Math.PI / 2 + (u - 0.5) * 2.6, sp = 900 + v * 1300, x = W / 2 + Math.cos(ang) * sp * a, y = H * 0.4 + Math.sin(ang) * sp * a * 0.7 + 1100 * a * a;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - a / 1.6); ctx.translate(x, y); ctx.rotate(a * (6 + k % 5) + k); ctx.fillStyle = COL[k % COL.length]; ctx.fillRect(-14, -8, 28, 16); ctx.restore(); } }
  if (flash > 0) { ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = flash; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  // comic wipe on each cut: a coloured diagonal band sweeps across in 0.18 s
  if (i > 0 && lt < 0.18) { const p = lt / 0.18, xw = -900 + p * (W + 1400); ctx.save(); ctx.fillStyle = ['#FFE600', '#FF3FA4', '#00B8FF', '#2EE86B'][i % 4]; ctx.beginPath(); ctx.moveTo(xw - 260, 0); ctx.lineTo(xw + 140, 0); ctx.lineTo(xw - 260 + 400 - 500, H); ctx.lineTo(xw - 260 - 500, H); ctx.closePath(); ctx.fill(); ctx.lineWidth = 12; ctx.strokeStyle = '#111'; ctx.stroke(); ctx.restore(); }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';

  // fade from / to black on the first and last 0.25 s
  const fade = Math.min(clamp(t / 0.25), clamp((T.dur - t) / 0.35));
  if (fade < 1) { ctx.fillStyle = '#000'; ctx.globalAlpha = 1 - fade; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawCaption(t);
}

(async () => {
  try {
    await document.fonts.load('900 100px Inter'); await document.fonts.load('800 92px Inter'); await document.fonts.ready;
    const script = await (await fetch('script.json', { cache: 'no-store' })).json();
    await loadTiming();
    buildCaptions(script);
    const { shots, cues } = buildShots(script);
    shots.sort((a, b) => a.at - b.at);
    OP._shots = shots; OP.script = script;
    OP.duration = () => T.dur;
    OP.draw = draw;
    OP.frame = (t, q = 0.92) => { draw(t); return cv.toDataURL('image/jpeg', q); };
    OP.shots = () => shots.map((s, i) => ({ id: s.id, at: +s.at.toFixed(3), end: +(i < shots.length - 1 ? shots[i + 1].at : T.dur).toFixed(3), note: s.note || '' }));
    OP.captions = () => captionList().map((c) => ({ s: +c.s.toFixed(3), e: +c.e.toFixed(3), text: c.words.map((w) => (w.hi ? '*' : '') + w.txt).join(' ') }));
    OP._impacts = cues.filter((c) => ['boom', 'hit', 'slam'].includes(c.type)).map((c) => ({ t: c.t, type: c.type, g: c.type === 'boom' ? 1 : c.type === 'hit' ? 0.6 : 0.4 * (c.gain || 1) }));
    OP.cues = () => cues.slice().sort((a, b) => a.t - b.t);
    window.DURATION = T.dur; window.seek = (t) => draw(t);
    OP.ready = true;
    // preview mode (not capture): play in real time, ?t=12.3 to hold a frame
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
