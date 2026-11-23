// WHY YOUR VOICE SOUNDS WEIRD ON RECORDINGS: shot list.
import { ctx, C, W, H, clamp, lerp, seg, eo, eio, eob, rnd, rr, circle, bigText } from './core/lib.js';
import { L, Le, Wd, T } from './core/timing.js';
import * as K from './core/kit.js';

const wd = (w, i, f = 0.5) => { try { return Wd(w, i); } catch (e) { return L(i) + f; } };
const BLUE = '#3B82F6';
function waves(x, y, dir, t, n = 4, col = BLUE, a = 1, sp = 70) {
  for (let i = 0; i < n; i++) {
    const p = ((t * 0.9 + i / n) % 1), r = 40 + p * sp * n * 0.9;
    ctx.save(); ctx.globalAlpha = a * (1 - p); ctx.strokeStyle = col; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, dir > 0 ? -0.8 : Math.PI - 0.8, dir > 0 ? 0.8 : Math.PI + 0.8); ctx.stroke(); ctx.restore();
  }
}
function phone(x, y, s, rec, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  rr(-110, -200, 220, 400, 34); ctx.fillStyle = C.ink; ctx.fill();
  rr(-92, -170, 184, 330, 20); ctx.fillStyle = '#E8EEF5'; ctx.fill();
  if (rec) { circle(0, -90, 26, (Math.floor(t * 2) % 2) ? C.red : '#F29AA2'); ctx.fillStyle = C.ink; ctx.font = '900 40px Inter'; ctx.textAlign = 'center'; ctx.fillText('REC', 0, -20); }
  for (let i = 0; i < 9; i++) { const h = 20 + Math.abs(Math.sin(t * 5 + i * 1.3)) * 60; rr(-80 + i * 20, 70 - h / 2, 12, h, 5); ctx.fillStyle = BLUE; ctx.fill(); }
  ctx.restore();
}
function mic(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  rr(-22, 40, 44, 200, 20); ctx.fillStyle = C.ink; ctx.fill();
  rr(-70, -130, 140, 210, 70); ctx.fillStyle = '#9AA5B1'; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = C.ink; ctx.stroke();
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-60, -40 + i * 28); ctx.lineTo(60, -40 + i * 28); ctx.strokeStyle = '#6B7684'; ctx.lineWidth = 5; ctx.stroke(); }
  ctx.restore();
}
function eq(x, y, bars, t, col, w = 56, base = 0) {
  bars.forEach((h, i) => { const hh = h * (0.9 + 0.1 * Math.sin(t * 6 + i)); rr(x + i * (w + 16), y - hh, w, hh, 12); ctx.fillStyle = col; ctx.fill(); });
}
const bg = () => { ctx.fillStyle = C.bg; ctx.fillRect(-300, -300, W + 600, H + 600); };

export function buildShots() {
  const S = [], CUES = [];
  const add = (o) => (S.push(o), o);
  const cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);

  { const st = cut(0), hate = wd('hate', 0) - st;
    add({ id: 'S01', at: st, cam: [540, 820], note: 'hero talks, phone records, grimace',
      draw(lt, d, t) { K.room();
        K.man({ x: 380, y: 1150, s: 1.5, arm: K.ARM.down, mouth: lt > hate ? 'flat' : 'o', chew: Math.abs(Math.sin(lt * 12)), eyes: lt > hate ? 'wide' : 'n', brow: lt > hate ? 1 : 0.2 });
        phone(840, 880, 1.15, true, t); waves(700, 850, -1, t, 3, BLUE, 0.6);
        K.pill('MY VOICE?!', 540, 330, 80, C.ink, C.white, eob(seg(lt, hate, hate + 0.3)));
      } });
    cue(st, 'whoosh'); cue(st + hate, 'boing', { gain: 0.5 }); }

  { const st = cut(1), two = wd('two', 1) - st;
    add({ id: 'S02', at: st, cam: [540, 800], note: 'two arrows leave the mouth',
      draw(lt, d, t) { K.room();
        K.man({ x: 540, y: 1150, s: 1.5, arm: K.ARM.down, mouth: 'o', chew: Math.abs(Math.sin(lt * 12)), brow: 0.4 });
        const p = eio(seg(lt, 0.2, 0.8)); K.arrow(560, 600, 260 * p, 0, 1); K.arrow(500, 600, 260 * p, Math.PI, 1);
        K.pill('ROUTE 1', 860, 520, 54, BLUE, C.white, eob(seg(lt, 0.5, 0.8)));
        K.pill('ROUTE 2', 220, 520, 54, C.yellow, C.ink, lt > two ? eob(seg(lt, two, two + 0.3)) : 0);
      } });
    cue(st, 'whoosh'); cue(st + 0.5, 'pop'); cue(st + two, 'pop'); }

  { const st = cut(2);
    add({ id: 'S03', at: st, cam: [540, 800], note: 'air: waves travel to a friend',
      draw(lt, d, t) { K.room();
        K.man({ x: 250, y: 1150, s: 1.15, arm: K.ARM.down, mouth: 'o', chew: Math.abs(Math.sin(lt * 12)) });
        K.man({ x: 830, y: 1150, s: 1.15, arm: K.ARM.down, mouth: 'smile' });
        waves(380, 700, 1, t, 4, BLUE, 1, 80);
        K.pill('THROUGH AIR', 540, 330, 76, BLUE, C.white, eob(seg(lt, 0.15, 0.45)));
      } });
    cue(st, 'whoosh'); cue(st + 0.2, 'pop'); }

  { const st = cut(3), bone = wd('bones', 3) - st;
    add({ id: 'S04', at: st, cam: [540, 760], zoom: 0.25, note: 'x-ray, bone route to the ear',
      draw(lt, d, t) { K.xray(t);
        K.man({ x: 540, y: 1150, s: 1.5, xray: true, mouth: 'o', chew: Math.abs(Math.sin(lt * 12)) });
        const p = eio(seg(lt, 0.2, 1.2));
        ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath();
        for (let k = 0; k <= 30; k++) { const u = k / 30 * p, x = lerp(540, 400, u) + Math.sin(k * 1.8 + t * 12) * 10, y = lerp(740, 600, u); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.restore();
        K.pill('THROUGH BONE', 540, 330, 76, C.yellow, C.ink, eob(seg(lt, bone, bone + 0.3)));
      } });
    cue(st, 'whoosh'); cue(st + 0.3, 'slide', { dur: 0.9 }); cue(st + bone, 'pop'); }

  { const st = cut(4), bass = wd('deep', 4) - st, rich = wd('rich', 4) - st;
    add({ id: 'S05', at: st, cam: [540, 820], note: 'bass bars grow',
      draw(lt, d, t) { bg();
        const g = eob(seg(lt, bass, bass + 0.5));
        eq(180, 1000, [150 + 330 * g, 130 + 290 * g, 120 + 160 * g, 100, 90, 80, 70], t, C.yellow, 80);
        K.tag('BASS', 300, 520, 300, 1000 - 400 * g - 20, 80, lt > bass ? eob(seg(lt, bass, bass + 0.3)) : 0);
        K.pill('RICH & FULL', 540, 1090, 66, C.ink, C.white, lt > rich ? eob(seg(lt, rich, rich + 0.3)) : 0);
      } });
    cue(st, 'whoosh'); cue(st + bass, 'boing', { gain: 0.6 }); cue(st + rich, 'pop'); }

  { const st = cut(5), only = wd('only', 5) - st;
    add({ id: 'S06', at: st, cam: [540, 800], note: 'mic hears air only, bone route blocked',
      draw(lt, d, t) { bg();
        mic(540, 760, 2.0); waves(840, 760, -1, t, 4, BLUE, 1, 70);
        const p = lt > only ? eob(seg(lt, only, only + 0.3)) : 0;
        K.pill('AIR ONLY', 540, 330, 78, BLUE, C.white, p);
        ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = C.yellow; ctx.lineWidth = 14; ctx.setLineDash([30, 24]); ctx.beginPath(); ctx.moveTo(60, 760); ctx.lineTo(380, 760); ctx.stroke(); ctx.restore();
        K.redX(210, 760, 0.7, lt > only ? 1 : 0.0);
      } });
    cue(st, 'whoosh'); cue(st + only, 'slam', { gain: 0.6 }); }

  { const st = cut(6), thin = wd('thinner', 6) - st;
    add({ id: 'S07', at: st, cam: [540, 820], note: 'compare full vs thin bars',
      draw(lt, d, t) { bg();
        eq(110, 640, [330, 290, 160, 100, 90], t, C.yellow, 70); K.pill('YOUR HEAD', 290, 730, 50, C.ink, C.white, 1);
        const g = 1 - eio(seg(lt, thin - 0.1, thin + 0.5)) * 0.65;
        eq(590, 1020, [330 * g, 290 * g, 160, 100, 90].map((h, i) => i < 2 ? h : h * 0.8), t, BLUE, 70); K.pill('RECORDING', 770, 1110, 50, C.ink, C.white, eob(seg(lt, 0.25, 0.55)));
      } });
    cue(st, 'whoosh'); cue(st + thin, 'tock'); }

  { const st = cut(7), no = wd('nope', 7) - st;
    add({ id: 'S08', at: st, cam: [540, 800], note: 'is it wrong? nope',
      draw(lt, d, t) { bg();
        phone(540, 820, 1.7, false, t);
        K.pill('IS IT WRONG?', 540, 330, 76, C.ink, C.white, eob(seg(lt, 0.05, 0.35)));
        if (lt > no) { ctx.save(); ctx.translate(540, 820); ctx.rotate(-0.18); bigText('NOPE!', 0, 0, 200, C.red, 0, eob(seg(lt, no, no + 0.25))); ctx.restore(); }
      } });
    cue(st, 'whoosh'); cue(st + no, 'slam'); }

  { const st = cut(8);
    add({ id: 'S09', at: st, cam: [540, 800], note: 'friends hear it',
      draw(lt, d, t) { K.room();
        K.man({ x: 250, y: 1150, s: 1.15, arm: K.ARM.down, mouth: 'o', chew: Math.abs(Math.sin(lt * 12)) });
        K.man({ x: 830, y: 1150, s: 1.15, arm: K.ARM.down, mouth: 'smile' });
        waves(380, 700, 1, t, 4, BLUE, 1, 80);
        K.pill('EVERYONE HEARS THIS', 540, 330, 66, C.ink, C.white, eob(seg(lt, 0.1, 0.4)));
      } });
    cue(st, 'whoosh'); cue(st + 0.15, 'pop'); }

  { const st = cut(9), real = wd('real', 9) - st;
    add({ id: 'S10', at: st, cam: [540, 760], note: 'hero points at camera',
      draw(lt) { K.room();
        const p = eio(seg(lt, 0, 0.5));
        K.man({ x: 540, y: 1290, s: 2.0, arm: K.armPose(K.ARM.down, K.ARM.point, p), finger: lt > 0.35 ? Math.sin(lt * 11) * 0.35 : 0, mouth: lt > real ? 'grin' : 'smirk', brow: 0.3, smirk: true });
        K.pill('YOU NEVER HEAR YOURS', 540, 330, 62, C.ink, C.white, eob(seg(lt, 0.2, 0.5)));
      } });
    cue(st, 'whoosh'); cue(st + real, 'pop', { gain: 0.6 }); }

  return { shots: S, cues: CUES };
}
