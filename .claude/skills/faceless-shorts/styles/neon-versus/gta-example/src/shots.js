// GTA 6 HAS TWO LEADS: MEET JASON AND LUCIA (Neon Versus, English). All art drawn in code: no game footage, logos or character art (generic silhouettes only).
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

function playPanel(x, y, w, h, col, sc = 1, label = '') { if (sc <= 0) return; panel(x, y, w, h, col, sc); ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.beginPath(); ctx.arc(0, 0, 90, 0, 7); ctx.fillStyle = RED; ctx.shadowColor = RED; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-28, -50); ctx.lineTo(54, 0); ctx.lineTo(-28, 50); ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.restore(); if (label) chip(label, x + w / 2, y - 10, col, sc, 44); }
function bar(x, y, w, h, p, col, label, value) { rr(x, y, w, h, 18); ctx.fillStyle = 'rgba(12,5,30,0.85)'; ctx.fill(); if (p > 0) { rr(x, y, Math.max(36, w * p), h, 18); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 26; ctx.fill(); ctx.shadowBlur = 0; } ctx.fillStyle = '#FFFFFF'; ctx.font = '900 44px Inter'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(label, x, y - 14); ctx.textAlign = 'right'; ctx.fillText(value, x + w, y - 14); }
function crack(x, y, s, a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s); for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * 90, Math.sin(an) * 90); ctx.lineTo(Math.cos(an + 0.2) * 180, Math.sin(an + 0.2) * 180); glowStroke('#FFFFFF', 5, 14); } ctx.restore(); }
function dateCard(x, y, top, big, col, sc = 1, crossed = 0, ok = 0) { if (sc <= 0) return; panel(x - 170, y - 150, 340, 300, col, sc); neon(top, x, y - 80, 46, col, sc); neon(big, x, y + 30, 92, col, sc); if (crossed > 0) tick(x + 140, y - 130, crossed, false); if (ok > 0) tick(x + 140, y - 130, ok, true); }

// stylised peninsula + small helpers (same as gta6-leonida)
const LAND = [[0.05, 0.02], [0.62, 0.0], [0.7, 0.12], [0.62, 0.2], [0.72, 0.34], [0.86, 0.52], [0.93, 0.7], [0.88, 0.84], [0.74, 0.9], [0.6, 0.84], [0.5, 0.66], [0.38, 0.5], [0.3, 0.32], [0.18, 0.22], [0.08, 0.16]];
function leonidaShape(x, y, w, h, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.beginPath(); LAND.forEach(([u, v], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, u * w, v * h)); ctx.closePath(); ctx.fillStyle = 'rgba(51,227,164,0.10)'; ctx.fill(); glowStroke(V5, 5, 18); ctx.restore(); }
function water(y0, col = '#0B3A5A') { ctx.fillStyle = col; ctx.fillRect(-300, y0, W + 600, H); }
function island(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.ellipse(0, 0, 120, 34, 0, 0, 7); ctx.fillStyle = '#E8C98A'; ctx.fill(); ctx.restore(); palm(x - 20 * s, y - 10 * s, 0.35 * s, 1, 0); }
function bars(x, y, w, h, open, col) { const n = 7; for (let i = 0; i < n; i++) { const bx = x + (i + 0.5) * w / n + (i < n / 2 ? -1 : 1) * open * w * 0.6; ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y + h); glowStroke(col, 12, 20); } ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + w + 20, y); ctx.moveTo(x - 20, y + h); ctx.lineTo(x + w + 20, y + h); glowStroke(col, 14, 20); }
function die(x, y, s, face, col, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); rr(-70, -70, 140, 140, 24); ctx.fillStyle = 'rgba(12,5,30,0.9)'; ctx.fill(); rr(-70, -70, 140, 140, 24); glowStroke(col, 7, 20); const P = { 1: [[0, 0]], 2: [[-30, -30], [30, 30]], 3: [[-30, -30], [0, 0], [30, 30]], 4: [[-30, -30], [30, -30], [-30, 30], [30, 30]], 5: [[-30, -30], [30, -30], [0, 0], [-30, 30], [30, 30]], 6: [[-30, -32], [30, -32], [-30, 0], [30, 0], [-30, 32], [30, 32]] }[face]; P.forEach(([a, b]) => circle(a, b, 12, col)); ctx.restore(); }
function star(x, y, r, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } ctx.closePath(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 30; ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); }
function heart(x, y, s, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(s * sc, s * sc); ctx.beginPath(); ctx.moveTo(0, 60); ctx.bezierCurveTo(-110, -10, -60, -90, 0, -40); ctx.bezierCurveTo(60, -90, 110, -10, 0, 60); ctx.closePath(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); }

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);

  // 1 · two leads, not one
  { const tw = Wd('two', 0), ja = Wd('Jason', 0), lu = Wd('Lucia', 0);
    add({ id: 'S01', at: 0, cam: [540, 760], zoom: 0.1, note: 'GTA VI, 2 LEADS, two silhouettes pop in with name chips', draw(lt, d, t) {
      world(t); dim(0.2); neon('GTA VI', 540, 250, 120, V6, eob(seg(lt, 0.05, 0.3)));
      neon('2 LEADS', 540, 430, 150, GOLD, lt > tw - 0.1 ? eob(seg(lt, tw - 0.1, tw + 0.2)) : 0);
      figure(340, 900, 1.6, CYAN, lt > ja - 0.1 ? 'JASON' : '', eob(seg(lt, 0.3, 0.6)), Math.sin(t * 2) * 6);
      figure(740, 900, 1.6, V6, lt > lu - 0.1 ? 'LUCIA' : '', eob(seg(lt, 0.45, 0.75)), Math.sin(t * 2 + 1) * 6);
    } });
    cue(0.05, 'slam', { gain: 0.5 }); cue(tw - 0.1, 'slam', { gain: 0.7 }); cue(ja - 0.1, 'pop'); cue(lu - 0.1, 'pop'); }

  // 2 · Lucia: out of Leonida Penitentiary, stroke of luck
  { const st = cut(1), pe = Wd('Penitentiary', 1) - st, lk = Wd('luck', 1) - st;
    add({ id: 'S02', at: st, cam: [540, 760], zoom: 0.08, note: 'Lucia silhouette behind neon bars; bars slide open on "luck"; PENITENTIARY chip, LUCKY BREAK chip', draw(lt, d, t) {
      world(t, { sun: 0 }); dim(0.35); neon('LUCIA CAMINOS', 540, 260, 104, V6, eob(seg(lt, 0.05, 0.3)));
      figure(540, 760, 1.5, V6, '', eob(seg(lt, 0.1, 0.35)));
      bars(250, 520, 580, 620, lt > lk - 0.1 ? eo(seg(lt, lk - 0.1, lk + 0.5)) : 0, '#9FB4C8');
      chip('LEONIDA PENITENTIARY', 540, 1240, '#9FB4C8', lt > pe - 0.3 ? eob(seg(lt, pe - 0.3, pe)) : 0, 40);
      chip('STROKE OF LUCK', 540, 1380, GOLD, lt > lk ? eob(seg(lt, lk, lk + 0.25)) : 0, 44);
    } });
    cue(st, 'whoosh'); cue(st + pe - 0.3, 'pop'); cue(st + lk - 0.1, 'slide', { dur: 0.6 }); cue(st + lk + 0.3, 'sparkle', { dur: 0.6 }); }

  // 3 · her plan: change the odds
  { const st = cut(2), pl = Wd('plan', 2) - st, od = Wd('odds', 2) - st, nm = Wd('matter', 2) - st;
    add({ id: 'S03', at: st, cam: [540, 760], zoom: 0.1, note: 'HER PLAN panel, two neon dice roll and land on sixes on "odds", NO MATTER WHAT chip', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.3); neon('HER PLAN', 540, 300, 130, V6, lt > pl - 0.2 ? eob(seg(lt, pl - 0.2, pl + 0.1)) : 0);
      const roll = lt < od + 0.3, f1 = roll ? 1 + Math.floor(lt * 14) % 6 : 6, f2 = roll ? 1 + Math.floor(lt * 11 + 3) % 6 : 6;
      die(400, 700, 1.3, f1, GOLD, roll ? lt * 6 : 0); die(680, 720, 1.3, f2, GOLD, roll ? -lt * 5 : 0.1);
      if (!roll) neon('ODDS: HERS', 540, 960, 96, GOLD, eob(seg(lt, od + 0.3, od + 0.55)));
      chip('NO MATTER WHAT', 540, 1200, RED, lt > nm - 0.2 ? eob(seg(lt, nm - 0.2, nm + 0.1)) : 0, 46);
    } });
    cue(st, 'whoosh'); cue(st + pl - 0.2, 'pop'); cue(st + 0.2, 'slide', { dur: od }); cue(st + od + 0.3, 'slam', { gain: 0.6 }); cue(st + nm - 0.2, 'pop'); }

  // 4 · Jason: Army vet, jobs in the Keys
  { const st = cut(3), ar = Wd('Army', 3) - st, ke = Wd('Keys', 3) - st;
    add({ id: 'S04', at: st, cam: [540, 760], zoom: 0.08, note: 'Jason silhouette, ARMY VET star badge, then THE KEYS islands appear behind him', draw(lt, d, t) {
      world(t, { palms: 0 }); if (lt > ke - 0.3) { ctx.globalAlpha = eo(seg(lt, ke - 0.3, ke + 0.2)); water(HZ, '#0B3A5A'); for (let k = 0; k < 5; k++) island(140 + k * 200, HZ + 140 + (k % 2) * 80, 0.8); ctx.globalAlpha = 1; }
      dim(0.2); neon('JASON DUVAL', 540, 260, 110, CYAN, eob(seg(lt, 0.05, 0.3)));
      figure(540, 760, 1.5, CYAN, '', eob(seg(lt, 0.1, 0.35)));
      star(800, 560, 70, GOLD, lt > ar - 0.1 ? eob(seg(lt, ar - 0.1, ar + 0.2)) : 0);
      chip('ARMY VET', 540, 1240, GOLD, lt > ar ? eob(seg(lt, ar, ar + 0.25)) : 0, 46);
      chip('JOBS IN THE KEYS', 540, 1380, CYAN, lt > ke - 0.1 ? eob(seg(lt, ke - 0.1, ke + 0.2)) : 0, 44);
    } });
    cue(st, 'whoosh'); cue(st + ar - 0.1, 'slam', { gain: 0.5 }); cue(st + ke - 0.3, 'whoosh'); cue(st + ke, 'pop'); }

  // 5 · the easy life slips away
  { const st = cut(4), sl = Wd('slips', 4) - st, kn = Wd('knows', 4) - st;
    add({ id: 'S05', at: st, cam: [540, 760], zoom: 0.1, note: 'EASY LIFE neon sign cracks and drops on "slips"; Jason silhouette; BACK TO WHAT HE KNOWS chip', draw(lt, d, t) {
      world(t); dim(0.25); const fall = lt > sl ? eo(seg(lt, sl, sl + 0.8)) : 0;
      if (fall < 1) neon('EASY LIFE', 540, 380 + fall * 600, 140, ORANGE, eob(seg(lt, 0.05, 0.3)), fall * 0.3, 1 - fall);
      crack(540, 380, 1.3, lt > sl - 0.1 && fall < 0.2 ? 1 : 0);
      figure(540, 900, 1.3, CYAN, '', eob(seg(lt, 0.1, 0.35)), Math.sin(t * 2) * 4);
      chip('BACK TO WHAT HE KNOWS', 540, 1300, CYAN, lt > kn - 0.4 ? eob(seg(lt, kn - 0.4, kn - 0.1)) : 0, 42);
    } });
    cue(st, 'whoosh'); cue(st + sl - 0.1, 'slam', { gain: 0.7 }); cue(st + sl + 0.1, 'slide', { dur: 0.7 }); cue(st + kn - 0.4, 'pop'); }

  // 6 · best or worst thing that ever happened to him
  { const st = cut(5), be = Wd('best', 5) - st, wo = Wd('worst', 5) - st, ro = Wd('Rockstar', 5) - st;
    add({ id: 'S06', at: st, cam: [540, 760], zoom: 0.08, note: 'both silhouettes, a heart between them; BEST (green tick) then WORST (red cross); ROCKSTAR SAYS chip', draw(lt, d, t) {
      world(t, { sun: 0 }); dim(0.3);
      figure(320, 800, 1.3, CYAN, 'JASON', eob(seg(lt, 0.05, 0.3))); figure(760, 800, 1.3, V6, 'LUCIA', eob(seg(lt, 0.15, 0.4)));
      const isWorst = lt > wo - 0.05, pulse = 1 + 0.08 * Math.max(0, Math.sin(lt * 8));
      heart(540, 620, 1.1 * pulse, isWorst ? RED : V6, eob(seg(lt, 0.3, 0.6)));
      chip('ROCKSTAR SAYS', 540, 300, GOLD, lt > ro - 0.1 ? eob(seg(lt, ro - 0.1, ro + 0.2)) : 0, 44);
      if (lt > be - 0.1) { neon('BEST', 330, 1240, 110, V5, eob(seg(lt, be - 0.1, be + 0.2))); tick(330, 1360, eob(seg(lt, be, be + 0.25)), true); }
      if (lt > wo - 0.1) { neon('WORST', 750, 1240, 110, RED, eob(seg(lt, wo - 0.1, wo + 0.2))); tick(750, 1360, eob(seg(lt, wo, wo + 0.25)), false); }
    } });
    cue(st, 'whoosh'); cue(st + ro - 0.1, 'pop'); cue(st + be - 0.1, 'pop', { gain: 0.7 }); cue(st + wo - 0.1, 'slam', { gain: 0.6 }); }

  // 7 · two people, one plan, all of Leonida, out November 19
  { const st = cut(6), le = Wd('Leonida', 6) - st, no = Wd('November', 6) - st;
    add({ id: 'S07', at: st, cam: [540, 760], zoom: 0.06, note: 'two figures small over a big Leonida map, 19 NOV date card', draw(lt, d, t) {
      world(t, { sun: 0, palms: 0 }); dim(0.35);
      leonidaShape(200, 260, 680, 860, eob(seg(lt, 0.05, 0.35)));
      figure(470, 760, 0.8, CYAN, '', eob(seg(lt, 0.05, 0.3))); figure(610, 760, 0.8, V6, '', eob(seg(lt, 0.15, 0.4)));
      dateCard(540, 1300, 'OUT', '19 NOV', GOLD, lt > no - 0.1 ? eob(seg(lt, no - 0.1, no + 0.2)) : 0);
    } });
    cue(st, 'whoosh'); cue(st + le - 0.3, 'slide', { dur: 0.4 }); cue(st + no - 0.1, 'slam', { gain: 0.6 }); }

  // 8 · vote
  { const st = cut(7), a = WdX('A', 7) - st, b = WdX('B', 7) - st;
    add({ id: 'S08', at: st, cam: [540, 820], zoom: 0.05, note: 'PART 2? two vote cards: A other characters, B map size', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.45);
      neon('PART 2?', 540, 330, 140, ORANGE, eob(seg(lt, 0.05, 0.3)), Math.sin(lt * 3) * 0.02);
      if (lt < a - 0.1) { ctx.globalAlpha = 0.25 * eo(seg(lt, 0.2, 0.5)); voteCard(540, 640, 'A', ['THE OTHER', 'CHARACTERS'], V6, 0.92); voteCard(540, 1020, 'B', ['MAP SIZE', 'VS GTA 5'], CYAN, 0.92); ctx.globalAlpha = 1; }
      voteCard(540, 640, 'A', ['THE OTHER', 'CHARACTERS'], V6, lt > a - 0.1 ? eob(seg(lt, a - 0.1, a + 0.15)) : 0);
      voteCard(540, 1020, 'B', ['MAP SIZE', 'VS GTA 5'], CYAN, lt > b - 0.1 ? eob(seg(lt, b - 0.1, b + 0.15)) : 0);
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'slam', { gain: 0.5 }); cue(st + a - 0.1, 'pop', { gain: 0.7 }); cue(st + b - 0.1, 'pop', { gain: 0.7 }); }

  // 9 · comment A or B
  { const st = cut(8);
    add({ id: 'S09', at: st, cam: [540, 820], zoom: 0.06, note: 'both cards pulse, COMMENT, A / B', draw(lt, d, t) {
      world(t, { palms: 0 }); dim(0.45);
      voteCard(540, 640, 'A', ['THE OTHER', 'CHARACTERS'], V6, 1, Math.max(0, Math.sin(lt * 6)));
      voteCard(540, 1020, 'B', ['MAP SIZE', 'VS GTA 5'], CYAN, 1, Math.max(0, Math.sin(lt * 6 + Math.PI)));
      neon('COMMENT', 540, 330, 120, GOLD, eob(seg(lt, 0.05, 0.3)));
      neon('A  /  B', 540, 1330, 110, ORANGE, eob(seg(lt, 0.3, 0.55)));
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'pop'); cue(st + 0.3, 'pop'); }

  return { shots: S, cues: CUES };
}
