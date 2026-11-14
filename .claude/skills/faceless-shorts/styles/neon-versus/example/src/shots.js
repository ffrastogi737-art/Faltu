// GTA 5 vs GTA 6: 13 SAAL MEIN KYA BADLA? (Neon Versus style: synthwave Vice City look, split cards, Hindi voice).
// All art is drawn here: no game footage, logos or official artwork.
import { ctx, W, H, clamp, lerp, seg, eo, eio, eob, rnd, rr, circle, ell, line, fillAll } from './core/lib.js';
import { L, Wd, lineWords } from './core/timing.js';

const V5 = '#33E3A4', V6 = '#FF4FD8', ORANGE = '#FF9A3C', CYAN = '#3FD8FF', GOLD = '#FFD25E', RED = '#FF3B5C', INK = '#07030F';
const HZ = 1180;                                                         // horizon line
const nm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]+/g, '');
const WdX = (word, i) => { const w = lineWords(i).find((x) => nm(x.w) === nm(word)); if (!w) throw new Error(`no exact "${word}" in line ${i}`); return w.s; };

// ── neon kit ─────────────────────────────────────────────────────────────
function neon(text, x, y, size, col, sc = 1, rot = 0, a = 1, weight = 900) {
  if (sc <= 0 || a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.font = `${weight} ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.shadowColor = col; ctx.shadowBlur = size * 0.4; ctx.lineWidth = size * 0.09; ctx.strokeStyle = col; ctx.strokeText(text, 0, 0);
  ctx.shadowBlur = size * 0.15; ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, 0, 0); ctx.restore();
}
function glowStroke(col, w, blur = 26) { ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.shadowBlur = 0; }
function panel(x, y, w, h, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); rr(-w / 2, -h / 2, w, h, 34); ctx.fillStyle = 'rgba(12,5,30,0.82)'; ctx.fill(); rr(-w / 2, -h / 2, w, h, 34); glowStroke(col, 7); ctx.restore(); }
function chip(text, x, y, col, sc = 1, size = 46) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width + size * 1.2; rr(-w / 2, -size * 0.8, w, size * 1.6, size * 0.8); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, size * 0.05); ctx.restore(); }
function palm(x, y, s, flip = 1, sway = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s); ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(30, -260, 70 + sway * 10, -520); ctx.lineTo(90 + sway * 10, -515); ctx.quadraticCurveTo(52, -250, 16, 0); ctx.closePath(); ctx.fill();
  for (const [a, l] of [[-2.6, 230], [-2.0, 260], [-1.2, 250], [-0.5, 240], [0.1, 210], [-3.0, 190]]) { const aa = a + sway * 0.05; ctx.beginPath(); ctx.moveTo(80 + sway * 10, -520); ctx.quadraticCurveTo(80 + Math.cos(aa) * l * 0.6, -520 + Math.sin(aa) * l * 0.6 - 60, 80 + Math.cos(aa) * l, -520 + Math.sin(aa) * l + 40); ctx.lineWidth = 26; ctx.stroke(); }
  ctx.restore();
}
/** the synthwave world: night sky, striped sun, magenta grid floor, palms */
function world(t, o = {}) {
  const g = ctx.createLinearGradient(0, -300, 0, HZ); g.addColorStop(0, '#07030F'); g.addColorStop(0.6, '#2A0A45'); g.addColorStop(1, '#6A1460');
  ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, HZ + 300);
  for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i)); circle(rnd(i) * W, rnd(i + 99) * (HZ - 300) - 200, 2 + rnd(i + 7) * 2.5, '#FFFFFF'); } ctx.globalAlpha = 1;
  if (o.sun !== 0) { const sy = HZ - 40, r = 330; ctx.save(); ctx.beginPath(); ctx.arc(540, sy, r, Math.PI, 0); ctx.closePath(); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - r, 0, sy); sg.addColorStop(0, GOLD); sg.addColorStop(0.55, ORANGE); sg.addColorStop(1, '#FF2E88'); ctx.fillStyle = sg; ctx.shadowColor = '#FF2E88'; ctx.shadowBlur = 80; ctx.fillRect(140, sy - r, 800, r);
    ctx.shadowBlur = 0; for (let k = 0; k < 7; k++) { const yy = sy - 150 + k * 22 + ((t * 18) % 22); ctx.fillStyle = '#4A1060'; ctx.fillRect(140, yy, 800, 4 + k * 1.6); } ctx.restore(); }
  ctx.fillStyle = '#12061F'; ctx.fillRect(-300, HZ, W + 600, H);
  ctx.save(); ctx.strokeStyle = V6; ctx.shadowColor = V6; ctx.shadowBlur = 14; ctx.lineWidth = 3;
  for (let k = 0; k < 14; k++) { const u = ((k + (t * 0.9) % 1) / 14), y = HZ + Math.pow(u, 2.2) * (H - HZ + 400); ctx.globalAlpha = 0.25 + 0.75 * u; ctx.beginPath(); ctx.moveTo(-300, y); ctx.lineTo(W + 300, y); ctx.stroke(); }
  ctx.globalAlpha = 0.8; for (let k = -12; k <= 12; k++) { ctx.beginPath(); ctx.moveTo(540 + k * 40, HZ); ctx.lineTo(540 + k * 330, H + 300); ctx.stroke(); } ctx.restore();
  if (o.palms !== 0) { palm(70, HZ + 40, 1.1, 1, Math.sin(t * 1.4)); palm(1010, HZ + 60, 1.25, -1, Math.sin(t * 1.2 + 1)); }
}
function header(sc = 1) { if (sc <= 0) return; neon('GTA V', 270, 230, 86, V5, sc); neon('VS', 540, 230, 60, ORANGE, sc); neon('GTA VI', 810, 230, 86, V6, sc); }
/** a generic skyline (no real landmarks) between x0 and x1 standing on y */
function skyline(x0, x1, y, col, seed, a = 1, glowWin = 0.6) {
  if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; let x = x0, k = 0;
  while (x < x1) { const w = 50 + rnd(seed + k) * 70, h = 120 + rnd(seed + k * 3) * 300; rr(x, y - h, w - 8, h, 4); ctx.fillStyle = '#140A2A'; ctx.fill(); rr(x, y - h, w - 8, h, 4); glowStroke(col, 3, 12);
    for (let r = 0; r < h / 34 - 1; r++) for (let c = 0; c < (w - 8) / 22 - 1; c++) if (rnd(seed + k * 31 + r * 7 + c) < glowWin) { ctx.fillStyle = col; ctx.globalAlpha = a * 0.75; ctx.fillRect(x + 8 + c * 22, y - h + 14 + r * 34, 10, 16); ctx.globalAlpha = a; }
    x += w; k++; }
  ctx.restore();
}
function blob(cx, cy, r, col, seed, sc = 1, label = '') {
  if (sc <= 0) return; ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.beginPath();
  for (let i = 0; i <= 90; i++) { const a = i / 90 * Math.PI * 2, k = 1 + 0.13 * Math.sin(3 * a + seed) + 0.07 * Math.sin(7 * a + seed * 2); ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k * 1.15); }
  ctx.closePath(); ctx.fillStyle = col + '33'; ctx.fill(); glowStroke(col, 8, 30); ctx.restore();
  if (label) neon(label, cx, cy, 64, col, sc);
}
/** a faceless silhouette (head, shoulders) with a coloured rim; name tag under it */
function figure(x, y, s, col, name, sc = 1, bob = 0, a = 1) {
  if (sc <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y + bob); ctx.scale(s * sc, s * sc);
  ctx.beginPath(); ctx.moveTo(-120, 230); ctx.quadraticCurveTo(-120, 70, 0, 60); ctx.quadraticCurveTo(120, 70, 120, 230); ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); glowStroke(col, 6, 22);
  ctx.beginPath(); ctx.arc(0, -10, 62, 0, 7); ctx.fillStyle = INK; ctx.fill(); glowStroke(col, 6, 22); ctx.restore();
  if (name && a > 0.9) chip(name, x, y + bob + 280 * s, col, sc, 38);
}
function consoleBox(x, y, s, col, label, sc = 1, a = 1) { if (sc <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s * sc, s * sc); rr(-70, -150, 140, 300, 26); ctx.fillStyle = '#140A2A'; ctx.fill(); rr(-70, -150, 140, 300, 26); glowStroke(col, 6); circle(0, 100, 10, col); ctx.restore(); if (a > 0.9) chip(label, x, y + 210 * s, col, sc, 40); }
function monitor(x, y, s, col, label, sc = 1, a = 1) { if (sc <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s * sc, s * sc); rr(-130, -110, 260, 170, 14); ctx.fillStyle = '#140A2A'; ctx.fill(); rr(-130, -110, 260, 170, 14); glowStroke(col, 6); ctx.fillStyle = col; ctx.fillRect(-10, 60, 20, 50); ctx.fillRect(-60, 106, 120, 10); ctx.restore(); if (a > 0.9) chip(label, x, y + 210 * s, col, sc, 40); }
function tick(x, y, s, ok) { if (s <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.arc(0, 0, 52, 0, 7); ctx.fillStyle = ok ? V5 : RED; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = INK; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); if (ok) { ctx.moveTo(-22, 2); ctx.lineTo(-6, 20); ctx.lineTo(24, -18); } else { ctx.moveTo(-18, -18); ctx.lineTo(18, 18); ctx.moveTo(18, -18); ctx.lineTo(-18, 18); } ctx.stroke(); ctx.restore(); }
function dim(a) { ctx.fillStyle = `rgba(7,3,15,${a})`; ctx.fillRect(-300, -300, W + 600, H + 600); }
function mapIcon(x, y, s, col) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(-60, -40); ctx.lineTo(-20, -55); ctx.lineTo(20, -40); ctx.lineTo(60, -55); ctx.lineTo(60, 45); ctx.lineTo(20, 60); ctx.lineTo(-20, 45); ctx.lineTo(-60, 60); ctx.closePath(); glowStroke(col, 7, 18); ctx.beginPath(); ctx.arc(10, -5, 14, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
/** the A / B vote buttons */
function voteCard(x, y, letter, title, col, sc = 1, pulse = 0, icon) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc * (1 + pulse * 0.04), sc * (1 + pulse * 0.04));
  rr(-450, -150, 900, 300, 44); ctx.fillStyle = 'rgba(12,5,30,0.9)'; ctx.fill(); rr(-450, -150, 900, 300, 44); glowStroke(col, 9, 30 + pulse * 30);
  ctx.beginPath(); ctx.arc(-330, 0, 92, 0, 7); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = INK; ctx.font = '900 120px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, -330, 8);
  ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF'; ctx.font = '900 58px Inter'; title.forEach((tl, i) => ctx.fillText(tl, -200, -42 + i * 78));
  ctx.restore(); if (icon) icon();
}

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);

  // 1 · 13 SAAL: the hook
  { const g = Wd('GTA', 0), bd = Wd('badal', 0);
    add({ id: 'S01', at: 0, cam: [540, 760], zoom: 0.1, note: 'synthwave world, a huge neon 13 SAAL, years tick 2013 → 2026, header lands', draw(lt, d, t) {
      world(t); const k = eio(seg(lt, 0.2, bd));
      neon('13', 540, 560, 420, V6, eob(seg(lt, 0.05, 0.35)), Math.sin(lt * 2) * 0.02); neon('SAAL', 540, 820, 130, ORANGE, eob(seg(lt, 0.25, 0.5)));
      if (lt > g - 0.1) { header(eob(seg(lt, g - 0.1, g + 0.2))); chip(String(Math.round(lerp(2013, 2026, k))), 540, 980, GOLD, 1.3, 50); }
    } });
    cue(0.05, 'slam', { gain: 0.6 }); cue(g - 0.1, 'whoosh'); cue(bd, 'sparkle', { dur: 0.7 }); }

  // 2 · #1 SHEHAR: Los Santos (top card)
  { const st = cut(1), ls = Wd('Los', 1) - st;
    add({ id: 'S02', at: st, cam: [540, 600], zoom: 0.06, note: '#1 SHEHAR; the GTA V card with a teal skyline, LOS SANTOS', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.35); header();
      chip('#1  SHEHAR', 540, 350, ORANGE, eob(seg(lt, 0.05, 0.3)), 50);
      panel(90, 380, 900, 560, V5, eob(seg(lt, 0.2, 0.5)));
      if (lt > 0.4) { ctx.save(); rr(100, 390, 880, 540, 30); ctx.clip(); skyline(110, 980, 900, V5, 3, eo(seg(lt, 0.4, 0.9))); ctx.restore(); }
      if (lt > ls) neon('LOS SANTOS', 540, 480, 96, V5, eob(seg(lt, ls, ls + 0.25)));
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'pop'); cue(st + ls, 'pop', { gain: 0.6 }); }

  // 3 · Vice City, Leonida (bottom card, pink)
  { const st = cut(2), vc = Wd('Vice', 2) - st, le = Wd('Leonida', 2) - st;
    add({ id: 'S03', at: st, cam: [540, 820], zoom: 0.06, note: 'the GTA VI card slides in under it: pink skyline, palms, VICE CITY · LEONIDA', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.35); header();
      panel(90, 300, 900, 420, V5, 1); ctx.save(); rr(100, 310, 880, 400, 30); ctx.clip(); skyline(110, 980, 700, V5, 3, 0.45); ctx.restore(); neon('LOS SANTOS', 540, 380, 70, V5, 1, 0, 0.6);
      const p = eio(seg(lt, 0.05, 0.45)); ctx.save(); ctx.translate(0, (1 - p) * 900);
      panel(90, 780, 900, 640, V6, 1); ctx.save(); rr(100, 790, 880, 620, 30); ctx.clip(); skyline(110, 980, 1380, V6, 17, 1, 0.7); palm(130, 1420, 0.75, 1, Math.sin(t)); palm(950, 1420, 0.85, -1, Math.sin(t + 1)); ctx.restore();
      if (lt > vc) neon('VICE CITY', 540, 880, 104, V6, eob(seg(lt, vc, vc + 0.25)));
      if (lt > le) chip('STATE: LEONIDA', 540, 1000, ORANGE, eob(seg(lt, le, le + 0.25)), 42);
      ctx.restore();
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'slide', { dur: 0.4 }); cue(st + vc, 'slam', { gain: 0.5 }); cue(st + le, 'pop'); }

  // 4 · #2 MAP: about twice the size (reported)
  { const st = cut(3), rp = Wd('Reports', 3) - st, dg = Wd('do', 3) - st;
    add({ id: 'S04', at: st, cam: [540, 760], zoom: 0.08, note: '#2 MAP: a small teal map, then the pink one grows to about 2X; REPORTED tag', draw(lt, d, t) {
      world(t, { sun: 0, palms: 0 }); dim(0.3); header();
      chip('#2  MAP', 540, 350, ORANGE, eob(seg(lt, 0.05, 0.3)), 50);
      blob(300, 760, 150, V5, 2, eob(seg(lt, 0.05, 0.35)), '1X');
      const gr = lt > dg ? eob(seg(lt, dg, dg + 0.5)) : 0.3 * eob(seg(lt, 0.5, 0.9));
      blob(700, 980, 150 * Math.SQRT2, V6, 5, Math.max(0.01, gr), lt > dg + 0.3 ? '~2X' : '');
      neon('GTA V', 300, 560, 50, V5, eob(seg(lt, 0.2, 0.45))); neon('GTA VI', 700, 690, 50, V6, eob(seg(lt, 0.5, 0.75)));
      if (lt > rp) chip('REPORTED · NOT OFFICIAL', 540, 1430, GOLD, eob(seg(lt, rp, rp + 0.25)), 36);
    } });
    cue(st, 'whoosh'); cue(st + 0.2, 'pop'); cue(st + rp, 'pop', { gain: 0.5 }); cue(st + dg, 'slide', { dur: 0.5 }); cue(st + dg + 0.5, 'thud'); }

  // 5 · #3 HERO: three in GTA V
  { const st = cut(4), names = [['Michael', 'MICHAEL', CYAN], ['Franklin', 'FRANKLIN', V5], ['Trevor', 'TREVOR', ORANGE]].map(([w, n, c]) => [Wd(w, 4) - st, n, c]);
    add({ id: 'S05', at: st, cam: [540, 760], zoom: 0.06, note: '#3 HERO: three silhouettes pop up one per name', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.4); header(); chip('#3  HERO', 540, 350, ORANGE, eob(seg(lt, 0.05, 0.3)), 50);
      panel(70, 400, 940, 900, V5, eob(seg(lt, 0.1, 0.4)));
      neon('GTA V = 3', 540, 500, 84, V5, eob(seg(lt, 0.3, 0.55)));
      names.forEach(([w, n, c], i) => { const on = lt > w - 0.1; figure(220 + i * 320, 820, 1.2, c, n, on ? lerp(0.85, 1, eob(seg(lt, w - 0.1, w + 0.15))) : eob(seg(lt, 0.4 + i * 0.15, 0.7 + i * 0.15)) * 0.85, Math.sin(t * 2 + i) * 6, on ? 1 : 0.28); });
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'pop'); names.forEach(([w]) => cue(st + w - 0.1, 'pop', { gain: 0.6 })); }

  // 6 · GTA VI: two, Lucia and Jason
  { const st = cut(5), lu = Wd('Lucia', 5) - st, ja = Wd('Jason', 5) - st, jo = Wd('jodi', 5) - st;
    add({ id: 'S06', at: st, cam: [540, 800], zoom: 0.08, note: 'GTA VI = 2: Lucia and Jason, a glowing link between them on "jodi"', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.4); header();
      panel(70, 400, 940, 900, V6, eob(seg(lt, 0.05, 0.35))); neon('GTA VI = 2', 540, 500, 84, V6, eob(seg(lt, 0.2, 0.45)));
      figure(320, 820, 1.45, V6, 'LUCIA', lt > lu - 0.1 ? lerp(0.85, 1, eob(seg(lt, lu - 0.1, lu + 0.15))) : eob(seg(lt, 0.3, 0.6)) * 0.85, Math.sin(t * 2) * 6, lt > lu - 0.1 ? 1 : 0.28);
      figure(760, 820, 1.45, CYAN, 'JASON', lt > ja - 0.1 ? lerp(0.85, 1, eob(seg(lt, ja - 0.1, ja + 0.15))) : eob(seg(lt, 0.45, 0.75)) * 0.85, Math.sin(t * 2 + 1) * 6, lt > ja - 0.1 ? 1 : 0.28);
      if (lt > jo - 0.2) { const p = eo(seg(lt, jo - 0.2, jo + 0.3)); ctx.beginPath(); ctx.moveTo(470, 900); ctx.lineTo(lerp(470, 610, p), 900); glowStroke(ORANGE, 10, 30); if (p > 0.95) chip('DUO', 540, 1000, ORANGE, eob(seg(lt, jo + 0.3, jo + 0.5)), 40); }
    } });
    cue(st, 'whoosh'); cue(st + lu - 0.1, 'pop', { gain: 0.6 }); cue(st + ja - 0.1, 'pop', { gain: 0.6 }); cue(st + jo - 0.2, 'zip', { gain: 0.5 }); }

  // 7 · #4 CONSOLE: GTA V on PS3 then, PC today
  { const st = cut(6), p3 = Wd('PS3', 6) - st, pc = Wd('PC', 6) - st;
    add({ id: 'S07', at: st, cam: [540, 800], zoom: 0.06, note: '#4 CONSOLE: GTA V card, PS3 2013 box, then a PC monitor with a check', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.4); header(); chip('#4  CONSOLE', 540, 350, ORANGE, eob(seg(lt, 0.05, 0.3)), 50);
      panel(70, 400, 940, 900, V5, eob(seg(lt, 0.1, 0.4))); neon('GTA V', 540, 500, 84, V5, eob(seg(lt, 0.25, 0.5)));
      consoleBox(300, 820, 1.4, V5, 'PS3 · 2013', lt > p3 - 0.1 ? eob(seg(lt, p3 - 0.1, p3 + 0.15)) : eob(seg(lt, 0.4, 0.7)) * 0.85, lt > p3 - 0.1 ? 1 : 0.28);
      monitor(750, 860, 1.4, CYAN, 'PC', lt > pc - 0.1 ? eob(seg(lt, pc - 0.1, pc + 0.15)) : eob(seg(lt, 0.55, 0.85)) * 0.85, lt > pc - 0.1 ? 1 : 0.28);
      if (lt > pc + 0.3) tick(900, 660, eob(seg(lt, pc + 0.3, pc + 0.5)) * 1.2, true);
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'pop'); cue(st + p3 - 0.1, 'thud', { gain: 0.5 }); cue(st + pc - 0.1, 'thud', { gain: 0.5 }); cue(st + pc + 0.3, 'sparkle', { dur: 0.5 }); }

  // 8 · GTA VI: only PS5 and Xbox Series, no PC date
  { const st = cut(7), p5 = Wd('PS5', 7) - st, xb = Wd('Xbox', 7) - st, pc = Wd('PC', 7) - st;
    add({ id: 'S08', at: st, cam: [540, 820], zoom: 0.06, note: 'GTA VI card: PS5 and XBOX get checks, PC gets a red cross and NO DATE', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.4); header();
      panel(70, 400, 940, 900, V6, eob(seg(lt, 0.05, 0.35))); neon('GTA VI', 540, 500, 84, V6, eob(seg(lt, 0.2, 0.45)));
      consoleBox(220, 820, 1.2, V6, 'PS5', lt > p5 - 0.1 ? eob(seg(lt, p5 - 0.1, p5 + 0.15)) : eob(seg(lt, 0.3, 0.6)) * 0.85, lt > p5 - 0.1 ? 1 : 0.28); if (lt > p5 + 0.2) tick(310, 620, eob(seg(lt, p5 + 0.2, p5 + 0.4)), true);
      consoleBox(530, 820, 1.2, V5, 'XBOX', lt > xb - 0.1 ? eob(seg(lt, xb - 0.1, xb + 0.15)) : eob(seg(lt, 0.45, 0.75)) * 0.85, lt > xb - 0.1 ? 1 : 0.28); if (lt > xb + 0.2) tick(620, 620, eob(seg(lt, xb + 0.2, xb + 0.4)), true);
      monitor(830, 850, 1.0, RED, 'PC', lt > pc - 0.1 ? eob(seg(lt, pc - 0.1, pc + 0.15)) : eob(seg(lt, 0.6, 0.9)) * 0.85, lt > pc - 0.1 ? 1 : 0.28); if (lt > pc + 0.2) { tick(920, 690, eob(seg(lt, pc + 0.2, pc + 0.4)), false); chip('NO DATE', 540, 1220, RED, eob(seg(lt, pc + 0.4, pc + 0.6)), 46); }
    } });
    cue(st, 'whoosh'); [p5, xb].forEach((w) => cue(st + w + 0.2, 'pop', { gain: 0.6 })); cue(st + pc + 0.2, 'slam', { gain: 0.5 }); }

  // 9 · 23 crore+ copies of GTA V
  { const st = cut(8), tc = Wd('teis', 8) - st;
    add({ id: 'S09', at: st, cam: [540, 760], zoom: 0.1, note: 'a counter races to 23 CRORE+, discs stack up', draw(lt, d, t) {
      world(t); dim(0.25); const k = eo(seg(lt, 0.1, tc + 0.4));
      neon(Math.round(lerp(0, 23, k)) + ' CRORE+', 540, 470, 150, V5, eob(seg(lt, 0.1, 0.35)));
      chip('GTA V · COPIES SOLD', 540, 640, V5, eob(seg(lt, tc + 0.4, tc + 0.65)), 44);
      for (let i = 0; i < 12; i++) { const p = seg(lt, 0.3 + i * 0.12, 0.6 + i * 0.12); if (p <= 0) continue; const y = lerp(-100, 1080 - (i % 6) * 26, eob(p)), x = 360 + Math.floor(i / 6) * 360; ell(x, y, 120, 30, '#140A2A'); ctx.beginPath(); ctx.ellipse(x, y, 120, 30, 0, 0, 7); glowStroke(i % 2 ? V5 : CYAN, 5, 16); }
      chip('= 230 MILLION+', 540, 1250, GOLD, eob(seg(lt, d - 1.2, d - 0.9)), 40);
    } });
    cue(st, 'whoosh'); cue(st + tc - 0.4, 'slide', { dur: 1.0 }); for (let i = 0; i < 12; i += 2) cue(st + 0.55 + i * 0.12, 'tock', { gain: 0.4 }); }

  // 10 · GTA VI arrives 19 November
  { const st = cut(9), dt = Wd('unnees', 9) - st;
    add({ id: 'S10', at: st, cam: [540, 760], zoom: 0.12, note: 'the sun rises, a neon 19 NOV 2026 date slams in', draw(lt, d, t) {
      world(t); const up = eo(seg(lt, 0, 1)); ctx.fillStyle = `rgba(255,79,216,${0.12 * up})`; ctx.fillRect(-300, -300, W + 600, H + 600);
      neon('GTA VI', 540, 360, 120, V6, eob(seg(lt, 0.05, 0.3)));
      if (lt > dt - 0.15) { const s = eob(seg(lt, dt - 0.15, dt + 0.1)); neon('19', 540, 640, 300, ORANGE, s); neon('NOVEMBER 2026', 540, 860, 92, V6, s); }
      chip('PS5 · XBOX SERIES X|S', 540, 1010, CYAN, lt > dt + 0.5 ? eob(seg(lt, dt + 0.5, dt + 0.75)) : 0, 40);
    } });
    cue(st, 'whoosh'); cue(st + dt - 0.15, 'slam', { gain: 0.7 }); cue(st + dt, 'sparkle', { dur: 1.0 }); }

  // 11 · vote: PART 2, A (map) or B (story)
  { const st = cut(10), pa = Wd('Part', 10) - st, a = WdX('A', 10) - st, b = WdX('B', 10) - st;
    add({ id: 'S11', at: st, cam: [540, 820], zoom: 0.05, note: 'PART 2? two vote cards: A Leonida map, B Lucia & Jason story', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.45);
      neon('PART 2?', 540, 330, 140, ORANGE, lt > pa - 0.1 ? eob(seg(lt, pa - 0.1, pa + 0.15)) : 0, Math.sin(lt * 3) * 0.02);
      voteCard(540, 640, 'A', ['LEONIDA KA', 'POORA MAP'], V6, lt > a - 0.1 ? eob(seg(lt, a - 0.1, a + 0.15)) : 0, 0, () => mapIcon(880, 640, 1.1, V6));
      voteCard(540, 1020, 'B', ['LUCIA & JASON', 'KI KAHANI'], CYAN, lt > b - 0.1 ? eob(seg(lt, b - 0.1, b + 0.15)) : 0);
    } });
    cue(st, 'whoosh'); cue(st + pa - 0.1, 'slam', { gain: 0.5 }); cue(st + a - 0.1, 'pop', { gain: 0.7 }); cue(st + b - 0.1, 'pop', { gain: 0.7 }); }

  // 12 · comment A or B
  { const st = cut(11);
    add({ id: 'S12', at: st, cam: [540, 820], zoom: 0.06, note: 'both cards pulse, COMMENT: A / B', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.45);
      voteCard(540, 640, 'A', ['LEONIDA KA', 'POORA MAP'], V6, 1, Math.max(0, Math.sin(lt * 6)), () => mapIcon(880, 640, 1.1, V6));
      voteCard(540, 1020, 'B', ['LUCIA & JASON', 'KI KAHANI'], CYAN, 1, Math.max(0, Math.sin(lt * 6 + Math.PI)));
      neon('COMMENT KARO', 540, 330, 104, GOLD, eob(seg(lt, 0.05, 0.3)));
      neon('A  /  B', 540, 1330, 110, ORANGE, eob(seg(lt, 0.3, 0.55)));
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'pop'); cue(st + 0.3, 'pop'); }

  return { shots: S, cues: CUES };
}
