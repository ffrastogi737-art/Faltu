// WHY YOU CAN'T REMEMBER BEING A BABY (Chalk Talk). Everything is drawn on a chalkboard and draws itself on.
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L, Wd } from './core/timing.js';
import * as K from './core/kit.js';
const CH = K.CH;
const brain = (x, y, s, col, p, seed = 300) => { K.chalk(K.arc(x, y, 150 * s, Math.PI, 2 * Math.PI, 30, 120 * s).concat([[x + 150 * s, y], [x - 150 * s, y]]), col, 9, p, seed); for (let i = 0; i < 3; i++) K.chalk(K.arc(x - 60 * s + i * 60 * s, y - 40 * s, 40 * s, Math.PI * 1.1, Math.PI * 1.9, 10, 30 * s), col, 6, p, seed + 1 + i); };
const frame = (x, y, w, h, col, p, seed = 400) => { K.chalk([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2], [x - w / 2, y - h / 2]], col, 8, p, seed); K.chalk([[x - w / 2 + 20, y + h / 2 - 20], [x - 20, y - h / 6], [x + 20, y + h / 6], [x + w / 2 - 20, y - h / 4]], CH.blue, 6, p, seed + 1); };
const check = (x, y, s, col, p) => K.chalk([[x - 40 * s, y], [x - 10 * s, y + 40 * s], [x + 50 * s, y - 50 * s]], col, 14, p, 450);
const shelf = (x, y, w, p, seed = 500) => { K.chalk([[x - w / 2, y], [x + w / 2, y]], CH.wood === undefined ? CH.white : CH.orange, 9, p, seed); const cols = [CH.white, CH.blue, CH.pink, CH.yellow, CH.white, CH.blue]; for (let i = 0; i < 6; i++) { const bx = x - w / 2 + 30 + i * (w - 60) / 6, bh = 100 + (i * 37 % 50); K.chalk([[bx, y], [bx, y - bh], [bx + 44, y - bh], [bx + 44, y]], cols[i], 6, p, seed + 1 + i); } };

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);
  const on = (lt, a, b) => eo(seg(lt, a, b));

  // 1 · baby brain recording, can't find one
  { const rc = Wd('recording', 0), on1 = Wd('one', 0);
    add({ id: 'S01', at: 0, cam: [540, 760], zoom: 0.08, note: 'a brain with a blinking REC dot; a big question mark on "one"', draw(lt, d, t) {
      K.board(); brain(540, 640, 1.5, CH.pink, on(lt, 0, 0.6));
      K.write('BABY BRAIN', 540, 330, 84, CH.white, on(lt, 0.1, 0.6));
      if (lt > rc - 0.2) { if (Math.sin(t * 8) > -0.3) K.circleC(300, 800, 26, CH.orange, 16, 1, 410); K.write('REC', 440, 800, 70, CH.orange, on(lt, rc - 0.2, rc + 0.2)); }
      if (lt > on1 - 0.2) K.write('?', 760, 900, 260, CH.yellow, eob(seg(lt, on1 - 0.2, on1 + 0.2)), 0.08);
    } });
    cue(0.2, 'slide', { dur: 0.6 }); cue(rc - 0.2, 'sparkle', { dur: 0.6 }); cue(on1 - 0.2, 'boing', { gain: 0.6 }); }

  // 2 · nothing before age three: a timeline
  { const st = cut(1), th = Wd('three', 1) - st;
    add({ id: 'S02', at: st, cam: [540, 760], zoom: 0.07, note: 'timeline 0..6 years; question marks fill 0-3; a yellow marker at 3', draw(lt) {
      K.board(); K.write('YOUR LIFE', 540, 420, 90, CH.white, on(lt, 0, 0.4));
      K.chalk([[110, 760], [970, 760]], CH.white, 9, on(lt, 0.1, 0.7), 420);
      for (let i = 0; i <= 3; i++) { const x = 110 + i * 286; K.chalk([[x, 730], [x, 790]], CH.white, 8, on(lt, 0.3, 0.8), 421 + i); K.write(['0', '3', '6', '9'][i], x, 850, 60, CH.white, on(lt, 0.4, 0.8)); }
      for (let i = 0; i < 3; i++) K.write('?', 190 + i * 100, 680, 110, CH.pink, on(lt, 0.4 + i * 0.12, 0.8 + i * 0.12));
      if (lt > th - 0.2) { K.arrowC(396, 600, 396, 720, CH.yellow, on(lt, th - 0.2, th + 0.2)); K.write('AGE 3', 396, 540, 70, CH.yellow, on(lt, th - 0.2, th + 0.2)); }
    } });
    cue(st, 'whoosh'); cue(st + 0.2, 'slide', { dur: 0.6 }); cue(st + th - 0.2, 'pop'); }

  // 3 · scientists thought babies couldn't store memories
  { const st = cut(2), sto = Wd('store', 2) - st;
    add({ id: 'S03', at: st, cam: [540, 760], zoom: 0.08, note: 'brain with a big chalk X over it; NO SAVING written', draw(lt) {
      K.board(); K.write('SCIENTISTS THOUGHT', 540, 330, 70, CH.white, on(lt, 0, 0.4));
      brain(540, 760, 1.4, CH.pink, on(lt, 0.2, 0.7));
      if (lt > sto - 0.2) { const p = on(lt, sto - 0.2, sto + 0.3); K.chalk([[340, 560], [740, 960]], CH.orange, 16, p, 430); K.chalk([[740, 560], [340, 960]], CH.orange, 16, p, 431); K.write('CAN\'T SAVE', 540, 1120, 90, CH.orange, p, -0.04); }
    } });
    cue(st, 'whoosh'); cue(st + sto - 0.2, 'slam', { gain: 0.5 }); }

  // 4 · 2025 Yale scans
  { const st = cut(3), ya = Wd('yale', 3) - st, br = Wd('brains', 3) - st;
    add({ id: 'S04', at: st, cam: [540, 760], zoom: 0.07, note: '2025 written big; a scanner ring around a baby head; YALE', draw(lt) {
      K.board(); K.write('2025', 540, 330, 150, CH.yellow, on(lt, 0, 0.5));
      K.circleC(540, 800, 190, CH.white, 8, on(lt, 0.3, 0.8), 440); K.circleC(540, 800, 250, CH.blue, 8, on(lt, 0.4, 0.9), 441);
      K.circleC(540, 800, 90, CH.pink, 9, on(lt, 0.5, 0.9), 442); K.circleC(510, 790, 8, CH.pink, 7, on(lt, 0.8, 1), 443); K.circleC(570, 790, 8, CH.pink, 7, on(lt, 0.8, 1), 444); K.chalk(K.arc(540, 820, 24, 0.3, Math.PI - 0.3, 10), CH.pink, 6, on(lt, 0.8, 1), 445);
      if (lt > ya - 0.2) K.label('YALE', 540, 1130, 90, CH.white, on(lt, ya - 0.2, ya + 0.3));
      if (lt > br) { const u = (lt * 0.8) % 1; K.chalk([[290, 800 - 220 + u * 440], [790, 800 - 220 + u * 440]], CH.blue, 6, 1, 446); }
    } });
    cue(st, 'whoosh'); cue(st + 0.3, 'slide', { dur: 0.8 }); cue(st + ya - 0.2, 'pop'); }

  // 5 · memory center brighter -> recognized the picture
  { const st = cut(4), br = Wd('brighter', 4) - st, rc = Wd('recognize', 4) - st;
    add({ id: 'S05', at: st, cam: [540, 760], zoom: 0.07, note: 'brain with a yellow hatch glow on "brighter"; picture frame and a check on "recognize"', draw(lt) {
      K.board(); brain(540, 520, 1.2, CH.pink, on(lt, 0, 0.5));
      if (lt > br - 0.2) { const g = on(lt, br - 0.2, br + 0.4); K.hatch(540, 470, 70, CH.yellow, 0.7 * g, g); K.label('MEMORY CENTER', 540, 750, 64, CH.yellow, g); }
      if (lt > rc - 0.3) { const p = on(lt, rc - 0.3, rc + 0.3); frame(540, 1000, 300, 220, CH.white, p); check(780, 1000, 1.2, CH.yellow, on(lt, rc, rc + 0.3)); }
    } });
    cue(st, 'whoosh'); cue(st + br - 0.2, 'sparkle', { dur: 0.8 }); cue(st + rc, 'pop'); }

  // 6 · memories were saved, babies as young as one
  { const st = cut(5), sv = Wd('saved', 5) - st, on1 = Wd('one', 5) - st;
    add({ id: 'S06', at: st, cam: [540, 760], zoom: 0.08, note: 'a big SAVED box with check; AGE 1 and a baby', draw(lt) {
      K.board(); K.chalk([[240, 420], [840, 420], [840, 820], [240, 820], [240, 420]], CH.white, 10, on(lt, 0, 0.5), 460);
      if (lt > sv - 0.2) { const p = on(lt, sv - 0.2, sv + 0.3); check(540, 620, 3, CH.yellow, p); K.write('SAVED', 540, 940, 110, CH.yellow, p); }
      if (lt > on1 - 0.2) { const p = on(lt, on1 - 0.2, on1 + 0.3); K.write('AGE', 400, 1130, 80, CH.white, p); K.write('1', 640, 1130, 150, CH.yellow, p); K.poof(640, 1100, 160, 1 - seg(lt, on1, on1 + 0.6)); }
    } });
    cue(st, 'whoosh'); cue(st + sv - 0.2, 'pop', { gain: 0.8 }); cue(st + on1 - 0.2, 'sparkle', { dur: 0.6 }); }

  // 7 · the real problem may be finding them
  { const st = cut(6), fi = Wd('finding', 6) - st;
    add({ id: 'S07', at: st, cam: [540, 760], zoom: 0.08, note: 'a magnifying glass sweeps over a brain with a question mark; FINDING IT', draw(lt, d, t) {
      K.board(); brain(540, 700, 1.3, CH.pink, on(lt, 0, 0.5));
      K.write('THE REAL PROBLEM', 540, 360, 74, CH.white, on(lt, 0.1, 0.5));
      if (lt > fi - 0.3) { const p = on(lt, fi - 0.3, fi + 0.3), mx = 540 + Math.sin(t * 2) * 160, my = 760; K.circleC(mx, my, 90, CH.yellow, 12, p, 470); K.chalk([[mx + 64, my + 64], [mx + 150, my + 150]], CH.yellow, 16, p, 471); K.write('?', mx, my + 28, 100, CH.yellow, p); }
      if (lt > fi) K.write('FINDING THEM', 540, 1120, 90, CH.yellow, on(lt, fi, fi + 0.4));
    } });
    cue(st, 'whoosh'); cue(st + 0.2, 'slide', { dur: 0.6 }); cue(st + fi - 0.3, 'pop'); }

  // 8 · a library, books on shelves, no way to look them up
  { const st = cut(7), li = Wd('library', 7) - st, lk = Wd('look', 7) - st;
    add({ id: 'S08', at: st, cam: [540, 760], zoom: 0.07, note: 'two shelves of chalk books draw on; LIBRARY; on "look" a crossed-out search box', draw(lt) {
      K.board(); K.write('LIBRARY', 540, 330, 100, CH.yellow, on(lt, li - 0.1, li + 0.4));
      shelf(540, 640, 820, on(lt, 0.2, 0.9), 500); shelf(540, 880, 820, on(lt, 0.5, 1.2), 520);
      if (lt > lk - 0.2) { const p = on(lt, lk - 0.2, lk + 0.3); K.chalk([[240, 1060], [840, 1060], [840, 1150], [240, 1150], [240, 1060]], CH.white, 8, p, 540); K.write('SEARCH...', 520, 1135, 56, CH.white, p); K.chalk([[200, 1180], [880, 1030]], CH.orange, 14, p, 541); }
    } });
    cue(st, 'whoosh'); cue(st + 0.3, 'slide', { dur: 0.8 }); cue(st + lk - 0.2, 'slam', { gain: 0.4 }); }

  // 9 · still testing how long they last
  { const st = cut(8), te = Wd('testing', 8) - st, lo = Wd('long', 8) - st;
    add({ id: 'S09', at: st, cam: [540, 760], zoom: 0.08, note: 'a stopwatch with a spinning hand; HOW LONG?', draw(lt, d, t) {
      K.board(); K.circleC(540, 760, 240, CH.white, 10, on(lt, 0, 0.6), 550); K.chalk([[500, 490], [580, 490]], CH.white, 12, on(lt, 0.2, 0.6), 551); K.chalk([[540, 520], [540, 490]], CH.white, 10, on(lt, 0.2, 0.6), 552);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.chalk([[540 + Math.cos(a) * 205, 760 + Math.sin(a) * 205], [540 + Math.cos(a) * 230, 760 + Math.sin(a) * 230]], CH.white, 6, on(lt, 0.3, 0.8), 560 + i); }
      const a = lt * 3 - Math.PI / 2; K.chalk([[540, 760], [540 + Math.cos(a) * 170, 760 + Math.sin(a) * 170]], CH.yellow, 10, lt > te - 0.2 ? 1 : 0, 580);
      if (lt > lo - 0.2) K.write('HOW LONG?', 540, 1130, 100, CH.yellow, on(lt, lo - 0.2, lo + 0.3), -0.03);
    } });
    cue(st, 'whoosh'); cue(st + te - 0.2, 'sizzle', { dur: 0.8 }); cue(st + lo - 0.2, 'boing', { gain: 0.5 }); }

  // 10 · first birthday may still be saved (loops back to the hook)
  { const st = cut(9), bd = Wd('birthday', 9) - st, sv = Wd('saved', 9) - st;
    add({ id: 'S10', at: st, cam: [540, 760], zoom: 0.07, note: 'a birthday cake with one candle inside a brain outline; SAVED', draw(lt, d, t) {
      K.board(); brain(540, 560, 1.7, CH.pink, on(lt, 0, 0.5));
      if (lt > bd - 0.4) { const p = on(lt, bd - 0.4, bd + 0.2); K.chalk([[400, 900], [400, 780], [680, 780], [680, 900], [400, 900]], CH.white, 9, p, 600); K.chalk([[400, 840], [680, 840]], CH.pink, 7, p, 601); K.chalk([[540, 780], [540, 700]], CH.yellow, 9, p, 602); K.chalk([[540, 690], [520, 650], [540, 620], [565, 650], [540, 690]], CH.orange, 8, p * (0.6 + 0.4 * Math.abs(Math.sin(t * 9))), 603); K.write('1', 540, 880, 70, CH.yellow, p); }
      if (lt > sv - 0.2) K.write('STILL SAVED?', 540, 1130, 100, CH.yellow, on(lt, sv - 0.2, sv + 0.3), -0.03);
    } });
    cue(st, 'whoosh'); cue(st + bd - 0.4, 'sparkle', { dur: 1.0 }); cue(st + sv - 0.2, 'pop'); }

  return { shots: S, cues: CUES };
}
