// STACK-SPLIT style (ported 25 Nov 2026 on the comic-pop engine): two panels stacked on a diagonal split, each answers the other.
// vis.k: H hook (number top, image bottom) · X two stacked panels · P proof image on top + credit · V versus stack · S big word across the split · Q closing question
import { ctx, W, H, lerp, seg, eo, eob, rnd, rr } from './core/lib.js';
import { L, Le, Wd } from './core/timing.js';
const BLUE = '#1E6BFF', HOT = '#FF3B6B', YEL = '#FFE23D', MINT = '#2EE8A0', INK = '#0A0A14';
const IMG = {};
export async function preload(script) {
  const names = [...new Set(script.lines.map((l) => l.vis.img).filter(Boolean))];
  await Promise.all(names.map((n) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[n] = im; res(); }; im.onerror = () => rej(new Error('img ' + n)); im.src = `assets/${n}.jpg`; })));
}
const TOP = [[BLUE, '#0A3FBF'], ['#7B3CFF', '#4A1AB8'], ['#00B7D4', '#0072A8']], BOT = [[HOT, '#C21850'], ['#FF8A1F', '#D14A00'], ['#FF4FA3', '#B01E80']];
const SY = 735, SL = 130; // split line y at centre, slope offset
function half(top, k, p, t) { // p = slide-in progress 0..1
  const c = (top ? TOP : BOT)[k % 3], off = (1 - p) * (top ? -1 : 1) * 1200;
  ctx.save(); ctx.translate(top ? off : -off, 0); ctx.beginPath();
  if (top) { ctx.moveTo(-60, 130); ctx.lineTo(W + 60, 130); ctx.lineTo(W + 60, SY - SL / 2); ctx.lineTo(-60, SY + SL / 2); } else { ctx.moveTo(-60, SY + SL / 2 + 24); ctx.lineTo(W + 60, SY - SL / 2 + 24); ctx.lineTo(W + 60, 1330); ctx.lineTo(-60, 1330); }
  ctx.closePath(); const g = ctx.createLinearGradient(0, top ? 130 : SY, 0, top ? SY : 1330); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); ctx.fillStyle = g; ctx.fill();
  ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.10)'; for (let x = -200 + ((t * 40) % 120); x < W + 200; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 60, 0); ctx.lineTo(x - 300 + 60, H); ctx.lineTo(x - 300, H); ctx.fill(); }
  ctx.restore();
}
function seam() { ctx.save(); ctx.beginPath(); ctx.moveTo(-60, SY + SL / 2); ctx.lineTo(W + 60, SY - SL / 2); ctx.lineTo(W + 60, SY - SL / 2 + 24); ctx.lineTo(-60, SY + SL / 2 + 24); ctx.closePath(); ctx.fillStyle = YEL; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
function bgAll() { ctx.fillStyle = '#0A0F2E'; ctx.fillRect(-300, -300, W + 600, H + 600); }
function txt(text, x, y, size, col, sc = 1, maxW = 900, rot = 0, w = 900) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `${w} ${size}px Inter`; const tw = ctx.measureText(text).width; if (tw > maxW) size *= maxW / tw;
  ctx.font = `${w} ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.15; ctx.strokeStyle = INK; ctx.strokeText(text, size * 0.04, size * 0.06); ctx.strokeText(text, 0, 0); ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.restore();
}
function cover(im, x, y, w, h, z = 1, ox = 0) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); const s = Math.max(w / im.width, h / im.height) * z, dw = im.width * s, dh = im.height * s; ctx.drawImage(im, x + (w - dw) / 2 + ox, y + (h - dh) / 2, dw, dh); ctx.restore(); }
function tag(text, x, y, col, tc, sc = 1, size = 38, rot = -0.03) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width + size * 1.2, h = size * 1.7;
  rr(-w / 2 + 7, -h / 2 + 9, w, h, 14); ctx.fillStyle = INK; ctx.fill(); rr(-w / 2, -h / 2, w, h, 14); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 3); ctx.restore();
}
function badge(text, x, y, sc, size = 70) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(-0.12); ctx.beginPath(); for (let i = 0; i < 28; i++) { const a = i * Math.PI / 14, r = i % 2 ? 92 : 120; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); ctx.scale(0.93, 0.93); ctx.fillStyle = YEL; ctx.fill(); ctx.fillStyle = INK; ctx.font = `900 ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 4); ctx.restore(); }

export function buildShots(script) {
  const S = [], CUES = [], cue = (t, type, o = {}) => CUES.push({ t: +Math.max(0, t).toFixed(3), type, ...o });
  const lines = script.lines; let hold = 0; const cut = (i) => (i === 0 ? 0 : Math.max(L(i) - 0.08, hold));
  lines.forEach((ln, i) => {
    const v = ln.vis, st = cut(i), ls = L(i) - st, le = Le(i) - st; if (i > 0) cue(st, 'swoosh');
    let draw;
    if (v.k === 'H') {
      draw = (lt, d, t) => { bgAll(); half(true, i, eo(seg(lt, 0, 0.25)), t); half(false, i, eo(seg(lt, 0.1, 0.35)), t);
        const a = seg(lt, 0.25, 0.5); ctx.save(); ctx.globalAlpha = a; ctx.save(); ctx.beginPath(); ctx.moveTo(-60, SY + SL / 2 + 24); ctx.lineTo(W + 60, SY - SL / 2 + 24); ctx.lineTo(W + 60, 1330); ctx.lineTo(-60, 1330); ctx.closePath(); ctx.clip(); cover(IMG[v.img], 0, SY - 70, W, 680, 1.05 + 0.08 * seg(lt, 0, d)); ctx.restore(); ctx.restore();
        seam(); txt(v.top, 540, 410, 380, YEL, eob(seg(lt, 0.15, 0.45)), 800); tag(v.topl, 540, 590, '#FFFFFF', INK, eob(seg(lt, 0.4, 0.65)), 46);
        tag(v.botl, 330, 1280, HOT, '#FFFFFF', eob(seg(lt, 0.7, 1)), 40); tag(v.tag, 840, 1280, YEL, INK, eob(seg(lt, 0.9, 1.2)), 40, 0.04); badge('VS', 540, SY + 12, eob(seg(lt, 0.5, 0.8)), 78); };
      cue(st + 0.15, 'hit'); cue(st + 0.5, 'pop');
    } else if (v.k === 'X') {
      draw = (lt, d, t) => { bgAll(); half(true, i, eo(seg(lt, 0, 0.25)), t); half(false, i, eo(seg(lt, 0.08, 0.33)), t); seam();
        txt(v.top, 540, 300, 150, '#FFFFFF', eob(seg(lt, 0.15, 0.45)), 900); txt(v.topt, 540, 520, 82, YEL, eob(seg(lt, 0.35, 0.65)), 900);
        const m = ls + 0.6; txt(v.bot, 540, 960, 150, '#FFFFFF', eob(seg(lt, Math.min(m, 0.5), Math.min(m, 0.5) + 0.3)), 900); txt(v.bott, 540, 1160, 82, YEL, eob(seg(lt, Math.min(m, 0.7), Math.min(m, 0.7) + 0.3)), 900);
        badge('VS', 540, SY + 12, eob(seg(lt, 0.4, 0.7)), 78); };
      cue(st + 0.15, 'pop'); cue(st + 0.55, 'hit', { gain: 0.6 });
    } else if (v.k === 'P') {
      draw = (lt, d, t) => { bgAll(); half(false, i, eo(seg(lt, 0, 0.25)), t);
        const a = eo(seg(lt, 0, 0.3)); ctx.save(); ctx.translate(0, (1 - a) * -900); cover(IMG[v.img], 0, 130, W, 820, 1.04 + 0.1 * seg(lt, 0, d), -30 * seg(lt, 0, d)); ctx.restore();
        ctx.save(); ctx.translate(0, (1 - a) * -900); ctx.fillStyle = YEL; ctx.fillRect(0, 950, W, 16); ctx.restore();
        tag('SOURCE: ' + v.src, 540, 175, '#FFFFFF', INK, eob(seg(lt, 0.3, 0.6)), 34, 0); txt(v.label, 540, 1140, 100, '#FFFFFF', eob(seg(lt, ls, ls + 0.3)), 940); };
      cue(st + 0.1, 'swoosh'); cue(st + ls, 'ding');
    } else if (v.k === 'V') {
      draw = (lt, d, t) => { bgAll(); half(true, i, eo(seg(lt, 0, 0.25)), t); half(false, i, eo(seg(lt, 0.08, 0.33)), t); seam();
        txt(v.a, 540, 430, 230, '#FFFFFF', eob(seg(lt, 0.15, 0.45)), 900); txt(v.b, 540, 1040, 200, '#FFFFFF', eob(seg(lt, 0.4, 0.7)), 900); badge(v.q, 540, SY + 12, eob(seg(lt, 0.7, 1)) * (1 + 0.05 * Math.sin(lt * 9)), 52); };
      cue(st + 0.15, 'pop'); cue(st + 0.45, 'pop'); cue(st + 0.75, 'boing', { gain: 0.7 });
    } else if (v.k === 'S') {
      const pAt = (() => { try { return Wd('not', i) - st; } catch { return ls + 0.4; } })();
      draw = (lt, d, t) => { bgAll(); half(true, i, eo(seg(lt, 0, 0.25)), t); half(false, i, eo(seg(lt, 0, 0.25)), t); seam(); const [w1, w2] = v.big.split(' ');
        txt(w1, 540, 500, 330, YEL, eob(seg(lt, pAt - 0.05, pAt + 0.2)), 900, -0.04); txt(w2, 540, 980, 330, '#FFFFFF', eob(seg(lt, pAt + 0.1, pAt + 0.35)), 900, 0.04);
        tag(v.label, 540, 1250, YEL, INK, eob(seg(lt, pAt + 0.4, pAt + 0.65)), 42); };
      cue(st + 0.05, 'riser', { dur: Math.max(0.3, pAt - 0.05) }); cue(st + pAt, 'boom'); hold = st + pAt + 0.7;
    } else if (v.k === 'Q') {
      draw = (lt, d, t) => { bgAll(); half(true, i, eo(seg(lt, 0, 0.25)), t); half(false, i, eo(seg(lt, 0.08, 0.33)), t); seam();
        txt(v.head, 540, 400, 170, '#FFFFFF', eob(seg(lt, 0.15, 0.45)), 900); txt('?', 900, 240, 240, YEL, eob(seg(lt, 0.3, 0.6)), 300, 0.2); txt(v.sub, 540, 1040, 110, YEL, eob(seg(lt, 0.5, 0.8)), 900); };
      cue(st + 0.12, 'boing', { gain: 0.7 });
    }
    S.push({ id: `S${String(i).padStart(2, '0')}`, at: st, cam: [540, 800], zoom: 0.05, note: `${v.k} ${v.top || v.head || v.big || v.a || ''}`, draw });
  });
  return { shots: S, cues: CUES };
}
