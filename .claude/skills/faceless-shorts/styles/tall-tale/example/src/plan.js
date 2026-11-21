// Tall Tale shot plans (owner 21 Nov 2026). A shot_plan.json, one shot per script line, drives the whole film: no hand-coded
// shot functions per video. Build-time safety rules (the build stops with a message when one fails):
//   - every shot has at least one character (no text-only shots), and a poster never covers more than 45 % of the frame;
//   - every character stays inside the safe zone (x 70..1010, y 170..1300 of 1080x1920) in every frame of the shot, falls included;
//   - the head size changes by at most 1.6x from one shot to the next; each camera blends from the previous shot over 0.4 s.
// shot_plan.json:
//   { "setting": "office", "track": "TALL-TALE", "cast_keys": ["tony", "lucy"],
//     "shots": [ { "line": 0, "theme": "office", "cam": "medium", "focus": "tony", "yaw": 0,
//                  "cast": [ { "who": "tony", "pos": "left", "mood": "smug", "action": "walk", "to": [-1.2, -2.8], "dir": "left",
//                              "kid": false, "talk": true, "look": [0, 0] } ],
//                  "props": [ { "kind": "poster", "pos": "back", "lines": ["THE BIG IDEA"], "w": 2.2, "h": 1.3 } ],
//                  "cues": [ { "word": "stole", "type": "boom", "gain": 0.9 }, { "at": "start", "type": "whoosh" } ] } ] }
// cam: wide | two-shot | medium | reaction-push | payoff.   action: stand walk run sit jump clap point shock worry fall slip lie dizzy.
// pos: left centre right far-left far-right back front, or [x, z] in metres (the set's own frame, camera on +z).
import * as THREE from 'three';
import { clamp, lerp, eio, eo } from './core/lib.js';
import { L, Wd, T } from './core/timing.js';
import { camera } from './core/engine.js';
import * as WD from './core/world.js';
import * as PR from './core/props.js';
import { Toon } from './core/toon.js';
import { CREW } from './cast.js';

const W = 1080, H = 1920, PERSON = 1.75;
export const SAFE = { l: 70, r: 1010, t: 170, b: 1300 };
const HEAD_MIN = 0.07, HEAD_MAX = 0.30, JUMP = 1.6, BLEND = 0.4, POSTER_MAX = 0.45;
const ROOM_CAM_Z = 1.6;                              // inside a room the camera stays in front of the floor edge (z 2)
const CAMS = {
  wide: { fov: 60, head: 0.10, y: 1.6 },
  'two-shot': { fov: 44, head: 0.17, y: 1.3 },
  medium: { fov: 40, head: 0.24, y: 1.4 },
  'reaction-push': { fov: 40, head: 0.17, head2: 0.23, y: 1.4 },
  payoff: { fov: 40, head: 0.20, y: 0.6 },
};
const ACTIONS = new Set(['stand', 'walk', 'run', 'sit', 'jump', 'clap', 'point', 'shock', 'worry', 'fall', 'slip', 'lie', 'dizzy']);
const PROP_KINDS = new Set(['poster', 'lockers', 'barbell', 'desk']);
const CUE_TYPES = new Set(['inhale', 'heartbeat', 'whoosh', 'slide', 'pop', 'plop', 'gulp', 'boing', 'bubbles', 'sizzle', 'sparkle', 'thud', 'slam', 'tock', 'zip',
  'alarm', 'boom', 'riser', 'ding', 'hit', 'swoosh', 'applause', 'tickclock', 'scratch', 'coin']);   // every type mix.py can play
const POS = {
  interior: { left: [-2.0, -5.6], centre: [0, -5.2], right: [2.0, -4.8], 'far-left': [-2.4, -7.0], 'far-right': [2.4, -6.6], back: [0, -7.4], front: [0, -4.2] },
  street: { left: [-2.2, -2.5], centre: [0, -3.0], right: [2.2, -2.5], 'far-left': [-2.8, -6], 'far-right': [2.8, -6], back: [0, -7], front: [0, -1.5] },
  open: { left: [-2.0, -3.0], centre: [0, -3.0], right: [2.0, -2.5], 'far-left': [-2.8, -5.5], 'far-right': [2.6, -5.5], back: [0, -6.5], front: [0, -1.5] },
};
const SETKIND = { interior: 'interior', mainStreet: 'street', coast: 'open', meadow: 'open' };
const LOOKS = { interior: { bloom: 0.3, aperture: 0.001, maxblur: 0.008 }, street: { bloom: 0.15, aperture: 0.0012, maxblur: 0.008 }, open: { bloom: 0.25, aperture: 0.001, maxblur: 0.007 } };
// the themes (= sets). interior = a room (w x depth, camera on +z, back wall at z = -depth); the rest are the 3D worlds of world.js.
export const THEMES = {
  office: { build: 'interior', o: { w: 7, depth: 9, wall: '#D9C7A3', motif: '#C9B48A', floor: '#6B4A32', ceiling: '#E9DFC8', signText: 'SALES · FLOOR 3', picture: false, counterOn: false, litter: false }, props: [] },
  gym: { build: 'interior', o: { w: 7, depth: 9, wall: '#2A2A33', motif: '#3B3B48', floor: '#4E4E58', ceiling: '#15151C', signText: 'GYM · NO EXCUSES', picture: false, counterOn: false, litter: false },
    props: [{ kind: 'lockers', pos: 'left-wall', n: 4, col: '#B5372E' }, { kind: 'barbell', pos: [1.6, -5.8] }] },
  school: { build: 'interior', o: { w: 7, depth: 9, wall: '#EFE4C6', motif: '#E2D3A8', floor: '#9A6A44', ceiling: '#E9EEF2', signText: 'ROOM 204', picture: false, counterOn: false, litter: false },
    props: [{ kind: 'lockers', pos: 'right-wall', n: 4, col: '#3C6FB6' }, { kind: 'poster', pos: 'back', lines: ['POP QUIZ', 'TODAY'], bg: '#1F3A2E', fg: '#F2F2E6', w: 2.0, h: 1.2 }] },
  friends: { build: 'interior', o: { w: 7, depth: 9, wall: '#8FC9B5', motif: '#78B8A3', floor: '#A46B3E', ceiling: '#EDEFE6', signText: 'APT 3B', picture: false, counterOn: false, litter: false },
    props: [{ kind: 'poster', pos: 'back', lines: ['FRIDAY', 'NIGHT'], bg: '#F2C230', fg: '#1F1C33', w: 2.0, h: 1.2 }] },
  street: { build: 'mainStreet', o: {}, props: [] },
  coast: { build: 'coast', o: {}, props: [] },
  meadow: { build: 'meadow', o: {}, props: [] },
};
const talk = (t) => 0.25 + 0.75 * Math.abs(Math.sin(t * 13)) * (0.6 + 0.4 * Math.sin(t * 5.3));
const blink = (t, off = 0) => (((t + off) % 3.3) < 0.12 ? 1 : 0);
const toRad = (d) => (d * Math.PI) / 180;

/** a readable error at build time (plan problems stop the build, they never render a bad shot) */
export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.shots) || !plan.shots.length) throw new Error('shot_plan.json: "shots" is empty');
  let last = -1;
  plan.shots.forEach((sp, i) => {
    const id = `shot ${i + 1} (line ${sp.line})`;
    if (!Number.isInteger(sp.line) || sp.line < 0 || sp.line <= last) throw new Error(`${id}: lines must be unique and in increasing order`);
    last = sp.line;
    if (!Array.isArray(sp.cast) || !sp.cast.length) throw new Error(`${id}: no cast. Every shot needs at least one character (text-only shots are banned)`);
    if (!CAMS[sp.cam]) throw new Error(`${id}: cam must be one of ${Object.keys(CAMS).join(', ')}`);
    const th = sp.theme || plan.setting, name = typeof th === 'string' ? th : th && th.name;
    if (!THEMES[name]) throw new Error(`${id}: unknown theme "${name}" (use ${Object.keys(THEMES).join(', ')})`);
    sp.cast.forEach((c) => {
      if (!CREW[c.who]) throw new Error(`${id}: unknown character "${c.who}" (cast.js has ${Object.keys(CREW).join(', ')})`);
      if (c.action && !ACTIONS.has(c.action)) throw new Error(`${id}: unknown action "${c.action}"`);
    });
    if (sp.cam === 'two-shot' && sp.cast.length < 2) throw new Error(`${id}: two-shot needs 2 characters`);
    (sp.props || []).forEach((p) => { if (!PROP_KINDS.has(p.kind)) throw new Error(`${id}: unknown prop "${p.kind}"`); });
    (sp.cues || []).forEach((c) => {
      if (!CUE_TYPES.has(c.type)) throw new Error(`${id}: unknown sound "${c.type}"`);
      if (c.word === undefined && c.at === undefined) throw new Error(`${id}: a cue needs "word" or "at"`);
    });
  });
  return plan;
}

function place(kind, pos) {
  if (Array.isArray(pos)) return pos;
  const v = POS[kind][pos || 'centre'];
  if (!v) throw new Error(`unknown position "${pos}"`);
  return v;
}
/** the cut-out's pose at film progress k (0..1 inside the shot), time t and shot-local time */
function poseOf(c, k, t) {
  const a = c.action || 'stand', dir = c.dir === 'left' ? -1 : 1;
  const st = { mood: c.mood || 'neutral', look: c.look || [0, 0], blink: blink(t, c.off || 0), talk: c.talk ? talk(t) : 0, armL: [12, 8], armR: [12, 8], legs: 'stand', lean: 0, bob: 0, phase: 0 };
  switch (a) {
    case 'stand': break;
    case 'walk': st.legs = 'walk'; st.phase = t * 9; st.bob = 1; break;
    case 'run': st.legs = 'run'; st.phase = t * 14; st.bob = 2; break;
    case 'sit': st.legs = 'sit'; break;
    case 'jump': st.legs = 'jump'; st.bob = 6 * Math.abs(Math.sin(t * 5)); break;
    case 'clap': st.mood = 'happy'; st.armL = [150, 40 + 20 * Math.sin(t * 14)]; st.armR = [150, 40 - 20 * Math.sin(t * 14)]; break;
    case 'point': st.armR = [150, 10]; st.armL = [20, 10]; break;
    case 'shock': st.mood = 'shock'; st.armL = [150, 10]; st.armR = [150, 10]; break;
    case 'worry': st.mood = 'worried'; st.sweat = 1; st.armL = [60, 90]; break;
    // a fall reads as a stumble: at 40 deg and more a 2D cut-out turns edge-on (a known limit of the toon engine, see STYLE.md)
    case 'fall': st.mood = 'dizzy'; st.lean = dir * 40 * eio(clamp(k * 1.6)); st.armL = [120, 30]; st.armR = [120, 30]; break;
    case 'slip': st.mood = 'shock'; st.legs = 'jump'; st.lean = dir * 30 * eo(clamp(k * 3)); break;
    case 'lie': st.mood = 'dizzy'; st.legs = 'sit'; st.lean = dir * 22; break;     // a slumped sit: a true lie is edge-on
    case 'dizzy': st.mood = 'dizzy'; st.lean = dir * 10 * Math.sin(t * 6); break;
  }
  return st;
}

/** the set (3D world + people + props) for one theme, built once per distinct theme */
function buildSet(E, th) {
  const def = THEMES[th.name], o = { ...def.o, ...(th.o || {}) };
  const S = def.build === 'interior' ? WD.interior(E, o) : def.build === 'mainStreet' ? WD.mainStreet(E, {}) : def.build === 'coast' ? WD.coast(E, {}) : WD.meadow(E, {});
  S.kind = SETKIND[def.build]; S.toons = {}; S.shotProps = [];
  (def.props || []).forEach((p) => addProp(S, p, null));
  return S;
}
function propPos(S, kind, pos) {
  if (Array.isArray(pos)) return { x: pos[0], z: pos[1], ry: 0 };
  if (S.kind === 'interior') {
    if (pos === 'back') return { x: 0, z: -S.depth + 0.15, ry: 0 };
    if (pos === 'left-wall') return { x: -S.w / 2 + 0.3, z: -S.depth * 0.5, ry: Math.PI / 2 };
    if (pos === 'right-wall') return { x: S.w / 2 - 0.3, z: -S.depth * 0.5, ry: -Math.PI / 2 };
  }
  throw new Error(`prop position "${pos}" is not known in this set (use [x, z] here)`);
}
function addProp(S, p, shot) {
  const g = p.kind === 'poster' ? PR.poster(p.lines || ['NOTICE'], { w: p.w || 2.0, h: p.h || 1.2, bg: p.bg || '#F4EBD6', fg: p.fg || '#1F1C33', accent: p.accent || '#B5372E' })
    : p.kind === 'lockers' ? PR.lockers(p.n || 4, p.col) : p.kind === 'barbell' ? PR.barbell() : PR.desk(p.w || 2.2);
  const q = propPos(S, p.kind, p.pos);
  g.position.set(q.x, p.kind === 'poster' ? (p.y ?? 2.3) : 0, q.z); g.rotation.y = q.ry; S.scene.add(g);
  g.visible = shot == null;                              // theme props stay visible; a shot's props only during that shot
  if (shot != null) S.shotProps.push({ g, shot });
  return { g, q, w: p.w || 2.0, h: p.h || 1.2, y: p.kind === 'poster' ? (p.y ?? 2.3) : 0, kind: p.kind };
}
function toonFor(S, who, kid) {
  const key = who + (kid ? '|kid' : '');
  if (!S.toons[key]) {
    const look = { ...CREW[who], extra: [...(CREW[who].extra || [])] }; delete look.name; delete look.mood; if (kid) look.kid = true;
    const tn = new Toon(look, { height: kid ? 1.4 : PERSON }); S.scene.add(tn.group); S.toons[key] = tn;
  }
  return S.toons[key];
}

/** builds every shot of the plan. Returns { shots, cues, report }. Call after loadTiming() and buildCaptions(). */
export function buildPlanShots(E, plan) {
  validatePlan(plan);
  const cam = camera(36), sets = new Map(), shots = [], cues = [], report = [];
  const setFor = (th) => { const key = JSON.stringify(th); if (!sets.has(key)) sets.set(key, buildSet(E, th)); return sets.get(key); };
  let prevEnd = null;
  plan.shots.forEach((sp, i) => {
    const th = typeof (sp.theme || plan.setting) === 'string' ? { name: sp.theme || plan.setting } : (sp.theme || { name: plan.setting });
    const S = setFor(th), P = CAMS[sp.cam], id = `P${String(i + 1).padStart(2, '0')}`;
    const at = i === 0 ? 0 : L(sp.line) - 0.06;
    const cast = sp.cast.map((c) => ({ ...c, kid: !!c.kid, p0: place(S.kind, c.pos), p1: c.to || null, toon: toonFor(S, c.who, !!c.kid) }));
    const castSet = new Set(cast.map((c) => c.toon));
    const posAt = (c, k) => (c.p1 ? { x: lerp(c.p0[0], c.p1[0], eio(k)), z: lerp(c.p0[1], c.p1[1], eio(k)) } : { x: c.p0[0], z: c.p0[1] });
    const fi = sp.focus === undefined ? 0 : typeof sp.focus === 'number' ? sp.focus : cast.findIndex((c) => c.who === sp.focus);
    if (fi < 0 || fi >= cast.length) throw new Error(`${id}: focus "${sp.focus}" is not in the cast`);
    const tgt = (k) => {
      const pts = cast.map((c) => posAt(c, k));
      if (sp.cam === 'wide') return { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, z: pts.reduce((n, p) => n + p.z, 0) / pts.length, y: 1.0 };
      if (sp.cam === 'two-shot') return { x: (pts[0].x + pts[1].x) / 2, z: (pts[0].z + pts[1].z) / 2, y: 1.0 };
      return { x: pts[fi].x, z: pts[fi].z, y: 1.0 };
    };
    const headLim = (k) => {                             // requested head size, held within 1.6x of the previous shot
      let h = (P.head2 != null ? lerp(P.head, P.head2, eio(k)) : P.head) * adj;
      if (prevEnd) h = clamp(h, prevEnd / JUMP, prevEnd * JUMP);
      return clamp(h, HEAD_MIN, HEAD_MAX);
    };
    let fovV = P.fov, adj = 1;                           // the lens may widen (up to 70) when the room is too small; adj re-aims the requested head
    const state = (k, s, sx, sy) => {
      const T0 = tgt(k), h = headLim(k), a = toRad(sp.yaw || 0);
      let D = (PERSON / (2 * h * Math.tan(toRad(P.fov / 2)))) * s, fo = fovV;
      if (S.kind === 'interior') {                       // in a room the lens cannot leave the floor: the frame is limited to the room, and the lens widens instead of getting closer than 0.30
        D = Math.min(D, ROOM_CAM_Z - T0.z); fo = Math.max(fovV, 2 * Math.atan(PERSON / (2 * D * h)) * 180 / Math.PI);   // the lens gives the requested head size (continuity holds at room cuts)
      }
      return { pos: new THREE.Vector3(T0.x + D * Math.sin(a), P.y, T0.z + D * Math.cos(a)), tgt: new THREE.Vector3(T0.x, T0.y, T0.z), fov: fo, sx, sy };
    };
    const apply = (st) => {
      cam.fov = st.fov; cam.updateProjectionMatrix(); cam.position.copy(st.pos); cam.lookAt(st.tgt);
      if (st.sx || st.sy) cam.setViewOffset(W, H, -st.sx, -st.sy, W, H); else cam.clearViewOffset();
      cam.updateMatrixWorld(true);
    };
    const toPx = (v) => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z }; };
    const corners = (c, k) => {                          // a box around the cut-out; a fall widens it
      const p = posAt(c, k), st = poseOf(c, k, 0), h = c.kid ? 1.4 : PERSON, lean = toRad(st.lean);
      const off = h * Math.abs(Math.sin(lean)), top = Math.max(0.25, h * Math.cos(lean) + 0.15), out = [];
      const lo = -0.45 - (st.lean < 0 ? off : 0), hi = 0.45 + (st.lean > 0 ? off : 0);      // the box grows only toward the side the body falls to
      for (const dx of [lo, hi]) for (const y of [0, top]) for (const dz of [-0.25, 0.25]) out.push(new THREE.Vector3(p.x + dx, y, p.z + dz));
      return out;
    };
    const KS = [0, 0.25, 0.5, 0.75, 1];
    const bbox = (s, sx, sy) => {
      const b = { l: 1e9, t: 1e9, r: -1e9, b: -1e9, behind: false };
      for (const k of KS) { apply(state(k, s, sx, sy)); for (const c of cast) for (const v of corners(c, k)) { const q = toPx(v); if (q.z > 1 || q.z < 0) b.behind = true; b.l = Math.min(b.l, q.x); b.r = Math.max(b.r, q.x); b.t = Math.min(b.t, q.y); b.b = Math.max(b.b, q.y); if (S.kind === 'interior' && Math.abs(v.x) > S.w / 2 - 0.2) b.wall = true; } }
      return b;
    };
    let s = 1, sx = 0, sy = 0, b1;
    const solve = () => {
      s = 1; sx = 0; sy = 0;
      for (let it = 0; it < 16; it++) {                  // dolly out until the whole cast fits in every frame of the shot
        const b = bbox(s, 0, 0), need = Math.max((b.r - b.l) / (SAFE.r - SAFE.l), (b.b - b.t) / (SAFE.b - SAFE.t));
        if (b.behind) s *= 1.15; else if (need > 1) s *= need * 1.03; else break;
      }
      const b0 = bbox(s, 0, 0);                          // then shift the picture (lens shift: the size stays) to the middle of the safe zone
      sx = (SAFE.l + SAFE.r) / 2 - (b0.l + b0.r) / 2; sy = (SAFE.t + SAFE.b) / 2 - (b0.t + b0.b) / 2;
      return bbox(s, sx, sy);
    };
    const fits = (b) => !b.behind && !b.wall && b.l >= SAFE.l && b.r <= SAFE.r && b.t >= SAFE.t && b.b <= SAFE.b;
    if (bbox(1, 0, 0).wall) throw new Error(`${id} (line ${sp.line}): a character would walk or fall into the wall of the room. Move the cast or change dir.`);
    const headPx = (k, sx_, sy_) => { apply(state(k, s, sx_, sy_)); const q = posAt(cast[fi], k); const hd = toPx(new THREE.Vector3(q.x, PERSON, q.z)), ft = toPx(new THREE.Vector3(q.x, 0, q.z)); return (ft.y - hd.y) / H; };
    let head0, head1;
    for (let pass = 0; ; pass++) {                       // the fit can shrink the head (the lens widens): re-aim the requested size until the measured head holds 1.6x
      for (fovV = P.fov; ; fovV += 4) {
        b1 = solve();
        if (fits(b1) || fovV >= 70) break;
      }
      if (!fits(b1))
        throw new Error(`${id} (line ${sp.line}): the cast does not fit the safe zone even at 70 deg (x ${b1.l | 0}..${b1.r | 0}, y ${b1.t | 0}..${b1.b | 0}). Move the cast closer together or use fewer people.`);
      head0 = headPx(0, sx, sy); head1 = headPx(1, sx, sy);
      const lo = (prevEnd || 0) / JUMP, hi = (prevEnd || 0) * JUMP;
      if (!prevEnd || pass === 5 || (head0 >= lo && head0 <= hi)) break;
      adj = head0 < lo ? Math.max(adj * lo * 1.03 / head0, lo * 1.03 / P.head) : adj * hi * 0.97 / head0;
    }
    if (prevEnd && (head0 < prevEnd / JUMP || head0 > prevEnd * JUMP)) console.warn(`${id}: head size ${(head0 / prevEnd).toFixed(2)}x of the shot before (the cast cannot hold 1.6x)`);
    prevEnd = head1;
    // props of this shot + the 45 % poster rule
    const shotProps = (sp.props || []).map((p) => addProp(S, p, i));
    shotProps.forEach((pr) => {
      if (pr.kind !== 'poster') return;
      const cs = toRad(pr.g.rotation.y), pts = [[-pr.w / 2, -pr.h / 2], [pr.w / 2, -pr.h / 2], [pr.w / 2, pr.h / 2], [-pr.w / 2, pr.h / 2]];
      apply(state(0.5, s, sx, sy));
      const q = pts.map(([lx, ly]) => toPx(new THREE.Vector3(pr.q.x + lx * Math.cos(cs), pr.y + ly, pr.q.z - lx * Math.sin(cs))));
      const area = (Math.max(...q.map((v) => v.x)) - Math.min(...q.map((v) => v.x))) * (Math.max(...q.map((v) => v.y)) - Math.min(...q.map((v) => v.y)));
      if (area > POSTER_MAX * W * H) throw new Error(`${id}: a poster covers ${(100 * area / (W * H)).toFixed(0)} % of the frame (max 45 %): make it smaller, it must not replace the cast`);
    });
    const shot = {
      id, at, note: `${S.kind}/${sp.cam}: head ${head0.toFixed(2)}->${head1.toFixed(2)}, cast in safe zone`, line: sp.line,
      cam: (k) => state(k, s, sx, sy),
      draw(lt, d, t, blit) {
        const k = clamp(lt / d);
        S.shotProps.forEach((pr) => { pr.g.visible = pr.shot === i; });
        Object.values(S.toons).forEach((tn) => { if (!castSet.has(tn)) tn.group.visible = false; });
        cast.forEach((c) => { c.toon.group.visible = true; const q = posAt(c, k); c.toon.at(q.x, 0, q.z).set(poseOf(c, k, t)); });
        const now = shot.cam(k);                         // blend from the previous camera over the first BLEND seconds
        let st = now;
        if (i > 0 && lt < BLEND) { const pe = shots[i - 1].cam(1), a = eo(clamp(lt / BLEND)); st = { pos: pe.pos.clone().lerp(now.pos, a), tgt: pe.tgt.clone().lerp(now.tgt, a), fov: lerp(pe.fov, now.fov, a), sx: lerp(pe.sx, now.sx, a), sy: lerp(pe.sy, now.sy, a) }; }
        apply(st);
        cast.forEach((c) => c.toon.face(cam)); if (S.faceAll) S.faceAll(cam);
        E.render(S.scene, cam, { ...LOOKS[S.kind], focus: st.pos.distanceTo(st.tgt) });
        blit();
      },
    };
    shots.push(shot);
    report.push({ id, line: sp.line, set: S.kind, cam: sp.cam, head0: +head0.toFixed(3), head1: +head1.toFixed(3), box: [b1.l | 0, b1.t | 0, b1.r | 0, b1.b | 0] });
    // sounds: a whoosh on the cut unless the plan turns it off, then the plan's own cues
    const end = i + 1 < plan.shots.length ? L(plan.shots[i + 1].line) - 0.06 : T.dur;
    if (sp.whoosh !== false) cues.push({ t: +at.toFixed(3), type: 'whoosh' });
    (sp.cues || []).forEach((c) => {
      const t = c.word !== undefined ? Wd(c.word, sp.line) : c.at === 'start' ? at : c.at === 'end' ? end - 0.05 : at + Number(c.at);
      cues.push({ t: +t.toFixed(3), type: c.type, ...(c.gain !== undefined ? { gain: c.gain } : {}), ...(c.dur !== undefined ? { dur: c.dur } : {}) });
    });
  });
  return { shots, cues, report };
}
