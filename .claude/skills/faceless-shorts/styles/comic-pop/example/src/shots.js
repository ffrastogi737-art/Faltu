// GTA 6 JUST TIED THE HIGHEST SCORE EVER — style COMIC POP (bright sunburst backgrounds, sticker cards, thick ink outlines,
// thumbnail-style text). All art drawn in code: no game footage, logos, store pages or character art.
import { ctx, W, H, clamp, lerp, seg, eo, eio, eob, rnd, rr, circle, ell, line, fillAll } from './core/lib.js';
import { L, Wd, lineWords } from './core/timing.js';

// palette: loud, saturated, daytime
const V5 = '#2EE86B', V6 = '#FF3FA4', ORANGE = '#FF8A00', CYAN = '#00B8FF', GOLD = '#FFE600', RED = '#FF2D2D', INK = '#111111', PURPLE = '#7B4DFF';
const BG = [['#FFB800', '#FF5E00'], ['#00C6FF', '#0061FF'], ['#FF4FA3', '#B620E0'], ['#36E07A', '#00A6A6'], ['#FFE600', '#FF8A00'], ['#7B4DFF', '#3A1CC8']];
const nm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]+/g, '');
const WdX = (word, i) => { const w = lineWords(i).find((x) => nm(x.w) === nm(word)); if (!w) throw new Error(`no exact "${word}" in line ${i}`); return w.s; };
let SCENE = 0;                                                            // which background pair the current shot uses

/** thumbnail text: white (or coloured) fill, thick black outline, hard offset shadow */
function neon(text, x, y, size, col, sc = 1, rot = 0, a = 1, weight = 900) {
  if (sc <= 0 || a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot - 0.03); ctx.scale(sc, sc);
  ctx.font = `${weight} ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = INK; ctx.fillText(text, size * 0.07, size * 0.09); ctx.lineWidth = size * 0.17; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = col === GOLD || col === ORANGE ? GOLD : '#FFFFFF'; ctx.fillText(text, 0, 0);
  if (col !== GOLD && col !== ORANGE) { ctx.save(); ctx.beginPath(); ctx.rect(-2000, size * 0.12, 4000, size); ctx.clip(); ctx.fillStyle = col; ctx.globalAlpha = a * 0.35; ctx.fillText(text, 0, 0); ctx.restore(); }
  ctx.restore();
}
/** ink outline + coloured stroke (replaces neon glow) */
function glowStroke(col, w) { ctx.strokeStyle = INK; ctx.lineWidth = w + 10; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
/** sticker card: white card, thick ink border, coloured hard shadow */
function panel(x, y, w, h, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.rotate(-0.012);
  rr(-w / 2 + 16, -h / 2 + 18, w, h, 30); ctx.fillStyle = INK; ctx.fill(); rr(-w / 2, -h / 2, w, h, 30); ctx.fillStyle = col; ctx.fill();
  rr(-w / 2 + 14, -h / 2 + 14, w - 28, h - 28, 22); ctx.fillStyle = '#FFFFFF'; ctx.fill(); rr(-w / 2, -h / 2, w, h, 30); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
function chip(text, x, y, col, sc = 1, size = 46) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(-0.03); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width + size * 1.2, h = size * 1.6;
  rr(-w / 2 + 8, -h / 2 + 10, w, h, h / 2); ctx.fillStyle = INK; ctx.fill(); rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = col === GOLD || col === V5 || col === CYAN ? INK : '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 4); ctx.restore(); }
/** the world: a bright gradient with a slowly turning sunburst and halftone dots, one colour pair per shot */
function world(t, o = {}) {
  const [c1, c2] = BG[SCENE % BG.length], g = ctx.createRadialGradient(540, 820, 80, 540, 820, 1300); g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
  ctx.save(); ctx.translate(540, 820); ctx.rotate(t * 0.08); ctx.fillStyle = 'rgba(255,255,255,0.13)';
  for (let k = 0; k < 18; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 2400, k * Math.PI / 9, k * Math.PI / 9 + Math.PI / 18); ctx.closePath(); ctx.fill(); } ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 1250; y < H + 40; y += 34) for (let x = (y / 34) % 2 * 17; x < W; x += 34) { const r = 3 + (y - 1250) / 90; ctx.beginPath(); ctx.arc(x, y, Math.min(r, 14), 0, 7); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = -10; y < 330; y += 34) for (let x = (y / 34) % 2 * 17; x < W; x += 34) { const r = 10 - y / 40; if (r > 0) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } }
}
function dim() {}
function star(x, y, r, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(Math.sin(sc * 3) * 0.1); ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
/** comic burst behind a big reveal */
function burst(x, y, r, col, sc = 1, spikes = 14) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.beginPath(); for (let i = 0; i < spikes * 2; i++) { const a = i * Math.PI / spikes, q = i % 2 ? r * 0.72 : r * (0.95 + 0.08 * rnd(i)); ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.closePath();
  ctx.save(); ctx.translate(14, 16); ctx.fillStyle = INK; ctx.fill(); ctx.restore(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
function tick(x, y, s, ok) { if (s <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.arc(0, 0, 52, 0, 7); ctx.fillStyle = ok ? V5 : RED; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); if (ok) { ctx.moveTo(-22, 2); ctx.lineTo(-6, 20); ctx.lineTo(24, -18); } else { ctx.moveTo(-18, -18); ctx.lineTo(18, 18); ctx.moveTo(18, -18); ctx.lineTo(-18, 18); } ctx.stroke(); ctx.restore(); }
function consoleBox(x, y, s, col, label, sc = 1, a = 1) { if (sc <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s * sc, s * sc);
  rr(-62, -136, 140, 300, 26); ctx.fillStyle = INK; ctx.fill(); rr(-70, -150, 140, 300, 26); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
  rr(-24, -110, 48, 220, 14); ctx.fillStyle = col; ctx.fill(); ctx.stroke(); ctx.restore(); if (a > 0.5) chip(label, x, y + 150 * s * sc + 40, col, sc, 40); }
function bar(x, y, w, h, p, col, label, value) { rr(x + 10, y + 12, w, h, 22); ctx.fillStyle = INK; ctx.fill(); rr(x, y, w, h, 22); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  if (p > 0) { rr(x, y, Math.max(44, w * p), h, 22); ctx.fillStyle = col; ctx.fill(); } rr(x, y, w, h, 22); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
  ctx.font = '900 52px Inter'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left'; ctx.strokeText(label, x, y - 14); ctx.fillText(label, x, y - 14); ctx.textAlign = 'right'; ctx.strokeText(value, x + w, y - 14); ctx.fillStyle = GOLD; ctx.fillText(value, x + w, y - 14); }
/** the A / B vote buttons as big stickers */
function voteCard(x, y, letter, title, col, sc = 1, pulse = 0) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc * (1 + pulse * 0.05), sc * (1 + pulse * 0.05)); ctx.rotate(letter === 'A' ? -0.02 : 0.02);
  rr(-440, -140, 900, 300, 44); ctx.fillStyle = INK; ctx.fill(); rr(-450, -150, 900, 300, 44); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(-330, 0, 96, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '900 128px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, -330, 8);
  ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = '900 60px Inter'; title.forEach((tl, i) => ctx.fillText(tl, -200, -42 + i * 80));
  ctx.restore();
}
function scoreRing(x, y, r, p, val, col, sc = 1) {
  if (sc <= 0) return; burst(x, y, r * 1.45, GOLD, sc * (0.9 + 0.1 * p), 16);
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.beginPath(); ctx.arc(10, 12, r, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
  if (p > 0) { ctx.beginPath(); ctx.arc(0, 0, r - 30, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.lineCap = 'round'; ctx.lineWidth = 36; ctx.strokeStyle = V5; ctx.stroke(); }
  ctx.fillStyle = INK; ctx.font = `900 ${r * 0.95}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(val), 0, 10); ctx.restore();
}
function critic(x, y, s, col, a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s); ctx.lineWidth = 5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(-36, 30); ctx.quadraticCurveTo(-34, -12, 0, -14); ctx.quadraticCurveTo(34, -12, 36, 30); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -40, 22, 0, 7); ctx.fillStyle = '#FFD9B8'; ctx.fill(); ctx.stroke();
  rr(10, -22, 34, 42, 4); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.stroke(); ctx.restore(); }
function clock(x, y, r, hAng, mAng, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.beginPath(); ctx.arc(12, 14, r, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke();
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.sin(a) * r * 0.78, -Math.cos(a) * r * 0.78); ctx.lineTo(Math.sin(a) * r * 0.9, -Math.cos(a) * r * 0.9); ctx.lineWidth = 8; ctx.stroke(); }
  ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(hAng) * r * 0.5, -Math.cos(hAng) * r * 0.5); ctx.lineWidth = 18; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(mAng) * r * 0.75, -Math.cos(mAng) * r * 0.75); ctx.lineWidth = 12; ctx.strokeStyle = RED; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.restore(); }
function count(lt, t0, t1, to) { return Math.round(to * eo(seg(lt, t0, t1))); }

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);

  // 1 · GTA 6 just got a 99
  { const nn = Wd('ninety', 0), me = Wd('Metacritic', 0);
    add({ id: 'S01', at: 0, cam: [540, 760], zoom: 0.1, note: 'GTA VI title, ring fills and counts to 99 on "ninety-nine", CRITIC SCORE chip', draw(lt, d, t) { SCENE = 0;
      world(t); dim(0.25); neon('GTA VI', 540, 260, 130, V6, eob(seg(lt, 0.02, 0.25)));
      const p = eo(seg(lt, 0.3, nn + 0.4)); scoreRing(540, 720, 260, p * 0.99, count(lt, 0.3, nn + 0.4, 99), GOLD, eob(seg(lt, 0.1, 0.35)));
      chip('CRITIC SCORE · METACRITIC', 540, 1120, CYAN, lt > me - 0.2 ? eob(seg(lt, me - 0.2, me + 0.1)) : 0, 42);
    } });
    cue(0.02, 'slam', { gain: 0.5 }); cue(0.3, 'riser', { dur: nn + 0.1 }); cue(nn + 0.4, 'boom'); cue(me - 0.2, 'pop'); }

  // 2 · ties the highest score ever
  { const st = cut(1), ti = Wd('ties', 1) - st, ev = Wd('ever', 1) - st;
    add({ id: 'S02', at: st, cam: [540, 760], zoom: 0.08, note: 'gold crown + ALL-TIME HIGH; 99 ring small; TIED chip on "ties", EVER stamp', draw(lt, d, t) { SCENE = 1;
      world(t, { palms: 0 }); dim(0.3);
      scoreRing(540, 640, 200, 0.99, 99, GOLD, 1); star(540, 360, 80, GOLD, eob(seg(lt, ti - 0.1, ti + 0.2)));
      neon('ALL-TIME HIGH', 540, 1000, 110, ORANGE, lt > ti - 0.1 ? eob(seg(lt, ti - 0.1, ti + 0.2)) : 0);
      chip('TIED · RECORD', 540, 1180, GOLD, lt > ev - 0.2 ? eob(seg(lt, ev - 0.2, ev + 0.1)) : 0, 50);
    } });
    cue(st, 'swoosh'); cue(st + ti - 0.1, 'hit'); cue(st + ev - 0.2, 'ding'); cue(st + ev - 0.1, 'sparkle', { dur: 0.6 }); }

  // 3 · the only other one: Ocarina of Time, 1998
  { const st = cut(2), oc = Wd('Ocarina', 2) - st, ni = Wd('nineteen', 2) - st;
    add({ id: 'S03', at: st, cam: [540, 760], zoom: 0.08, note: 'two podium cards side by side, 99 each: GTA VI (pink) and OCARINA OF TIME (cyan), 1998 date chip', draw(lt, d, t) { SCENE = 2;
      world(t, { sun: 0 }); dim(0.35); neon('THE 99 CLUB', 540, 260, 110, GOLD, eob(seg(lt, 0.02, 0.25)));
      panel(90, 420, 420, 560, V6, eob(seg(lt, 0.05, 0.3))); neon('99', 300, 620, 170, V6, eob(seg(lt, 0.1, 0.35))); neon('GTA VI', 300, 820, 72, V6, eob(seg(lt, 0.1, 0.35))); chip('2026', 300, 920, V6, eob(seg(lt, 0.15, 0.4)), 40);
      const o = lt > oc - 0.2 ? eob(seg(lt, oc - 0.2, oc + 0.1)) : 0;
      ctx.globalAlpha = o > 0 ? 1 : 0.28; panel(570, 420, 420, 560, CYAN, 1); ctx.globalAlpha = 1;
      neon('99', 780, 620, 170, CYAN, o); neon('OCARINA', 780, 790, 64, CYAN, o); neon('OF TIME', 780, 860, 64, CYAN, o);
      chip('1998', 780, 920, CYAN, lt > ni - 0.1 ? eob(seg(lt, ni - 0.1, ni + 0.2)) : 0, 40);
      neon('=', 540, 700, 110, GOLD, o);
    } });
    cue(st, 'swoosh'); cue(st + 0.05, 'pop'); cue(st + oc - 0.2, 'hit'); cue(st + ni - 0.1, 'ding'); }

  // 4 · beats GTA 4 (98) and GTA 5 (97)
  { const st = cut(3), ro = Wd('Rockstar', 3) - st, g4 = Wd('ninety', 3) - st, w5 = lineWords(3).filter((w) => w.w.startsWith('ninety'))[1].s - st;
    add({ id: 'S04', at: st, cam: [540, 760], zoom: 0.06, note: 'ROCKSTAR RECORDS ladder: GTA VI 99 (lit), GTA IV 98 on "ninety-eight", GTA V 97 on "ninety-seven"', draw(lt, d, t) { SCENE = 3;
      world(t, { sun: 0, palms: 0 }); dim(0.35); neon('ROCKSTAR RECORDS', 540, 270, 92, ORANGE, 1, 0, lt > ro - 0.2 ? eo(seg(lt, ro - 0.2, ro + 0.1)) * 0.7 + 0.3 : 0.3);
      const B = [['GTA VI', 0.99, '99', V6, 0.1], ['GTA IV', 0.98, '98', CYAN, g4 - 0.15], ['GTA V', 0.97, '97', V5, w5 - 0.15]];
      B.forEach(([lab, p, v, c, t0], k) => { const on = lt > t0 ? eo(seg(lt, t0, t0 + 0.5)) : 0; ctx.globalAlpha = on > 0 ? 1 : 0.35; bar(120, 520 + k * 250, 840, 96, (p - 0.9) * 10 * on, c, lab, on > 0 ? v : '?'); ctx.globalAlpha = 1; });
      chip('#1', 940, 470, GOLD, lt > w5 + 0.3 ? eob(seg(lt, w5 + 0.3, w5 + 0.55)) : 0, 46);
    } });
    cue(st, 'swoosh'); cue(st + ro - 0.2, 'pop'); cue(st + g4 - 0.15, 'slide', { dur: 0.5 }); cue(st + w5 - 0.15, 'slide', { dur: 0.5 }); cue(st + w5 + 0.3, 'hit'); cue(st + w5 + 0.35, 'coin'); }

  // 5 · not one review, 100+ critics
  { const st = cut(4), on = Wd('one', 4) - st, hu = Wd('hundred', 4) - st;
    add({ id: 'S05', at: st, cam: [540, 760], zoom: 0.08, note: 'one critic, then a crowd of 100+ critics fills the grid on "hundred", 100+ CRITICS', draw(lt, d, t) { SCENE = 4;
      world(t, { palms: 0 }); dim(0.3);
      const fill = lt > hu - 0.6 ? eo(seg(lt, hu - 0.6, hu + 0.6)) : 0, N = 104;
      for (let k = 0; k < N; k++) { const cx = 130 + (k % 9) * 103, cy = 440 + Math.floor(k / 9) * 72, first = k === 49;
        if (!first) critic(cx, cy, 0.9, [V6, CYAN, V5, ORANGE][k % 4], fill * N > k ? 1 : 0.12); }
      if (fill < 0.5) critic(540, 760, 2.4, GOLD, eob(seg(lt, on - 0.3, on)) * (1 - fill * 2));
      neon(lt > hu - 0.1 ? '100+ CRITICS' : 'ONE REVIEW?', 540, 300, 100, lt > hu - 0.1 ? GOLD : RED, eob(seg(lt, 0.05, 0.3)));
    } });
    cue(st, 'swoosh'); cue(st + on - 0.3, 'pop'); cue(st + hu - 0.9, 'riser', { dur: 0.9 }); cue(st + hu, 'boom'); cue(st + hu + 0.05, 'applause', { dur: 2.0 }); }

  // 6 · score can still move
  { const st = cut(5), mv = Wd('move', 5) - st, ton = Wd('tonight', 5) - st;
    add({ id: 'S06', at: st, cam: [540, 760], zoom: 0.08, note: 'a live meter with a needle wobbling around 99, LIVE chip blinking, WATCH TONIGHT chip', draw(lt, d, t) { SCENE = 5;
      world(t); dim(0.35);
      panel(140, 420, 800, 520, CYAN, eob(seg(lt, 0.02, 0.25))); chip('LIVE', 260, 470, RED, (Math.sin(lt * 6) > -0.3) ? 1 : 0.4, 40);
      ctx.save(); ctx.beginPath(); for (let i = 0; i <= 60; i++) { const x = 200 + i * 11.5, y = 720 - Math.sin(i * 0.7 + lt * 4) * (lt > mv - 0.2 ? 30 : 8) - i * 0.6; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } glowStroke(GOLD, 8, 20); ctx.restore();
      neon('99', 820, 640, 120, GOLD, 1); neon('MAY MOVE', 540, 860, 70, CYAN, lt > mv - 0.2 ? eob(seg(lt, mv - 0.2, mv + 0.1)) : 0);
      chip('WATCH IT TONIGHT', 540, 1120, ORANGE, lt > ton - 0.3 ? eob(seg(lt, ton - 0.3, ton)) : 0, 46);
    } });
    cue(st, 'swoosh'); cue(st + mv - 0.2, 'pop'); cue(st + ton - 0.3, 'ding'); }

  // 7 · pre-loaded? unlocks at midnight, PS5 + Xbox
  { const st = cut(6), pr = Wd('pre', 6) - st, mi = Wd('midnight', 6) - st, ps = Wd('PS5', 6) - st, xb = Wd('Xbox', 6) - st;
    add({ id: 'S07', at: st, cam: [540, 760], zoom: 0.08, note: 'PRE-LOAD 100% bar, clock hands sweep to 12 on "midnight", REPORTED chip, PS5 + XBOX consoles light up', draw(lt, d, t) { SCENE = 6;
      world(t, { sun: 0 }); dim(0.35);
      bar(160, 330, 760, 70, eo(seg(lt, pr - 0.2, pr + 0.6)), V5, 'PRE-LOAD', lt > pr + 0.6 ? '100%' : Math.round(100 * eo(seg(lt, pr - 0.2, pr + 0.6))) + '%');
      const sw = eo(seg(lt, 0.4, mi)); clock(540, 690, 200, (1 - sw) * 1.8 + sw * Math.PI * 2, (1 - sw) * 4.5 + sw * Math.PI * 2, GOLD, eob(seg(lt, 0.1, 0.35)));
      neon('MIDNIGHT', 540, 950, 96, GOLD, lt > mi - 0.1 ? eob(seg(lt, mi - 0.1, mi + 0.2)) : 0);
      chip('REPORTED · STORE LISTINGS', 540, 1060, GOLD, lt > mi + 0.2 ? eob(seg(lt, mi + 0.2, mi + 0.45)) : 0, 34);
      consoleBox(380, 1290, 0.75, V6, 'PS5', 1, lt > ps - 0.1 ? 1 : 0.28); consoleBox(700, 1290, 0.75, V5, 'XBOX', 1, lt > xb - 0.1 ? 1 : 0.28);
    } });
    cue(st, 'swoosh'); cue(st + pr - 0.2, 'riser', { dur: 0.8 }); cue(st + 0.4, 'tickclock', { dur: mi - 0.6 }); cue(st + mi - 0.1, 'boom'); cue(st + ps - 0.1, 'pop'); cue(st + xb - 0.1, 'pop'); }

  // 8 · vote
  { const st = cut(7), a = WdX('A', 7) - st, b = WdX('B', 7) - st;
    const VA = ['WHAT THEY', 'LOVED MOST'], VB = ['WHAT THEY', "DIDN'T LIKE"];
    add({ id: 'S08', at: st, cam: [540, 820], zoom: 0.05, note: 'PART 2? two vote cards: A loved, B did not like', draw(lt, d, t) { SCENE = 7;
      world(t, { palms: 0 }); dim(0.45);
      neon('PART 2?', 540, 330, 140, ORANGE, eob(seg(lt, 0.05, 0.3)), Math.sin(lt * 3) * 0.02);
      if (lt < a - 0.1) { ctx.globalAlpha = 0.25 * eo(seg(lt, 0.2, 0.5)); voteCard(540, 640, 'A', VA, V5, 0.92); voteCard(540, 1020, 'B', VB, RED, 0.92); ctx.globalAlpha = 1; }
      voteCard(540, 640, 'A', VA, V5, lt > a - 0.1 ? eob(seg(lt, a - 0.1, a + 0.15)) : 0);
      voteCard(540, 1020, 'B', VB, RED, lt > b - 0.1 ? eob(seg(lt, b - 0.1, b + 0.15)) : 0);
    } });
    cue(st, 'swoosh'); cue(st + 0.05, 'hit'); cue(st + a - 0.1, 'ding'); cue(st + b - 0.1, 'ding'); }

  // 9 · comment A or B
  { const st = cut(8); const VA = ['WHAT THEY', 'LOVED MOST'], VB = ['WHAT THEY', "DIDN'T LIKE"];
    add({ id: 'S09', at: st, cam: [540, 820], zoom: 0.06, note: 'both cards pulse, COMMENT, A / B', draw(lt, d, t) { SCENE = 8;
      world(t, { palms: 0 }); dim(0.45);
      voteCard(540, 640, 'A', VA, V5, 1, Math.max(0, Math.sin(lt * 6)));
      voteCard(540, 1020, 'B', VB, RED, 1, Math.max(0, Math.sin(lt * 6 + Math.PI)));
      neon('COMMENT', 540, 330, 120, GOLD, eob(seg(lt, 0.05, 0.3)));
      neon('A  /  B', 540, 1330, 110, ORANGE, eob(seg(lt, 0.3, 0.55)));
    } });
    cue(st, 'swoosh'); cue(st + 0.05, 'pop'); cue(st + 0.3, 'pop'); }

  return { shots: S, cues: CUES };
}
