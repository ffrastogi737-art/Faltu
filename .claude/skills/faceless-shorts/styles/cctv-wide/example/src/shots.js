// GTA 5 HABITS THAT WILL GET YOU CAUGHT IN GTA 6: CCTV Dossier style (16:9). Every frame is drawn here from shapes:
// no game footage, screenshots, logos or character art. Reveals land on the spoken word (Wd).
import { ctx, W, H, clamp, lerp, seg, eo, eio, eob, rnd, rr, circle, ell, TAU } from './core/lib.js';
import { L, Wd, T } from './core/timing.js';
import { K, text, card, chip, stamp, brackets, ln, star, qmark, car, copCar, person, shirt, camera, cloud, bolt, hurricane, rain, gator, manatee, flamingo, bird, disk, clock, eye, trash, landmass, marker } from './core/kit.js';

const FEED = [120, 150, 1680, 730];               // x, y, w, h of the "camera feed" frame
export function buildShots() {
  const S = [], CUES = [], cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  // scene(line, startWord|null, habit, note, fn, cues): one shot. fn gets {lt, d, t, w, A, E} (A = pop-in 0..1 on a word, E = has the word been said)
  let nCut = 0; const CUTS = ['whip', 'glitch', 'whip', 'flash'];
  function scene(line, sw, habit, note, fn, cues = [], o = {}) {
    const st = sw ? Wd(sw, line) - 0.1 : L(line), w = (word, ln_ = line) => Wd(word, ln_) - st;
    const cut = o.cut || CUTS[nCut++ % CUTS.length]; S.push({ id: `L${line}${sw ? '-' + sw : ''}`, at: st, habit, note, cut, draw: (lt, d, t) => fn({ lt, d, t, st, w, A: (word, dur = 0.3, l = line) => eob(seg(lt, w(word, l), w(word, l) + dur)), E: (word, l = line) => lt >= w(word, l) }) });
    if (S.length > 1) { if (cut === 'whip') cue(st, 'whoosh', { gain: 1.0 }); else if (cut === 'glitch') cue(st, 'glitch', { gain: 0.9 }); else cue(st, 'slam', { gain: 0.45 }); } if (o.riser) { cue(st - 1.0, 'riser', { gain: 0.9 }); cue(st, 'boom', { gain: 1.0 }); } for (const [word, type, gain] of cues) cue(st + w(word), type, { gain: gain ?? 0.6 });
  }
  cue(0.15, 'slam', { gain: 0.9 }); cue(0.65, 'slam', { gain: 1.0 }); cue(0.65, 'boom', { gain: 1.0 });
  const conf = (a, x = 960, y = 190, label = 'CONFIRMED · GAME INFORMER') => chip(label, x, y, K.green, a, 28);
  const unk = (lt, t, x, y, label, a) => { card(x - 250, y - 70, 500, 140, K.amber, a); qmark(x - 190, y, 90, K.amber, a, t); text(label, x + 30, y, 40, K.white, { a }); };

  // ── shared pieces ────────────────────────────────────────────────────────────
  const feedFrame = (a = 1) => { const [x, y, w, h] = FEED; ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#0a1019'; ctx.fillRect(x, y, w, h); ctx.restore(); };
  const streetBase = (t) => {                      // the night-street camera feed
    const [fx, fy, fw, fh] = FEED; ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
    const g = ctx.createLinearGradient(0, fy, 0, fy + 420); g.addColorStop(0, '#0b1424'); g.addColorStop(1, '#1b2a44'); ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, 460);
    for (let i = 0; i < 16; i++) { const bx = fx + i * 112 - 20, bh = 180 + rnd(i) * 230; ctx.fillStyle = '#0e1726'; ctx.fillRect(bx, fy + 460 - bh, 100, bh); for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) if (rnd(i * 31 + r * 5 + c) > 0.55) { ctx.fillStyle = rnd(i + r + c) > 0.5 ? 'rgba(255,200,100,0.65)' : 'rgba(150,200,255,0.5)'; ctx.fillRect(bx + 14 + c * 28, fy + 460 - bh + 18 + r * 32, 16, 18); } }
    ctx.fillStyle = '#131b27'; ctx.fillRect(fx, fy + 460, fw, 270); ctx.fillStyle = '#0f1620'; ctx.fillRect(fx, fy + 460, fw, 40);
    ctx.fillStyle = '#18222f'; ctx.beginPath(); ctx.moveTo(1240, fy + 460); ctx.lineTo(1360, fy + 460); ctx.lineTo(1420, fy + 40 + 0); ctx.lineTo(1300, fy + 40); ctx.fill();   // the side street
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 14; k++) ctx.fillRect(fx + ((k * 140 - t * 160) % (fw + 140) + fw + 140) % (fw + 140) - 70, fy + 630, 70, 8);
    ctx.restore(); brackets(fx, fy, fw, fh, 'rgba(56,189,248,0.7)', 50, 1, 4);
  };
  const planCard = (o) => { const { lt, t, w, A, E } = o.h, rows = o.rows; card(300, 210, 1320, 560, K.amber, eob(seg(lt, 0.05, 0.35)));
    chip('MY PLAN', 420, 262, K.amber, eob(seg(lt, 0.1, 0.4)), 34);
    rows.forEach((r, i) => { const y = 400 + i * 120, a = A(r.word), sc = 1; if (a <= 0) return; text(r.txt, 380, y, r.size || 56, r.col || K.white, { align: 'left', a: Math.min(1, a), sc });
      if (r.strike && E(r.strike)) { const p = eo(seg(lt, w(r.strike), w(r.strike) + 0.4)); ctx.save(); ctx.font = `900 ${r.size || 56}px Inter`; const tw = ctx.measureText(r.txt).width; ctx.restore(); ln(370, y + 2, 370 + tw + 20, y + 2, K.red, 8, p); } });
    (o.icons || []).forEach((ic) => { const a = A(ic.word); if (a > 0) ic.fn(ic.x, ic.y, a); });
  };
  const titleCard = (n, l1, l2, o) => { const { lt, d, t } = o, a = eob(seg(lt, 0, 0.35)), a2 = eo(seg(lt, 0.15, 0.5)); ctx.save(); ctx.font = '900 92px Inter'; const mw = Math.max(ctx.measureText(l1).width, l2 ? ctx.measureText(l2).width : 0); ctx.restore(); const fs = Math.min(92, 92 * 900 / mw);
    text(String(n).padStart(2, '0'), 470, 480, 560, K.amber, { a, glow: 36, sc: lerp(2.2, 1, a), font: 'Anton' }); text('HABIT TO UNLEARN', 880, 330, 38, K.dim, { align: 'left', a: a2, mono: true });
    text(l1, 880, 450, fs * 1.25, K.white, { align: 'left', a: a2, font: 'Anton' }); if (l2) text(l2, 880, 560, fs * 1.25, K.white, { align: 'left', a: a2, font: 'Anton' }); ln(880, 640, 880 + 760, 640, K.amber, 8, eo(seg(lt, 0.2, 0.8))); };

  // ── 0 · hook ──────────────────────────────────────────────────────────────────
  scene(0, null, 0, 'night street: a car turns two corners', ({ lt, t, w, A, E }) => {
    streetBase(t); const p = seg(lt, w('steal'), w('corners') + 0.9);
    const x = p < 0.62 ? lerp(-260, 1320, eio(p / 0.62)) : 1320, y = p < 0.62 ? 790 : lerp(790, 360, eio((p - 0.62) / 0.38)), s = p < 0.62 ? 1.7 : lerp(1.7, 0.7, eio((p - 0.62) / 0.38));
    if (E('steal')) { car(x, y, s, '#9db3c9', { lights: 1 }); const a = eob(seg(lt, w('steal'), w('steal') + 0.3)); brackets(x - 120 * s, y - 80 * s, 240 * s, 130 * s, K.amber, 22, a); chip('STOLEN CAR', x, y - 100 * s, K.amber, a, 26); }
    if (E('turn')) chip('TURN 1', 760, 560, K.cyan, eob(seg(lt, w('turn'), w('turn') + 0.3)), 28); if (E('corners')) chip('TURN 2', 1480, 560, K.cyan, eob(seg(lt, w('corners'), w('corners') + 0.3)), 28);
  }, [['steal', 'pop'], ['turn', 'tock'], ['corners', 'tock']]);
  scene(0, 'police', 0, 'cop car rolls past and forgets', ({ lt, t, w, A, E }) => {
    streetBase(t); car(1320, 330, 0.7, '#4a5a6e', { lights: 0, a: 0.6 }); const cx = lerp(1900, -300, eio(seg(lt, 0, w('existed') + 0.6)));
    copCar(cx, 790, 2.0, t, -1); chip('LOST YOU', 1320, 250, K.green, E('forgot') ? eob(seg(lt, w('forgot'), w('forgot') + 0.3)) : 0, 34);
    if (E('forgot')) qmark(cx, 600, 110, K.amber, 1, t);
  }, [['forgot', 'pop']]);
  scene(1, null, 0, 'caught: cops close in, brackets tighten', ({ lt, t, w, A, E }) => {
    streetBase(t); const k = eo(seg(lt, 0, 1.2)); copCar(lerp(-200, 330, k), 790, 2.0, t, 1); copCar(lerp(2100, 1590, k), 790, 2.0, t, -1); car(960, 790, 1.8, '#9db3c9');
    brackets(960 - lerp(700, 190, k), 790 - lerp(560, 150, k), lerp(1400, 380, k), lerp(760, 220, k), K.red, 36, 1, 6); stamp('CAUGHT', 960, 380, K.red, E('caught') ? eob(seg(lt, w('caught'), w('caught') + 0.18)) : 0, 120, -0.06);
  }, [['caught', 'slam', 0.7]]);
  scene(2, null, 0, 'two stamps: CONFIRMED vs REPORTED', ({ lt, t, w, A, E }) => {
    card(160, 230, 740, 470, K.green, eob(seg(lt, 0.1, 0.4))); card(1020, 230, 740, 470, K.amber, A('reported', 0.3));
    stamp('CONFIRMED', 530, 350, K.green, A('confirmed', 0.2), 74, -0.05); text('Rockstar statements and', 530, 480, 38, K.white, { a: A('confirmed', 0.4) }); text('the Game Informer cover story', 530, 535, 38, K.white, { a: A('confirmed', 0.5) });
    stamp('REPORTED', 1390, 350, K.amber, A('reported', 0.2), 74, 0.05); text('Several reliable outlets,', 1390, 480, 38, K.white, { a: A('reported', 0.4) }); text('not official', 1390, 535, 38, K.white, { a: A('reported', 0.5) });
    text("I'LL TELL YOU WHICH IS WHICH", 960, 800, 52, K.cyan, { a: A('tell', 0.4) });
  }, [['confirmed', 'slam', 0.5], ['reported', 'slam', 0.5]]);
  scene(3, null, 0, 'launch date card + reviews loading', ({ lt, t, w, A, E }) => {
    text('19 NOV 2026', 960, 330, 220, K.white, { a: A('November', 0.4), glow: 30 }); chip('PS5', 760, 520, K.cyan, A('launches', 0.4), 40); chip('XBOX SERIES X|S', 1080, 520, K.green, A('launches', 0.6), 40);
    card(360, 620, 1200, 130, K.edge, A('reviews', 0.3)); text('REAL REVIEWS', 560, 660, 34, K.dim, { a: A('reviews'), mono: true }); disk(430, 690, 1060, 36, 0.05 + 0.2 * eo(seg(lt, w('reviews'), w('starting') + 1)), K.amber);
    text('JUST STARTING', 1330, 660, 34, K.amber, { a: A('starting'), mono: true }); stamp('PART 2 · AFTER REVIEWS', 960, 830, K.green, A('Part', 0.2), 44, -0.03);
  }, [['November', 'slam', 0.6], ['Part', 'slam', 0.4]]);
  scene(4, null, 0, 'the eight habits, lighting one by one', ({ lt, t, w, A, E }) => {
    const names = ['LAZY GETAWAY', 'IGNORING STARS', 'THE WEATHER', 'THE ANIMALS', '30 FPS', 'NO ONLINE', 'THE MAP', 'THE DOWNLOAD'];
    text('8 HABITS TO UNLEARN', 960, 190, 76, K.amber, { a: A('eight', 0.35), glow: 24 });
    names.forEach((n, i) => { const x = 160 + (i % 4) * 410, y = 290 + Math.floor(i / 4) * 280, on = lt > w('eight') + i * 0.26, a = on ? eob(seg(lt, w('eight') + i * 0.26, w('eight') + i * 0.26 + 0.25)) : 0;
      card(x, y, 370, 230, on ? K.amber : K.edge, 1, on ? 1 : 0.35); text(String(i + 1).padStart(2, '0'), x + 80, y + 85, 90, on ? K.amber : K.dim, { a: on ? 1 : 0.5 }); text(n, x + 185, y + 175, 32, on ? K.white : K.dim, { a: on ? 1 : 0.5 }); }); 
  }, [['eight', 'pop'], ['habits', 'pop'], ['unlearn', 'pop']]);

  // ── habit 1 · the lazy getaway ─────────────────────────────────────────────────
  scene(5, null, 1, 'habit 1 title', (h) => titleCard(1, 'THE LAZY GETAWAY', null, h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(6, null, 1, 'suspect scan: vehicle + clothing tags', ({ lt, t, w, A, E }) => {
    conf(A('identify', 0.3)); const sc = lt % 2.4 / 2.4; person(470, 850, 2.0, '#5f7389'); const sy = lerp(300, 860, sc); ln(260, sy, 680, sy, K.cyan, 5); brackets(330, 280, 280, 590, K.cyan, 30, 1, 5); text('SUSPECT', 470, 250, 30, K.cyan, { mono: true });
    card(900, 300, 800, 200, K.cyan, A('vehicle', 0.3)); car(1060, 430, 1.0, '#9db3c9', { a: A('vehicle') }); text('VEHICLE', 1330, 400, 64, K.white, { a: A('vehicle') }); 
    card(900, 560, 800, 200, K.cyan, A('clothing', 0.3)); shirt(1060, 650, 1.1, K.cyan, A('clothing')); text('CLOTHING', 1330, 660, 64, K.white, { a: A('clothing') });
  }, [['vehicle', 'pop'], ['clothing', 'pop']]);
  scene(6, 'physical', 1, 'tags: description + CCTV', ({ lt, t, w, A, E }) => {
    conf(1); const sc = lt % 2.4 / 2.4; person(470, 850, 2.0, '#5f7389'); const sy = lerp(300, 860, sc); ln(260, sy, 680, sy, K.cyan, 5); brackets(330, 280, 280, 590, K.cyan, 30, 1, 5);
    card(900, 300, 800, 200, K.cyan, A('description', 0.3)); person(1020, 470, 0.5, K.cyan, A('description')); text('DESCRIPTION', 1350, 400, 58, K.white, { a: A('description') });
    card(900, 560, 800, 200, K.red, A('CCTV', 0.3)); if (E('CCTV')) camera(1010, 690, 1.1, t, 0); text('CCTV FOOTAGE', 1350, 660, 58, K.white, { a: A('CCTV') });
    if (E('CCTV')) camera(1650, 230, 0.8, t, 1);
  }, [['description', 'pop'], ['CCTV', 'slam', 0.5]]);
  scene(7, null, 1, 'the old trick in 3 steps, then MAY NOT WORK', ({ lt, t, w, A, E }) => {
    const dimA = E('may') ? 0.45 : 1; [['1', 'DITCH THE CAR', 'ditch'], ['2', 'TURN A CORNER', 'turn'], ['3', 'WALK AWAY', 'walk']].forEach(([n, lab, wd], i) => { const x = 140 + i * 590, a = A(wd, 0.3); card(x, 250, 540, 420, K.edge, a, dimA); text(n, x + 70, 330, 100, K.amber, { a: a * dimA }); text(lab, x + 270, 610, 46, K.white, { a: a * dimA });
      ctx.save(); ctx.globalAlpha = a * dimA; if (i === 0) car(x + 290, 470, 0.9, '#9db3c9'); if (i === 1) { ln(x + 150, 500, x + 150, 400, K.cyan, 12); ln(x + 150, 400, x + 400, 400, K.cyan, 12); circle(x + 410, 400, 16, K.cyan); } if (i === 2) person(x + 300, 590, 0.9, '#9fb2c8'); ctx.restore();
      if (i < 2) text('→', x + 565, 460, 90, K.dim, { a }); });
    stamp('MAY NOT WORK', 960, 790, K.red, E('may') ? eob(seg(lt, w('may'), w('may') + 0.2)) : 0, 80, -0.05);
  }, [['ditch', 'pop'], ['turn', 'pop'], ['walk', 'pop'], ['may', 'slam', 0.6]]);
  scene(8, null, 1, 'big ? : how fast, how well', ({ lt, t, w, A, E }) => {
    qmark(960, 440, 420, K.amber, A('explained', 0.4), t); text('HOW FAST?', 460, 440, 80, K.white, { a: A('fast') }); text('HOW WELL?', 1470, 440, 80, K.white, { a: A('well') });
    chip('NOT EXPLAINED BY ROCKSTAR', 960, 740, K.amber, A('explained', 0.4), 44);
  }, [['explained', 'pop'], ['fast', 'tock'], ['well', 'tock']]);
  scene(9, null, 1, 'my plan card 1', (h) => planCard({ h, rows: [{ txt: 'ASSUME THE COPS REMEMBER:', word: 'plan', size: 50, col: K.amber }, { txt: 'MY CAR', word: 'car', size: 70 }, { txt: 'MY OUTFIT', word: 'outfit', size: 70 }], icons: [{ word: 'car', x: 880, y: 510, fn: (x, y, a) => car(x, y, 0.8, '#9db3c9', { a }) }, { word: 'outfit', x: 880, y: 630, fn: (x, y, a) => shirt(x, y, 0.8, K.cyan, a) }] }), [['car', 'pop'], ['outfit', 'pop']]);

  // ── habit 2 · ignoring the stars ───────────────────────────────────────────────
  scene(10, null, 2, 'habit 2 title', (h) => titleCard(2, 'IGNORING THE STARS', null, h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  const gauge = (x, y, r, val, a = 1, t = 0, q = false) => { ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = 34; ctx.lineCap = 'butt'; [[K.green, 0], [K.amber, 1], [K.red, 2]].forEach(([c, i]) => { ctx.beginPath(); ctx.arc(x, y, r, Math.PI + i * Math.PI / 3, Math.PI + (i + 1) * Math.PI / 3); ctx.strokeStyle = c; ctx.stroke(); });
    const ang = Math.PI + val * Math.PI; ln(x, y, x + Math.cos(ang) * (r - 20), y + Math.sin(ang) * (r - 20), K.white, 10); circle(x, y, 18, K.white); ctx.restore(); text('HEAT', x, y + 70, 54, K.red, { a, glow: 20 }); };
  scene(11, null, 2, 'six stars + Heat gauge', ({ lt, t, w, A, E }) => {
    conf(A('six', 0.3), 960, 190, 'CONFIRMED · GAME INFORMER'); text('WANTED LEVEL', 960, 270, 44, K.dim, { mono: true, a: A('six') });
    for (let i = 0; i < 6; i++) { const at = w('six') + i * 0.22, on = lt > at; star(460 + i * 200, 380, 70, on ? K.amber : '#2a3342', on ? 30 : 0); }
    gauge(960, 800, 200, 0.15 + 0.75 * eo(seg(lt, w('Heat'), w('Heat') + 1.4)) + 0.03 * Math.sin(t * 9), A('Heat', 0.4), t); chip('NEW', 1230, 650, K.red, A('Heat', 0.4), 34);
  }, [['six', 'pop'], ['Heat', 'slam', 0.6]]);
  scene(12, null, 2, 'what we know about Heat', ({ lt, t, w, A, E }) => {
    gauge(520, 600, 220, 0.62 + 0.04 * Math.sin(t * 7), 1, t); qmark(520, 330, 120, K.amber, 1, t);
    card(980, 300, 740, 150, K.green, A('Heat', 0.3)); text('NAME: HEAT', 1350, 375, 54, K.white, { a: A('Heat') });
    card(980, 480, 740, 150, K.amber, A('explained', 0.3)); text('DETAILS: NOT EXPLAINED', 1350, 555, 46, K.white, { a: A('explained') });
    card(980, 660, 740, 150, K.edge, A('suggests', 0.3)); text('OUR GUESS: IT REMEMBERS', 1350, 735, 44, K.cyan, { a: A('suggests') });
  }, [['Heat', 'pop'], ['explained', 'pop'], ['suggests', 'pop']]);
  scene(13, null, 2, 'plan: timer -> record', (h) => planCard({ h, rows: [{ txt: 'STARS = A TIMER', word: 'stop', strike: 'start', size: 80, col: K.dim }, { txt: 'STARS = A RECORD', word: 'record', size: 80, col: K.green }], icons: [{ word: 'record', x: 1500, y: 520, fn: (x, y, a) => star(x, y, 70 * a, K.amber, 24) }] }), [['start', 'slam', 0.5], ['record', 'pop']]);

  // ── habit 3 · the weather ──────────────────────────────────────────────────────
  scene(14, null, 3, 'habit 3 title', (h) => titleCard(3, 'TREATING THE WEATHER', 'LIKE WALLPAPER', h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(15, null, 3, 'hurricane + rebuilt weather', ({ lt, t, w, A, E }) => {
    conf(A('rebuilt', 0.3)); hurricane(560, 480, 290, t, K.cyan, A('rebuilt', 0.5));
    card(1000, 300, 720, 150, K.cyan, A('scratch', 0.3)); text('REBUILT FROM SCRATCH', 1360, 375, 50, K.white, { a: A('scratch', 0.3) });
    card(1000, 480, 720, 230, K.edge, A('Red', 0.3)); text('BUILT ON', 1360, 540, 34, K.dim, { a: A('Red'), mono: true }); text('RED DEAD REDEMPTION 2', 1360, 600, 46, K.white, { a: A('Red') }); text('TECHNOLOGY', 1360, 660, 46, K.amber, { a: A('technology') });
  }, [['rebuilt', 'whoosh'], ['Red', 'pop']]);
  scene(16, null, 3, 'storms and hurricanes confirmed, frequency unknown', ({ lt, t, w, A, E }) => {
    cloud(430, 330, 2.1, '#46566b'); rain(200, 380, 480, 400, t, 0.5); if (Math.floor(t * 3.3) % 7 === 0) bolt(430, 520, 2.2, K.amber);
    conf(A('Tropical', 0.3), 1300, 190, 'CONFIRMED');
    card(900, 260, 820, 110, K.green, A('Tropical', 0.3)); text('✔  TROPICAL STORMS', 1310, 316, 52, K.white, { a: A('Tropical') }); card(900, 400, 820, 110, K.green, A('hurricanes', 0.3)); text('✔  HURRICANES', 1310, 456, 52, K.white, { a: A('hurricanes') });
    card(900, 560, 390, 150, K.amber, A('often', 0.3)); text('HOW OFTEN?', 1095, 635, 42, K.amber, { a: A('often') }); card(1330, 560, 390, 150, K.amber, A('change', 0.3)); text('WHAT CHANGES?', 1525, 635, 38, K.amber, { a: A('change') });
  }, [['Tropical', 'pop'], ['hurricanes', 'pop'], ['often', 'tock'], ['change', 'tock']]);
  scene(17, null, 3, 'plan: check the sky', (h) => planCard({ h, rows: [{ txt: 'THE SKY IS NOT JUST DECORATION', word: 'assume', size: 50 }, { txt: 'CHECK IT BEFORE A BIG JOB', word: 'Check', size: 50, col: K.cyan }, { txt: 'HAVE A BACKUP PLAN', word: 'backup', size: 50, col: K.amber }], icons: [{ word: 'decoration', x: 1380, y: 520, fn: (x, y, a) => cloud(x, y, 1.6 * a, '#5b6b80') }] }), [['Check', 'pop'], ['backup', 'pop']]);

  // ── habit 4 · animals ──────────────────────────────────────────────────────────
  scene(18, null, 4, 'habit 4 title', (h) => titleCard(4, 'RUNNING PAST', 'THE ANIMALS', h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(19, null, 4, '170+ species counter with dots', ({ lt, t, w, A, E }) => {
    conf(A('reports', 0.3)); const k = eo(seg(lt, w('hundred') - 0.3, w('seventy') + 0.5)), n = Math.round(170 * k);
    for (let i = 0; i < 170; i++) if (i < n) circle(260 + (i % 34) * 41, 640 + Math.floor(i / 34) * 44, 11, i % 5 === 0 ? K.amber : K.cyan);
    text(n + '+', 960, 400, 260, K.white, { glow: 30 }); text('ANIMAL SPECIES', 960, 540, 60, K.cyan, { a: A('species', 0.3) });
  }, [['hundred', 'pop'], ['seventy', 'sparkle']]);
  scene(19, 'including', 4, 'three animals', ({ lt, t, w, A, E }) => {
    [['ALLIGATORS', 'alligators', (x, y, a) => gator(x + 240, y + 210, 1.3 * a)], ['MANATEES', 'manatees', (x, y, a) => manatee(x + 240, y + 200, 1.2 * a)], ['FLAMINGOS', 'flamingos', (x, y, a) => flamingo(x + 220, y + 330, 1.15 * a)]].forEach(([n, wd, fn], i) => { const x = 160 + i * 560, a = A(wd, 0.35); card(x, 230, 480, 520, K.cyan, a); if (a > 0) fn(x, 330, a); text(n, x + 240, 690, 50, K.white, { a }); });
  }, [['alligators', 'pop'], ['manatees', 'pop'], ['flamingos', 'pop']]);
  scene(20, null, 4, '60+ birds flying, then the tiers', ({ lt, t, w, A, E }) => {
    text('60+', 560, 560, 300, K.white, { a: A('sixty', 0.4), glow: 28 }); text('BIRD TYPES', 560, 740, 58, K.cyan, { a: A('birds', 0.3) });
    for (let i = 0; i < 16; i++) { const x = 1000 + ((rnd(i) * 800 + t * (60 + 40 * rnd(i + 3))) % 800), y = 280 + rnd(i + 9) * 420; bird(x, y, 1.2 + rnd(i + 2), i % 3 ? K.cyan : K.amber, Math.sin(t * 7 + i)); }
  }, [['sixty', 'pop']]);
  const tiers = (lt, t, A, qs, a0 = 1) => [['RARE', K.cyan, 'rare'], ['DISCOVERABLE', K.green, 'discoverable'], ['LEGENDARY', K.amber, 'legendary']].forEach(([n, c, wd], i) => { const y = 260 + i * 200, a = A(wd, 0.35); card(260, y, 1400, 160, c, a); text(n, 560, y + 80, 64, c, { a, align: 'left', glow: wd === 'legendary' ? 30 : 0 }); if (qs) qmark(1500, y + 80, 100, c, a, t + i); else for (let k = 0; k < 3 - i; k++) star(1180 + k * 90, y + 80, 34, c, 14); });
  scene(20, 'split', 4, 'three tiers', ({ lt, t, w, A, E }) => { conf(A('split', 0.3)); tiers(lt, t, A, false); }, [['rare', 'pop'], ['discoverable', 'pop'], ['legendary', 'sparkle']]);
  scene(21, null, 4, 'which animal in which tier: not revealed', ({ lt, t, w, A, E }) => {
    const A2 = (word, d) => A(word, d); [['RARE', K.cyan], ['DISCOVERABLE', K.green], ['LEGENDARY', K.amber]].forEach(([n, c], i) => { const y = 260 + i * 200; card(260, y, 1400, 160, c, 1); text(n, 560, y + 80, 64, c, { align: 'left' }); qmark(1500, y + 80, 100, c, 1, t + i); });
    chip('NOT REVEALED', 960, 190, K.amber, A('said', 0.3), 34); stamp('YOURS TO DISCOVER', 1000, 820, K.green, A('yours', 0.2), 64, -0.04);
  }, [['said', 'pop'], ['yours', 'slam', 0.5]]);
  scene(22, null, 4, 'plan: slow down, look around', (h) => planCard({ h, rows: [{ txt: 'LEAVE THE CITY', word: 'plan', size: 64 }, { txt: 'SLOW DOWN', word: 'slowing', size: 64, col: K.amber }, { txt: 'LOOK AROUND', word: 'looking', size: 64, col: K.cyan }], icons: [{ word: 'looking', x: 1380, y: 520, fn: (x, y, a) => eye(x, y, 1.6 * a, K.cyan, Math.max(0, Math.sin(h.t * 2.2) - 0.9) * 10) }] }), [['looking', 'pop']]);

  // ── habit 5 · 30 fps ───────────────────────────────────────────────────────────
  scene(23, null, 5, 'habit 5 title', (h) => titleCard(5, 'EXPECTING SMOOTH', '60 FPS', h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(24, null, 5, '30 frames in one second', ({ lt, t, w, A, E }) => {
    conf(A('targets', 0.3), 960, 190, 'ROCKSTAR: 30 FPS TARGET'); text('30', 960, 380, 300, K.white, { a: Math.max(0.25, A('thirty', 0.4)), glow: 30 }); text('FRAMES PER SECOND', 960, 540, 56, K.cyan, { a: Math.max(0.25, A('frames', 0.3)) });
    for (let i = 0; i < 30; i++) { const on = E('thirty') && Math.floor((lt - w('thirty')) * 30 % 30) >= i && (lt - w('thirty')) * 30 % 30 >= 0; rr(180 + i * 53, 640, 40, 80, 6); ctx.fillStyle = on ? K.cyan : '#1e2a3a'; ctx.fill(); }
    text('60 (NOT AT LAUNCH)', 960, 790, 36, K.red, { a: A('thirty', 0.4), mono: true });
  }, [['thirty', 'pop']]);
  scene(24, 'PlayStation', 5, 'consoles at launch', ({ lt, t, w, A, E }) => {
    card(220, 270, 700, 300, K.cyan, A('PlayStation', 0.35)); text('PLAYSTATION 5', 570, 420, 70, K.white, { a: A('PlayStation') }); card(1000, 270, 700, 300, K.green, A('Xbox', 0.35)); text('XBOX SERIES X|S', 1350, 420, 64, K.white, { a: A('Xbox') });
    stamp('AT LAUNCH', 960, 720, K.amber, A('launch', 0.2), 80, -0.04);
  }, [['PlayStation', 'pop'], ['Xbox', 'pop'], ['launch', 'slam', 0.5]]);
  scene(25, null, 5, '60 fps mode undecided (toggle)', ({ lt, t, w, A, E }) => {
    card(560, 260, 800, 420, K.amber, A('sixty', 0.3)); text('60 FPS MODE', 960, 360, 70, K.white, { a: A('sixty') }); rr(790, 440, 340, 130, 65); ctx.fillStyle = '#1e2a3a'; ctx.fill(); circle(lerp(860, 1060, 0.5 + 0.5 * Math.sin(t * 2.4)), 505, 52, K.amber);
    qmark(1280, 505, 110, K.amber, 1, t); chip('UNDECIDED', 960, 770, K.amber, A('undecided', 0.3), 50);
  }, [['sixty', 'pop'], ['undecided', 'slam', 0.5]]);
  scene(25, 'eyes', 5, 'give your eyes time', ({ lt, t, w, A, E }) => { eye(960, 440, 3.2 * eob(seg(lt, 0.05, 0.4)), K.cyan, Math.max(0, Math.sin(t * 2.2) - 0.9) * 10); text('GIVE YOUR EYES A LITTLE TIME', 960, 740, 64, K.white, { a: A('give', 0.4) }); }, [['give', 'pop']]);

  // ── habit 6 · online ──────────────────────────────────────────────────────────
  scene(26, null, 6, 'habit 6 title', (h) => titleCard(6, 'PLANNING ON ONLINE', 'WITH FRIENDS', h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(27, null, 6, 'single-player: Jason and Lucia', ({ lt, t, w, A, E }) => {
    conf(A('selling', 0.3), 960, 190, 'ROCKSTAR: "SINGLE-PLAYER"'); text('SINGLE-PLAYER STORY', 960, 280, 70, K.white, { a: eob(seg(lt, 0.1, 0.4)), glow: 20 });
    person(640, 860, 2.0, K.cyan, 0.22 + 0.78 * clamp(A('Jason', 0.3))); text('JASON', 640, 900, 46, K.cyan, { a: A('Jason') }); person(1280, 860, 2.0, '#ff7aa8', 0.22 + 0.78 * clamp(A('Lucia', 0.3))); text('LUCIA', 1280, 900, 46, '#ff7aa8', { a: A('Lucia') });
  }, [['Jason', 'pop'], ['Lucia', 'pop']]);
  scene(27, 'announced', 6, 'empty online lobby', ({ lt, t, w, A, E }) => {
    for (let i = 0; i < 4; i++) { const x = 220 + i * 370; ctx.save(); ctx.setLineDash([14, 12]); rr(x, 260, 320, 330, 18); ctx.lineWidth = 4; ctx.strokeStyle = K.dim; ctx.stroke(); ctx.restore(); person(x + 160, 540, 0.9, '#2a3342'); text('EMPTY', x + 160, 565, 30, K.dim, { mono: true }); }
    text('ONLINE MODE: NOT ANNOUNCED', 960, 700, 60, K.white, { a: A('online', 0.3) }); stamp('NO DATE', 960, 820, K.red, A('date', 0.2), 70, -0.05);
  }, [['online', 'pop'], ['date', 'slam', 0.6]]);
  scene(28, null, 6, '2027? one report, unconfirmed', ({ lt, t, w, A, E }) => {
    text('2027?', 960, 400, 460, K.amber, { a: A('twenty', 0.4), glow: 40, font: 'Anton' }); chip('ONE REPORT', 960, 640, K.cyan, A('report', 0.3), 50); stamp('UNCONFIRMED', 960, 790, K.red, A('unconfirmed', 0.2), 80, -0.05);
  }, [['twenty', 'pop'], ['unconfirmed', 'slam', 0.7]]);
  scene(28, 'enjoy', 6, 'enjoy the story first', ({ lt, t, w, A, E }) => { person(700, 840, 1.9, K.cyan, eob(seg(lt, 0.05, 0.4))); person(1220, 840, 1.9, '#ff7aa8', eob(seg(lt, 0.15, 0.5))); text('STORY FIRST', 960, 330, 110, K.white, { a: A('story', 0.4), glow: 24 }); }, [['story', 'pop']]);

  // ── habit 7 · the map ──────────────────────────────────────────────────────────
  scene(29, null, 7, 'habit 7 title', (h) => titleCard(7, 'THINKING YOU', 'KNOW THE MAP', h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(30, null, 7, 'about twice the size (invented shapes)', ({ lt, t, w, A, E }) => {
    const k = eo(seg(lt, w('twice') - 0.2, w('twice') + 1.2)); landmass(560, 500, 150, 1.3, '#1f3a4f', 1, K.cyan); text('GTA 5 MAP', 560, 760, 44, K.cyan, { a: 1 });
    landmass(1250, 500, lerp(150, 212, k), 4.1, 'rgba(255,176,0,0.2)', 1, K.amber); text('LEONIDA ≈ 2×', 1250, 760, 52, K.amber, { a: A('twice', 0.4) });
    chip('REPORTED · NOT OFFICIAL', 960, 190, K.amber, A('reported', 0.3), 28); text('illustrative shapes, not real maps', 960, 840, 28, K.dim, { mono: true });
  }, [['twice', 'slam', 0.5]]);
  scene(30, 'named', 7, 'six named regions light up', ({ lt, t, w, A, E }) => {
    conf(A('named', 0.3), 960, 190, 'NAMED BY ROCKSTAR'); landmass(960, 520, 300, 4.1, '#1b3045', 1, K.cyan);
    [['VICE CITY', 'Vice', 1260, 470, 1], ['LEONIDA KEYS', 'Keys', 1180, 760, 1], ['PORT GELLHORN', 'Port', 700, 600, -1], ['AMBROSIA', 'Ambrosia', 760, 380, -1], ['GRASSRIVERS', 'Grassrivers', 980, 560, 1], ['MOUNT KALAGA NATIONAL PARK', 'Mount', 960, 330, 1]].forEach(([n, wd, x, y, s]) => marker(x, y, n, K.amber, A(wd, 0.3), s));
  }, [['Vice', 'pop'], ['Keys', 'pop'], ['Port', 'pop'], ['Ambrosia', 'pop'], ['Grassrivers', 'pop'], ['Mount', 'pop']]);
  const act = (x, y, kind, a) => { ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.strokeStyle = K.cyan; ctx.fillStyle = K.cyan; ctx.lineWidth = 8; ctx.lineCap = 'round';
    if (kind === 0) { ctx.beginPath(); ctx.ellipse(0, 20, 120, 22, 0, 0, TAU); ctx.fill(); ln(-60, -70, 60, 60, K.amber, 8); circle(-60, -70, 12, K.amber); circle(60, 60, 12, K.amber); }
    if (kind === 1) { ctx.beginPath(); ctx.arc(0, -40, 110, Math.PI, 0); ctx.stroke(); for (const dx of [-110, -55, 0, 55, 110]) ln(dx, -40, 0, 90, K.cyan, 3); circle(0, 100, 16, K.amber); }
    if (kind === 2) { circle(0, 0, 80, '#f2f2f2'); circle(0, 0, 38, K.ink); ctx.font = '900 48px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('8', 0, 3); }
    if (kind === 3) { ln(-100, 0, 100, 0, K.cyan, 12); for (const dx of [-100, 100]) { rr(dx - 18, -50, 36, 100, 8); ctx.fill(); } }
    ctx.restore(); };
  scene(31, null, 7, 'activities from Game Informer', ({ lt, t, w, A, E }) => {
    [['KAYAKING', 'kayaking'], ['BASE JUMPING', 'base'], ['BILLIARDS', 'billiards'], ['GYM WORKOUTS', 'gym']].forEach(([n, wd], i) => { const x = 140 + i * 410, a = 0.25 + 0.75 * clamp(A(wd, 0.35)); card(x, 260, 380, 440, K.cyan, a); act(x + 190, 440, i, a); text(n, x + 190, 640, 38, K.white, { a }); });
    conf(A('kayaking', 0.3), 960, 190, 'GAME INFORMER ACTIVITIES'); stamp('MORE THAN SHOOTING', 960, 810, K.amber, A('more', 0.2), 60, -0.03);
  }, [['kayaking', 'pop'], ['base', 'pop'], ['billiards', 'pop'], ['gym', 'pop'], ['more', 'slam', 0.5]]);
  scene(32, null, 7, 'plan: one region at a time', (h) => planCard({ h, rows: [{ txt: 'PICK ONE REGION', word: 'pick', size: 64 }, { txt: 'EXPLORE IT PROPERLY', word: 'explore', size: 64, col: K.cyan }, { txt: 'THEN RACE ACROSS THE STATE', word: 'racing', size: 54, col: K.amber }], icons: [{ word: 'pick', x: 1450, y: 520, fn: (x, y, a) => marker(x, y, '', K.amber, 2 * a) }] }), [['pick', 'pop'], ['explore', 'pop'], ['racing', 'pop']]);

  // ── habit 8 · download ─────────────────────────────────────────────────────────
  scene(33, null, 8, 'habit 8 title', (h) => titleCard(8, 'LEAVING THE', 'DOWNLOAD LATE', h), [['Habit', 'slam', 0.5]], { cut: 'flash', riser: true });
  scene(34, null, 8, '212 GB disk bar', ({ lt, t, w, A, E }) => {
    const k = eo(seg(lt, w('twelve') - 1.4, w('twelve') + 0.3)); chip('UP TO', 960, 250, K.amber, A('needs', 0.3), 40); text(Math.round(212 * k) + ' GB', 960, 410, 240, K.white, { glow: 30 });
    disk(260, 560, 1400, 120, k, K.cyan, 'FREE SPACE NEEDED'); text('DEPENDING ON YOUR DEVICE', 960, 780, 52, K.dim, { a: A('depending', 0.4) });
  }, [['twelve', 'sparkle']]);
  scene(35, null, 8, 'midnight local time', ({ lt, t, w, A, E }) => {
    const p = eo(seg(lt, w('midnight') - 2.2, w('midnight'))); clock(560, 480, 230, 11 + p, 55 * (1 - p) + (p >= 1 ? 0 : 0)); text('12:00 AM', 1340, 420, 150, K.white, { a: Math.max(0.2, A('midnight', 0.4)), glow: 24 });
    chip('PLAYSTATION STORE LISTING', 1340, 250, K.cyan, A('listing', 0.3), 30); chip('LOCAL TIME', 1340, 560, K.amber, A('local', 0.3), 44); chip('19 NOV', 1340, 680, K.green, A('November', 0.3), 44);
  }, [['listing', 'pop'], ['midnight', 'slam', 0.6]]);
  scene(36, null, 8, 'free up space today', ({ lt, t, w, A, E }) => {
    const f = lerp(0.9, 0.35, eo(seg(lt, w('free'), w('today') + 0.3))); disk(260, 330, 1400, 120, f, K.amber, 'DISK'); trash(460, 640, 2.4 * A('free', 0.3)); stamp('TODAY', 1000, 600, K.green, A('today', 0.2), 90, -0.05); stamp('NOT AT MIDNIGHT', 1100, 800, K.red, A('midnight', 0.2), 60, 0.04);
  }, [['free', 'pop'], ['today', 'slam', 0.6], ['midnight', 'slam', 0.5]]);

  // ── recap + outro ──────────────────────────────────────────────────────────────
  scene(37, null, 0, 'recap grid, lights on each word', ({ lt, t, w, A, E }) => {
    const items = [['LAZY GETAWAY', 'lazy', (x, y) => car(x, y + 20, 0.7, '#9db3c9')], ['THE STARS', 'stars', (x, y) => star(x, y, 52, K.amber, 20)], ['THE WEATHER', 'weather', (x, y) => cloud(x, y, 0.9)], ['THE ANIMALS', 'animals', (x, y) => bird(x, y, 1.8, K.cyan, Math.sin(t * 6))], ['30 FPS', 'thirty', (x, y) => text('30', x, y, 90, K.cyan)], ['NO ONLINE', 'online', (x, y) => text('✕', x, y, 100, K.red)], ['HUGE MAP', 'map', (x, y) => landmass(x, y, 40, 4.1, '#1f3a4f', 1, K.cyan)], ['HUGE DOWNLOAD', 'download', (x, y) => disk(x - 70, y - 22, 140, 44, 0.8, K.cyan)]];
    text('8 HABITS', 960, 190, 70, K.amber, { glow: 24 }); items.forEach(([n, wd, ic], i) => { const x = 160 + (i % 4) * 410, y = 290 + Math.floor(i / 4) * 280, on = E(wd), a = on ? eob(seg(lt, w(wd), w(wd) + 0.3)) : 0; card(x, y, 370, 230, on ? K.amber : K.edge, 1, on ? 1 : 0.35); if (on) { ctx.save(); ctx.globalAlpha = a; ic(x + 185, y + 90); ctx.restore(); } text(n, x + 185, y + 180, 32, on ? K.white : K.dim, { a: on ? 1 : 0.5 }); });
  }, [['lazy', 'pop', 0.5], ['stars', 'pop', 0.5], ['weather', 'pop', 0.5], ['animals', 'pop', 0.5], ['thirty', 'pop', 0.5], ['online', 'pop', 0.5], ['map', 'pop', 0.5], ['download', 'pop', 0.5]]);
  scene(38, null, 0, 'which habit hurts most', ({ lt, t, w, A, E }) => {
    text('WHICH HABIT WILL HURT YOU MOST?', 960, 250, 74, K.white, { a: A('Which', 0.4) });
    for (let i = 0; i < 8; i++) { const x = 330 + (i % 4) * 330, y = 440 + Math.floor(i / 4) * 170, a = eob(seg(lt, 0.3 + i * 0.1, 0.55 + i * 0.1)); card(x - 120, y - 60, 240, 120, K.amber, a); text(String(i + 1), x, y + 3, 80, K.amber, { a }); }
    chip('COMMENT YOUR NUMBER 👇', 960, 830, K.green, A('Tell', 0.3), 44);
  }, [['Which', 'pop'], ['Tell', 'pop']]);
  scene(39, null, 0, 'part 2 + subscribe', ({ lt, t, w, A, E }) => {
    card(360, 230, 1200, 330, K.green, A('reviews', 0.35)); text('PART 2', 960, 340, 130, K.white, { a: A('reviews'), glow: 24 }); text('AFTER THE REVIEWS: WHAT HOLDS UP?', 960, 470, 46, K.green, { a: A('check', 0.4) });
    const pulse = 1 + 0.05 * Math.sin(t * 5) * (E('Subscribe') ? 1 : 0); ctx.save(); ctx.translate(960, 720); ctx.scale(pulse * A('Subscribe', 0.35), pulse * A('Subscribe', 0.35)); rr(-260, -70, 520, 140, 30); ctx.fillStyle = K.red; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 64px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SUBSCRIBE', 0, 4); ctx.restore();
  }, [['reviews', 'pop'], ['Subscribe', 'slam', 0.5]]);

  return { shots: S, cues: CUES };
}
