// 5 TYPES OF GTA 6 PLAYERS: the GTA crew (original cartoon characters) in a sunny 3D coast. Tall Tale recipe + comic stickers.
import * as THREE from 'three';
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L, Wd, T } from './core/timing.js';
import { camera } from './core/engine.js';
import * as WD from './core/world.js';
import { Toon } from './core/toon.js';
import { CREW } from './cast.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, k) => a.clone().lerp(b, k);
const talk = (t, on = 1) => (on ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13)) * (0.6 + 0.4 * Math.sin(t * 5.3)) : 0);
const blink = (t, off = 0) => (((t + off) % 3.3) < 0.12 ? 1 : 0);
const INK = '#111111';

// 2D comic stickers drawn over the 3D frame
function sticker(text, x, y, col, sc = 1, size = 64, rot = -0.04, fg) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const w = ctx.measureText(text).width + size * 1.1, h = size * 1.6;
  ctx.beginPath(); ctx.roundRect(-w / 2 + 9, -h / 2 + 11, w, h, h / 2); ctx.fillStyle = INK; ctx.fill(); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = fg || (['#FFE600', '#2EE86B', '#00B8FF', '#FFFFFF'].includes(col) ? INK : '#FFFFFF'); ctx.fillText(text, 0, size * 0.04); ctx.restore(); }
function bigText(text, x, y, size, col, sc = 1, rot = -0.05) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = INK; ctx.fillText(text, size * 0.06, size * 0.08); ctx.lineWidth = size * 0.17; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 0); ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.restore(); }
function badge(n, x, y, col, sc = 1) { if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.beginPath(); ctx.arc(8, 10, 70, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK; ctx.font = '900 96px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), 0, 6); ctx.restore(); }
function bar(x, y, w, h, p, col, label, value) { ctx.beginPath(); ctx.roundRect(x + 9, y + 11, w, h, h / 2); ctx.fillStyle = INK; ctx.fill(); ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  if (p > 0) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * p), h, h / 2); ctx.fillStyle = col; ctx.fill(); } ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
  ctx.font = '900 54px Inter'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left'; ctx.strokeText(label, x, y - 12); ctx.fillText(label, x, y - 12); ctx.textAlign = 'right'; ctx.strokeText(value, x + w, y - 12); ctx.fillStyle = '#FFE600'; ctx.fillText(value, x + w, y - 12); }

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.06);
  const pop = (lt, a) => (lt > a ? eob(seg(lt, a, a + 0.22)) : 0);
  const cam = camera(36);
  const LK = { bloom: 0.15, aperture: 0.0010, maxblur: 0.006 }, WIDE = { ...LK, fov: 52, aperture: 0.0004 };
  const shoot = (scene, people, from, to, at, at2, k, look = LK, focus) => {
    if (cam.fov !== (look.fov || 36)) { cam.fov = look.fov || 36; cam.updateProjectionMatrix(); }
    cam.position.copy(mix(from, to, k)); cam.lookAt(at2 ? mix(at, at2, k) : at);
    people.forEach((p) => p.face(cam));
    E.render(scene, cam, { ...look, focus: focus ?? cam.position.distanceTo(at2 ? mix(at, at2, k) : at) });
  };
  const ST = WD.coast(E); ST.sun.key.target.position.set(0, 0, -6); ST.sun.key.position.set(-8, 13, 4);
  const P = {}; for (const k of ['rookie', 'cop', 'hank', 'lucy', 'gus', 'max']) { P[k] = new Toon(CREW[k]); ST.scene.add(P[k].group); }
  const car = ST.cars[0], car2 = ST.cars[1]; car.position.set(2.2, 0, -30); car2.position.set(-2.2, 0, -50);
  const all = () => [...Object.values(P), ...ST.people];
  const away = (p) => p.at(60, 0, 60);                       // park unused cut-outs far away
  const parkAll = () => { Object.values(P).forEach(away); car.position.set(2.2, 0, -30); car.rotation.y = 0; };
  const stand = (p, x, z, st) => { p.at(x, 0, z).set({ blink: blink(0), armL: [8, 6], armR: [8, 6], ...st }); };

  // 1 · hook: the whole crew lined up
  { const q = Wd('Which', 0), ln = Wd('GTA', 0);
    add({ id: 'S01', at: 0, note: 'crew lined up on the coast, camera pushes in, ? on "Which"', draw(lt, d, t, blit) {
      parkAll(); const m = ['happy', 'angry', 'smug', 'proud', 'worried', 'shock'];
      [['max', -1.5], ['gus', -0.75], ['hank', 0], ['lucy', 0.75], ['rookie', 1.5]].forEach(([k, x], i) => stand(P[k], x, -5 + (i % 2) * 0.3, { mood: lt > q ? m[(i + 2) % 6] : 'happy', talk: i === 2 ? talk(t) : 0, bob: Math.sin(t * 4 + i) * 3 }));
      shoot(ST.scene, all(), V3(0.0, 1.3, 2.4), V3(0.0, 1.2, 1.0), V3(0.0, 1.1, -5), V3(0.0, 1.1, -5), eio(clamp(lt / d)), WIDE, 6);
      blit(); bigText('WHICH ONE ARE YOU?', 540, 330, 84, '#FFE600', pop(lt, q)); } });
    cue(0.1, 'swoosh'); cue(q - 0.2, 'riser', { dur: 0.3 }); cue(q, 'hit'); }

  // 2a · the Rusher runs in
  { const st = cut(1), r = Wd('runs', 1) - st, gu = Wd('guns', 1) - st, bu = Wd('but', 1) - st;
    add({ id: 'S02', at: st, note: 'Max (mohawk) sprints at the camera, Officer Dan chases; #1 THE RUSHER sticker', draw(lt, d, t, blit) {
      parkAll(); const k = clamp(lt / (bu - 0.05)); const z = lerp(-14, -3.2, eo(k));
      stand(P.max, lerp(-1.4, -0.6, k), z, { mood: 'shock', legs: 'run', phase: t * 11, armL: [40, -60], armR: [150, 20], bob: Math.abs(Math.sin(t * 11)) * 8, talk: 0.4 });
      stand(P.cop, 0.9, z - 3.2, { mood: 'angry', legs: 'run', phase: t * 11 + 1, armR: [120, 30], bob: Math.abs(Math.sin(t * 11 + 1)) * 8 });
      shoot(ST.scene, all(), V3(1.4, 1.1, 1.4), V3(0.6, 1.2, 0.8), V3(-0.8, 1.0, -6), V3(-0.8, 1.1, -4), eio(clamp(lt / d)), LK);
      blit(); badge(1, 190, 330, '#FFE600', pop(lt, 0.05)); sticker('THE RUSHER', 640, 330, '#FF3FA4', pop(lt, 0.1), 76); if (lt > gu) bigText('BANG!', 780, 620, 120, '#FFE600', pop(lt, gu), 0.2); } });
    cue(st, 'swoosh'); cue(st + 0.05, 'ding'); cue(st + gu - 0.05, 'hit'); }
  // 2b · but reviewers say grounded, plan
  { const st = cut(1) + 0, bu = Wd('but', 1), gr = Wd('grounded', 1), pl = Wd('plan', 1), su = Wd('survive', 1);
    add({ id: 'S02b', at: bu - 0.08, note: 'Max stops, Dan arrives: sweat; GROUNDED sticker, PLAN > RUSH', draw(lt, d, t, blit) {
      parkAll(); stand(P.max, -0.4, -3.4, { mood: 'worried', sweat: 1, armL: [30, 20], armR: [30, 20], look: [0.8, 0] }); stand(P.cop, 0.9, -3.6, { mood: 'smug', armR: [140, 40], talk: talk(t, lt < 1.2) });
      shoot(ST.scene, all(), V3(0.9, 1.3, 1.6), V3(0.2, 1.25, 0.9), V3(0.2, 1.1, -4), V3(0.2, 1.2, -4), eio(clamp(lt / d)), LK);
      blit(); if (lt > gr - (bu - 0.08)) sticker('MORE GROUNDED', 540, 270, '#00B8FF', pop(lt, gr - (bu - 0.08)), 64); if (lt > pl - (bu - 0.08)) sticker('PLAN  >  RUSH', 540, 440, '#2EE86B', pop(lt, pl - (bu - 0.08)), 70); } });
    cue(bu - 0.08, 'scratch'); cue(gr - 0.1, 'ding'); cue(pl - 0.1, 'hit'); }

  // 3a · the Explorer
  { const st = cut(2), wo = Wd('world', 2) - st, pe = Wd('people', 2) - st, de = Wd('dense', 2) - st;
    add({ id: 'S03', at: st, note: 'Hank (cowboy, beard) looks around; camera pans along the beach; #2 THE EXPLORER + DENSE WORLD', draw(lt, d, t, blit) {
      parkAll(); const lk = Math.sin(t * 2.2);
      stand(P.hank, -1.0, -3.6, { mood: 'proud', look: [lk, 0], armR: [130, 90], armL: [20, 10] });
      shoot(ST.scene, all(), V3(-3.2, 1.1, 0.8), V3(-0.4, 1.2, 0.6), V3(-1.0, 1.1, -4), V3(-1.0, 1.15, -4), eio(clamp(lt / d)), LK);
      blit(); badge(2, 190, 330, '#2EE86B', pop(lt, 0.05)); sticker('THE EXPLORER', 650, 330, '#00B8FF', pop(lt, 0.1), 70); if (lt > de - 0.1) sticker('DENSE WORLD', 540, 1050, '#FFE600', pop(lt, de - 0.1), 70); } });
    cue(st, 'swoosh'); cue(st + 0.05, 'ding'); cue(st + de - 0.1, 'hit'); }
  // 3b · people react
  { const pe = Wd('people', 2), re = Wd('react', 2);
    add({ id: 'S03b', at: pe - 0.1, note: 'crowd turns to Hank with ! bubbles; PEOPLE REACT TO YOU', draw(lt, d, t, blit) {
      parkAll(); stand(P.hank, 0.0, -3.4, { mood: 'smug', armR: [150, 20] });
      ST.people.forEach((p, i) => p.set({ mood: lt > 0.3 + i * 0.08 ? 'shock' : 'neutral', armL: [8, 6], armR: [8, 6] }));
      shoot(ST.scene, all(), V3(0.2, 1.2, 1.8), V3(0.0, 1.3, 0.6), V3(0.1, 1.2, -4), V3(0.1, 1.3, -4), eio(clamp(lt / d)), LK);
      blit(); if (lt > 0.3) bigText('!', 300, 560, 220, '#FF3B3B', pop(lt, 0.3), -0.1); if (lt > 0.5) bigText('!', 800, 600, 190, '#FF3B3B', pop(lt, 0.5), 0.1); sticker('PEOPLE REACT TO YOU', 540, 1050, '#FF3FA4', pop(lt, 0.1), 60); } });
    cue(pe - 0.1, 'swoosh'); cue(pe + 0.3, 'hit'); cue(pe + 0.5, 'hit'); }

  // 4 · the Driver
  { const st = cut(3), dr = Wd('driving', 3) - st, ev = Wd('ever', 3) - st;
    add({ id: 'S04', at: st, note: 'Lucy in the pink convertible drives down the coast road, camera tracks beside; #3 THE DRIVER, BETTER THAN EVER', draw(lt, d, t, blit) {
      parkAll(); const cz = lerp(-12, 6, lt / d), cx = 1.4; car.position.set(cx, 0, cz); car.rotation.y = 0;
      P.lucy.at(cx, 0.52, cz - 0.1).set({ mood: 'happy', legs: 'sit', armL: [60, 60], armR: [150, 20], blink: blink(t), look: [0, 0] });
      shoot(ST.scene, all(), V3(-3.4, 1.3, cz + 3.2), V3(-3.1, 1.15, cz + 2.4), V3(cx, 1.15, cz), V3(cx, 1.15, cz), 0, LK);
      blit(); badge(3, 190, 330, '#FF3FA4', pop(lt, 0.05)); sticker('THE DRIVER', 640, 330, '#FFE600', pop(lt, 0.1), 76); if (lt > ev - 0.2) sticker('BETTER THAN EVER', 540, 1050, '#2EE86B', pop(lt, ev - 0.2), 64); } });
    cue(st, 'swoosh'); cue(st + 0.05, 'ding'); cue(st + ev - 0.2, 'boom'); }

  // 5a · the Frame Counter
  { const st = cut(4), th = Wd('thirty', 4) - st, ev2 = Wd('console', 4) - st;
    add({ id: 'S05', at: st, note: 'Gus (glasses, white beard) squints, sweats; #4 THE FRAME COUNTER; 30 FPS slams on "thirty"', draw(lt, d, t, blit) {
      parkAll(); stand(P.gus, 0.0, -3.2, { mood: lt > th ? 'worried' : 'neutral', sweat: lt > th ? 1 : 0, look: [Math.sin(t * 5) * 0.6, 0.3], armL: [20, 100], armR: [20, 100] });
      shoot(ST.scene, all(), V3(0.5, 1.4, 1.2), V3(0.1, 1.45, 0.4), V3(0.0, 1.45, -3.2), V3(0.0, 1.5, -3.2), eio(clamp(lt / d)), LK);
      blit(); badge(4, 190, 330, '#00B8FF', pop(lt, 0.05)); sticker('THE FRAME COUNTER', 660, 330, '#7B4DFF', pop(lt, 0.1), 60); if (lt > th - 0.1) bigText('30 FPS', 540, 1050, 150, '#FFE600', pop(lt, th - 0.1)); if (lt > ev2 - 0.1) sticker('EVERY CONSOLE', 540, 1220, '#FF3FA4', pop(lt, ev2 - 0.1), 56); } });
    cue(st, 'swoosh'); cue(st + 0.05, 'ding'); cue(st + th - 0.5, 'riser', { dur: 0.4 }); cue(st + th - 0.1, 'boom'); }
  // 5b · he has opinions
  { const op = Wd('opinions', 4);
    add({ id: 'S05b', at: op - 0.25, note: 'Gus furious, shaking, steam; NOT HAPPY', draw(lt, d, t, blit) {
      parkAll(); stand(P.gus, 0.0, -3.2, { mood: 'angry', sweat: 0, armL: [150, 30], armR: [150, 30], talk: talk(t), bob: Math.sin(t * 40) * 4, lean: Math.sin(t * 30) * 2 });
      shoot(ST.scene, all(), V3(0.2, 1.4, 0.9), V3(0.0, 1.45, 0.3), V3(0.0, 1.5, -3.2), V3(0.0, 1.5, -3.2), eio(clamp(lt / d)), LK);
      blit(); bigText('NOT HAPPY!', 540, 1050, 110, '#FF3B3B', pop(lt, 0.2), -0.06); } });
    cue(op - 0.25, 'scratch'); cue(op, 'hit'); }

  // 6a · the Preloader
  { const st = cut(5), gb = Wd('two', 5) - st, cl = Wd('cleared', 5) - st;
    add({ id: 'S06', at: st, note: 'Raj (headset) at a laptop-bar: PRE-LOAD fills to 212 GB; #5 THE PRELOADER', draw(lt, d, t, blit) {
      parkAll(); stand(P.rookie, 0.0, -3.2, { mood: 'happy', armL: [30, 20], armR: [30, 20], bob: Math.sin(t * 5) * 3 });
      shoot(ST.scene, all(), V3(-0.6, 1.3, 1.4), V3(0.2, 1.2, 0.8), V3(0.0, 1.1, -3.2), V3(0.0, 1.15, -3.2), eio(clamp(lt / d)), LK);
      blit(); badge(5, 190, 330, '#FFE600', pop(lt, 0.05)); sticker('THE PRELOADER', 650, 330, '#2EE86B', pop(lt, 0.1), 64);
      const p = eo(seg(lt, gb - 0.2, cl)); if (lt > gb - 0.4) bar(120, 1030, 840, 100, p, '#2EE86B', 'PRE-LOAD', Math.round(212 * p) + ' GB'); } });
    cue(st, 'swoosh'); cue(st + 0.05, 'ding'); cue(st + gb - 0.2, 'riser', { dur: Math.max(0.3, cl - gb + 0.2) }); }
  // 6b · cleared storage days ago
  { const cl = Wd('cleared', 5);
    add({ id: 'S06b', at: cl - 0.1, note: 'Raj proud, thumbs up; READY tick + STORAGE CLEARED', draw(lt, d, t, blit) {
      parkAll(); stand(P.rookie, 0.0, -3.2, { mood: 'proud', armR: [150, 30], armL: [20, 10] });
      shoot(ST.scene, all(), V3(0.3, 1.3, 1.2), V3(0.0, 1.25, 0.5), V3(0.0, 1.2, -3.2), V3(0.0, 1.25, -3.2), eio(clamp(lt / d)), LK);
      blit(); bigText('READY!', 540, 420, 130, '#2EE86B', pop(lt, 0.1), -0.05); sticker('STORAGE CLEARED', 540, 1050, '#FFE600', pop(lt, 0.3), 60); } });
    cue(cl - 0.1, 'boom'); cue(cl + 0.3, 'coin'); }

  // 7 · all five, 50-80 hours
  { const st = cut(6), fi = Wd('fifty', 6) - st, al = Wd('all', 6) - st;
    add({ id: 'S07', at: st, note: 'all five together, 50-80 HOURS sticker, cheering', draw(lt, d, t, blit) {
      parkAll(); [['max', -1.5], ['gus', -0.75], ['hank', 0], ['lucy', 0.75], ['rookie', 1.5]].forEach(([k, x], i) => stand(P[k], x, -5 + (i % 2) * 0.3, { mood: 'laugh', armL: [150, 20], armR: [150, 20], bob: Math.abs(Math.sin(t * 6 + i)) * 12, talk: talk(t) }));
      shoot(ST.scene, all(), V3(0.0, 1.2, 2.4), V3(0.0, 1.3, 1.2), V3(0.0, 1.2, -5), V3(0.0, 1.3, -5), eio(clamp(lt / d)), WIDE, 6);
      blit(); if (lt > fi - 0.2) bigText('50-80 HOURS', 540, 330, 110, '#FFE600', pop(lt, fi - 0.2)); if (lt > al - 0.1) sticker('BE ALL FIVE!', 540, 1050, '#FF3FA4', pop(lt, al - 0.1), 76); } });
    cue(st, 'swoosh'); cue(st + fi - 0.2, 'ding'); cue(st + al - 0.1, 'applause', { dur: 1.6 }); }

  // 8 · comment your number
  { const st = cut(7);
    add({ id: 'S08', at: st, note: 'COMMENT YOUR NUMBER + 1-5 badges bounce, crew waves', draw(lt, d, t, blit) {
      parkAll(); [['max', -1.5], ['gus', -0.75], ['hank', 0], ['lucy', 0.75], ['rookie', 1.5]].forEach(([k, x], i) => stand(P[k], x, -5, { mood: 'happy', armR: [150, 20 + Math.sin(t * 8 + i) * 30], armL: [8, 6], bob: Math.sin(t * 5 + i) * 3 }));
      shoot(ST.scene, all(), V3(0.0, 1.2, 2.2), V3(0.0, 1.25, 1.2), V3(0.0, 1.2, -5), V3(0.0, 1.2, -5), eio(clamp(lt / d)), WIDE, 6);
      blit(); bigText('COMMENT', 540, 300, 120, '#FFE600', pop(lt, 0.05)); bigText('YOUR NUMBER!', 540, 440, 100, '#FFFFFF', pop(lt, 0.2));
      [1, 2, 3, 4, 5].forEach((n, i) => badge(n, 160 + i * 190, 1050 + Math.sin(t * 6 + i) * 14, ['#FFE600', '#2EE86B', '#FF3FA4', '#00B8FF', '#FF8A00'][i], pop(lt, 0.3 + i * 0.1))); } });
    cue(st, 'swoosh'); cue(st + 0.05, 'hit'); [0, 1, 2, 3, 4].forEach((i) => cue(st + 0.3 + i * 0.1, 'ding', { gain: 0.5 })); }

  return { shots: S, cues: CUES };
}
