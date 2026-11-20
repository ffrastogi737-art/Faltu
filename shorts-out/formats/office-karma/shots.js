// YOUR BOSS GOT INSTANT KARMA (skit): Tall Tale 3D, one office set, new original cast (bowler boss, beanie hero, two coworkers).
import * as THREE from 'three';
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L, Wd, T } from './core/timing.js';
import { camera } from './core/engine.js';
import * as WD from './core/world.js';
import * as PR from './core/props.js';
import { Toon, PROPS } from './core/toon.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, k) => a.clone().lerp(b, k);
const talk = (t, on = 1) => (on ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13)) * (0.6 + 0.4 * Math.sin(t * 5.3)) : 0);
const blink = (t, off = 0) => (((t + off) % 3.3) < 0.12 ? 1 : 0);

const LOOK = {
  boss: { body: '#B8412F', hat: 'bowler', hatCol: '#2F2F3A', neck: 'tie', neckCol: '#F2C230', pattern: 'vest', patCol: '#2F2F3A', extra: ['mustache'] },
  hero: { body: '#F2C230', hat: 'beanie', hatCol: '#2E9C6A', neck: 'collar', extra: ['glasses', 'freckles'] },
  cowA: { body: '#3E5FA8', hat: 'visor', hatCol: '#E8C77A', extra: ['pencil'] },
  cowB: { body: '#B98ACF', hat: 'bun', hatCol: '#7A4A2E', extra: ['blush'] },
};
const person = (k, opts) => new Toon({ ...LOOK[k], extra: [...(LOOK[k].extra || [])] }, opts);

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.06);
  const cam = camera(36);
  const LK = { bloom: 0.1, aperture: 0.001, maxblur: 0.008 };
  const shoot = (scene, people, from, to, at, at2, k, look, focus) => {
    cam.position.copy(mix(from, to, k)); cam.lookAt(at2 ? mix(at, at2, k) : at);
    people.forEach((p) => p.face(cam));
    E.render(scene, cam, { ...look, focus: focus ?? cam.position.distanceTo(at2 ? mix(at, at2, k) : at) });
  };

  const OF = WD.interior(E, { w: 7, depth: 6, wall: '#5B7FA8', motif: '#6B8FB8', ceiling: '#2A2638', floor: '#7A5A3E', signText: null, counterOn: false, litter: false, picture: false, view: null });
  const slide = (lines, bg, accent) => { const s = PR.poster(lines, { w: 3.1, h: 1.7, bg: '#1F2A44', fg: '#FFFFFF', accent: '#FFD23F' }); s.position.set(-0.2, 2.1, -5.87); OF.scene.add(s); s.visible = false; return s; };
  const s0 = slide(['!THE BIG IDEA', 'BY YOUR BOSS'], '#F4EBD6', '#B5372E');
  const s1 = slide(['!CREATED BY', 'YOU'], '#FFFFFF', '#2E9C6A');
  const s2 = slide(['!VOICEMAIL', 'I HAVE NO IDEA', "WHAT I'M DOING"], '#FFE9E4', '#B5372E');
  const showSlide = (s) => [s0, s1, s2].forEach((x) => (x.visible = x === s));
  const boss = person('boss'), hero = person('hero'), cowA = person('cowA'), cowB = person('cowB');
  const ALL = [boss, hero, cowA, cowB]; ALL.forEach((p) => OF.scene.add(p.group));
  const crowd = (t, mood = 'neutral', look = [-0.8, 0]) => {
    cowA.at(1.5, 0, -1.7); cowB.at(-2.4, 0, -2.3); hero.at(2.5, 0, -1.4);
    cowA.set({ mood, look, blink: blink(t, 0.4) }); cowB.set({ mood, look, blink: blink(t, 1.1) });
  };

  // 1 · HOOK: boss smug at the screen
  { const st = cut(0), sw = Wd('stole', 0) - st;
    add({ id: 'S01', at: st, note: 'close on the smug boss', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s0); crowd(t); hero.set({ mood: 'neutral', look: [-1, 0], blink: blink(t) });
      boss.at(-1.0, 0, -4.6); boss.set({ mood: 'smug', talk: talk(t), look: [0, 0], armR: [lerp(20, 75, eo(seg(lt, 0, 0.4))), -10], armL: [20, 10], blink: blink(t) });
      shoot(OF.scene, ALL, V3(-0.2, 1.7, -1.0), V3(-0.7, 1.65, -2.6), V3(-1.0, 1.5, -4.6), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + sw, 'boom', { gain: 0.9 }); }

  // 2 · strutting in
  { const st = cut(1);
    add({ id: 'S02', at: st, note: 'boss struts across the room', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s0); crowd(t, 'neutral', [-1, 0]); hero.set({ mood: 'neutral', look: [-1, 0], blink: blink(t) });
      boss.at(lerp(-3.2, -1.0, k), 0, -4.4); boss.set({ mood: 'smug', legs: k < 0.95 ? 'walk' : 'stand', phase: t * 9, look: [0.4, 0], armL: [20, 10], armR: [20, 10], bob: 1 });
      shoot(OF.scene, ALL, V3(1.2, 1.9, 0.8), V3(0.6, 1.85, 0.4), V3(-1.5, 1.4, -4), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); }

  // 3 · you stare
  { const st = cut(2), nn = Wd('nothing', 2) - st;
    add({ id: 'S03', at: st, note: 'deadpan close-up on you', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s0); crowd(t); boss.at(-1.0, 0, -4.6); boss.set({ mood: 'smug', look: [0.8, 0] });
      hero.set({ mood: 'neutral', look: [-1, 0], blink: 0, armL: [10, 5], armR: [10, 5] });
      shoot(OF.scene, ALL, V3(2.6, 1.55, 0.7), V3(2.5, 1.55, 0.1), V3(2.5, 1.45, -1.4), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + nn, 'scratch', { gain: 0.7 }); }

  // 4 · remote click
  { const st = cut(3), rm = Wd('remote', 3) - st;
    add({ id: 'S04', at: st, note: 'boss raises the clicker', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s0); crowd(t); hero.set({ mood: 'neutral', look: [-1, 0], blink: blink(t) });
      boss.at(-1.0, 0, -4.6); boss.set({ mood: 'smug', talk: talk(t), look: [0.2, 0.2], armR: [lerp(30, 100, eo(seg(lt, 0, rm))), 30], armL: [20, 10], blink: blink(t) });
      shoot(OF.scene, ALL, V3(-0.4, 1.7, 0.3), V3(-0.8, 1.7, -0.9), V3(-1.0, 1.5, -4.5), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + rm, 'pop'); }

  // 5 · CREATED BY YOU
  { const st = cut(4), cr = Wd('created', 4) - st, yo = Wd('you', 4) - st;
    add({ id: 'S05', at: st, note: 'slide reads CREATED BY YOU, boss freezes', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(t - st > 0 && lt >= cr - 0.05 ? s1 : s0); crowd(t); hero.set({ mood: lt > yo ? 'smug' : 'neutral', look: [-1, 0], blink: blink(t) });
      boss.at(-1.4, 0, -4.7); boss.set({ mood: lt > cr ? 'shock' : 'smug', sweat: lt > cr ? 1 : 0, look: [1, 0.3], armL: [20, 10], armR: [20, 10], blink: blink(t) });
      shoot(OF.scene, ALL, V3(0.0, 1.9, 1.0), V3(0.1, 1.9, -0.2), V3(-0.1, 1.9, -5.4), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + cr, 'ding'); cue(st + yo, 'hit', { gain: 0.9 }); }

  // 6 · the voicemail
  { const st = cut(5), vm = Wd('voicemail', 5) - st;
    add({ id: 'S06', at: st, note: 'voicemail slide, boss sweats', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s2); crowd(t, 'shock', [0.6, 0]); hero.set({ mood: 'smug', look: [-1, 0], blink: blink(t) });
      boss.at(-1.4, 0, -4.7); boss.set({ mood: 'shock', sweat: 1, look: [1, 0], armL: [60, 90], armR: [60, 90], blink: 0 });
      shoot(OF.scene, ALL, V3(-0.3, 1.8, 0.6), V3(-0.4, 1.75, -0.5), V3(-0.3, 1.6, -5.0), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + vm, 'scratch', { gain: 0.8 }); cue(st + vm + 0.6, 'boing', { gain: 0.6 }); }

  // 7 · run and slip
  { const st = cut(6), sl = Wd('slipped', 6) - st;
    add({ id: 'S07', at: st, note: 'boss runs, slips on the carpet', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s2); crowd(t, 'shock', [0.3, 0]); hero.set({ mood: 'laugh', look: [-1, 0], blink: 0 });
      const run = clamp(lt / Math.max(sl, 0.4)), fell = clamp((lt - sl) / 0.3);
      boss.at(lerp(-1.4, 0.9, eo(run)), fell > 0 ? 0.45 * Math.sin(Math.min(fell, 1) * Math.PI) : 0, lerp(-4.7, -3.2, eo(run))); boss.set({ mood: fell > 0 ? 'shock' : 'angry', legs: fell > 0 ? 'jump' : 'run', phase: t * 14, lean: 16 * Math.sin(fell * 9), sweat: 1, look: [0.5, 0], armL: [90, 20], armR: [90, 20] });
      shoot(OF.scene, ALL, V3(1.8, 1.8, 0.8), V3(1.4, 1.7, 0.3), V3(-0.5, 1.2, -3.6), V3(0.7, 1.0, -3.2), k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + sl, 'boing', { gain: 0.8 }); cue(st + sl + 0.25, 'slam', { gain: 0.7 }); }

  // 8 · staring at the ceiling
  { const st = cut(7);
    add({ id: 'S08', at: st, note: 'boss lying on the floor, dizzy', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s2); crowd(t, 'neutral', [0.8, -0.2]); hero.set({ mood: 'smug', look: [-0.5, 0], blink: blink(t) });
      boss.at(0.8, 0, -3.2); boss.set({ mood: 'dizzy', lean: 12 * Math.sin(t * 3), legs: 'stand', look: [0, -1], armL: [30, 40], armR: [30, 40], blink: 0 });
      shoot(OF.scene, ALL, V3(0.9, 0.7, -0.6), V3(0.9, 0.8, -1.5), V3(0.8, 1.55, -3.2), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + 0.5, 'tock', { gain: 0.5 }); }

  // 9 · applause for you
  { const st = cut(8);
    add({ id: 'S09', at: st, note: 'everyone claps, hero proud', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s1);
      cowA.at(-1.4, 0, -3.0); cowB.at(2.4, 0, -3.0); hero.at(0.6, 0, -3.4); boss.at(-3.2, 0.12, -3.0);
      const cl = 55 + 35 * Math.abs(Math.sin(t * 12));
      cowA.set({ mood: 'happy', look: [0.6, 0], armL: [cl, 85], armR: [cl, 85], blink: blink(t) }); cowB.set({ mood: 'happy', look: [-0.6, 0], armL: [cl, 85], armR: [cl, 85], blink: blink(t, 0.7) });
      hero.set({ mood: 'proud', look: [0, 0], armL: [cl, 85], armR: [cl, 85], blink: blink(t) });
      boss.set({ mood: 'dizzy', lean: -88, look: [0, -1] });
      shoot(OF.scene, ALL, V3(0.6, 1.8, 0.8), V3(0.6, 1.7, 0.0), V3(0.5, 1.4, -3.2), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + 0.1, 'applause', { dur: 2.2, gain: 0.8 }); }

  // 10 · loop line: hero sly look
  { const st = cut(9);
    add({ id: 'S10', at: st, note: 'hero looks at the camera, line left open to loop', draw(lt, d, t, blit) {
      const k = eio(clamp(lt / d)); showSlide(s1); crowd(t, 'happy', [0, 0]);
      hero.at(0.6, 0, -3.4); hero.set({ mood: 'sly', look: [0, 0], talk: talk(t), blink: blink(t), armL: [20, 10], armR: [20, 10] }); boss.at(-3.2, 0, -3.0); boss.set({ mood: 'dizzy' });
      shoot(OF.scene, ALL, V3(0.6, 1.55, -1.6), V3(0.6, 1.52, -2.3), V3(0.6, 1.5, -3.4), null, k, LK); blit();
    } });
    cue(st, 'whoosh'); cue(st + 0.2, 'pop'); }

  return { shots: S, cues: CUES };
}
