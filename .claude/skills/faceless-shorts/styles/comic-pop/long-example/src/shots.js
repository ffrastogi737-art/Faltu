// LONG 16:9 (1920x1080) — style COMIC POP, data-driven: every script line has a `vis` and becomes one shot.
// vis.k: I icon + headline (+ sub chip) · T chapter title · S big stat · Q question · M myth/twist stamp · F fact stamp
//        C chain of icons · V versus.   Optional vis.fx: 'boom' | 'hit' (on the headline, or on word vis.at).
// All art drawn in code (no photos, no AI images).
import { ctx, W, H, lerp, seg, eo, eob, rnd, rr, ell } from './core/lib.js';
import { L, Le, Wd, T, lineWords } from './core/timing.js';

const GREEN = '#2EE86B', PINK = '#FF3FA4', ORANGE = '#FF8A00', CYAN = '#00B8FF', GOLD = '#FFE600', RED = '#FF2D2D', INK = '#111111', PURPLE = '#7B4DFF', SKIN = '#FFD2A8', SKIN2 = '#F2B184';
const BG = [['#FFB800', '#FF5E00'], ['#00C6FF', '#0061FF'], ['#FF4FA3', '#B620E0'], ['#36E07A', '#00A6A6'], ['#FFE600', '#FF8A00'], ['#7B4DFF', '#3A1CC8'], ['#FF6B6B', '#E0245E'], ['#4DD8FF', '#2E7DFF']];
const RIM = [CYAN, PINK, GOLD, GREEN, ORANGE, PURPLE];
let SCENE = 0;
export let SERIES = '';

// ───────────── kit ─────────────
function world(t) {
  const [c1, c2] = BG[SCENE % BG.length], g = ctx.createRadialGradient(960, 440, 60, 960, 440, 1250); g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
  ctx.save(); ctx.translate(960, 440); ctx.rotate(t * 0.06); ctx.fillStyle = 'rgba(255,255,255,0.13)';
  for (let k = 0; k < 20; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 2600, k * Math.PI / 10, k * Math.PI / 10 + Math.PI / 20); ctx.closePath(); ctx.fill(); } ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 880; y < H + 40; y += 30) for (let x = (y / 30) % 2 * 15; x < W; x += 30) { const r = 2 + (y - 880) / 40; ctx.beginPath(); ctx.arc(x, y, Math.min(r, 10), 0, 7); ctx.fill(); }
}
function fitFont(text, size, maxW, weight = 900) { ctx.font = `${weight} ${size}px Inter`; const w = ctx.measureText(text).width; return w > maxW ? size * maxW / w : size; }
/** thumbnail text: white / gold fill, thick ink outline, hard shadow; shrinks to fit maxW */
function pop(text, x, y, size, col = '#FFFFFF', sc = 1, rot = 0, maxW = 1700) {
  if (sc <= 0) return; size = fitFont(text, size, maxW); ctx.save(); ctx.translate(x, y); ctx.rotate(rot - 0.025); ctx.scale(sc, sc);
  ctx.font = `900 ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = INK; ctx.fillText(text, size * 0.06, size * 0.08); ctx.lineWidth = size * 0.16; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.restore();
}
function chip(text, x, y, col, sc = 1, size = 46, rot = -0.03) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width + size * 1.2, h = size * 1.6;
  rr(-w / 2 + 8, -h / 2 + 10, w, h, h / 2); ctx.fillStyle = INK; ctx.fill(); rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = [GOLD, GREEN, CYAN, '#FFFFFF'].includes(col) ? INK : '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 4); ctx.restore();
}
function card(x, y, w, h, col, sc = 1, rot = -0.012) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(rot);
  rr(-w / 2 + 16, -h / 2 + 18, w, h, 30); ctx.fillStyle = INK; ctx.fill(); rr(-w / 2, -h / 2, w, h, 30); ctx.fillStyle = col; ctx.fill();
  rr(-w / 2 + 14, -h / 2 + 14, w - 28, h - 28, 22); ctx.fillStyle = '#FFFFFF'; ctx.fill(); rr(-w / 2, -h / 2, w, h, 30); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
}
function burst(x, y, r, col, sc = 1, spikes = 16, rot = 0) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) { const a = i * Math.PI / spikes, q = i % 2 ? r * 0.74 : r * (0.95 + 0.08 * rnd(i)); ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.closePath();
  ctx.save(); ctx.translate(14, 16); ctx.fillStyle = INK; ctx.fill(); ctx.restore(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
}
function tick(x, y, s, ok) { if (s <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.arc(6, 8, 52, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 52, 0, 7); ctx.fillStyle = ok ? GREEN : RED; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); if (ok) { ctx.moveTo(-22, 2); ctx.lineTo(-6, 20); ctx.lineTo(24, -18); } else { ctx.moveTo(-18, -18); ctx.lineTo(18, 18); ctx.moveTo(18, -18); ctx.lineTo(-18, 18); } ctx.stroke(); ctx.restore(); }
function stamp(text, x, y, col, sc, rot = -0.14) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = '900 120px Inter'; const w = ctx.measureText(text).width + 90;
  rr(-w / 2, -95, w, 190, 26); ctx.lineWidth = 20; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = '#FFFFFF'; rr(-w / 2 + 18, -77, w - 36, 154, 16); ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 8); ctx.restore();
}
function arrow(x0, y, x1, p) { if (p <= 0) return; const xe = lerp(x0, x1, p); ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xe, y); ctx.lineWidth = 30; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 16; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xe + 30, y); ctx.lineTo(xe - 14, y - 34); ctx.lineTo(xe - 14, y + 34); ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
function ink(w = 8) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
function blob(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ink(); }
function disc(x, y, r, fill, w = 8) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill(); if (w) ink(w); }

// ───────────── icons (drawn in a ~440 px box around 0,0; t = shot-local time for idle motion) ─────────────
const ICON = {
  person(t) { const b = Math.sin(t * 3) * 6;
    ctx.beginPath(); ctx.moveTo(-170, 200); ctx.quadraticCurveTo(-160, 40, 0, 40); ctx.quadraticCurveTo(160, 40, 170, 200); ctx.closePath(); ctx.fillStyle = CYAN; ctx.fill(); ink();
    disc(0, -70 + b, 120, SKIN); ctx.beginPath(); ctx.arc(0, -90 + b, 122, Math.PI * 1.08, Math.PI * 1.92); ctx.quadraticCurveTo(0, -130 + b, -112, -130 + b); ctx.closePath(); ctx.fillStyle = '#4A2C1A'; ctx.fill(); ink();
    disc(-42, -60 + b, 14, INK, 0); disc(42, -60 + b, 14, INK, 0); ctx.beginPath(); ctx.arc(0, -25 + b, 40, 0.15 * Math.PI, 0.85 * Math.PI); ink(9); },
  lungs(t) { const br = 1 + Math.sin(t * 2.4) * 0.04; ctx.save(); ctx.scale(br, br);
    rr(-18, -200, 36, 120, 14); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ink();
    for (const s of [-1, 1]) { ctx.save(); ctx.scale(s, 1); ctx.beginPath(); ctx.moveTo(25, -100); ctx.bezierCurveTo(150, -150, 190, 20, 170, 120); ctx.quadraticCurveTo(100, 150, 30, 110); ctx.closePath(); ctx.fillStyle = '#FF7FA8'; ctx.fill(); ink(); ctx.beginPath(); ctx.moveTo(40, -60); ctx.quadraticCurveTo(90, -20, 110, 40); ink(6); ctx.restore(); }
    ctx.restore(); const dy = Math.sin(t * 2.4) * 10; ctx.beginPath(); ctx.moveTo(-210, 190 + dy); ctx.quadraticCurveTo(0, 90 + dy, 210, 190 + dy); ctx.lineWidth = 34; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 20; ctx.strokeStyle = RED; ctx.stroke(); },
  brain(t) { ctx.save(); ctx.scale(1 + Math.sin(t * 2) * 0.02, 1 + Math.sin(t * 2) * 0.02);
    rr(-10, 100, 50, 100, 16); ctx.fillStyle = '#FF9CC2'; ctx.fill(); ink();
    ctx.beginPath(); ctx.moveTo(-180, 40); ctx.bezierCurveTo(-220, -120, -60, -200, 10, -150); ctx.bezierCurveTo(90, -210, 230, -110, 190, 30); ctx.bezierCurveTo(210, 120, 90, 150, 30, 110); ctx.bezierCurveTo(-30, 160, -170, 140, -180, 40); ctx.fillStyle = '#FF9CC2'; ctx.fill(); ink(9);
    ctx.beginPath(); ctx.moveTo(10, -150); ctx.bezierCurveTo(-20, -60, 40, 20, 20, 110); ink(7);
    for (const [a, b2, c] of [[-150, -40, -60], [-120, 60, -40], [80, -90, 150], [70, 40, 160]]) { ctx.beginPath(); ctx.moveTo(a, b2); ctx.quadraticCurveTo((a + c) / 2, b2 - 50, c, b2 + 10); ink(6); }
    ctx.restore(); },
  nerve(t) { const pts = [[-200, 40], [-120, -60], [-40, 50], [40, -70], [120, 40], [200, -50]];
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.lineWidth = 44; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 28; ctx.strokeStyle = GOLD; ctx.stroke();
    pts.forEach((p) => disc(p[0], p[1], 26, '#FFFFFF', 7)); const u = (t * 0.9) % 1, k = Math.min(4, Math.floor(u * 5)), f = u * 5 - k;
    burst(lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f), 46, '#FFFFFF', 1, 8, t * 4); },
  clock(t) { disc(10, 12, 190, INK, 0); disc(0, 0, 190, '#FFFFFF', 12);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.sin(a) * 148, -Math.cos(a) * 148); ctx.lineTo(Math.sin(a) * 170, -Math.cos(a) * 170); ink(8); }
    const m = t * 2.2, h = t * 0.4 + 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(h) * 90, -Math.cos(h) * 90); ink(18); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(m) * 135, -Math.cos(m) * 135); ctx.lineWidth = 12; ctx.strokeStyle = RED; ctx.stroke(); disc(0, 0, 16, INK, 0); },
  bubble(t) { for (let k = 0; k < 9; k++) { const r = 30 + 40 * rnd(k + 3), x = -150 + 300 * rnd(k + 11), y = 170 - ((t * (60 + 40 * rnd(k)) + 380 * rnd(k + 7)) % 380);
    disc(x, y, r, '#A0EBFF', 7); disc(x - r * 0.35, y - r * 0.35, r * 0.25, '#FFFFFF', 0); } },
  thermo(t) { rr(-46, -200, 92, 300, 46); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ink(10); const lv = 0.45 + Math.sin(t * 1.6) * 0.2;
    rr(-20, -150 + 240 * (1 - lv), 40, 240 * lv + 60, 20); ctx.fillStyle = RED; ctx.fill(); disc(0, 140, 82, RED, 10); for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(46, -150 + k * 50); ctx.lineTo(80, -150 + k * 50); ink(7); } },
  sun(t) { ctx.save(); ctx.rotate(t * 0.5); for (let k = 0; k < 12; k++) { ctx.save(); ctx.rotate(k * Math.PI / 6); blob([[-26, -150], [0, -215], [26, -150]], ORANGE); ctx.restore(); } ctx.restore();
    disc(0, 0, 135, GOLD, 10); disc(-45, -15, 12, INK, 0); disc(45, -15, 12, INK, 0); ctx.beginPath(); ctx.arc(0, 15, 50, 0.2 * Math.PI, 0.8 * Math.PI); ink(9); },
  eye(t) { const bl = Math.abs(Math.sin(t * 1.3)) > 0.97 ? 0.15 : 1; ctx.save(); ctx.scale(1, bl);
    ctx.beginPath(); ctx.moveTo(-220, 0); ctx.quadraticCurveTo(0, -190, 220, 0); ctx.quadraticCurveTo(0, 190, -220, 0); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ink(11);
    const lx = Math.sin(t * 0.8) * 30; disc(lx, 0, 85, CYAN, 9); disc(lx, 0, 40, INK, 0); disc(lx - 22, -24, 15, '#FFFFFF', 0); ctx.restore(); },
  nose(t) { const s = Math.max(0, Math.sin(t * 2.2));
    ctx.beginPath(); ctx.moveTo(-40, -200); ctx.quadraticCurveTo(10, -60, 120, 60); ctx.quadraticCurveTo(140, 120, 70, 120); ctx.quadraticCurveTo(30, 150, -20, 120); ctx.quadraticCurveTo(-90, 130, -90, 80); ctx.quadraticCurveTo(-60, 0, -40, -200); ctx.fillStyle = SKIN; ctx.fill(); ink(10);
    ell(10, 105, 26, 14, INK); ell(80, 100, 18, 11, INK);
    for (let k = 0; k < 10; k++) { const a = 0.2 + k * 0.12, d = 80 + 120 * s * (0.6 + 0.4 * rnd(k)); disc(40 + Math.cos(a) * d, 130 + Math.sin(a) * d * 0.6, 9 + 6 * rnd(k + 2), '#BFF4FF', 4); } },
  icecream(t) { blob([[-110, -20], [110, -20], [0, 230]], '#E8A85C'); for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 55 - 30, -20); ctx.lineTo(k * 55 + 30, 110); ink(5); }
    disc(-55, -70, 85, '#FF8FC0', 9); disc(60, -75, 85, '#9EE8FF', 9); disc(0, -150, 90, '#FFF2B3', 9); disc(0, -245, 22, RED, 7);
    for (let k = 0; k < 4; k++) { const y = -150 + ((t * 60 + k * 70) % 260); ctx.beginPath(); ctx.moveTo(150 + k * 18, y); ctx.lineTo(165 + k * 18, y + 20); ctx.lineWidth = 6; ctx.strokeStyle = '#7FD8FF'; ctx.lineCap = 'round'; ctx.stroke(); } },
  bed(t) { rr(-230, -80, 40, 260, 14); ctx.fillStyle = '#8A5A36'; ctx.fill(); ink(); rr(-220, 20, 440, 120, 20); ctx.fillStyle = '#B07A4E'; ctx.fill(); ink();
    rr(-180, -30, 120, 70, 30); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ink(); disc(-115, -55, 50, SKIN, 8); ctx.beginPath(); ctx.moveTo(-140, -58); ctx.lineTo(-122, -58); ctx.moveTo(-108, -58); ctx.lineTo(-90, -58); ink(6);
    rr(-80, -10, 290, 60, 26); ctx.fillStyle = PURPLE; ctx.fill(); ink();
    for (let k = 0; k < 3; k++) { const u = (t * 0.7 + k / 3) % 1; ctx.globalAlpha = 1 - u; ctx.font = `900 ${50 + k * 14}px Inter`; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText('Z', -40 + u * 150, -110 - u * 100); ctx.fillText('Z', -40 + u * 150, -110 - u * 100); ctx.globalAlpha = 1; } },
  cup(t) { ctx.beginPath(); ctx.arc(110, 30, 60, -Math.PI / 2, Math.PI / 2); ctx.lineWidth = 34; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 18; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    rr(-120, -80, 220, 240, 30); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ink(10); rr(-120, 20, 220, 50, 0); ctx.fillStyle = RED; ctx.fill(); ell(-10, -80, 100, 20, '#6B3A1E');
    for (let k = 0; k < 3; k++) { const x = -60 + k * 50, o = Math.sin(t * 3 + k) * 14; ctx.beginPath(); ctx.moveTo(x, -110); ctx.bezierCurveTo(x + 30 + o, -150, x - 30 - o, -190, x, -230); ctx.lineWidth = 18; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = '#FFFFFF'; ctx.stroke(); } },
  skin(t) { const up = 0.5 + 0.5 * Math.sin(t * 2.5);
    for (let k = 0; k < 5; k++) { const x = -160 + k * 80; ctx.beginPath(); ctx.moveTo(x, -66); ctx.lineTo(x + 60 * (1 - up), -190 + 40 * (1 - up)); ctx.lineWidth = 9; ctx.strokeStyle = '#4A2C1A'; ctx.lineCap = 'round'; ctx.stroke(); }
    rr(-220, -40, 440, 200, 30); ctx.fillStyle = SKIN; ctx.fill(); ink(10);
    for (let k = 0; k < 5; k++) { const x = -160 + k * 80; ctx.beginPath(); ctx.arc(x, -40, 30 * (0.6 + 0.4 * up), Math.PI, 0); ctx.fillStyle = SKIN2; ctx.fill(); ink(7); ctx.beginPath(); ctx.moveTo(x - 6, -10); ctx.lineTo(x + 34, 90); ctx.lineWidth = 12; ctx.strokeStyle = RED; ctx.stroke(); } },
  cat(t) { const p = 1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3));
    blob([[-130, -80], [-100, -215], [-30, -120]], ORANGE); blob([[130, -80], [100, -215], [30, -120]], ORANGE);
    ctx.save(); ctx.scale(p, p); ctx.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r = i % 2 ? 140 : 180; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.9 + 20); } ctx.closePath(); ctx.fillStyle = ORANGE; ctx.fill(); ink(9); ctx.restore();
    disc(0, 10, 115, '#FFB24A', 8); disc(-45, -10, 20, INK, 0); disc(45, -10, 20, INK, 0); blob([[-14, 25], [14, 25], [0, 40]], PINK);
    for (const s of [-1, 1]) for (const dy of [-8, 12]) { ctx.beginPath(); ctx.moveTo(s * 40, 40); ctx.lineTo(s * 150, 30 + dy); ink(5); } },
  note(t) { const b = Math.sin(t * 4) * 10; ctx.save(); ctx.translate(0, b);
    blob([[-30, 110], [-30, -170], [170, -220], [170, 60], [150, 60], [150, -150], [-10, -110], [-10, 110]], INK);
    ell(-90, 120, 70, 52, PINK, -0.4); ctx.beginPath(); ctx.ellipse(-90, 120, 70, 52, -0.4, 0, 7); ink(9); ell(110, 70, 70, 52, CYAN, -0.4); ctx.beginPath(); ctx.ellipse(110, 70, 70, 52, -0.4, 0, 7); ink(9); ctx.restore(); },
  hand(t) { ctx.save(); ctx.rotate(Math.sin(t * 2) * 0.05); ctx.translate(0, 30);
    [[-110, 0], [-45, 30], [20, 30], [85, 0]].forEach(([x, ex]) => { rr(x, -175 - ex, 62, 220 + ex, 31); ctx.fillStyle = SKIN; ctx.fill(); ink(9);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + 12, -145 - ex + k * 16); ctx.quadraticCurveTo(x + 31, -153 - ex + k * 16, x + 50, -145 - ex + k * 16); ink(4); } });
    rr(-125, -20, 270, 210, 70); ctx.fillStyle = SKIN; ctx.fill(); ink(10);
    ctx.beginPath(); ctx.ellipse(-150, 60, 40, 95, -0.6, 0, 7); ctx.fillStyle = SKIN; ctx.fill(); ink(9); ctx.restore(); },
  water(t) { const s = 1 + Math.sin(t * 3) * 0.04; ctx.save(); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(0, -220); ctx.bezierCurveTo(60, -100, 150, -10, 150, 70); ctx.arc(0, 70, 150, 0, Math.PI); ctx.bezierCurveTo(-150, -10, -60, -100, 0, -220); ctx.fillStyle = CYAN; ctx.fill(); ink(10);
    ell(-60, 40, 26, 50, '#FFFFFF', 0.3); ctx.restore(); },
  stomach(t) { const g = Math.sin(t * 9) * 5 * (Math.sin(t * 1.3) > 0.3 ? 1 : 0); ctx.save(); ctx.translate(g - 20, 0);
    ctx.beginPath(); ctx.moveTo(-40, -220); ctx.lineTo(10, -220); ctx.bezierCurveTo(10, -150, 40, -130, 120, -130); ctx.bezierCurveTo(240, -130, 230, 120, 80, 170); ctx.bezierCurveTo(-60, 210, -170, 120, -120, 40); ctx.bezierCurveTo(-80, -20, -40, -60, -40, -220); ctx.fillStyle = '#FF7FA8'; ctx.fill(); ink(10);
    ctx.beginPath(); ctx.moveTo(-60, 60); ctx.quadraticCurveTo(40, 110, 150, 0); ink(6); ctx.restore();
    for (let k = 0; k < 3; k++) { const u = (t * 0.8 + k / 3) % 1; ctx.globalAlpha = 1 - u; disc(170 + u * 40, -60 - u * 120 + k * 10, 14 + u * 12, '#FFFFFF', 4); ctx.globalAlpha = 1; } },
  foot(t) { ctx.save(); ctx.translate(-30, 0); ctx.beginPath(); ctx.moveTo(-60, -220); ctx.lineTo(50, -220); ctx.lineTo(60, 40); ctx.bezierCurveTo(70, 80, 210, 60, 220, 130); ctx.bezierCurveTo(225, 190, 120, 200, -20, 190); ctx.bezierCurveTo(-90, 190, -90, 120, -70, 60); ctx.closePath(); ctx.fillStyle = SKIN; ctx.fill(); ink(10);
    [[200, 110, 26], [160, 82, 20], [124, 72, 17], [92, 66, 15]].forEach(([x, y, r]) => disc(x, y, r, SKIN, 6));
    for (let k = 0; k < 7; k++) { const a = t * 6 + k * 2.1, x = -40 + 220 * rnd(k + 5), y = 40 + 120 * rnd(k + 9), s = 0.5 + 0.5 * Math.sin(a); if (s > 0.3) burst(x, y, 22 * s, GOLD, 1, 6, a); } ctx.restore(); },
};
function icon(name, x, y, s, t, sc = 1, ring = '#FFFFFF') {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc * s, sc * s);
  disc(14, 18, 270, INK, 0); disc(0, 0, 270, ring, 12); disc(0, 0, 244, '#FFFFFF', 0);
  ctx.save(); ctx.scale(0.92, 0.92); (ICON[name] || ICON.person)(t); ctx.restore(); ctx.restore();
}

// ───────────── shots from the script ─────────────
export function buildShots(script) {
  const S = [], CUES = [], cue = (t, type, o = {}) => CUES.push({ t: +Math.max(0, t).toFixed(3), type, ...o });
  const lines = script.lines, n = lines.length, cut = (i) => (i === 0 ? 0 : L(i) - 0.12);
  SERIES = script.series || '';
  let chap = null, lastBoom = -99, side = 0;
  const wordAt = (txt, i) => { try { return Wd(txt, i); } catch { return null; } };
  lines.forEach((ln, i) => {
    const v = ln.vis, st = cut(i), ls = L(i) - st, le = Le(i) - st;          // line start / end, shot-local
    const scene = i, rim = RIM[i % RIM.length];
    if (v.k === 'T') chap = { n: v.n, title: v.title };
    const myChap = v.k === 'T' ? null : chap;
    const mid = ls + (le - ls) * 0.45;
    const fxAt = v.at ? (wordAt(v.at, i) ?? L(i)) - st : ls + 0.15;
    if (i > 0) cue(st, 'swoosh', { gain: 0.8 });
    const flip = (side++) % 2 === 1;
    let draw;
    if (v.k === 'T') {
      draw = (lt, d, t) => { world(t); const s1 = eob(seg(lt, 0.05, 0.35));
        burst(960, 330, 230, GOLD, s1, 18, t * 0.3); pop('#' + v.n, 960, 340, 200, '#FFFFFF', s1, 0, 380);
        pop(v.title, 960, 680, 170, GOLD, eob(seg(lt, 0.3, 0.6)), 0, 1500);
        icon(v.icon, 330, 380, 0.55, lt, eob(seg(lt, 0.45, 0.75)), CYAN); icon(v.icon, 1590, 380, 0.55, lt + 1, eob(seg(lt, 0.55, 0.85)), PINK);
        if (SERIES) chip(SERIES, 960, 80, '#FFFFFF', eob(seg(lt, 0.1, 0.3)), 34, 0); };
      cue(st - 0.7, 'riser', { dur: 0.75 }); cue(st + 0.06, 'boom'); lastBoom = st; cue(st + 0.35, 'ding');
    } else if (v.k === 'I') {
      const ix = flip ? 1440 : 480, tx = flip ? 620 : 1300;
      draw = (lt, d, t) => { world(t);
        icon(v.icon, ix, 450, 1.25, lt, eob(seg(lt, 0.0, 0.3)), rim);
        pop(v.head, tx, v.sub ? 375 : 450, 158, '#FFFFFF', eob(seg(lt, ls - 0.05, ls + 0.25)), 0, 840);
        if (v.sub) chip(v.sub, tx, 580, rim === GOLD ? PINK : GOLD, eob(seg(lt, mid - 0.1, mid + 0.2)), 54); };
      if (v.sub) cue(st + mid - 0.1, 'pop');
    } else if (v.k === 'S') {
      const num = parseInt(v.big, 10), isNum = /^\d+%?$/.test(v.big) && num > 10 && !/^(19|20)\d\d$/.test(v.big), rev = Math.min(ls + 0.6, le);
      draw = (lt, d, t) => { world(t); const s1 = eob(seg(lt, 0.0, 0.35));
        burst(960, 410, 340, GOLD, s1 * (1 + 0.03 * Math.sin(lt * 6)), 18, t * 0.2);
        const txt = isNum ? Math.round(num * eo(seg(lt, 0.15, rev))) + (v.big.endsWith('%') ? '%' : '') : v.big;
        pop(txt, 960, 420, 230, '#FFFFFF', eob(seg(lt, 0.1, 0.4)), 0, 560);
        chip(v.label, 960, 790, '#FFFFFF', eob(seg(lt, rev - 0.1, rev + 0.2)), 60, 0.02); };
      if (v.fx === 'boom' && st - lastBoom > 7) { cue(st + 0.05, 'riser', { dur: rev - 0.05 }); cue(st + rev, 'boom'); lastBoom = st + rev; } else cue(st + rev, 'hit');
      cue(st + rev + 0.1, 'ding');
    } else if (v.k === 'Q') {
      draw = (lt, d, t) => { world(t);
        for (const [x, y, r, k] of [[270, 420, 1, 0], [1650, 380, 1.1, 1]]) { const sc = eob(seg(lt, 0.1 + k * 0.12, 0.4 + k * 0.12)); burst(x, y, 170 * r, k ? PINK : CYAN, sc, 14, Math.sin(t * 2 + k) * 0.15); pop('?', x, y + 10, 230 * r, GOLD, sc, Math.sin(t * 3 + k) * 0.12); }
        card(960, 440, 1000, 300, rim, eob(seg(lt, 0.0, 0.3))); pop(v.head, 960, 440, 120, '#FFFFFF', eob(seg(lt, ls, ls + 0.3)), 0, 880); };
      cue(st + 0.15, 'boing', { gain: 0.6 });
    } else if (v.k === 'M') {
      const sAt = Math.max(ls + 0.3, Math.min(mid, le - 0.3));
      draw = (lt, d, t) => { world(t); card(960, 450, 1300, 330, rim, eob(seg(lt, 0, 0.3)));
        pop(v.head, 960, 450, 130, '#FFFFFF', eob(seg(lt, ls, ls + 0.3)), 0, 1150);
        stamp(v.stamp || 'MYTH', 1400, 240, v.stamp ? PURPLE : RED, lt > sAt ? lerp(2.2, 1, eo(seg(lt, sAt, sAt + 0.16))) : 0); };
      cue(st + sAt, v.stamp ? 'hit' : 'scratch'); if (!v.stamp) cue(st + sAt + 0.05, 'slam', { gain: 0.5 });
    } else if (v.k === 'F') {
      const sAt = Math.min(ls + 0.35, le);
      draw = (lt, d, t) => { world(t); card(960, 450, 1250, 320, GREEN, eob(seg(lt, 0, 0.3)));
        pop(v.head, 960, 450, 140, '#FFFFFF', eob(seg(lt, ls, ls + 0.3)), 0, 1050);
        tick(380, 290, eob(seg(lt, sAt, sAt + 0.25)) * 1.5, true); stamp('FACT', 1460, 250, GREEN, lt > sAt ? lerp(2, 1, eo(seg(lt, sAt, sAt + 0.16))) : 0, 0.1); };
      if (v.fx === 'boom' && st - lastBoom > 7) { cue(st + sAt, 'boom'); lastBoom = st + sAt; } else cue(st + sAt, 'ding'); cue(st + sAt + 0.15, 'coin');
    } else if (v.k === 'C') {
      const m = v.items.length, xs = m === 2 ? [600, 1320] : [380, 960, 1540], ws = lineWords(i);
      const at = v.items.map((it, j) => { const w0 = it[1].split(' ')[0].replace(/[^A-Za-z]/g, '').toLowerCase().slice(0, 4); const hit = j && ws.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(w0));
        return hit ? hit.s - st - 0.1 : ls + (le - ls) * j / m; });
      for (let j = 1; j < m; j++) at[j] = Math.max(at[j], at[j - 1] + 0.35);
      draw = (lt, d, t) => { world(t);
        v.items.forEach((it, j) => { const sc = eob(seg(lt, at[j], at[j] + 0.3)); icon(it[0], xs[j], 400, m === 2 ? 0.95 : 0.78, lt + j, sc, RIM[(i + j) % RIM.length]);
          chip(it[1], xs[j], m === 2 ? 720 : 680, '#FFFFFF', sc, 50, j % 2 ? 0.03 : -0.03);
          if (j > 0) arrow(xs[j - 1] + (m === 2 ? 280 : 235), 400, xs[j] - (m === 2 ? 310 : 265), eo(seg(lt, at[j] - 0.25, at[j]))); }); };
      at.forEach((a2, j) => cue(st + a2, j === m - 1 ? 'hit' : 'pop'));
    } else if (v.k === 'V') {
      const bAt = mid;
      draw = (lt, d, t) => { world(t);
        for (const [k, x, col, txt, rot] of [[0, 500, CYAN, v.a, -0.03], [1, 1420, ORANGE, v.b, 0.03]]) { const sc = eob(seg(lt, k ? bAt : 0, (k ? bAt : 0) + 0.3)); card(x, 440, 720, 520, col, sc, rot);
          if (sc > 0) { pop(txt[0], x, 330, 90, col, sc, rot, 600); pop(txt[1], x, 490, 96, INK === '#111111' ? '#FFFFFF' : '#FFFFFF', sc, rot, 600); tick(x, 640, sc, k === 0); } }
        burst(960, 440, 110, PINK, eob(seg(lt, bAt - 0.1, bAt + 0.2)), 12, t); pop('VS', 960, 445, 90, '#FFFFFF', eob(seg(lt, bAt - 0.1, bAt + 0.2))); };
      cue(st + 0.1, 'pop'); cue(st + bAt, 'hit');
    }
    if (v.fx === 'hit' && v.k === 'I') cue(st + fxAt, 'hit');
    if (v.fx === 'boom' && v.k === 'I') { if (st + fxAt - lastBoom > 7) { cue(st + fxAt - 0.7, 'riser', { dur: 0.7 }); cue(st + fxAt, 'boom'); lastBoom = st + fxAt; } else cue(st + fxAt, 'hit'); }
    const badge = myChap ? `#${myChap.n} ${myChap.title}` : null;
    S.push({ id: `S${String(i).padStart(2, '0')}`, at: st, cam: [960, 440], zoom: 0.05, note: `${v.k} ${v.head || v.title || v.big || ''}`.trim(),
      draw(lt, d2, t) { SCENE = scene; draw(lt, d2, t); if (badge) { ctx.font = '900 38px Inter'; const w = ctx.measureText(badge).width + 38; chip(badge, 50 + w * 1.2 / 2, 72, '#FFFFFF', 1, 38, 0); } } });
  });
  cue(Le(n - 1) - 0.2, 'applause', { dur: 2.2 });
  return { shots: S, cues: CUES };
}
