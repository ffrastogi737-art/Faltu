// WHY YOU GET GOOSEBUMPS (Chalk Talk): the shot list. Everything is drawn on a chalkboard and draws itself on.
// A shot: { id, at, cam: [cx, cy], zoom, note, draw(lt, d, t) }. Captions sit at y 1400: keep drawings above ~1250.
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L, Wd } from './core/timing.js';
import * as K from './core/kit.js';
const CH = K.CH;

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);
  const on = (lt, a, b) => eo(seg(lt, a, b));

  // 1 · a song, arms explode in bumps
  { const sg = Wd('song', 0), ex = Wd('explode', 0);
    add({ id: 'S01', at: 0, cam: [540, 760], zoom: 0.08, note: 'chalk person with headphones, music notes float, yellow bumps pop along the arm on "explode"', draw(lt, d, t) {
      K.board(); const b = lt > ex - 0.1 ? eob(seg(lt, ex - 0.1, ex + 0.3)) : 0;
      K.person(540, 1000, 1.6, { p: on(lt, 0, 0.6), headphones: true, mood: b > 0.5 ? 'wow' : 'calm', arms: { L: [-110, 120], R: [170, -20] }, bumps: b });
      for (let i = 0; i < 3; i++) { const u = (lt * 0.5 + i / 3) % 1; K.note(300 + i * 230 + Math.sin(lt * 2 + i) * 30, 560 - u * 260, 1, [CH.yellow, CH.pink, CH.blue][i], lt > sg - 0.2 ? clamp((lt - sg + 0.2) * 3) * (1 - u) : 0); }
      K.poof(840, 760, 120, b > 0 && b < 1.05 ? 1 - seg(lt, ex, ex + 0.6) : 0);
    } });
    cue(0.2, 'slide', { dur: 0.6 }); cue(sg - 0.2, 'sparkle', { dur: 0.8 }); cue(ex - 0.1, 'boing', { gain: 0.6 }); }

  // 2 · every hair has its own tiny muscle
  { const st = cut(1), hr = Wd('hair', 1) - st, mu = Wd('muscle', 1) - st;
    add({ id: 'S02', at: st, cam: [540, 760], zoom: 0.06, note: 'skin cross-section draws on: skin line, follicle, hair; the muscle is drawn and labelled on "muscle"', draw(lt) {
      K.board(); K.write('UNDER YOUR SKIN', 540, 360, 90, CH.white, on(lt, 0, 0.5));
      K.skin(540, 760, 900, 1.8, 0, 0, on(lt, 0.1, hr + 0.3));
      if (lt > mu - 0.2) { K.label('TINY MUSCLE', 280, 560, 64, CH.yellow, on(lt, mu - 0.2, mu + 0.4)); K.arrowC(280, 620, 330, 830, CH.yellow, on(lt, mu, mu + 0.4)); }
      if (lt > hr - 0.1) K.label('HAIR', 860, 480, 70, CH.white, on(lt, hr - 0.1, hr + 0.3));
    } });
    cue(st, 'whoosh'); cue(st + 0.1, 'slide', { dur: 0.8 }); cue(st + mu - 0.2, 'pop'); }

  // 3 · cold, or a feeling hits you hard
  { const st = cut(2), co = Wd('cold', 2) - st, fe = Wd('feeling', 2) - st;
    add({ id: 'S03', at: st, cam: [540, 760], zoom: 0.08, note: 'left: shivering person + snowflake on "cold"; right: heart + bolt on "feeling"', draw(lt, d, t) {
      K.board();
      K.person(300, 1060, 1.1, { p: on(lt, 0, 0.5), mood: 'cold', shiver: lt > co, t, arms: { L: [40, 60], R: [-40, 60] } });
      K.snowflake(300, 430, 90, CH.blue, lt > co - 0.15 ? on(lt, co - 0.15, co + 0.4) : 0, lt * 0.6);
      K.write('COLD', 300, 600, 70, CH.blue, lt > co ? on(lt, co, co + 0.3) : 0);
      if (lt > fe - 0.2) { const pp = on(lt, fe - 0.2, fe + 0.5), s = 1 + 0.08 * Math.max(0, Math.sin(lt * 9));
        K.chalk([[780, 560], [700, 480], [700, 420], [740, 390], [780, 420], [820, 390], [860, 420], [860, 480], [780, 560]].map(([x, y]) => [780 + (x - 780) * s, 470 + (y - 470) * s]), CH.pink, 10, pp, 300);
        K.bolt(780, 800, 1.6, CH.yellow, pp); K.write('FEELINGS', 780, 1010, 70, CH.pink, pp); }
    } });
    cue(st, 'whoosh'); cue(st + co - 0.15, 'sparkle', { dur: 0.5 }); cue(st + fe - 0.2, 'heartbeat'); }

  // 4 · nervous system flips into alert mode
  { const st = cut(3), al = Wd('alert', 3) - st;
    add({ id: 'S04', at: st, cam: [540, 760], zoom: 0.1, note: 'a nerve line runs from a brain doodle down to the skin; ALERT! written with flashing exclamation', draw(lt) {
      K.board(); const p = on(lt, 0, 0.6);
      K.chalk(K.arc(540, 470, 150, Math.PI, 2 * Math.PI, 30, 120).concat([[690, 470], [390, 470]]), CH.pink, 9, p, 310);
      for (let i = 0; i < 3; i++) K.chalk(K.arc(480 + i * 60, 430, 40, Math.PI * 1.1, Math.PI * 1.9, 10, 30), CH.pink, 6, p, 311 + i);
      const path = [[540, 480], [520, 600], [580, 700], [510, 800], [560, 900]]; K.chalk(path, CH.yellow, 9, on(lt, 0.3, 1.1), 320);
      const u = clamp((lt - 0.3) * 1.2 % 1), k = Math.min(path.length - 2, Math.floor(u * (path.length - 1))), f = u * (path.length - 1) - k;
      K.circleC(lerp(path[k][0], path[k + 1][0], f), lerp(path[k][1], path[k + 1][1], f), 20, CH.yellow, 8, lt > 0.4 ? 1 : 0, 321);
      if (lt > al - 0.15) K.write('ALERT!', 540, 1060, 120, Math.sin(lt * 14) > 0 ? CH.yellow : CH.orange, on(lt, al - 0.15, al + 0.2), -0.05);
    } });
    cue(st, 'whoosh'); cue(st + 0.3, 'zip'); cue(st + al - 0.15, 'slam', { gain: 0.5 }); }

  // 5 · thousands of muscles squeeze, hairs stand up
  { const st = cut(4), sq = Wd('squeeze', 4) - st, up = Wd('up', 4) - st;
    add({ id: 'S05', at: st, cam: [540, 760], zoom: 0.06, note: 'the cross-section again: the muscle turns orange and shortens on "squeeze", the hair swings upright; a row of small hairs behind does the same', draw(lt) {
      K.board(); const k = lt > sq - 0.1 ? eio(seg(lt, sq - 0.1, up + 0.2)) : 0;
      for (let i = 0; i < 6; i++) { const x = 140 + i * 160, a = lerp(-0.4, -1.5, k); K.chalk([[x, 420], [x + Math.cos(a) * 90, 420 + Math.sin(a) * 90]], CH.white, 6, on(lt, 0, 0.4), 330 + i); }
      K.chalk([[80, 420], [1000, 420]], CH.pink, 6, on(lt, 0, 0.4), 340);
      K.skin(540, 800, 900, 1.8, k, 0, 1, k);
      if (k > 0.3) K.write('SQUEEZE!', 270, 560, 80, CH.orange, on(lt, sq, sq + 0.3), -0.06);
      if (k > 0.8) K.write('HAIR UP', 820, 520, 64, CH.white, on(lt, up, up + 0.3));
    } });
    cue(st, 'whoosh'); cue(st + sq - 0.1, 'slide', { dur: 0.6 }); cue(st + up, 'pop', { gain: 0.6 }); }

  // 6 · the skin bunches into a bump
  { const st = cut(5), bu = Wd('bump', 5) - st;
    add({ id: 'S06', at: st, cam: [540, 760], zoom: 0.08, note: 'cross-section with hair upright; the skin line rises into a bump on "bump"; BUMP label', draw(lt) {
      K.board(); const b = lt > bu - 0.5 ? eob(seg(lt, bu - 0.5, bu + 0.1)) : 0;
      K.skin(540, 820, 900, 1.8, 1, b, 1, 1);
      if (b > 0.5) { K.label('GOOSEBUMP', 340, 520, 80, CH.yellow, on(lt, bu, bu + 0.4)); K.arrowC(330, 590, 480, 720, CH.yellow, on(lt, bu + 0.1, bu + 0.4)); }
    } });
    cue(st, 'whoosh'); cue(st + bu - 0.5, 'slide', { dur: 0.5 }); cue(st + bu, 'pop', { gain: 0.7 }); }

  // 7 · for a furry animal, a superpower
  { const st = cut(6), su = Wd('superpower', 6) - st;
    add({ id: 'S07', at: st, cam: [540, 760], zoom: 0.08, note: 'a round fluffy animal draws on; SUPERPOWER written with a star', draw(lt) {
      K.board(); K.fluff(540, 760, 220, 0, CH.white, on(lt, 0, 0.7));
      if (lt > su - 0.2) { K.write('SUPERPOWER', 540, 1150, 96, CH.yellow, on(lt, su - 0.2, su + 0.3)); K.poof(540, 760, 330, 1 - seg(lt, su, su + 0.7)); }
    } });
    cue(st, 'whoosh'); cue(st + 0.1, 'slide', { dur: 0.6 }); cue(st + su - 0.2, 'sparkle', { dur: 0.8 }); }

  // 8 · puffed fur traps warm air and looks bigger
  { const st = cut(7), wa = Wd('warm', 7) - st, bi = Wd('bigger', 7) - st;
    add({ id: 'S08', at: st, cam: [540, 760], zoom: 0.05, note: 'the animal puffs up; orange warm-air arrows curl inside the fur; on "bigger" a dashed outline of its old size and a size arrow', draw(lt, d, t) {
      K.board(); const pf = eio(seg(lt, 0.1, 0.8));
      K.fluff(540, 740, 220, pf, CH.white, 1);
      if (lt > wa - 0.2) for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + t; K.chalk(K.arc(540 + Math.cos(a) * 200, 740 + Math.sin(a) * 200, 34, 0, Math.PI * 1.5, 12), CH.orange, 7, on(lt, wa - 0.2, wa + 0.4), 360 + i); }
      if (lt > wa) K.write('WARM AIR', 300, 380, 64, CH.orange, on(lt, wa, wa + 0.3));
      if (lt > bi - 0.2) { ctx.save(); ctx.setLineDash([18, 16]); K.circleC(540, 740, 200, CH.blue, 5, on(lt, bi - 0.2, bi + 0.3), 370); ctx.restore(); K.arrowC(860, 1080, 960, 960, CH.yellow, on(lt, bi, bi + 0.3)); K.write('BIGGER', 820, 1150, 72, CH.yellow, on(lt, bi, bi + 0.3)); }
    } });
    cue(st, 'whoosh'); cue(st + 0.1, 'slide', { dur: 0.7 }); cue(st + wa - 0.2, 'sizzle', { dur: 0.8 }); cue(st + bi - 0.1, 'boing', { gain: 0.5 }); }

  // 9 · a scared cat does exactly this
  { const st = cut(8), ca = Wd('cat', 8) - st;
    add({ id: 'S09', at: st, cam: [540, 760], zoom: 0.08, note: 'a side-on chalk cat draws on and arches into a puffed Halloween-cat pose on "cat"', draw(lt) {
      K.board(); const pf = lt > ca - 0.2 ? eob(seg(lt, ca - 0.2, ca + 0.3)) : 0;
      K.cat(560, 900, 1.3, pf, CH.white, on(lt, 0, 0.6));
      if (pf > 0.5) K.write('HISS!', 820, 470, 90, CH.pink, on(lt, ca, ca + 0.2), 0.1);
    } });
    cue(st, 'whoosh'); cue(st + 0.05, 'slide', { dur: 0.5 }); cue(st + ca - 0.2, 'boing', { gain: 0.6 }); }

  // 10 · you lost your fur, left with the bumps
  { const st = cut(9), fu = Wd('fur', 9) - st, bu = Wd('bumps', 9) - st;
    add({ id: 'S10', at: st, cam: [540, 760], zoom: 0.08, note: 'a fluffy animal on the left, a crossed-out fur label, the person on the right with yellow bumps on the arm', draw(lt) {
      K.board(); K.fluff(280, 760, 150, 1, CH.white, on(lt, 0, 0.4));
      K.arrowC(470, 760, 610, 760, CH.yellow, on(lt, 0.3, 0.7));
      K.person(800, 920, 1.0, { p: on(lt, 0.2, 0.7), mood: 'wow', arms: { L: [-90, 120], R: [150, -10] }, bumps: lt > bu - 0.2 ? on(lt, bu - 0.2, bu + 0.2) : 0 });
      if (lt > fu - 0.2) { K.write('FUR', 280, 400, 80, CH.white, on(lt, fu - 0.2, fu + 0.1)); K.chalk([[200, 430], [360, 370]], CH.pink, 10, on(lt, fu, fu + 0.3), 380); }
      if (lt > bu - 0.2) K.write('JUST BUMPS', 790, 400, 64, CH.yellow, on(lt, bu - 0.2, bu + 0.2));
    } });
    cue(st, 'whoosh'); cue(st + fu, 'slide', { dur: 0.3 }); cue(st + bu - 0.2, 'pop'); }

  // 11 · a leftover from your furry ancestors
  { const st = cut(10), an = Wd('ancestors', 10) - st;
    add({ id: 'S11', at: st, cam: [540, 760], zoom: 0.08, note: 'a family-tree line: a furry ancestor blob at the top, branch down to the person; LEFTOVER label', draw(lt) {
      K.board(); K.fluff(540, 470, 120, 0.8, CH.white, on(lt, 0, 0.5));
      K.chalk([[540, 620], [540, 760], [380, 760], [700, 760]], CH.yellow, 8, on(lt, 0.3, 0.8), 390);
      K.person(540, 1040, 0.8, { p: on(lt, 0.5, 1.0), mood: 'calm' });
      K.write('LEFTOVER', 850, 700, 70, CH.yellow, on(lt, 0.2, 0.6), 0.1);
      if (lt > an - 0.2) K.label('ANCESTORS', 540, 250, 64, CH.white, on(lt, an - 0.2, an + 0.3));
    } });
    cue(st, 'whoosh'); cue(st + 0.3, 'slide', { dur: 0.5 }); cue(st + an - 0.2, 'pop'); }

  // 12 · still firing every time a song gives you chills (loops back to the hook)
  { const st = cut(11), ch = Wd('chills', 11) - st;
    add({ id: 'S12', at: st, cam: [540, 760], zoom: 0.06, note: 'back to the hook: person with headphones, notes, bumps fire again on "chills"; CHILLS written', draw(lt, d, t) {
      K.board(); const b = lt > ch - 0.2 ? eob(seg(lt, ch - 0.2, ch + 0.2)) : 0.3;
      K.person(540, 1000, 1.6, { p: 1, headphones: true, mood: 'wow', arms: { L: [-110, 120], R: [170, -20] }, bumps: b });
      for (let i = 0; i < 3; i++) { const u = (lt * 0.5 + i / 3) % 1; K.note(300 + i * 230 + Math.sin(lt * 2 + i) * 30, 560 - u * 260, 1, [CH.yellow, CH.pink, CH.blue][i], 1 - u); }
      if (lt > ch - 0.1) K.write('CHILLS!', 540, 330, 110, CH.blue, on(lt, ch - 0.1, ch + 0.2), -0.04);
    } });
    cue(st, 'whoosh'); cue(st + ch - 0.2, 'sparkle', { dur: 1.0 }); }

  return { shots: S, cues: CUES };
}
