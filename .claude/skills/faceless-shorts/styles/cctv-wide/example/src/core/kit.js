// CCTV Dossier kit (16:9, 1920x1080): a dark surveillance-room look. Slate screens, amber alerts, red danger,
// green "confirmed", cyan info. Everything is drawn here: no game footage, logos or character art.
import { ctx, W, H, clamp, lerp, seg, eo, eob, rnd, rr, circle, ell, TAU } from './lib.js';

export const K = { bg: '#070A0F', panel: '#111823', edge: '#2A3647', amber: '#FFB000', red: '#FF4040', cyan: '#38BDF8', green: '#4ADE80', white: '#E8EEF2', dim: '#7C8896', ink: '#05070B' };

/** text with optional scale / alpha / weight. align: center | left | right */
export function text(s, x, y, size, col = K.white, o = {}) {
  const { a = 1, sc = 1, align = 'center', weight = 900, mono = false, rot = 0, glow = 0 } = o; if (a <= 0 || sc <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.font = mono ? `700 ${size}px "DejaVu Sans Mono", monospace` : `${weight} ${size}px Inter`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
  ctx.fillStyle = col; ctx.fillText(s, 0, 0); ctx.restore();
}
export function card(x, y, w, h, col = K.edge, sc = 1, a = 1, fill = K.panel) {
  if (sc <= 0 || a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc);
  rr(-w / 2, -h / 2, w, h, 14); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(-w / 2 + 14, -h / 2 - 1, 70, 6); ctx.restore();
}
export function chip(s, x, y, col, sc = 1, size = 34, solid = true) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(s).width + size * 1.1;
  rr(-w / 2, -size * 0.8, w, size * 1.6, size * 0.8); if (solid) { ctx.fillStyle = col; ctx.fill(); } else { ctx.fillStyle = 'rgba(5,7,11,0.85)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); }
  ctx.fillStyle = solid ? K.ink : col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 0, 2); ctx.restore();
}
/** a rubber-stamp: outlined text, rotated; sc animates the slam */
export function stamp(s, x, y, col, sc = 1, size = 64, rot = -0.08) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(s).width + size;
  ctx.globalAlpha = Math.min(1, sc); rr(-w / 2, -size * 0.75, w, size * 1.5, 10); ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 0, 3); ctx.restore();
}
export function brackets(x, y, w, h, col, len = 36, a = 1, lw = 5) {
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'square'; ctx.beginPath();
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.moveTo(cx, cy + sy * len); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * len, cy); }
  ctx.stroke(); ctx.restore();
}
export function ln(x0, y0, x1, y1, col, w = 4, p = 1, dash = null) {
  if (p <= 0) return; ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, p), lerp(y0, y1, p)); ctx.stroke(); ctx.restore();
}
export function star(x, y, r, fill, glow = 0) {
  ctx.save(); if (glow) { ctx.shadowColor = fill; ctx.shadowBlur = glow; } ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr_ = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * rr_, y + Math.sin(a) * rr_); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
export function qmark(x, y, size, col = K.amber, a = 1, t = 0) { text('?', x, y + Math.sin(t * 4) * 6, size, col, { a, glow: 24 }); }

// ── the always-on layer: background, scanlines, vignette, HUD ─────────────────────────────────────────
export function background(t) {
  ctx.fillStyle = K.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,150,190,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = 0; y <= H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
}
export function overlay(t, habit, total = 8) {
  // scanlines + vignette + a slow roll bar + film specks (all pure functions of t)
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.4);
  const rb = ((t * 90) % (H + 300)) - 150; const g = ctx.createLinearGradient(0, rb - 90, 0, rb + 90); g.addColorStop(0, 'rgba(160,200,255,0)'); g.addColorStop(0.5, 'rgba(160,200,255,0.035)'); g.addColorStop(1, 'rgba(160,200,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, rb - 90, W, 180);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const f = Math.floor(t * 12); ctx.fillStyle = 'rgba(255,255,255,0.10)'; for (let i = 0; i < 40; i++) ctx.fillRect(rnd(i + f * 7.3) * W, rnd(i * 3 + f * 1.9) * H, 2, 2);
  // HUD
  brackets(40, 40, W - 80, H - 80, 'rgba(255,176,0,0.75)', 44, 1, 4);
  const on = Math.floor(t * 1.6) % 2 === 0; circle(96, 92, 12, on ? K.red : '#5a1a1a'); text('REC', 124, 93, 28, K.white, { align: 'left', mono: true });
  text(`CAM ${String(1 + (habit || 0)).padStart(2, '0')}  LEONIDA`, 230, 93, 28, K.dim, { align: 'left', mono: true });
  const s = Math.floor(t), tc = `19-NOV-2026  ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  text(tc, W - 96, 93, 28, K.dim, { align: 'right', mono: true });
  // habit progress pips (top centre)
  for (let i = 0; i < total; i++) { const x = W / 2 - (total - 1) * 22 + i * 44, act = habit === i + 1, done = habit > i + 1; rr(x - 15, 80, 30, 24, 6); ctx.fillStyle = act ? K.amber : done ? 'rgba(255,176,0,0.4)' : 'rgba(124,136,150,0.25)'; ctx.fill(); }
}

// ── drawn things ──────────────────────────────────────────────────────────────────────────────────────
export function car(x, y, s = 1, col = '#8aa0b8', o = {}) {
  const { flip = 1, lights = 0, a = 1 } = o; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s * flip, s);
  if (lights) { const g = ctx.createLinearGradient(100, 0, 360, 0); g.addColorStop(0, `rgba(255,240,180,${0.5 * lights})`); g.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(100, -14); ctx.lineTo(360, -60); ctx.lineTo(360, 50); ctx.lineTo(100, 8); ctx.fill(); }
  rr(-100, -34, 200, 46, 14); ctx.fillStyle = col; ctx.fill(); ctx.beginPath(); ctx.moveTo(-58, -34); ctx.lineTo(-34, -70); ctx.lineTo(40, -70); ctx.lineTo(70, -34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0b1420'; ctx.beginPath(); ctx.moveTo(-46, -37); ctx.lineTo(-28, -63); ctx.lineTo(-2, -63); ctx.lineTo(-2, -37); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, -37); ctx.lineTo(6, -63); ctx.lineTo(36, -63); ctx.lineTo(58, -37); ctx.fill();
  for (const wx of [-56, 58]) { circle(wx, 12, 22, '#05070B'); circle(wx, 12, 10, '#46515f'); } circle(96, -12, 7, lights ? '#fff3b0' : '#c9b87a'); circle(-98, -14, 6, '#c0392b'); ctx.restore();
}
export function copCar(x, y, s = 1, t = 0, flip = 1) {
  car(x, y, s, '#dfe6ee', { flip }); const f = Math.floor(t * 6) % 2; ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s);
  ctx.shadowColor = f ? K.red : K.cyan; ctx.shadowBlur = 50; rr(-24, -82, 22, 12, 3); ctx.fillStyle = f ? K.red : '#401414'; ctx.fill(); rr(2, -82, 22, 12, 3); ctx.fillStyle = f ? '#1a2a4a' : K.cyan; ctx.fill(); ctx.restore();
}
export function person(x, y, s = 1, col = '#9fb2c8', a = 1) {   // faceless silhouette, feet at y
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col;
  circle(0, -250, 34, col); rr(-48, -208, 96, 120, 30); ctx.fill(); rr(-44, -96, 38, 96, 12); ctx.fill(); rr(6, -96, 38, 96, 12); ctx.fill(); rr(-76, -204, 24, 100, 12); ctx.fill(); rr(52, -204, 24, 100, 12); ctx.fill(); ctx.restore();
}
export function shirt(x, y, s = 1, col = K.cyan, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(-40, -60); ctx.lineTo(-16, -72); ctx.quadraticCurveTo(0, -50, 16, -72); ctx.lineTo(40, -60); ctx.lineTo(70, -20); ctx.lineTo(48, -4); ctx.lineTo(34, -22); ctx.lineTo(34, 60); ctx.lineTo(-34, 60); ctx.lineTo(-34, -22); ctx.lineTo(-48, -4); ctx.lineTo(-70, -20); ctx.closePath(); ctx.fill(); ctx.restore();
}
export function camera(x, y, s = 1, t = 0, cone = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); const ang = Math.sin(t * 1.2) * 0.35;
  if (cone) { ctx.save(); ctx.rotate(0.5 + ang); const g = ctx.createLinearGradient(0, 0, 360, 0); g.addColorStop(0, 'rgba(56,189,248,0.35)'); g.addColorStop(1, 'rgba(56,189,248,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(380, -130); ctx.lineTo(380, 130); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = K.edge; ctx.fillRect(-60, -70, 12, 90); rr(-52, -56, 100, 46, 10); ctx.fillStyle = '#c9d4e0'; ctx.fill(); circle(58, -33, 18, '#0b1420'); circle(58, -33, 8, K.cyan); circle(-30, -33, 6, Math.floor(t * 1.6) % 2 ? K.red : '#5a1a1a'); ctx.restore();
}
export function cloud(x, y, s = 1, col = '#5b6b80') { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; for (const [cx, cy, r] of [[-60, 10, 44], [-10, -14, 58], [50, 6, 48], [90, 18, 34]]) circle(cx, cy, r, col); ctx.fillRect(-90, 14, 200, 38); ctx.restore(); }
export function bolt(x, y, s = 1, col = K.amber) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(10, -60); ctx.lineTo(-30, 8); ctx.lineTo(-4, 8); ctx.lineTo(-18, 60); ctx.lineTo(34, -14); ctx.lineTo(6, -14); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
/** hurricane: rotating spiral arms with a calm eye */
export function hurricane(x, y, r, t, col = K.cyan, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.lineCap = 'round'; ctx.shadowColor = col; ctx.shadowBlur = 24;
  for (let arm = 0; arm < 4; arm++) { ctx.beginPath(); for (let i = 0; i <= 60; i++) { const u = i / 60, ang = arm * TAU / 4 + u * 4.2 - t * 1.4, rad = r * (0.12 + 0.88 * u); ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.9); } ctx.strokeStyle = col; ctx.lineWidth = 16 - arm; ctx.globalAlpha = a * 0.75; ctx.stroke(); }
  ctx.globalAlpha = a; circle(0, 0, r * 0.1, K.bg); ctx.restore();
}
export function rain(x0, y0, w, h, t, a = 0.5) { ctx.save(); ctx.strokeStyle = `rgba(150,200,255,${a})`; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 70; i++) { const x = x0 + rnd(i) * w, y = y0 + ((rnd(i + 5) * h + t * 700) % h); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 26); } ctx.stroke(); ctx.restore(); }
export function gator(x, y, s = 1, col = '#4d8a5a') { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; rr(-110, -22, 190, 44, 22); ctx.fill(); ctx.beginPath(); ctx.moveTo(60, -16); ctx.lineTo(150, -6); ctx.lineTo(150, 12); ctx.lineTo(60, 20); ctx.fill(); ctx.beginPath(); ctx.moveTo(-100, -10); ctx.lineTo(-170, 6); ctx.lineTo(-100, 14); ctx.fill(); for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-80 + i * 26, -22); ctx.lineTo(-70 + i * 26, -36); ctx.lineTo(-60 + i * 26, -22); ctx.fill(); } circle(70, -22, 6, '#e6e6a0'); for (const lx of [-70, 20]) { rr(lx, 12, 20, 30, 6); ctx.fill(); } ctx.restore(); }
export function manatee(x, y, s = 1, col = '#8b9aa8') { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ell(0, 0, 120, 54, col); ell(120, 6, 36, 30, col); ctx.beginPath(); ctx.moveTo(-100, 0); ctx.quadraticCurveTo(-190, -40, -170, 30); ctx.quadraticCurveTo(-130, 40, -100, 20); ctx.fillStyle = col; ctx.fill(); ell(30, 40, 38, 14, '#738291', 0.4); circle(138, -6, 5, K.ink); ctx.restore(); }
export function flamingo(x, y, s = 1, col = '#ff7aa8') { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ell(0, -80, 64, 38, col, -0.2); ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(40, -90); ctx.bezierCurveTo(110, -150, 20, -210, 70, -250); ctx.stroke(); circle(72, -252, 15, col); ctx.fillStyle = K.ink; ctx.beginPath(); ctx.moveTo(84, -254); ctx.lineTo(116, -240); ctx.lineTo(84, -240); ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-6, -48); ctx.lineTo(-6, 40); ctx.moveTo(16, -48); ctx.lineTo(26, 40); ctx.stroke(); ctx.restore(); }
export function bird(x, y, s = 1, col = K.cyan, flap = 0) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-36, -8 - flap * 14); ctx.quadraticCurveTo(-16, 8, 0, 0); ctx.quadraticCurveTo(16, 8, 36, -8 - flap * 14); ctx.stroke(); ctx.restore(); }
export function disk(x, y, w, h, fill, col = K.cyan, label) { rr(x, y, w, h, 18); ctx.fillStyle = '#0b1420'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = K.edge; ctx.stroke(); if (fill > 0) { ctx.save(); rr(x, y, w, h, 18); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x, y, w * fill, h); ctx.restore(); } if (label) text(label, x + w / 2, y + h / 2, h * 0.5, fill > 0.5 ? K.ink : K.white); }
export function clock(x, y, r, hrs, mins, col = K.amber) { circle(x, y, r, '#0b1420'); ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); ctx.lineWidth = 4; ctx.stroke(); } const hand = (ang, len, w) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(ang) * len, y - Math.cos(ang) * len); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); }; hand((hrs % 12 + mins / 60) * TAU / 12, r * 0.5, 9); hand(mins * TAU / 60, r * 0.78, 6); circle(x, y, 9, col); }
export function eye(x, y, s, col = K.cyan, blink = 0) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s * (1 - 0.9 * blink)); ctx.beginPath(); ctx.moveTo(-90, 0); ctx.quadraticCurveTo(0, -80, 90, 0); ctx.quadraticCurveTo(0, 80, -90, 0); ctx.lineWidth = 8; ctx.strokeStyle = col; ctx.stroke(); circle(0, 0, 28, col); circle(0, 0, 12, K.ink); ctx.restore(); }
export function trash(x, y, s, col = K.red) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-44, -30); ctx.lineTo(-34, 56); ctx.lineTo(34, 56); ctx.lineTo(44, -30); ctx.closePath(); ctx.moveTo(-58, -30); ctx.lineTo(58, -30); ctx.moveTo(-16, -30); ctx.lineTo(-16, -48); ctx.lineTo(16, -48); ctx.lineTo(16, -30); ctx.stroke(); ctx.restore(); }
/** an invented island/peninsula blob (never a real map) */
export function landmass(cx, cy, r, seed, col, a = 1, edge = null) {
  ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); for (let i = 0; i <= 40; i++) { const an = i / 40 * TAU, k = 1 + 0.28 * Math.sin(an * 3 + seed) + 0.16 * Math.sin(an * 5 + seed * 2.1); const x = cx + Math.cos(an) * r * k * 1.15, y = cy + Math.sin(an) * r * k * 0.8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); if (edge) { ctx.lineWidth = 4; ctx.strokeStyle = edge; ctx.stroke(); } ctx.restore();
}
export function marker(x, y, label, col, sc = 1, side = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); circle(0, 0, 11, col); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke(); ln(0, 0, side * 46, -34, col, 3); text(label, side * 54, -38, 30, K.white, { align: side > 0 ? 'left' : 'right' }); ctx.restore(); }
