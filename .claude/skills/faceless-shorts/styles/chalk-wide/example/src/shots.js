// 4 WEIRD THINGS YOUR BODY DOES (Chalk Talk, 16:9 long form). One shot per narration line; shots draw on a 1920x1080 board.
// Captions sit at y 945: keep drawings above ~850. `A(word)` = when that word is spoken, relative to the shot start.
import { ctx, clamp, lerp, seg, eo, eio, eob, rnd, TAU } from './core/lib.js';
import { L, Wd } from './core/timing.js';
import * as K from './core/kit.js';
const CH = K.CH;
const on = (lt, a, b) => eo(seg(lt, a, b));
const W2 = (txt, x, y, s, col, p = 1, rot = 0) => K.write(txt, x, y, s, col, p, rot);

// ---------- components ----------
function head(x, y, s, o = {}) {   // side profile facing right; o.mouth 0..1, o.brain colour (hatched), o.p draw-on
  const p = o.p ?? 1; K.circleC(x, y, 200 * s, CH.white, 9, p, 201);
  K.chalk([[x + 190 * s, y - 20 * s], [x + 255 * s, y + 45 * s], [x + 192 * s, y + 60 * s]], CH.white, 9, p, 202);
  K.circleC(x + 105 * s, y - 55 * s, 13 * s, CH.white, 7, p, 203);
  const m = o.mouth || 0;
  if (m > 0.05) K.chalk(K.arc(x + 140 * s, y + 125 * s, 34 * s, 0, TAU, 18, (14 + 50 * m) * s), CH.white, 8, 1, 204); else K.chalk([[x + 105 * s, y + 125 * s], [x + 175 * s, y + 120 * s]], CH.white, 8, p, 204);
  K.chalk([[x - 80 * s, y + 195 * s], [x - 80 * s, y + 330 * s]], CH.white, 9, p, 205); K.chalk([[x + 60 * s, y + 198 * s], [x + 60 * s, y + 330 * s]], CH.white, 9, p, 206);
  if (o.brain) { K.hatch(x - 30 * s, y - 50 * s, 105 * s, o.brain, o.ba ?? 0.5, p); K.chalk(K.arc(x - 30 * s, y - 50 * s, 105 * s, 0, TAU, 26, 85 * s), o.brain, 8, p, 207); }
}
function thermo(x, y, level, col, p = 1) {
  K.chalk([[x - 22, y], [x - 22, y + 300], [x + 22, y + 300], [x + 22, y]], CH.white, 8, p, 210); K.circleC(x, y + 335, 38, col, 8, p, 211);
  K.chalk([[x, y + 300 - 280 * level], [x, y + 330]], col, 16, p, 212); K.hatch(x, y + 335, 34, col, 0.6, p);
}
function torso(x, y, s, o = {}) {   // front view: lungs, diaphragm (dia 0 up .. 1 down), throat with cords (gap 0..1)
  const p = o.p ?? 1, dia = o.dia || 0, gap = o.gap ?? 1;
  K.chalk(K.arc(x, y, 300 * s, Math.PI * 0.85, Math.PI * 2.15, 30, 330 * s).concat(K.arc(x, y + 20 * s, 290 * s, Math.PI * 0.15, Math.PI * 0.85, 12, 290 * s).slice(0, 0)), CH.white, 8, p, 220);
  K.chalk([[x - 270 * s, y + 130 * s], [x - 250 * s, y + 330 * s], [x + 250 * s, y + 330 * s], [x + 270 * s, y + 130 * s]], CH.white, 8, p, 221);
  const lung = (sx) => { K.hatch(x + sx * 125 * s, y - 70 * s, 100 * s, CH.pink, 0.35 * (o.lungs ?? 1), p); K.circleC(x + sx * 125 * s, y - 70 * s, 104 * s, CH.pink, 8, p, 230 + sx); };
  lung(-1); lung(1);
  const yb = y + 105 * s + dia * 55 * s, pts = Array.from({ length: 21 }, (_, i) => { const u = i / 20; return [x - 260 * s + 520 * s * u, yb - 95 * s * (1 - 0.75 * dia) * Math.sin(Math.PI * u)]; });
  K.chalk(pts, o.diaCol || CH.orange, 12, p, 240);
  K.chalk([[x - 28 * s, y - 300 * s], [x - 28 * s, y - 120 * s]], CH.white, 8, p, 241); K.chalk([[x + 28 * s, y - 300 * s], [x + 28 * s, y - 120 * s]], CH.white, 8, p, 242);
  const g = 22 * s * gap; K.chalk([[x - 28 * s, y - 230 * s], [x - 4 * s - g, y - 218 * s]], CH.yellow, 9, p, 243); K.chalk([[x + 28 * s, y - 230 * s], [x + 4 * s + g, y - 218 * s]], CH.yellow, 9, p, 244);
}
function fish(x, y, s, p = 1, col = CH.blue) {
  K.chalk(K.arc(x, y, 140 * s, 0, TAU, 30, 70 * s), col, 8, p, 250); K.chalk([[x + 130 * s, y], [x + 220 * s, y - 60 * s], [x + 220 * s, y + 60 * s], [x + 130 * s, y]], col, 8, p, 251);
  K.circleC(x - 70 * s, y - 15 * s, 9 * s, col, 6, p, 252); for (let i = 0; i < 3; i++) K.chalk(K.arc(x - 20 * s + i * 22 * s, y, 40 * s, -1, 1, 8), CH.yellow, 6, p, 253 + i);
}
function womb(x, y, s, p = 1) { K.circleC(x, y, 150 * s, CH.pink, 8, p, 260); K.circleC(x - 20 * s, y - 30 * s, 40 * s, CH.white, 8, p, 261); K.chalk(K.arc(x - 20 * s, y + 70 * s, 80 * s, Math.PI * 0.2, Math.PI * 1.1, 14, 50 * s), CH.white, 8, p, 262); }
function sun(x, y, r, p = 1, t = 0) { K.circleC(x, y, r, CH.yellow, 9, p, 270); K.hatch(x, y, r, CH.yellow, 0.5, p); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.3; K.chalk([[x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35], [x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8]], CH.yellow, 8, p, 271 + i); } }
function tick(x, y, s, p = 1) { K.chalk([[x - 40 * s, y], [x - 10 * s, y + 40 * s], [x + 50 * s, y - 50 * s]], CH.green, 14, p, 280); }
function cross(x, y, s, p = 1, col = CH.pink) { K.chalk([[x - 40 * s, y - 40 * s], [x + 40 * s, y + 40 * s]], col, 14, p, 281); K.chalk([[x + 40 * s, y - 40 * s], [x - 40 * s, y + 40 * s]], col, 14, p, 282); }
function badge(txt) { W2(txt, 960, 92, 50, CH.yellow, 1); }
function leg(x, y, s, p = 1) {   // a leg ending in a foot, pointing right, x,y = knee
  K.chalk([[x, y], [x + 330 * s, y + 20 * s]], CH.white, 9, p, 290); K.chalk([[x, y + 110 * s], [x + 300 * s, y + 120 * s], [x + 380 * s, y + 150 * s], [x + 380 * s, y + 220 * s], [x + 300 * s, y + 230 * s]], CH.white, 9, p, 291);
  K.chalk([[x + 330 * s, y + 20 * s], [x + 430 * s, y + 20 * s], [x + 440 * s, y + 220 * s], [x + 300 * s, y + 230 * s]], CH.white, 9, p, 292);
}

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const shot = (i, id, draw, o = {}) => { const st = i === 0 ? 0 : L(i) - 0.08, A = (w, f = 0.4) => { try { return Wd(w, i) - st; } catch (e) { return f; } };
    add({ id, at: st, cam: o.cam || [960, 470], zoom: o.zoom ?? 0.04, draw(lt, d, t) { K.board(); draw(lt, d, t, A); } }); if (i) cue(st, 'whoosh', { gain: 0.5 }); };

  // ---- intro ----
  shot(0, 'I0', (lt) => { W2('4 WEIRD THINGS', 960, 250, 150, CH.white, on(lt, 0, 0.8)); W2('YOUR BODY DOES', 960, 430, 120, CH.yellow, on(lt, 0.6, 1.4)); K.person(960, 760, 0.9, { p: on(lt, 1, 1.8), mood: 'wow', arms: { L: [-120, -60], R: [120, -60] } }); });
  shot(1, 'I1', (lt, d, t, A) => { [['A YAWN', 560, 250, 'yawn'], ['A HICCUP', 1360, 250, 'hiccup'], ['A SUN SNEEZE', 560, 520, 'sneeze'], ['A SLEEPING FOOT', 1360, 520, 'foot']].forEach(([s, x, y, w], k) => { const a = A(w, 1 + k) - 0.2; if (lt > a) { W2(s, x, y, 90, [CH.pink, CH.orange, CH.blue, CH.green][k], on(lt, a, a + 0.4)); K.chalk([[x - 280, y + 60], [x + 280, y + 60]], CH.white, 6, on(lt, a + 0.2, a + 0.6), 300 + k); } }); });
  shot(2, 'I2', (lt, d, t, A) => { head(700, 430, 1.1, { p: on(lt, 0, 0.8), mouth: eio(seg(lt, A('probably', 2) , A('probably', 2) + 1)) }); W2('NO. 1', 1350, 360, 150, CH.yellow, on(lt, 0.5, 1.1)); K.arrowC(1180, 470, 980, 450, CH.yellow, on(lt, 1.1, 1.6)); });

  // ---- 1 · YAWN (lines 3-11) ----
  shot(3, 'Y3', (lt) => { badge('NO. 1'); W2('THE YAWN', 960, 250, 170, CH.white, on(lt, 0, 0.9)); head(960, 640, 0.8, { p: on(lt, 0.4, 1.2), mouth: 0.5 + 0.5 * Math.sin(lt * 3) }); });
  shot(4, 'Y4', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); head(700, 470, 1.15, { mouth: eio(seg(lt, 0.3, 1.2)) }); [['TIRED', 'tired', 1200, 300, CH.blue], ['BORED', 'bored', 1300, 470, CH.pink], ['SAW A YAWN', 'someone', 1250, 640, CH.yellow]].forEach(([s, w, x, y, c]) => { const a = A(w, 1.5) - 0.2; if (lt > a) W2(s, x, y, 80, c, on(lt, a, a + 0.4)); }); });
  shot(5, 'Y5', (lt, d, t) => { badge('NO. 1 · THE YAWN'); head(760, 470, 1.15, { mouth: 0.8 }); for (let i = 0; i < 4; i++) { const u = (lt * 0.35 + i / 4) % 1; const x = lerp(1500, 980, u), y = lerp(300 + i * 90, 580, u); K.circleC(x, y, 34, CH.cyan || CH.blue, 6, 1 - 0.5 * u, 310 + i); W2('O2', x, y, 28, CH.blue, 1 - 0.5 * u); } W2('MORE OXYGEN?', 1400, 780, 70, CH.yellow, on(lt, 1, 1.6)); });
  shot(6, 'Y6', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); const a = on(lt, 0.2, 0.9), b = on(lt, A('extra', 3) - 0.2, A('extra', 3) + 0.6);
    W2('PURE OXYGEN', 520, 300, 90, CH.blue, a); W2('= SAME YAWNS', 520, 440, 90, CH.white, a); W2('MORE CO2', 1400, 300, 90, CH.orange, b); W2('= SAME YAWNS', 1400, 440, 90, CH.white, b); cross(960, 640, 3, on(lt, d - 2, d - 1.4)); W2('THEORY FAILS', 960, 780, 80, CH.yellow, on(lt, d - 1.8, d - 1.2)); });
  shot(7, 'Y7', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); const c = eio(seg(lt, A('cool', 3), A('cool', 3) + 1.2)); const col = c > 0.5 ? CH.blue : CH.orange;
    head(700, 470, 1.15, { brain: col, ba: 0.6, mouth: 0.6 * c }); thermo(1250, 220, lerp(0.9, 0.25, c), col, 1); if (c < 0.5) W2('BRAIN TOO HOT', 1620, 330, 56, CH.orange, 1); else W2('COOLED DOWN', 1620, 330, 56, CH.blue, 1);
    if (c > 0.05) for (let i = 0; i < 3; i++) K.arrowC(1050, 520 + i * 40, 900, 500 + i * 30, CH.blue, c); });
  shot(8, 'Y8', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); const p = on(lt, 0.2, 2.2); K.chalk([[300, 560], [600, 540], [860, 330], [1000, 300], [1180, 560], [1500, 600]], CH.orange, 12, p, 320);
    K.fluff(300, 330, 70, 0, CH.white, on(lt, 0, 0.6)); K.circleC(250, 270, 26, CH.white, 7, on(lt, 0, 0.6), 321); K.circleC(350, 270, 26, CH.white, 7, on(lt, 0, 0.6), 322);
    const a = A('rose', 4) - 0.1, c2 = A('dropped', 4) - 0.1; if (lt > a) W2('WARMER', 700, 720, 64, CH.orange, on(lt, a, a + 0.4)); W2('YAWN', 1000, 220, 70, CH.yellow, on(lt, 1.5, 2)); if (lt > c2) W2('COOLER', 1400, 720, 64, CH.blue, on(lt, c2, c2 + 0.4)); W2('RAT STUDIES', 1500, 250, 60, CH.white, on(lt, 0, 0.5)); });
  shot(9, 'Y9', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); head(700, 470, 1.15, { brain: CH.blue, ba: 0.4 }); for (let i = 0; i < 4; i++) K.arrowC(1050, 440 + i * 25, 930, 450 + i * 20, CH.blue, on(lt, 0.4 + i * 0.1, 1.2)); W2('NOSE BREATHING', 1450, 260, 70, CH.blue, on(lt, 0.4, 1)); W2('= NO CATCHING YAWNS', 1450, 380, 64, CH.white, on(lt, A('nose', 6) , A('nose', 6) + 0.6)); W2('(ONE SMALL STUDY)', 1450, 480, 50, CH.pink, on(lt, 2, 2.6)); });
  shot(10, 'Y10', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); womb(480, 420, 1.2, on(lt, 0, 0.8)); fish(1250, 430, 1.4, on(lt, A('cold', 7) - 0.8, A('cold', 7) + 0.4)); W2('BABY IN THE WOMB', 480, 690, 56, CH.pink, on(lt, A('babies', 7), A('babies', 7) + 0.5)); W2('COLD-BLOODED', 1250, 690, 56, CH.blue, on(lt, A('cold', 7), A('cold', 7) + 0.5)); W2('NOT PROVEN', 960, 800, 80, CH.yellow, on(lt, 0.6, 1.2)); });
  shot(11, 'Y11', (lt, d, t, A) => { badge('NO. 1 · THE YAWN'); const a = A('seven', 8) - 0.5; for (let i = 0; i < 10; i++) { const hi = i < 7 && lt > a; K.person(330 + i * 140, 580, 0.42, { p: on(lt, i * 0.08, i * 0.08 + 0.5), col: hi ? CH.yellow : CH.white, mood: hi ? 'wow' : 'calm' }); } W2('ONLY ABOUT 6-7 OUT OF 10', 960, 250, 80, CH.yellow, on(lt, a, a + 0.6)); });

  // ---- 2 · HICCUP (12-20) ----
  shot(12, 'H12', (lt) => { badge('NO. 2'); W2('THE HICCUP', 960, 250, 170, CH.white, on(lt, 0, 0.9)); torso(960, 640, 0.75, { p: on(lt, 0.3, 1.2), dia: Math.max(0, Math.sin(lt * 6)) }); W2('HIC!', 1460, 560 + Math.sin(lt * 12) * 12, 110, CH.yellow, on(lt, 1.2, 1.5)); });
  shot(13, 'H13', (lt) => { badge('NO. 2 · THE HICCUP'); torso(760, 560, 1, { lungs: 0.7 + 0.3 * Math.sin(lt * 2) }); K.chalk([[1200, 520], [1260, 520], [1290, 420], [1340, 620], [1370, 520], [1480, 520]], CH.yellow, 10, on(lt, 0.4, 1.4), 330); W2('A GLITCH', 1340, 720, 80, CH.yellow, on(lt, 1.2, 1.8)); });
  shot(14, 'H14', (lt, d, t, A) => { badge('NO. 2 · THE HICCUP'); const j = eob(seg(lt, A('jerks', 14) - 0.2, A('jerks', 14) + 0.3)); torso(760, 560, 1, { dia: j }); const a = A('diaphragm', 14) - 0.2; W2('DIAPHRAGM', 1330, 330, 76, CH.orange, on(lt, a, a + 0.5)); K.arrowC(1180, 380, 960, 560, CH.orange, on(lt, a + 0.2, a + 0.7)); if (j > 0.5) W2('JERK!', 1330, 560, 90, CH.yellow, 1, -0.06); });
  shot(15, 'H15', (lt, d, t, A) => { badge('NO. 2 · THE HICCUP'); const sn = A('snap', 15), g = 1 - eob(seg(lt, sn - 0.1, sn + 0.15)); torso(760, 560, 1, { dia: 1, gap: clamp(g, 0, 1) }); W2('VOCAL CORDS', 1330, 270, 66, CH.yellow, on(lt, A('vocal', 15) - 0.2, A('vocal', 15) + 0.4)); K.arrowC(1180, 310, 800, 340, CH.yellow, on(lt, A('vocal', 15), A('vocal', 15) + 0.4)); if (lt > sn) { W2('HIC!', 1330, 600, 160, CH.white, on(lt, sn, sn + 0.2), -0.05); K.poof(1330, 590, 190, 1 - seg(lt, sn, sn + 0.7)); } }, { zoom: 0.06 });
  shot(16, 'H16', (lt, d, t, A) => { badge('NO. 2 · THE HICCUP'); head(520, 330, 0.7, { brain: CH.pink, ba: 0.4 }); torso(1250, 560, 0.9, { dia: 0.5 }); const p1 = on(lt, 0.3, 1.8), p2 = on(lt, A('vagus', 16) - 0.8, A('vagus', 16) + 0.6);
    K.chalk([[500, 440], [560, 560], [900, 620], [1180, 560], [1230, 640]], CH.pink, 9, p1, 340); K.chalk([[560, 440], [640, 520], [940, 690], [1250, 520], [1280, 620]], CH.yellow, 9, p2, 341); W2('PHRENIC NERVE', 700, 770, 54, CH.pink, on(lt, A('phrenic', 16), A('phrenic', 16) + 0.4)); W2('VAGUS NERVE', 1300, 120 + 0, 54, CH.yellow, on(lt, A('vagus', 16), A('vagus', 16) + 0.4)); });
  shot(17, 'H17', (lt) => { badge('NO. 2 · THE HICCUP'); W2('?', 960, 400, 420, CH.yellow, on(lt, 0.2, 0.9)); W2('NOBODY KNOWS FOR SURE', 960, 760, 90, CH.white, on(lt, 1.2, 2)); });
  shot(18, 'H18', (lt, d, t, A) => { badge('NO. 2 · THE HICCUP'); fish(520, 450, 1.5, on(lt, 0, 0.9)); torso(1400, 520, 0.75, { p: on(lt, A('control', 17) - 0.5, A('control', 17) + 0.5) }); K.arrowC(800, 450, 1050, 450, CH.yellow, on(lt, 1.2, 1.9)); W2('GILL LEFTOVER?', 960, 790, 80, CH.yellow, on(lt, A('gills', 17), A('gills', 17) + 0.6)); }, { zoom: 0.03 });
  shot(19, 'H19', (lt, d, t, A) => { badge('NO. 2 · THE HICCUP'); K.circleC(480, 380, 90, CH.white, 8, on(lt, 0, 0.6), 350); K.chalk([[480, 470], [480, 620]], CH.white, 8, on(lt, 0.2, 0.8), 351); K.chalk([[430, 650], [540, 650], [540, 760], [430, 760], [430, 650]], CH.blue, 8, on(lt, 0.4, 1), 352);
    W2('HELPS BABIES FEED', 480, 830 - 0, 50, CH.blue, on(lt, A('babies', 19), A('babies', 19) + 0.4)); womb(1350, 400, 1.3, on(lt, A('third', 19) - 0.8, A('third', 19) + 0.3)); W2('BREATHING PRACTICE', 1350, 700, 56, CH.pink, on(lt, A('practice', 19), A('practice', 19) + 0.4)); W2('BURP', 800, 380, 70, CH.yellow, on(lt, A('burp', 19) , A('burp', 19) + 0.3)); });
  shot(20, 'H20', (lt, d, t) => { badge('NO. 2 · THE HICCUP'); K.person(700, 660, 1.1, { p: on(lt, 0, 0.7), mood: 'wow', arms: { L: [-130, -30], R: [130, -30] } }); W2('USEFUL?', 1350, 300, 110, CH.yellow, on(lt, 0.8, 1.4)); W2('USELESS?', 1350, 480, 110, CH.pink, on(lt, 1.5, 2.1)); W2('EXPERTS DISAGREE', 1350, 680, 60, CH.white, on(lt, 2.4, 3)); });

  // ---- 3 · SUN SNEEZE (21-28) ----
  shot(21, 'S21', (lt, d, t) => { badge('NO. 3'); W2('THE SUN SNEEZE', 960, 250, 150, CH.white, on(lt, 0, 0.9)); sun(420, 600, 90, on(lt, 0.3, 1), t); head(1250, 560, 0.7, { p: on(lt, 0.5, 1.2) }); W2('ACHOO!', 1500, 480, 80, CH.yellow, on(lt, 1.6, 2)); });
  shot(22, 'S22', (lt, d, t, A) => { badge('NO. 3 · THE SUN SNEEZE'); sun(1500, 300, 110, 1, t); const u = clamp(lt / (d - 1.2)); K.person(lerp(300, 1050, eio(u)), 700, 0.85, { mood: u > 0.95 ? 'wow' : 'calm', t }); if (u > 0.98) { W2('ACHOO!', 1100, 360, 130, CH.yellow, on(lt, d - 1.1, d - 0.8), -0.05); K.poof(1100, 380, 160, 1 - seg(lt, d - 1.1, d - 0.4)); } });
  shot(23, 'S23', (lt, d, t, A) => { badge('NO. 3 · THE SUN SNEEZE'); const a = A('estimate', 23) - 0.1; for (let i = 0; i < 10; i++) { const hi = i < 3 && lt > a + 0.8; K.person(330 + i * 140, 600, 0.42, { p: on(lt, i * 0.07, i * 0.07 + 0.5), col: hi ? CH.yellow : CH.white, mood: hi ? 'wow' : 'calm' }); } W2('PHOTIC SNEEZE REFLEX', 960, 250, 80, CH.white, on(lt, 0, 0.6)); W2('18-35 OUT OF 100', 960, 800 - 80, 100, CH.yellow, on(lt, a + 0.6, a + 1.2)); });
  shot(24, 'S24', (lt, d, t, A) => { badge('NO. 3 · THE SUN SNEEZE'); K.person(480, 660, 0.95, { col: CH.yellow, mood: 'wow' }); K.person(820, 760, 0.6, { col: CH.yellow, mood: 'wow', p: on(lt, 0.8, 1.5) }); const q = on(lt, A('fifty', 24) - 0.5, A('fifty', 24) + 0.8); K.circleC(1400, 440, 170, CH.white, 9, q, 360); K.hatch(1400, 440, 160, CH.yellow, 0.5, q > 0.5 ? 1 : q * 2); K.chalk([[1400, 270], [1400, 610]], CH.white, 8, q, 361); W2('50 %', 1400, 440, 90, CH.board === undefined ? CH.white : CH.white, q); W2('RUNS IN FAMILIES', 1400, 700, 64, CH.white, on(lt, 0.3, 0.9)); });
  shot(25, 'S25', (lt, d, t) => { badge('NO. 3 · THE SUN SNEEZE'); sun(520, 400, 120, 1, t); W2('LIGHT  →  ?  →  SNEEZE', 1100, 400, 100, CH.white, on(lt, 0.3, 1.1)); W2('HOW? STILL UNKNOWN', 960, 760, 90, CH.yellow, on(lt, 1.4, 2)); });
  shot(26, 'S26', (lt, d, t, A) => { badge('NO. 3 · THE SUN SNEEZE'); head(700, 430, 1.15, {}); const p = on(lt, 0.8, 2.4); K.chalk([[805, 375], [900, 330], [990, 400], [1000, 470], [950, 520]], CH.yellow, 10, p, 370);
    W2('EYE NERVE', 1450, 300, 64, CH.yellow, on(lt, A('eye', 26) - 0.1, A('eye', 26) + 0.4)); W2('NOSE NERVES', 1450, 560, 64, CH.pink, on(lt, A('nose', 26) - 0.1, A('nose', 26) + 0.4)); K.arrowC(1250, 330, 1000, 400, CH.yellow, on(lt, 1, 1.5)); K.arrowC(1250, 560, 980, 505, CH.pink, on(lt, 1.8, 2.3)); W2('SIGNALS CROSS?', 960, 800, 70, CH.white, on(lt, A('cross', 26) - 0.2, A('cross', 26) + 0.4)); });
  shot(27, 'S27', (lt, d, t, A) => { badge('NO. 3 · THE SUN SNEEZE'); K.chalk([[300, 650], [900, 650], [900, 300], [1620, 300]], CH.yellow, 14, on(lt, 0.2, 2.2), 380); sun(1500, 190, 55, on(lt, 2, 2.6), t); W2('DARK', 600, 740, 64, CH.blue, on(lt, 0.8, 1.2)); W2('BRIGHT', 1260, 400, 64, CH.yellow, on(lt, 2.2, 2.6)); W2('SUDDEN CHANGE', 900, 190, 80, CH.white, on(lt, A('sudden', 27) - 0.1, A('sudden', 27) + 0.5)); });
  shot(28, 'S28', (lt, d, t, A) => { badge('NO. 3 · THE SUN SNEEZE'); K.chalk([[380, 560], [380, 480], [560, 480], [660, 380], [1000, 380], [1130, 480], [1380, 480], [1380, 560], [380, 560]], CH.white, 9, on(lt, 0, 1), 390); K.circleC(560, 580, 56, CH.white, 9, on(lt, 0.3, 1), 391); K.circleC(1200, 580, 56, CH.white, 9, on(lt, 0.3, 1), 392);
    const e = A('eyes', 28) - 0.2; if (lt > e) { K.chalk(K.arc(800, 280, 40, 0.2, Math.PI - 0.2, 10), CH.yellow, 8, 1, 393); K.chalk(K.arc(930, 280, 40, 0.2, Math.PI - 0.2, 10), CH.yellow, 8, 1, 394); W2('EYES SHUT!', 1000, 160, 80, CH.yellow, on(lt, e, e + 0.4)); } W2('HARMLESS', 960, 780, 90, CH.green, on(lt, 0.5, 1)); tick(1500, 780, 1.3, on(lt, 1, 1.5)); });

  // ---- 4 · FOOT (29-35) ----
  shot(29, 'F29', (lt, d, t) => { badge('NO. 4'); W2('THE FOOT THAT', 960, 200, 130, CH.white, on(lt, 0, 0.8)); W2('FALLS ASLEEP', 960, 350, 130, CH.yellow, on(lt, 0.5, 1.3)); leg(620, 540, 1.1, on(lt, 0.8, 1.6)); W2('Z z z', 1500, 600 - Math.sin(lt * 2) * 15, 100, CH.blue, on(lt, 1.6, 2.2)); });
  shot(30, 'F30', (lt, d, t, A) => { badge('NO. 4 · THE SLEEPING FOOT'); leg(520, 380, 1.5, 1); for (let i = 0; i < 16; i++) { const x = 1040 + rnd(i * 3 + Math.floor(lt * 14)) * 250, y = 520 + rnd(i * 5 + Math.floor(lt * 14)) * 280; K.chalk([[x, y], [x + 20, y - 18], [x + 40, y + 10], [x + 60, y - 10]], CH.pink, 6, lt > 0.8 ? 1 : 0, 400 + i); } W2('BZZZZ', 1600, 400, 90, CH.pink, on(lt, 1, 1.5)); });
  shot(31, 'F31', (lt, d, t, A) => { badge('NO. 4 · THE SLEEPING FOOT'); leg(520, 380, 1.5, 1); K.chalk([[650, 460], [900, 470], [1100, 520], [1180, 560]], CH.pink, 12, on(lt, 0.3, 1.2), 410); W2('NO BLOOD?', 1450, 300, 90, CH.pink, on(lt, A('blood', 31) - 0.4, A('blood', 31) + 0.3)); cross(1450, 480, 2, on(lt, d - 1.5, d - 1), CH.pink); W2('POPULAR STORY', 1450, 700, 60, CH.white, on(lt, 0.2, 0.8)); });
  shot(32, 'F32', (lt, d, t, A) => { badge('NO. 4 · THE SLEEPING FOOT'); leg(520, 380, 1.5, 1); K.chalk([[650, 520], [900, 530], [1100, 580], [1180, 620]], CH.yellow, 10, on(lt, 0.2, 1), 420); const a = A('pressure', 32) - 0.2; K.chalk([[760, 300], [900, 300], [900, 360], [760, 360], [760, 300]], CH.orange, 9, on(lt, a, a + 0.5), 421); K.arrowC(830, 220, 830, 300, CH.orange, on(lt, a + 0.3, a + 0.7)); W2('PRESSURE ON A NERVE', 1400, 300, 70, CH.yellow, on(lt, a, a + 0.6)); });
  shot(33, 'F33', (lt, d, t, A) => { badge('NO. 4 · THE SLEEPING FOOT'); const sq = on(lt, 0.3, 1.2); K.chalk([[300, 520], [1000, 520 + 0]], CH.yellow, 36 - 24 * sq, 1, 430); K.chalk([[1000, 520], [1620, 520]], CH.yellow, 36, 1, 431);
    K.chalk([[560, 340], [760, 340]], CH.orange, 20, sq, 432); K.chalk([[560, 700], [760, 700]], CH.orange, 20, sq, 433); K.arrowC(660, 340, 660, 450, CH.orange, sq); K.arrowC(660, 700, 660, 590, CH.orange, sq);
    for (let i = 0; i < 4; i++) { const u = (lt * 0.4 + i / 4) % 1, x = lerp(300, 560, Math.min(u * 1.5, 1) ); K.circleC(x, 520, 14, CH.white, 6, 1, 440 + i); } W2('MESSAGE BLOCKED', 1100, 250, 80, CH.yellow, on(lt, 0.8, 1.5)); W2('NUMB', 1500, 700, 100, CH.blue, on(lt, d - 1.6, d - 1)); });
  shot(34, 'F34', (lt, d, t, A) => { badge('NO. 4 · THE SLEEPING FOOT'); K.chalk([[300, 520], [1620, 520]], CH.yellow, 30, 1, 450); const rs = A('restarts', 34); for (let i = 0; i < 18; i++) { const x = 500 + rnd(i * 2 + Math.floor(lt * 10)) * 1000, y = 400 + rnd(i * 7 + Math.floor(lt * 10)) * 240; K.chalk([[x, y], [x + 30, y - 25], [x + 60, y + 15]], CH.pink, 6, lt > rs ? 1 : 0, 460 + i); }
    W2('PINS AND NEEDLES', 960, 250, 110, CH.pink, on(lt, A('pins', 34) - 0.2, A('pins', 34) + 0.5)); W2('SCRAMBLED SIGNALS', 960, 780, 70, CH.white, on(lt, A('scrambled', 34) - 0.2, A('scrambled', 34) + 0.5)); });
  shot(35, 'F35', (lt, d, t, A) => { badge('NO. 4 · THE SLEEPING FOOT'); tick(520, 430, 3.2, on(lt, 0.2, 0.9)); W2('FADES FAST = FINE', 520, 700, 64, CH.green, on(lt, 0.5, 1.1)); K.chalk([[1360, 330], [1360, 560]], CH.pink, 26, on(lt, A('keeps', 35) - 0.3, A('keeps', 35) + 0.5), 470); K.chalk([[1245, 445], [1475, 445]], CH.pink, 26, on(lt, A('keeps', 35) - 0.3, A('keeps', 35) + 0.5), 471); W2('KEEPS COMING BACK', 1360, 700, 60, CH.pink, on(lt, A('keeps', 35), A('keeps', 35) + 0.5)); W2('GET IT CHECKED', 1360, 780, 60, CH.white, on(lt, A('checked', 35) - 0.2, A('checked', 35) + 0.4)); });

  // ---- outro ----
  shot(36, 'O36', (lt, d, t, A) => { [['YAWN', 480, 300, CH.pink], ['HICCUP', 1440, 300, CH.orange], ['SUN SNEEZE', 480, 600, CH.blue], ['SLEEPING FOOT', 1440, 600, CH.green]].forEach(([s, x, y, c], k) => { const a = 0.3 + k * 0.5; K.chalk([[x - 340, y - 90], [x + 340, y - 90], [x + 340, y + 90], [x - 340, y + 90], [x - 340, y - 90]], c, 8, on(lt, a, a + 0.5), 480 + k); W2(s, x, y, 80, c, on(lt, a + 0.2, a + 0.7)); }); W2('?', 960, 450, 200, CH.yellow, on(lt, d - 2.5, d - 1.8)); });
  shot(37, 'O37', (lt, d, t, A) => { W2('WHICH NEXT?', 960, 230, 150, CH.yellow, on(lt, 0, 0.8)); ['WHY WE DREAM', 'DEJA VU', 'EYE TWITCHES', 'WHY WE CRY'].forEach((s, k) => W2(s, 960, 430 + k * 110, 90, [CH.pink, CH.blue, CH.orange, CH.green][k], on(lt, 0.8 + k * 0.45, 1.3 + k * 0.45))); W2('COMMENT BELOW', 960, 835, 56, CH.white, on(lt, d - 1.6, d - 1)); });
  shot(38, 'O38', (lt, d, t) => { W2('SUBSCRIBE', 960, 400, 190, CH.yellow, on(lt, 0, 0.8)); K.chalk(K.arc(960, 650, 100, Math.PI, 2 * Math.PI, 20, 120).concat([[1060, 650], [1090, 740], [830, 740], [860, 650]]), CH.white, 9, on(lt, 0.6, 1.5), 490); K.circleC(960, 770, 20, CH.white, 8, on(lt, 1.4, 1.7), 491); W2('SOLO HYPE', 960, 200, 70, CH.white, on(lt, 0.8, 1.4)); });

  return { shots: S, cues: CUES };
}
