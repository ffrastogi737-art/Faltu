// Tall Tale shot plans (owner 21 Nov 2026): cinematic mini-movies in the @aiwithcb look. A shot_plan.json, one shot per script line, drives
// the film. Build-time rules (the build stops with a message when one fails; STYLE.md explains each):
//   format    14-18 shots, 45-60 s, 135-175 words, 3+ lines of quoted dialogue, no textbook definitions, last line flows into line 1 (loop);
//   cast      characters dressed for THIS story (role + 3 costume parts), no recurring crew looks, every shot has a character;
//   framing   knee-up / waist-up: primary characters 55-70 % of the frame height by preset, never under 45 % (extras "bg": 30 %);
//             body inside x 70..1010, head inside y 170..1300; the camera always moves; head size changes <= 1.6x per cut;
//   sets      no whiteboards / easels / charts / diagrams; posters are small signs in <= 20 % of shots; 3D solids in >= 1/3 of shots,
//             one 2+ solid comparison, 2+ moving solids, every solid on screen; 2+ set or light changes, never 30 s in one look;
//             something new at least every 3rd shot.
// See example/shot_plan.example.json for a full plan.
// cam: wide | two-shot | medium | reaction-push | payoff.   light: day warm dusk night alarm spot (real 3D rigs, engine.js LIGHT_RIGS).
// move: push pull orbit-left orbit-right | dolly-in dolly-out | track-left track-right | crane-up crane-down tilt-up (STYLE.md section 5).
// action: stand walk run sit jump clap point shock worry fall slip lie dizzy.   pos: [x, z] metres (or left centre right far-left far-right back front).
import * as THREE from 'three';
import { clamp, lerp, eio, eo } from './core/lib.js';
import { L, Wd, T } from './core/timing.js';
import { camera, LIGHT_RIGS, applyRig } from './core/engine.js';
import * as WD from './core/world.js';
import * as PR from './core/props.js';
import { Toon } from './core/toon.js';
import { CREW } from './cast.js';

const W = 1080, H = 1920, PERSON = 1.75;
export const SAFE = { l: 70, r: 1010, t: 170, b: 1300 };
const HEAD_MIN = 0.07, HEAD_MAX = 0.75, JUMP = 1.6, BLEND = 0.4, POSTER_MAX = 0.10, POSTER_SHARE = 0.2;
const FIG_MIN = 0.45, FIG_BG = 0.30;                 // hard floor: a character smaller than 45 % of the frame height is too far away (background extras: 30 %)
const SHOTS = [14, 18], WORDS = [135, 175], SECS = [45, 60], ROOM_MAX = 30;   // the mini-movie format; ROOM_MAX = longest stretch (s) in one set + light
const ROOM_CAM_Z = 1.6;                              // inside a room the camera stays in front of the floor edge (z 2)
const CAMS = {                                        // head = the figure's height as a share of the 1080x1920 frame: knee-up / waist-up, 55-70 %
  wide: { fov: 50, head: 0.55, y: 1.5 },               // a group of 2-3, still knee-up (people about 0.7 m apart)
  'two-shot': { fov: 44, head: 0.58, y: 1.4 },
  medium: { fov: 40, head: 0.64, y: 1.4 },
  'reaction-push': { fov: 40, head: 0.58, head2: 0.70, y: 1.4 },
  payoff: { fov: 40, head: 0.62, y: 0.7 },
};
const ACTIONS = new Set(['stand', 'walk', 'run', 'sit', 'jump', 'clap', 'point', 'shock', 'worry', 'fall', 'slip', 'lie', 'dizzy',
  'recoil', 'triumph', 'accuse', 'facepalm', 'cower', 'slump', 'smug-stand']);   // the last seven are dramatic reaction stances (poseOf)
const MOODS = new Set(['neutral', 'smug', 'smirk', 'happy', 'laugh', 'shock', 'wide', 'worried', 'angry', 'sad', 'sly', 'proud', 'tired', 'dizzy']);
const FX = new Set(['steam', 'sweat', 'sweat-fly']);   // cast[].fx: angry steam off the head, a sweat drop, sweat flying off the face
const PROP_KINDS = new Set(['solid', 'poster', 'lockers', 'barbell', 'desk', 'calendar', 'sign', 'breaker', 'clock', 'phone', 'marker', 'papers']);
const DIEGETIC = new Set(['calendar', 'sign', 'breaker', 'clock', 'phone', 'marker', 'papers']);   // story details that live inside the 3D set (STYLE.md section 6)
const WALL_Y = { calendar: 1.75, sign: 2.0, breaker: 1.45, clock: 2.55, phone: 1.5 };   // default hanging / floating height (m); marker + papers stand on the floor
const LECTURE = new Set(['diagram', 'whiteboard', 'board', 'easel', 'chart', 'slide', 'blackboard']);   // banned: no character explains in front of a board
export const LIGHTS = LIGHT_RIGS;                      // day warm dusk night alarm spot: real per-shot 3D rigs (engine.js), not a colour tint
const DEFINITION = /\b(is defined as|refers to|is a term for|is known as|is called|has a name|according to|wikipedia|in conclusion|in summary|by definition)\b/i;
export const MUSIC = new Set(['suspense', 'tension', 'bed', 'neon', 'hype', 'none']);
export const DEFAULT_MUSIC = 'suspense';             // the default track of every tall-tale (script.json "music" must match the plan's)
// camera choreography (owner 22 Nov 2026). Value = head growth over the shot (dolly pushes / pulls the lens position, not the fov); orbits swing the camera +-7 deg.
// dolly-in / dolly-out: 1.22x. track-left / track-right: the camera slides sideways 0.22 m and its look-at follows half of it (parallax). crane-up: the camera rises 0.9 m and tilts down;
// crane-down: it sinks from a high angle; tilt-up: a fixed camera tilts from the feet up to the face. Every cut blends the previous camera in over BLEND s: the camera never stops.
const MOVES = { push: 1.1, pull: 1 / 1.1, 'orbit-left': 1, 'orbit-right': 1, 'dolly-in': 1.22, 'dolly-out': 1 / 1.22, 'track-left': 1, 'track-right': 1, 'crane-up': 1, 'crane-down': 1, 'tilt-up': 1 };
const DEFAULT_MOVE = { wide: 'orbit-left', 'two-shot': 'orbit-right', medium: 'push', 'reaction-push': null, payoff: 'pull' };   // reaction-push already pushes in
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
  room: { build: 'interior', o: { w: 7, depth: 9, wall: '#C9B48A', motif: '#B79F73', floor: '#6B4A32', ceiling: '#E9DFC8', signText: '', picture: false, counterOn: false, litter: false }, props: [] },   // a blank room: dress it with theme.o + props
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
  const chars = plan.characters;
  if (!chars || typeof chars !== 'object' || !Object.keys(chars).length) throw new Error('shot_plan.json: "characters" is empty. Dress every character for THIS story (role + look); recurring crew characters are not used');
  const crewSig = (l) => [l.body, l.hat, l.hair, l.pattern, l.neck].join('|');
  const crew = new Set(Object.values(CREW).map(crewSig));
  Object.entries(chars).forEach(([k, c]) => {
    if (!c || !c.role) throw new Error(`character "${k}": "role" is missing (who is this in the story, e.g. "1943 mathematician")`);
    const lk = c.look || {};
    if (!lk.body) throw new Error(`character "${k}": look.body (the outfit colour) is missing`);
    const parts = ['hat', 'hair', 'beard', 'neck', 'pattern', 'extra'].filter((f) => lk[f] && lk[f] !== 'none' && lk[f] !== 'plain' && !(Array.isArray(lk[f]) && !lk[f].length));
    if (parts.length < 3) throw new Error(`character "${k}": dress it for the story: at least 3 of hat, hair, beard, neck, pattern, extra (it has ${parts.length})`);
    if (crew.has(crewSig(lk))) throw new Error(`character "${k}" is a recurring crew look from cast.js: design an outfit that belongs to this story`);
  });
  if (plan.music !== undefined && !MUSIC.has(plan.music)) throw new Error(`music "${plan.music}": use ${[...MUSIC].join(', ')} (default ${DEFAULT_MUSIC})`);
  const n = plan.shots.length;
  if (n < SHOTS[0] || n > SHOTS[1]) throw new Error(`shot_plan.json: ${n} shots. A tall-tale mini-movie has ${SHOTS[0]}-${SHOTS[1]} cuts (one per script line)`);
  const lookOf = (sp) => JSON.stringify(sp.theme || plan.setting) + '|' + (sp.light || 'day');
  const looks = plan.shots.map(lookOf);
  const shifts = looks.filter((l, i) => i && l !== looks[i - 1]).length;
  if (shifts < 2) throw new Error(`shot_plan.json: the whole video stays in one look. Change the set ("theme") or the lighting ("light": ${Object.keys(LIGHTS).join(', ')}) at least 2 times`);
  const posterShots = plan.shots.filter((sp) => (sp.props || []).some((p) => p.kind === 'poster')).length;
  if (posterShots > Math.floor(n * POSTER_SHARE)) throw new Error(`shot_plan.json: ${posterShots} shots carry a poster (max ${Math.floor(n * POSTER_SHARE)}). Text charts are not the story: show it with 3D objects`);
  const solids = plan.shots.map((sp) => (sp.props || []).filter((p) => p.kind === 'solid'));
  if (solids.filter((x) => x.length).length < Math.ceil(n / 3)) throw new Error(`shot_plan.json: only ${solids.filter((x) => x.length).length} shots have a 3D prop ("solid"); at least ${Math.ceil(n / 3)} need one`);
  if (!solids.some((x) => x.length >= 2)) throw new Error('shot_plan.json: no visual comparison. One shot needs 2+ solids side by side (this vs that, real objects)');
  if (solids.flat().filter((p) => p.motion).length < 2) throw new Error('shot_plan.json: the props never move. Give at least 2 solids a "motion" (slide, spin, grow, bob)');
  let last = -1;
  const novel = plan.shots.map((sp, i) => !!((sp.props || []).length || (sp.cast || []).some((c) => c.soot || c.wear) || (i && looks[i] !== looks[i - 1])));
  plan.shots.forEach((sp, i) => {
    const id = `shot ${i + 1} (line ${sp.line})`;
    if (!Number.isInteger(sp.line) || sp.line < 0 || sp.line <= last) throw new Error(`${id}: lines must be unique and in increasing order`);
    last = sp.line;
    if (!Array.isArray(sp.cast) || !sp.cast.length) throw new Error(`${id}: no cast. Every shot needs at least one character (text-only shots are banned)`);
    if (!CAMS[sp.cam]) throw new Error(`${id}: cam must be one of ${Object.keys(CAMS).join(', ')}`);
    if (sp.light !== undefined && !LIGHTS[sp.light]) throw new Error(`${id}: light "${sp.light}" (use ${Object.keys(LIGHTS).join(', ')})`);
    if (sp.move !== undefined && !MOVES[sp.move]) throw new Error(`${id}: move "${sp.move}" is not allowed (the camera always moves: ${Object.keys(MOVES).join(', ')})`);
    const th = sp.theme || plan.setting, name = typeof th === 'string' ? th : th && th.name;
    if (!THEMES[name]) throw new Error(`${id}: unknown theme "${name}" (use ${Object.keys(THEMES).join(', ')})`);
    sp.cast.forEach((c) => {
      if (!chars[c.who]) throw new Error(`${id}: character "${c.who}" is not defined in "characters" (defined: ${Object.keys(chars).join(', ')})`);
      if (c.action && !ACTIONS.has(c.action)) throw new Error(`${id}: unknown action "${c.action}" (use ${[...ACTIONS].join(', ')})`);
      if (c.mood !== undefined && !MOODS.has(c.mood)) throw new Error(`${id}: unknown mood "${c.mood}" (use ${[...MOODS].join(', ')})`);
      if (c.fx !== undefined && (!Array.isArray(c.fx) || c.fx.some((f) => !FX.has(f)))) throw new Error(`${id}: "fx" is a list of ${[...FX].join(', ')}`);
    });
    if (sp.cam === 'two-shot' && sp.cast.length < 2) throw new Error(`${id}: two-shot needs 2 characters`);
    (sp.props || []).forEach((p) => {
      if (LECTURE.has(p.kind)) throw new Error(`${id}: "${p.kind}" is a whiteboard / chart lecture shot, which is banned. Show the idea with real 3D objects ("solid"), a set change or a character's reaction`);
      if (!PROP_KINDS.has(p.kind)) throw new Error(`${id}: unknown prop "${p.kind}" (use ${[...PROP_KINDS].join(', ')})`);
      if (p.kind === 'poster' && (p.lines || []).length > 2) throw new Error(`${id}: a poster is a sign in the set (2 short lines at most), not a chart`);
      if (DIEGETIC.has(p.kind)) {                          // story details: short text only, inside the 3D world
        const txt = [...(p.lines || []), p.label, p.month].filter(Boolean).map(String);
        if ((p.lines || []).length > 2) throw new Error(`${id}: a ${p.kind} carries 2 short lines at most`);
        if (txt.some((t) => t.length > 18)) throw new Error(`${id}: ${p.kind} text "${txt.find((t) => t.length > 18)}" is longer than 18 characters: it is a prop, not a paragraph`);
        if (p.kind === 'calendar' && (p.cross || []).some((d) => !Number.isInteger(d) || d < 1 || d > 30)) throw new Error(`${id}: calendar "cross" days are 1-30`);
      }
      if (p.kind === 'solid' && !(p.parts || []).length) throw new Error(`${id}: a solid needs "parts"`);
    });
    (sp.cues || []).forEach((c) => {
      if (!CUE_TYPES.has(c.type)) throw new Error(`${id}: unknown sound "${c.type}"`);
      if (c.word === undefined && c.at === undefined) throw new Error(`${id}: a cue needs "word" or "at"`);
    });
  });
  for (let i = 0; i + 2 < plan.shots.length; i++)
    if (!novel[i] && !novel[i + 1] && !novel[i + 2])
      throw new Error(`shots ${i + 1}-${i + 3} (lines ${plan.shots[i].line}-${plan.shots[i + 2].line}): nothing new for 3 shots in a row. Add a 3D prop, a set or light change, a costume change ("wear") or a state change ("soot")`);
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
  const st = { soot: c.soot || 0, mood: c.mood || 'neutral', look: c.look || [0, 0], blink: blink(t, c.off || 0), talk: c.talk ? talk(t) : 0, armL: [12, 8], armR: [12, 8], legs: 'stand', lean: 0, bob: 0, phase: 0 };
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
    case 'fall': st.mood = 'dizzy'; st.lean = dir * 55 * eio(clamp(k * 1.6)); st.armL = [120, 30]; st.armR = [120, 30]; break;
    case 'slip': st.mood = 'shock'; st.legs = 'jump'; st.lean = dir * 30 * eo(clamp(k * 3)); break;
    case 'lie': st.mood = 'dizzy'; st.legs = 'sit'; st.lean = dir * 22; break;     // a slumped sit: a true lie is edge-on
    case 'dizzy': st.mood = 'dizzy'; st.lean = dir * 10 * Math.sin(t * 6); break;
    // dramatic reaction stances (owner 22 Nov 2026)
    case 'recoil': st.mood = 'wide'; st.lean = -dir * (4 + 4 * eo(clamp(k * 4))); st.armL = [140, 10]; st.armR = [125, 25]; st.bob = 2; break;
    case 'triumph': st.mood = 'proud'; st.armL = [165, 12]; st.armR = [165, 12]; st.bob = 3 * Math.abs(Math.sin(t * 5)); break;
    case 'accuse': st.mood = 'angry'; st.armR = [98, 4]; st.armL = [18, 10]; st.lean = dir * 2; st.steam = 1; break;
    case 'facepalm': st.mood = 'tired'; st.armR = [150, 112]; st.armL = [14, 8]; st.lean = dir * 4; break;
    case 'cower': st.mood = 'wide'; st.sweat = 1.6; st.armL = [78, 125]; st.armR = [78, 125]; st.lean = dir * 2; st.bob = 1; break;
    case 'slump': st.mood = 'tired'; st.lean = dir * 7; st.armL = [4, 2]; st.armR = [4, 2]; break;
    case 'smug-stand': st.mood = 'smirk'; st.armL = [34, 112]; st.armR = [34, 112]; st.lean = -dir * 3; break;
  }
  if (Array.isArray(c.fx)) {                              // expression effects: animated, so they carry the clock t
    if (c.fx.includes('steam')) { st.steam = 1; st.t = t; }
    if (c.fx.includes('sweat')) st.sweat = Math.max(st.sweat || 0, 1);
    if (c.fx.includes('sweat-fly')) { st.sweat = Math.max(st.sweat || 0, 1.6); st.t = t; }
  }
  if (st.steam && st.t === undefined) st.t = t;
  if (st.sweat >= 1.5 && st.t === undefined) st.t = t;
  return st;
}

/** the set (3D world + people + props) for one theme, built once per distinct theme */
function buildSet(E, th) {
  const def = THEMES[th.name], o = { ...def.o, ...(th.o || {}) };
  const S = def.build === 'interior' ? WD.interior(E, o) : def.build === 'mainStreet' ? WD.mainStreet(E, o) : def.build === 'coast' ? WD.coast(E, o) : WD.meadow(E, o);
  S.kind = SETKIND[def.build]; S.toons = {}; S.shotProps = []; WD.depthLayers(S, S.kind);
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
  const wall = typeof p.pos === 'string', h = p.h || (p.kind === 'diagram' ? 1.4 : 1.2);
  const y = p.kind === 'poster' ? (p.y ?? 2.3) : p.kind === 'diagram' ? (p.y ?? (wall ? 2.3 : 0.6 + h / 2)) : DIEGETIC.has(p.kind) ? (p.y ?? WALL_Y[p.kind] ?? 0) : 0;
  const g = p.kind === 'poster' ? PR.poster(p.lines || ['NOTICE'], { w: p.w || 2.0, h: p.h || 1.2, bg: p.bg || '#F4EBD6', fg: p.fg || '#1F1C33', accent: p.accent || '#B5372E' })
    : p.kind === 'diagram' ? PR.diagram(p.ops || [], { w: p.w || 2.0, h, bg: p.bg || '#F4EBD6', fg: p.fg || '#1F1C33', title: p.title || '', legs: wall ? 0 : y })
    : p.kind === 'solid' ? PR.solid(p.parts || [])
    : p.kind === 'calendar' ? PR.calendar({ month: p.month || 'NOV', mark: p.mark || 0, cross: p.cross || [], w: p.w, h: p.h })
    : p.kind === 'sign' ? PR.sign(p.lines || ['KEEP OUT'], { bg: p.bg, fg: p.fg, w: p.w, h: p.h })
    : p.kind === 'breaker' ? PR.breaker({ flip: !!p.flip, switches: p.switches, w: p.w, h: p.h })
    : p.kind === 'clock' ? PR.clock({ hour: p.hour ?? 12, min: p.min ?? 0, spin: p.spin ?? 0.25, r: p.r, hang: p.hang })
    : p.kind === 'phone' ? PR.phone({ lines: p.lines, glow: p.glow })
    : p.kind === 'marker' ? PR.marker({ label: p.label || '39 FT', h: p.h2 })
    : p.kind === 'papers' ? PR.papers({ lines: p.lines, n: p.n })
    : p.kind === 'lockers' ? PR.lockers(p.n || 4, p.col) : p.kind === 'barbell' ? PR.barbell() : PR.desk(p.w || 2.2);
  const q = propPos(S, p.kind, p.pos);
  if (typeof p.pos === 'string' && DIEGETIC.has(p.kind) && p.kind !== 'phone') q.z += 0.06;   // flush against the wall
  g.position.set(q.x, y, q.z); g.rotation.y = q.ry + toRad(p.ry || 0); S.scene.add(g);
  g.visible = shot == null;                              // theme props stay visible; a shot's props only during that shot
  if (shot != null) S.shotProps.push({ g, shot, motion: p.motion || null, base: { x: q.x, y, z: q.z, ry: g.rotation.y } });
  return { g, q, w: p.w || 2.0, h, y, kind: p.kind };
}
function toonFor(S, chars, who, kid) {
  const key = who + (kid ? '|kid' : '');
  if (!S.toons[key]) {
    const def = chars[who], look = { ...def.look, extra: [...(def.look.extra || [])] }; if (kid || def.kid) look.kid = true;
    const tn = new Toon(look, { height: kid || def.kid ? 1.4 : PERSON }); tn.baseLook = { ...look }; tn.wearKey = ''; S.scene.add(tn.group); S.toons[key] = tn;
  }
  return S.toons[key];
}

/** builds every shot of the plan. Returns { shots, cues, report }. Call after loadTiming() and buildCaptions(). */
export function buildPlanShots(E, plan) {
  validatePlan(plan);
  if (T.dur < SECS[0] || T.dur > SECS[1]) throw new Error(`the narration is ${T.dur.toFixed(1)} s: a tall-tale mini-movie runs ${SECS[0]}-${SECS[1]} s (about ${WORDS[0]}-${WORDS[1]} words; add "pause" before reveals or trim)`);
  if (T.words.length < WORDS[0] || T.words.length > WORDS[1]) throw new Error(`the script has ${T.words.length} words: write ${WORDS[0]}-${WORDS[1]}`);
  if (T.lines.length !== plan.shots.length) throw new Error(`the script has ${T.lines.length} lines and the plan ${plan.shots.length} shots: one shot per line`);
  const said = T.lines.filter((l) => /["\u201C\u201D]/.test(l.text)).length;
  if (said < 3) throw new Error(`only ${said} lines of dialogue: a mini-movie needs at least 3 lines where a character speaks in quotes ("...") in the moment`);
  const lecture = T.lines.find((l) => DEFINITION.test(l.text));
  if (lecture) throw new Error(`line ${lecture.i}: "${lecture.text}" reads like a textbook definition. Show it happening to the characters instead`);
  const lastTxt = String((T.lines[T.lines.length - 1] || {}).text || '').trim();
  if (plan.loop !== false && /[.!?]["')]*$/.test(lastTxt)) throw new Error(`the last script line ends with "${lastTxt.slice(-1)}": write it mid-sentence so it flows into line 1 and the video loops cleanly (or set "loop": false)`);
  const cam = camera(36), sets = new Map(), shots = [], cues = [], report = [];
  const setFor = (th) => { const key = JSON.stringify(th); if (!sets.has(key)) sets.set(key, buildSet(E, th)); return sets.get(key); };
  let prevEnd = null;
  plan.shots.forEach((sp, i) => {
    const rawTh = sp.theme || plan.setting, th = typeof rawTh === 'string' ? { name: rawTh } : rawTh;     // a theme is a name or { name, o: { ...custom colours / sign } }
    const S = setFor(th), P = CAMS[sp.cam], id = `P${String(i + 1).padStart(2, '0')}`;
    const at = i === 0 ? 0 : L(sp.line) - 0.06;
    const cast = sp.cast.map((c) => ({ ...c, kid: !!c.kid, p0: place(S.kind, c.pos), p1: c.to || null, toon: toonFor(S, plan.characters, c.who, !!c.kid) }));
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
    const mv = sp.move || DEFAULT_MOVE[sp.cam], gain = mv ? MOVES[mv] : 1;
    const headLim = (k) => {                             // requested head size: the cut-in size is held within 1.6x of the previous shot, the move still plays out
      const f = (kk) => (P.head2 != null ? lerp(P.head, P.head2, eio(kk)) : P.head) * adj * lerp(1, gain, eio(kk));
      let h = f(k);
      if (prevEnd) h *= clamp(f(0), prevEnd / JUMP, prevEnd * JUMP) / f(0);
      return clamp(h, HEAD_MIN, HEAD_MAX);
    };
    let fovV = P.fov, adj = 1;                           // the lens may widen (up to 70) when the room is too small; adj re-aims the requested head
    const state = (k, s, sx, sy) => {
      const T0 = tgt(k), h = headLim(k), a = toRad((sp.yaw || 0) + (mv === 'orbit-left' ? lerp(-7, 7, eio(k)) : mv === 'orbit-right' ? lerp(7, -7, eio(k)) : 0));
      let D = (PERSON / (2 * h * Math.tan(toRad(P.fov / 2)))) * s, fo = fovV;
      if (S.kind === 'interior') {                       // in a room the lens cannot leave the floor: the frame is limited to the room, and the lens widens instead of getting closer than 0.30
        D = Math.min(D, ROOM_CAM_Z - T0.z); fo = Math.max(fovV, 2 * Math.atan(PERSON / (2 * D * h)) * 180 / Math.PI);   // the lens gives the requested head size (continuity holds at room cuts)
      }
      const e = eio(k), tl = mv === 'track-left' ? lerp(0.22, -0.22, e) : mv === 'track-right' ? lerp(-0.22, 0.22, e) : 0;      // sideways track (m)
      const cy = mv === 'crane-up' ? lerp(0, 0.9, e) : mv === 'crane-down' ? lerp(0.9, 0, e) : 0, ty = mv === 'tilt-up' ? lerp(-0.35, 0.3, e) : mv === 'crane-up' ? lerp(0, -0.1, e) : 0;
      return { pos: new THREE.Vector3(T0.x + D * Math.sin(a) + tl, P.y + cy, T0.z + D * Math.cos(a)), tgt: new THREE.Vector3(T0.x + tl * 0.5, T0.y + ty, T0.z), fov: fo, sx, sy };
    };
    const apply = (st) => {
      cam.fov = st.fov; cam.updateProjectionMatrix(); cam.position.copy(st.pos); cam.lookAt(st.tgt);
      if (st.sx || st.sy) cam.setViewOffset(W, H, -st.sx, -st.sy, W, H); else cam.clearViewOffset();
      cam.updateMatrixWorld(true);
    };
    const toPx = (v) => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z }; };
    // framing (owner 21 Nov 2026): knee-up / waist-up. The whole body must stay inside the safe zone left to right, the head (hat to chin)
    // inside it top to bottom; legs and feet may run into the caption zone or below the frame.
    const parts = (c, k) => {
      const p = posAt(c, k), st = poseOf(c, k, 0), h = c.kid ? 1.4 : PERSON, lean = toRad(st.lean), sn = Math.sin(lean), cs = Math.cos(lean);
      const top = h * cs + 0.15, chin = h * 0.66 * cs, body = [], head = [];
      const lo = -0.32 - (st.lean < 0 ? h * Math.abs(sn) : 0), hi = 0.32 + (st.lean > 0 ? h * Math.abs(sn) : 0);
      for (const dx of [lo, hi]) for (const y of [0, top]) for (const dz of [-0.2, 0.2]) body.push(new THREE.Vector3(p.x + dx, y, p.z + dz));
      for (const y of [top, chin]) for (const dx of [-0.3, 0.3]) head.push(new THREE.Vector3(p.x + h * 0.83 * sn + dx, y, p.z));
      return { body, head };
    };
    const KS = [0, 0.25, 0.5, 0.75, 1];
    const bbox = (s, sx, sy) => {
      const b = { l: 1e9, t: 1e9, r: -1e9, chin: -1e9, behind: false };
      for (const k of KS) {
        apply(state(k, s, sx, sy));
        for (const c of cast) {
          const { body, head } = parts(c, k);
          for (const v of body) { const q = toPx(v); if (q.z > 1 || q.z < 0) b.behind = true; b.l = Math.min(b.l, q.x); b.r = Math.max(b.r, q.x); if (S.kind === 'interior' && Math.abs(v.x) > S.w / 2 - 0.2) b.wall = true; }
          for (const v of head) { const q = toPx(v); b.t = Math.min(b.t, q.y); b.chin = Math.max(b.chin, q.y); }
        }
      }
      return b;
    };
    let s = 1, sx = 0, sy = 0, b1;
    const solve = () => {
      s = 1; sx = 0; sy = 0;
      for (let it = 0; it < 16; it++) {                  // dolly out only when the cast is wider than the safe zone (the height check below then decides)
        const b = bbox(s, 0, 0), need = Math.max((b.r - b.l) / (SAFE.r - SAFE.l), (b.chin - b.t) / (SAFE.b - SAFE.t));
        if (b.behind) s *= 1.15; else if (need > 1) s *= need * 1.03; else break;
      }
      const b0 = bbox(s, 0, 0);                          // lens shift: centred left-right, the highest hat 50 px under the top of the safe zone
      sx = (SAFE.l + SAFE.r) / 2 - (b0.l + b0.r) / 2; sy = SAFE.t + 50 - b0.t;
      if (b0.chin + sy > SAFE.b) sy = SAFE.b - b0.chin;
      return bbox(s, sx, sy);
    };
    const fits = (b) => !b.behind && !b.wall && b.l >= SAFE.l && b.r <= SAFE.r && b.t >= SAFE.t && b.chin <= SAFE.b;
    if (bbox(1, 0, 0).wall) throw new Error(`${id} (line ${sp.line}): a character would walk or fall into the wall of the room. Move the cast or change dir.`);
    const headPx = (k, sx_, sy_) => { apply(state(k, s, sx_, sy_)); const q = posAt(cast[fi], k); const hd = toPx(new THREE.Vector3(q.x, PERSON, q.z)), ft = toPx(new THREE.Vector3(q.x, 0, q.z)); return (ft.y - hd.y) / H; };
    let head0, head1;
    for (let pass = 0; ; pass++) {                       // the fit can shrink the head (the lens widens): re-aim the requested size until the measured head holds 1.6x
      for (fovV = P.fov; ; fovV += 4) {
        b1 = solve();
        if (fits(b1) || fovV >= 70) break;
      }
      if (!fits(b1))
        throw new Error(`${id} (line ${sp.line}): the cast does not fit the safe zone even at 70 deg (x ${b1.l | 0}..${b1.r | 0}, head y ${b1.t | 0}..${b1.chin | 0}). Move the cast closer together or use fewer people.`);
      head0 = headPx(0, sx, sy); head1 = headPx(1, sx, sy);
      const lo = (prevEnd || 0) / JUMP, hi = (prevEnd || 0) * JUMP;
      if (!prevEnd || pass === 5 || (head0 >= lo && head0 <= hi)) break;
      adj = head0 < lo ? Math.max(adj * lo * 1.03 / head0, lo * 1.03 / P.head) : adj * hi * 0.97 / head0;
    }
    const m0 = state(0, s, sx, sy), m1 = state(1, s, sx, sy);
    if (m0.pos.distanceTo(m1.pos) < 0.3 && m0.tgt.distanceTo(m1.tgt) < 0.15 && Math.abs(m0.fov - m1.fov) < 1) throw new Error(`${id} (line ${sp.line}): the camera would not move in this shot (the cast fills the frame, so a push or pull has no room). Use "move": "orbit-left" or "orbit-right"`);
    if (prevEnd && (head0 < prevEnd / JUMP || head0 > prevEnd * JUMP)) console.warn(`${id}: head size ${(head0 / prevEnd).toFixed(2)}x of the shot before (the cast cannot hold 1.6x)`);
    prevEnd = head1;
    const figH = (c, k) => { apply(state(k, s, sx, sy)); const q = posAt(c, k), hh = c.kid ? 1.4 : PERSON; return (toPx(new THREE.Vector3(q.x, 0, q.z)).y - toPx(new THREE.Vector3(q.x, hh, q.z)).y) / H; };
    let figMin = 1;
    cast.forEach((c) => {
      const m = Math.min(...KS.map((k) => figH(c, k))), need = c.bg ? FIG_BG : FIG_MIN; if (!c.bg) figMin = Math.min(figMin, m);
      if (m < need) throw new Error(`${id} (line ${sp.line}): ${c.who} is too far away (${(m * 100).toFixed(0)} % of the frame height, min ${need * 100} %${c.bg ? ' for a background extra' : ''}). Waist-up / knee-up framing only: stand the people closer together (two-shot about 0.9 m apart), use fewer people or a closer cam`);
    });
    // props of this shot + the 45 % poster rule
    const shotProps = (sp.props || []).map((p) => addProp(S, p, i));
    shotProps.forEach((pr) => {                          // a solid is part of the story: it must be on screen (its centre inside the frame)
      if (pr.kind !== 'solid') return;
      apply(state(0.5, s, sx, sy)); S.scene.updateMatrixWorld(true);
      const q = toPx(new THREE.Box3().setFromObject(pr.g).getCenter(new THREE.Vector3()));
      if (q.z < 0 || q.z > 1 || q.x < 40 || q.x > W - 40 || q.y < 40 || q.y > H - 40)
        throw new Error(`${id} (line ${sp.line}): the solid at [${pr.q.x}, ${pr.q.z}] is off screen. Props are part of the story: put them within about 0.7 m of the people (or right behind them)`);
    });
    shotProps.forEach((pr) => {
      if (pr.kind !== 'poster' && pr.kind !== 'diagram') return;
      const cs = pr.g.rotation.y, pts = [[-pr.w / 2, -pr.h / 2], [pr.w / 2, -pr.h / 2], [pr.w / 2, pr.h / 2], [-pr.w / 2, pr.h / 2]];
      apply(state(0.5, s, sx, sy));
      const q = pts.map(([lx, ly]) => toPx(new THREE.Vector3(pr.q.x + lx * Math.cos(cs), pr.y + ly, pr.q.z - lx * Math.sin(cs))));
      const area = (Math.max(...q.map((v) => v.x)) - Math.min(...q.map((v) => v.x))) * (Math.max(...q.map((v) => v.y)) - Math.min(...q.map((v) => v.y)));
      if (area > POSTER_MAX * W * H) throw new Error(`${id}: a ${pr.kind} covers ${(100 * area / (W * H)).toFixed(0)} % of the frame (max 45 %): make it smaller, it must not replace the cast`);
    });
    const shot = {
      id, at, note: `${S.kind}/${sp.cam}/${mv || 'push'}: head ${head0.toFixed(2)}->${head1.toFixed(2)}, cast in safe zone`, line: sp.line,
      cam: (k) => state(k, s, sx, sy),
      draw(lt, d, t, blit) {
        const k = clamp(lt / d);
        S.shotProps.forEach((pr) => {
          pr.g.visible = pr.shot === i; if (pr.shot !== i) return;
          if (pr.g.reveal) pr.g.reveal(k);
          const m = pr.motion; if (!m) return;             // active props: slide in, spin, grow, bob over the shot
          const e = eio(k), [dx, dz] = m.slide || [0, 0];
          pr.g.position.set(pr.base.x + dx * (e - 1), pr.base.y + (m.bob || 0) * Math.abs(Math.sin(lt * 4)), pr.base.z + dz * (e - 1));
          pr.g.rotation.y = pr.base.ry + toRad((m.spin || 0) * e); pr.g.scale.setScalar(lerp(m.grow ?? 1, 1, e));
        });
        const rig = applyRig(S, sp.light || 'day', k, lt);                // real 3D light rig: key angle, rim, bounce, atmosphere (engine.js)
        const key = S.rig && S.rig.key, sd = key ? { x: key.t.x - key.o.position.x, z: key.t.z - key.o.position.z } : { x: 0, z: 0 };
        Object.values(S.toons).forEach((tn) => { if (!castSet.has(tn)) tn.group.visible = false; });
        cast.forEach((c) => { const wk = c.wear ? JSON.stringify(c.wear) : ''; if (c.toon.wearKey !== wk) { c.toon.look = { ...c.toon.baseLook, ...(c.wear || {}) }; c.toon.wearKey = wk; c.toon.key = ''; }
          c.toon.group.visible = true; const q = posAt(c, k); c.toon.at(q.x, 0, q.z).set(poseOf(c, k, t)).ground(rig.contact, sd.x, sd.z); });
        const now = shot.cam(k);                         // blend from the previous camera over the first BLEND seconds
        let st = now;
        if (i > 0 && lt < BLEND) { const pe = shots[i - 1].cam(1), a = eo(clamp(lt / BLEND)); st = { pos: pe.pos.clone().lerp(now.pos, a), tgt: pe.tgt.clone().lerp(now.tgt, a), fov: lerp(pe.fov, now.fov, a), sx: lerp(pe.sx, now.sx, a), sy: lerp(pe.sy, now.sy, a) }; }
        apply(st);
        cast.forEach((c) => c.toon.face(cam)); if (S.faceAll) S.faceAll(cam);
        E.render(S.scene, cam, { ...LOOKS[S.kind], bloom: rig.bloom, vignette: rig.vignette, exposure: rig.exposure, tint: rig.tint, focus: st.pos.distanceTo(st.tgt) });
        blit();
      },
    };
    shots.push(shot);
    report.push({ id, line: sp.line, set: S.kind, cam: sp.cam, move: mv || 'push (built in)', head0: +head0.toFixed(3), head1: +head1.toFixed(3), box: [b1.l | 0, b1.t | 0, b1.r | 0, b1.chin | 0], fig: +figMin.toFixed(3) });
    // sounds: a whoosh on the cut unless the plan turns it off, then the plan's own cues
    const end = i + 1 < plan.shots.length ? L(plan.shots[i + 1].line) - 0.06 : T.dur;
    if (sp.whoosh !== false) cues.push({ t: +at.toFixed(3), type: 'whoosh' });
    (sp.cues || []).forEach((c) => {
      const t = c.word !== undefined ? Wd(c.word, sp.line) : c.at === 'start' ? at : c.at === 'end' ? end - 0.05 : at + Number(c.at);
      cues.push({ t: +t.toFixed(3), type: c.type, ...(c.gain !== undefined ? { gain: c.gain } : {}), ...(c.dur !== undefined ? { dur: c.dur } : {}) });
    });
  });
  // no single set + light for ROOM_MAX seconds or more
  let runStart = 0;
  plan.shots.forEach((sp, i) => {
    const key = (x) => JSON.stringify(x.theme || plan.setting) + '|' + (x.light || 'day');
    const nxt = plan.shots[i + 1], end = nxt ? shots[i + 1].at : T.dur;
    if (!nxt || key(nxt) !== key(sp)) {
      if (end - shots[runStart].at >= ROOM_MAX) throw new Error(`shots ${runStart + 1}-${i + 1} stay in one set and light for ${(end - shots[runStart].at).toFixed(0)} s (max ${ROOM_MAX} s): change the set or the lighting in between`);
      runStart = i + 1;
    }
  });
  return { shots, cues, report };
}
