// CHALK TALK kit: a green chalkboard and everything drawn in "chalk" (jittered, slightly transparent strokes that
// draw themselves on). Import as `import * as K from './core/kit.js'`. All shapes take p = draw-on progress 0..1.
import { ctx, W, H, clamp, lerp, rnd, TAU } from './lib.js';

export const CH = { board: '#1F3D2B', boardDark: '#15301F', wood: '#7A5232', woodDark: '#5C3D24',
  white: '#F2F0E6', yellow: '#F7E26B', pink: '#F4A6B8', blue: '#8EC9F0', orange: '#F6B26B', green: '#9EE09A' };

// ---------- the board ----------
let dust = null;
function dustLayer() {   // built once: faint chalk smudges + speckle so the board never looks like flat colour
  if (dust) return dust;
  dust = document.createElement('canvas'); dust.width = W; dust.height = H; const d = dust.getContext('2d');
  for (let i = 0; i < 26; i++) { d.globalAlpha = 0.035 + 0.03 * rnd(i); d.fillStyle = CH.white; d.beginPath(); d.ellipse(rnd(i + 1) * W, rnd(i + 2) * H, 120 + 260 * rnd(i + 3), 40 + 90 * rnd(i + 4), rnd(i + 5) * 3, 0, TAU); d.fill(); }
  for (let i = 0; i < 2600; i++) { d.globalAlpha = 0.05 + 0.08 * rnd(i + 9); d.fillStyle = CH.white; d.fillRect(rnd(i * 3.1) * W, rnd(i * 7.7) * H, 2, 2); }
  return dust;
}
export function board() {
  ctx.fillStyle = CH.board; ctx.fillRect(-300, -300, W + 600, H + 600);
  const g = ctx.createRadialGradient(540, 860, 200, 540, 860, 1300); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
  ctx.drawImage(dustLayer(), 0, 0);
  ctx.fillStyle = CH.wood; ctx.fillRect(-300, -300, W + 600, 330); ctx.fillRect(-300, 1880, W + 600, 400);   // frame top / ledge
  ctx.fillStyle = CH.woodDark; ctx.fillRect(-300, 20, W + 600, 10); ctx.fillRect(-300, 1880, W + 600, 14);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = [CH.white, CH.yellow, CH.pink][i]; ctx.fillRect(760 + i * 70, 1860, 52, 16); }   // chalk sticks on the ledge
}

// ---------- chalk strokes ----------
const len = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
function partial(pts, p) {   // the first p fraction (by length) of a polyline
  if (p >= 1) return pts; const L = len(pts) * clamp(p); let acc = 0; const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + s >= L) { const u = (L - acc) / (s || 1); out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); break; } acc += s; out.push(pts[i]); }
  return out;
}
/** chalk polyline: 3 jittered passes, rough and a little see-through; p draws it on */
export function chalk(pts, col = CH.white, w = 8, p = 1, seed = 1) {
  if (p <= 0 || pts.length < 2) return; const q = partial(pts, p), base = ctx.globalAlpha;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
  for (let k = 0; k < 3; k++) { ctx.globalAlpha = [0.75, 0.45, 0.3][k] * base; ctx.lineWidth = w * [1, 0.7, 1.35][k];
    ctx.beginPath(); q.forEach(([x, y], i) => { const jx = (rnd(seed * 31 + i * 7 + k) - 0.5) * w * 0.5, jy = (rnd(seed * 17 + i * 3 + k * 5) - 0.5) * w * 0.5; i ? ctx.lineTo(x + jx, y + jy) : ctx.moveTo(x + jx, y + jy); }); ctx.stroke(); }
  ctx.restore();
}
export const arc = (x, y, r, a0 = 0, a1 = TAU, n = 40, ry = r) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [x + Math.cos(a) * r, y + Math.sin(a) * ry]; });
export function circleC(x, y, r, col = CH.white, w = 8, p = 1, seed = 2) { chalk(arc(x, y, r), col, w, p, seed); }
/** a scribble fill (diagonal hatching) inside a circle, the chalk way to colour something in */
export function hatch(x, y, r, col, a = 0.5, p = 1) { if (p <= 0) return; ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip(); ctx.globalAlpha = a; const n = Math.round(16 * p);
  for (let i = 0; i < n; i++) chalk([[x - r + i * r / 7 - r * 0.6, y + r], [x - r + i * r / 7 + r * 0.6, y - r]], col, 6, 1, 40 + i); ctx.restore(); }
export function arrowC(x0, y0, x1, y1, col = CH.yellow, p = 1, w = 8) {
  chalk([[x0, y0], [x1, y1]], col, w, clamp(p * 1.3), 5); if (p < 0.75) return;
  const a = Math.atan2(y1 - y0, x1 - x0), h = 34;
  chalk([[x1 - Math.cos(a - 0.5) * h, y1 - Math.sin(a - 0.5) * h], [x1, y1], [x1 - Math.cos(a + 0.5) * h, y1 - Math.sin(a + 0.5) * h]], col, w, clamp((p - 0.75) * 4), 6);
}
/** chalk lettering: Inter Black with a rough double pass and chalk grain; p reveals it left to right */
export function write(text, x, y, size, col = CH.white, p = 1, rot = 0, align = 'center') {
  if (p <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.font = `900 ${size}px Inter`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width, x0 = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  ctx.beginPath(); ctx.rect(x0 - 10, -size, (w + 20) * clamp(p), size * 2); ctx.clip();
  ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fillText(text, 0, 0); ctx.globalAlpha = 0.35; ctx.fillText(text, 2, -2);
  ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.6; ctx.drawImage(dustLayer(), -x - 200, -y - 200);   // chalk grain bites the letters
  ctx.restore();
}
/** a label with a chalk underline, for naming parts */
export function label(text, x, y, size, col = CH.yellow, p = 1) { write(text, x, y, size, col, p); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width; chalk([[x - w / 2, y + size * 0.62], [x + w / 2, y + size * 0.62]], col, 6, p, 9); }

// ---------- figures and props ----------
/** a chalk person: round head, simple body; mood 'calm'|'wow'|'cold'; arms {L:[dx,dy], R:[dx,dy]} hand offsets from the shoulder */
export function person(x, y, s = 1, o = {}) {
  const p = o.p ?? 1, col = o.col || CH.white, mood = o.mood || 'calm', sh = o.shiver ? Math.sin((o.t || 0) * 50) * 4 : 0;
  ctx.save(); ctx.translate(x + sh, y); ctx.scale(s, s);
  circleC(0, -260, 70, col, 8, p, 11);
  const L = o.arms?.L || [-90, 120], R = o.arms?.R || [90, 120];
  chalk([[0, -190], [0, 40]], col, 9, p, 12); chalk([[0, -150], [L[0] * 0.5, -150 + L[1] * 0.45], [L[0], -150 + L[1]]], col, 8, p, 13); chalk([[0, -150], [R[0] * 0.5, -150 + R[1] * 0.45], [R[0], -150 + R[1]]], col, 8, p, 14);
  chalk([[0, 40], [-50, 200]], col, 9, p, 15); chalk([[0, 40], [50, 200]], col, 9, p, 16);
  if (p > 0.7) { circleC(-24, -270, 6, col, 7, 1, 17); circleC(24, -270, 6, col, 7, 1, 18);
    if (mood === 'wow') circleC(0, -228, 14, col, 6, 1, 19); else if (mood === 'cold') chalk(Array.from({ length: 7 }, (_, i) => [-26 + i * 9, -228 + (i % 2 ? 6 : -6)]), col, 5, 1, 20); else chalk(arc(0, -240, 26, 0.3, Math.PI - 0.3, 14), col, 6, 1, 21);
    if (o.headphones) { chalk(arc(0, -270, 84, Math.PI * 1.05, Math.PI * 1.95, 24), CH.blue, 9, 1, 22); circleC(-80, -262, 18, CH.blue, 9, 1, 23); circleC(80, -262, 18, CH.blue, 9, 1, 24); }
    if (o.bumps) for (let i = 0; i < 9; i++) { const u = (i + 0.5) / 9; circleC(R[0] * u * (u < 0.45 ? 1 : 1) , -150 + R[1] * u, 5 + 3 * o.bumps, CH.yellow, 5, o.bumps, 25 + i); } }
  ctx.restore();
}
export function note(x, y, s, col = CH.yellow, p = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); circleC(0, 0, 20, col, 8, p, 31); chalk([[18, 0], [18, -80], [50, -66]], col, 8, p, 32); ctx.restore(); }
export function snowflake(x, y, r, col = CH.blue, p = 1, rot = 0) { for (let k = 0; k < 6; k++) { const a = rot + k * Math.PI / 3, ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r; chalk([[x, y], [ex, ey]], col, 8, p, 40 + k);
  const bx = x + Math.cos(a) * r * 0.6, by = y + Math.sin(a) * r * 0.6; chalk([[bx + Math.cos(a + 0.8) * r * 0.25, by + Math.sin(a + 0.8) * r * 0.25], [bx, by], [bx + Math.cos(a - 0.8) * r * 0.25, by + Math.sin(a - 0.8) * r * 0.25]], col, 6, p, 50 + k); } }
export function bolt(x, y, s, col = CH.yellow, p = 1) { chalk([[x + 20 * s, y - 80 * s], [x - 20 * s, y], [x + 15 * s, y], [x - 25 * s, y + 80 * s]], col, 10, p, 60); }
/** a skin cross-section: skin line (with a bump of height `bump`), follicle, hair at angle `up` (0 lying, 1 upright), the small muscle */
export function skin(x, y, w, s, up = 0, bump = 0, p = 1, muscleOn = 0) {
  const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40, xx = x - w / 2 + u * w, b = Math.exp(-Math.pow((u - 0.5) / 0.12, 2)) * bump * 60 * s; pts.push([xx, y - b]); }
  chalk(pts, CH.pink, 10, p, 70); chalk([[x - w / 2, y + 230 * s], [x + w / 2, y + 230 * s]], CH.pink, 5, p, 71);   // the deeper skin layer stays flat
  const fx = x, fy = y + 140 * s; chalk(arc(fx, fy, 22 * s, 0, TAU, 20, 30 * s), CH.white, 6, p, 72);   // follicle bulb
  const ang = lerp(-0.3, -1.5, up), hx = fx + Math.cos(ang) * 250 * s, hy = fy + Math.sin(ang) * 250 * s;
  chalk([[fx, fy], [hx, hy]], CH.white, 9, p, 73);   // the hair
  const mx0 = fx - 150 * s, my0 = y + 60 * s, mx1 = fx - 16 * s, my1 = fy - 10 * s;   // the muscle, under the skin, to the follicle
  chalk([[mx0, my0], [lerp(mx0, mx1, 0.5), lerp(my0, my1, 0.5) + (1 - muscleOn) * 16 * s], [mx1, my1]], muscleOn > 0.5 ? CH.orange : CH.yellow, 14 + 8 * muscleOn, p, 74);
}
/** a round fluffy animal; puff 0..1 makes the fur stand up and the outline grow */
export function fluff(x, y, r, puff = 0, col = CH.white, p = 1) {
  const R = r * (1 + 0.35 * puff), n = 34;
  for (let i = 0; i < n; i++) { const a = i / n * TAU, l = r * (0.12 + 0.35 * puff); chalk([[x + Math.cos(a) * R * 0.92, y + Math.sin(a) * R * 0.92], [x + Math.cos(a) * (R * 0.92 + l), y + Math.sin(a) * (R * 0.92 + l)]], col, 6, p, 80 + i); }
  circleC(x, y, R * 0.92, col, 8, p, 79); circleC(x - R * 0.3, y - R * 0.15, 10, col, 8, p, 120); circleC(x + R * 0.3, y - R * 0.15, 10, col, 8, p, 121);
}
/** a side-on cat; puff 0..1 arches the back and bristles the tail and fur */
export function cat(x, y, s, puff = 0, col = CH.white, p = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); const arch = 60 + 110 * puff;
  const back = arc(0, 0, 200, Math.PI * 1.05, Math.PI * 1.95, 30, arch); chalk(back, col, 9, p, 130);
  chalk([[-190, 0], [-180, 150]], col, 9, p, 131); chalk([[-110, 20], [-100, 150]], col, 9, p, 132); chalk([[110, 20], [100, 150]], col, 9, p, 133); chalk([[185, 0], [180, 150]], col, 9, p, 134);
  chalk([[-200, 10], [200, 10]], col, 8, p, 135);
  circleC(250, -60, 62, col, 8, p, 136); chalk([[215, -110], [225, -160], [250, -118]], col, 8, p, 137); chalk([[260, -118], [290, -160], [295, -108]], col, 8, p, 138);
  circleC(235, -70, 7, col, 6, p, 139); circleC(270, -70, 7, col, 6, p, 140);
  const tail = Array.from({ length: 16 }, (_, i) => [-200 - i * 8, -10 - i * 14 - puff * i * 3]); chalk(tail, col, 10 + 14 * puff, p, 141);
  if (puff > 0.05) for (let i = 0; i < 22; i++) { const [bx, by] = back[Math.round(i / 21 * 30)], a = Math.atan2(by, bx); chalk([[bx, by], [bx + Math.cos(a) * 40 * puff, by + Math.sin(a) * 40 * puff]], col, 5, p, 150 + i); }
  ctx.restore();
}
/** chalk dust burst for emphasis */
export function poof(x, y, r, a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; for (let i = 0; i < 14; i++) { const an = i / 14 * TAU; chalk([[x + Math.cos(an) * r * 0.6, y + Math.sin(an) * r * 0.6], [x + Math.cos(an) * r, y + Math.sin(an) * r]], CH.white, 6, 1, 200 + i); } ctx.restore(); }
