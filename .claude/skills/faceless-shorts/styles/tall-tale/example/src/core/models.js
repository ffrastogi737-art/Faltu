// 3D story objects (owner 28 Nov 2026: "the characters are 2D, everything else in the picture is 3D"; "the pig did not show, just a round egg").
// Every story object is a real 3D model built here from shaped parts (capsules, lathes, extrusions, tubes), lit by the set's light rig like the
// rest of the world, with a dark ink outline (an inverted hull) so it sits next to the inked 2D cast. Never assemble an animal or a machine
// from loose spheres and boxes in shot_plan.json: add a model here.
//   MODELS[name] = { m: default height (m), ink: outline width (m), build(o) -> THREE.Group (built at real size, facing +x, standing on y = 0) }
//   model(name, { h, col, mood, pose, design, label, fire, crack, anim, ry, flip, ... }) -> Group with .size { w, h }, .reveal(k, t)
import * as THREE from 'three';

const INK = '#1F1C33';
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mat = (col, o = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.62, metalness: 0, ...o });
const shade = (hex, k = 0.8) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
const tint = (hex, k = 0.35) => { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#FFFFFF'), k); return '#' + c.getHexString(); };
const rad = (d) => d * Math.PI / 180;

// ---------- ink outline: an inverted hull pushed out along smoothed normals (so box corners and cylinder rims close up) ----------
const inkMats = {};
function inkMat(w) {
  if (inkMats[w]) return inkMats[w];
  return (inkMats[w] = new THREE.ShaderMaterial({
    uniforms: { w: { value: w }, col: { value: new THREE.Color(INK) } }, side: THREE.BackSide,
    vertexShader: 'attribute vec3 onormal; uniform float w; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * onormal); gl_Position = projectionMatrix * viewMatrix * vec4(wp.xyz + n * w, 1.0); }',
    fragmentShader: 'uniform vec3 col; void main() { gl_FragColor = vec4(col, 1.0); }',
  }));
}
function smoothNormals(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  const on = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.hypot(...a) || 1; on[i * 3] = a[0] / l; on[i * 3 + 1] = a[1] / l; on[i * 3 + 2] = a[2] / l; }
  g.setAttribute('onormal', new THREE.BufferAttribute(on, 3)); return g;
}
/** gives every mesh in the group an ink outline (skip a mesh with userData.noInk) */
export function inkAll(group, w = 0.014) {
  const meshes = []; group.traverse((o) => { if (o.isMesh && !o.userData.noInk && !o.userData.isInk) meshes.push(o); });
  meshes.forEach((m) => { const o = new THREE.Mesh(smoothNormals(m.geometry), inkMat(w)); o.userData.isInk = true; o.castShadow = false; o.receiveShadow = false; m.add(o); });
  return group;
}

// ---------- part helpers (all in metres) ----------
function add(parent, geo, m, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m); mesh.position.set(...pos); mesh.rotation.set(...rot); mesh.scale.set(...scl);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const plain = (m) => { m.userData.noInk = true; return m; };
const SPH = (r, a = 24, b = 16) => new THREE.SphereGeometry(r, a, b), CYL = (r1, r2, h, s = 24) => new THREE.CylinderGeometry(r1, r2, h, s), BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20), CONE = (r, h, s = 20) => new THREE.ConeGeometry(r, h, s), TOR = (r, t, s = 28) => new THREE.TorusGeometry(r, t, 10, s);
function eyes(g, x, y, z, r, mood = '', zs = [-1, 1]) {        // cartoon eyes on both sides of a head (x forward)
  zs.forEach((s) => {
    if (mood === 'x') { [1, -1].forEach((d) => plain(add(g, BOX(r * 0.35, r * 2.2, r * 0.35), INK, [x, y, z * s], [0, 0, d * Math.PI / 4]))); return; }
    if (mood === 'happy') { plain(add(g, new THREE.TorusGeometry(r * 0.8, r * 0.22, 8, 16, Math.PI), INK, [x, y - r * 0.2, z * s])); return; }
    plain(add(g, SPH(r * 1.25, 16, 12), '#FFFFFF', [x - r * 0.3, y, z * s]));
    plain(add(g, SPH(r * 0.72, 14, 10), INK, [x + r * 0.35, y + (mood === 'scared' ? r * 0.25 : 0), z * s + s * r * 0.55]));
    plain(add(g, SPH(r * 0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), [x + r * 0.55, y + r * 0.3, z * s + s * r * 0.95]));
    if (mood === 'angry') plain(add(g, BOX(r * 2.2, r * 0.35, r * 0.35), INK, [x, y + r * 1.5, z * s + s * r * 0.4], [s * 0.4, 0, -0.45]));
  });
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function puffs(g, n, at, col = '#EDEDF2') {                       // smoke balls that rise and fade: g.userData.tick(t) drives them
  const list = []; for (let i = 0; i < n; i++) { const m = plain(add(g, SPH(0.12, 12, 9), mat(col, { transparent: true, opacity: 0.9, roughness: 1 }), at)); m.castShadow = false; m.userData.fx = true; list.push(m); }
  return (t, s = 1) => list.forEach((m, i) => { const k = (t * 0.5 + i / n) % 1; m.position.set(at[0] + k * 0.6 * s, at[1] + k * 1.4 * s, at[2] + Math.sin(i * 2.3) * 0.15 * k); m.scale.setScalar((0.6 + k * 2.4) * s); m.material.opacity = 0.9 * (1 - k); });
}

// ---------- extra part helpers for the model library ----------
const RBOX = (w, h, d, r = 0.03) => {                              // a chunky box with bevelled edges
  const b = Math.min(r, w / 4, h / 4, d / 4), W = w / 2 - b, H = h / 2 - b, s = new THREE.Shape();
  s.moveTo(-W, -H); s.lineTo(W, -H); s.lineTo(W, H); s.lineTo(-W, H); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3 });
  g.translate(0, 0, -(d - 2 * b) / 2); return g;
};
const tube = (pts, r, seg = 32, close = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), close), seg, r, 8, close);
const LATH = (pts, s = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s);
const glow = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
function lay(g, o) {                                               // pose 'dead' (on its back, legs up) | 'side' (lying on its side), like the pig
  if (o.pose !== 'dead' && o.pose !== 'side') return g;
  const p = new THREE.Group(); p.add(...g.children); p.rotation.x = o.pose === 'dead' ? Math.PI : Math.PI / 2; p.position.y = 1; g.add(p); return g;
}
function wheel(parent, R, t, col, rim, pos, n = 8) {               // a spoked wheel in the xy plane; userData.wheel lets the 'roll' anim turn it
  const w = new THREE.Group(); w.position.set(...pos); w.userData.wheel = true; parent.add(w);
  add(w, TOR(R, t, 32), rim); add(w, CYL(R * 0.17, R * 0.17, t * 3, 16), shade(rim, 0.7), [0, 0, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < n; i++) add(w, BOX(t * 0.8, R * 2, t * 0.8), col, [0, 0, 0], [0, 0, i / n * Math.PI]);
  return w;
}

// ---------- the library ----------
export const MODELS = {
  /** a farm pig, snout to +x. col (default pink; '#3A3640' = black pig), mood: '' angry scared happy x, pose: 'stand' | 'dead' (on its back, legs up) | 'side' (lying on its side), mud */
  pig: { m: 0.75, ink: 0.022, build(o) {
    const g = new THREE.Group(), c = o.col || '#F2A0B2', light = tint(c, 0.18), dark = shade(c, 0.55);
    add(g, CAP(0.27, 0.42), c, [0, 0.45, 0], [0, 0, Math.PI / 2], [1, 1, 0.92]);
    add(g, SPH(0.23), c, [0.44, 0.55, 0]);
    add(g, CYL(0.1, 0.115, 0.12), light, [0.66, 0.5, 0], [0, 0, Math.PI / 2]);
    [-1, 1].forEach((s) => plain(add(g, new THREE.CircleGeometry(0.022, 14), dark, [0.722, 0.5, s * 0.04], [0, Math.PI / 2, 0])));
    [-1, 1].forEach((s) => add(g, CONE(0.085, 0.16, 14), c, [0.4, 0.78, s * 0.12], [s * 0.35, 0, -0.5]));
    eyes(g, 0.6, 0.64, 0.12, 0.034, o.mood);
    [[0.22, 0.14], [-0.22, 0.14]].forEach(([x, z]) => [-1, 1].forEach((s) => { add(g, CYL(0.07, 0.062, 0.24, 14), c, [x, 0.14, s * z]); add(g, CYL(0.064, 0.064, 0.05, 14), '#5A3A30', [x, 0.025, s * z]); }));
    const curl = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => { const a = i / 23 * Math.PI * 3.2, r = 0.05 * (1 - i / 40); return new THREE.Vector3(-0.53 - i * 0.004, 0.55 + Math.sin(a) * r, Math.cos(a) * r); }));
    add(g, new THREE.TubeGeometry(curl, 40, 0.014, 8), c);
    if (o.mud) [[0.1, 0.62, 0.24], [-0.2, 0.4, 0.25], [0.3, 0.3, 0.24]].forEach(([x, y, z], i) => plain(add(g, SPH(0.07 - i * 0.012, 12, 8), '#6B4A30', [x, y, z], [0, 0, 0], [1, 0.8, 0.3])));
    if (o.pose === 'dead' || o.pose === 'side') { const p = new THREE.Group(); p.add(...g.children); p.rotation.x = o.pose === 'dead' ? Math.PI : Math.PI / 2; p.position.y = o.pose === 'dead' ? 0.82 : 0.3; g.add(p); }
    return g;
  } },
  /** an old muzzle-loading cannon on a wooden carriage, muzzle to +x. fire: true = flash + smoke (animated), col = barrel, balls: a stack of cannonballs */
  cannon: { m: 1.0, ink: 0.022, build(o) {
    const g = new THREE.Group(), iron = mat(o.col || '#2E2D36', { roughness: 0.4, metalness: 0.5 }), wood = '#8A5A36';
    [-1, 1].forEach((s) => { const ch = add(g, BOX(1.1, 0.26, 0.07), wood, [-0.05, 0.42, s * 0.2], [0, 0, rad(12)]); add(g, BOX(0.95, 0.07, 0.07), shade(wood, 0.8), [-0.65, 0.12, s * 0.12], [0, s * 0.18, rad(-8)]); ch.castShadow = true; });
    add(g, CYL(0.035, 0.035, 0.7, 10), '#4A4A52', [0.15, 0.36, 0], [Math.PI / 2, 0, 0]);
    [-1, 1].forEach((s) => { const w = new THREE.Group(); w.position.set(0.15, 0.36, s * 0.32); g.add(w); add(w, TOR(0.3, 0.045, 30), wood); add(w, CYL(0.07, 0.07, 0.1, 14), '#5A3A22', [0, 0, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 8; i++) add(w, BOX(0.03, 0.56, 0.03), shade(wood, 0.85), [0, 0, 0], [0, 0, i / 8 * Math.PI]); w.userData.wheel = true; });
    const prof = [[0, 0], [0.13, 0], [0.15, 0.08], [0.14, 0.12], [0.12, 0.2], [0.11, 0.9], [0.125, 0.94], [0.125, 1.02], [0.1, 1.02], [0.06, 1.0], [0.06, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const barrel = new THREE.Group(); barrel.position.set(-0.25, 0.62, 0); barrel.rotation.z = rad(-78); g.add(barrel);
    add(barrel, new THREE.LatheGeometry(prof, 28), iron); add(barrel, SPH(0.07, 14, 10), iron, [0, -0.05, 0]);
    [0.3, 0.55].forEach((y) => add(barrel, CYL(0.128, 0.128, 0.04, 28), iron, [0, y, 0]));
    if (o.balls) [[-0.7, 0.09, 0.42], [-0.52, 0.09, 0.42], [-0.61, 0.24, 0.42]].forEach((p) => add(g, SPH(0.09, 16, 12), iron, p));
    if (o.fire) {
      const fl = plain(add(g, new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: '#FFD43B', toneMapped: false }), [0.86, 0.84, 0], [0, 0, 0], [1.5, 1, 1])); fl.userData.fx = true;
      const sm = puffs(g, 7, [0.95, 0.85, 0]); g.userData.tick = (t) => { sm(t, 1.1); fl.scale.set(1.3 + 0.4 * Math.sin(t * 30), 0.9 + 0.3 * Math.sin(t * 23), 1); fl.rotation.z = t * 3; };
    }
    return g;
  } },
  /** a flag on a pole; the cloth waves. design: 'uk' | 'us' | 'stripes' | 'tricolor' (cols: [...]) | 'plain' (col) | 'pirate' */
  flag: { m: 2.6, ink: 0.018, build(o) {
    const g = new THREE.Group();
    add(g, CYL(0.035, 0.045, 2.55, 12), '#7A5236', [0, 1.275, 0]); add(g, SPH(0.07, 14, 10), mat('#E2B33C', { metalness: 0.6, roughness: 0.3 }), [0, 2.58, 0]);
    add(g, CYL(0.18, 0.22, 0.08, 16), '#5A4A40', [0, 0.04, 0]);
    const des = o.design || 'plain', cols = o.cols || ['#C8372D', '#F4EFE4', '#2E4E8A'];
    const tex = canvasTex(600, 400, (c, w, h) => {
      if (des === 'uk') { c.fillStyle = '#1F3A7A'; c.fillRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2);
        [1, -1].forEach((s) => { c.save(); c.rotate(Math.atan2(h * s, w)); c.fillStyle = '#F4EFE4'; c.fillRect(-w, -36, w * 2, 72); c.fillStyle = '#C8372D'; c.fillRect(-w, -14, w * 2, 28); c.restore(); });
        c.fillStyle = '#F4EFE4'; c.fillRect(-w, -60, w * 2, 120); c.fillRect(-60, -h, 120, h * 2); c.fillStyle = '#C8372D'; c.fillRect(-w, -36, w * 2, 72); c.fillRect(-36, -h, 72, h * 2); c.restore(); }
      else if (des === 'us') { for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#F4EFE4' : '#C8372D'; c.fillRect(0, i * h / 13, w, h / 13 + 1); } c.fillStyle = '#1F3A7A'; c.fillRect(0, 0, w * 0.42, h * 7 / 13); c.fillStyle = '#F4EFE4'; for (let r = 0; r < 5; r++) for (let q = 0; q < 6; q++) { c.beginPath(); c.arc(22 + q * 40, 22 + r * 40, 9, 0, 7); c.fill(); } }
      else if (des === 'stripes') cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * h / cols.length, w, h / cols.length + 1); });
      else if (des === 'tricolor') cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * w / cols.length, 0, w / cols.length + 1, h); });
      else if (des === 'pirate') { c.fillStyle = '#1F1C24'; c.fillRect(0, 0, w, h); c.fillStyle = '#F4EFE4'; c.beginPath(); c.arc(w / 2, h * 0.42, 70, 0, 7); c.fill(); c.fillStyle = '#1F1C24'; [-26, 26].forEach((dx) => { c.beginPath(); c.arc(w / 2 + dx, h * 0.4, 18, 0, 7); c.fill(); }); }
      else { c.fillStyle = o.col || '#C8372D'; c.fillRect(0, 0, w, h); }
      c.strokeStyle = INK; c.lineWidth = 14; c.strokeRect(0, 0, w, h);
    });
    const geo = new THREE.PlaneGeometry(1.2, 0.8, 24, 12); geo.translate(0.6, 0, 0);
    const cloth = plain(add(g, geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }), [0.04, 2.08, 0])); cloth.receiveShadow = false; const base = geo.attributes.position.array.slice();
    g.userData.tick = (t) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(x * 4.2 - t * 5) * 0.09 * (x / 1.2)); p.setY(i, base[i * 3 + 1] - 0.04 * (x / 1.2) * (x / 1.2)); } p.needsUpdate = true; geo.computeVertexNormals(); };
    g.userData.tick(0); return g;
  } },
  /** a wooden sailing warship, bow to +x: a hull with two rows of gun ports, two masts with billowing sails, a pennant. col = hull, design = the stern flag */
  ship: { m: 3.6, ink: 0.045, build(o) {
    const g = new THREE.Group(), hullC = o.col || '#7A4A2A', L = 4.2;
    const sh = new THREE.Shape(); sh.moveTo(-L / 2, 1.2); sh.lineTo(L / 2 + 0.3, 1.05); sh.quadraticCurveTo(L / 2, 0.1, L / 2 - 0.6, 0); sh.lineTo(-L / 2 + 0.3, 0); sh.quadraticCurveTo(-L / 2, 0.3, -L / 2, 1.2);
    const hull = add(g, new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.12, bevelSegments: 4, curveSegments: 16 }), hullC, [0, 0, -0.5]);
    hull.geometry.computeVertexNormals();
    [-1, 1].forEach((s) => { add(g, BOX(L - 0.4, 0.07, 0.04), '#E2B33C', [0.05, 0.98, s * 0.69]); for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) plain(add(g, BOX(0.2, 0.16, 0.03), '#1F1C24', [-1.55 + i * 0.58, 0.55 + r * 0.25, s * 0.7])); });
    add(g, BOX(L - 0.2, 0.06, 1.2), '#B5875A', [0.05, 1.16, 0]);
    [[-0.6, 3.3], [0.9, 2.9]].forEach(([x, hgt], i) => {
      add(g, CYL(0.06, 0.08, hgt, 10), '#5A3A22', [x, 1.16 + hgt / 2, 0]);
      [[0.36, 1.0, 1.0], [0.74, 0.86, 0.8]].forEach(([yk, wk, hk]) => {
        const sw = 2.1 * wk, shh = 1.15 * hk;                       // a sail: a sheet bent forward (billowing)
        const sail = new THREE.PlaneGeometry(sw, shh, 12, 8); const p = sail.attributes.position; for (let v = 0; v < p.count; v++) { const sx = p.getX(v) / sw, sy = p.getY(v) / shh; p.setZ(v, 0.25 * (1 - 4 * sx * sx) * (0.6 + 0.4 * (0.5 - sy))); } sail.computeVertexNormals();
        const m = plain(add(g, sail, new THREE.MeshStandardMaterial({ color: '#F2EADB', roughness: 0.9, side: THREE.DoubleSide }), [x + 0.05, 1.16 + hgt * yk, 0], [0, Math.PI / 2 - 0.25, 0]));   // thin sheet: no ink hull (it would z-fight)
        m.receiveShadow = false;
        add(g, CYL(0.03, 0.03, sw + 0.2, 8), '#5A3A22', [x, 1.16 + hgt * yk + shh / 2, 0], [Math.PI / 2, 0, 0]); m.castShadow = true;
      });
      if (i === 1) plain(add(g, CONE(0.1, 0.6, 3), o.pennant || '#C8372D', [x + 0.3, 1.16 + hgt + 0.05, 0], [0, 0, -Math.PI / 2], [1, 1, 0.15]));
    });
    const bow = new THREE.CatmullRomCurve3([new THREE.Vector3(L / 2 + 0.25, 1.1, 0), new THREE.Vector3(L / 2 + 1.0, 1.45, 0)]); add(g, new THREE.TubeGeometry(bow, 4, 0.05, 8), '#5A3A22');
    return g;
  } },
  /** a huge riveted storage tank (molasses, oil, water). label (on the front), crack: true = jagged cracks with liquid oozing (animated), col, drip = liquid colour */
  tank: { m: 3.6, ink: 0.04, build(o) {
    const g = new THREE.Group(), c = o.col || '#8E959E', R = 1.3, Hh = 3.0;
    const tex = canvasTex(1024, 512, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = shade(c, 0.7); for (let r = 0; r < 5; r++) { x.fillRect(0, r * h / 5, w, 5); for (let q = 0; q < 48; q++) { x.beginPath(); x.arc(q * w / 48 + 10, r * h / 5 + 16, 4, 0, 7); x.fill(); } } for (let q = 0; q < 8; q++) x.fillRect(q * w / 8, 0, 4, h);
      if (o.label) { x.fillStyle = '#F4EFE4'; x.fillRect(w * 0.18, h * 0.38, w * 0.3, h * 0.22); x.strokeStyle = INK; x.lineWidth = 8; x.strokeRect(w * 0.18, h * 0.38, w * 0.3, h * 0.22); x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; let f = 70; x.font = `900 ${f}px Inter`; while (x.measureText(o.label).width > w * 0.27) { f -= 4; x.font = `900 ${f}px Inter`; } x.fillText(o.label, w * 0.33, h * 0.49); }
      if (o.crack) { x.strokeStyle = INK; x.lineWidth = 10; x.lineJoin = 'round'; x.beginPath(); x.moveTo(w * 0.27, h * 0.62); [[0.3, 0.7], [0.26, 0.78], [0.31, 0.88], [0.28, 1]].forEach(([a, b]) => x.lineTo(w * a, h * b)); x.stroke(); } });
    add(g, new THREE.CylinderGeometry(R, R, Hh, 48, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.25 }), [0, Hh / 2, 0], [0, -Math.PI / 2 - 0.4, 0]);
    add(g, new THREE.SphereGeometry(R, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(tint(c, 0.1), { metalness: 0.35, roughness: 0.5 }), [0, Hh, 0], [0, 0, 0], [1, 0.32, 1]);
    add(g, CYL(R + 0.05, R + 0.05, 0.12, 48), shade(c, 0.6), [0, 0.06, 0]);
    const lad = new THREE.Group(); lad.position.set(Math.sin(1.25) * R, 0, Math.cos(1.25) * R); lad.rotation.y = 1.25; g.add(lad);   // on the side, clear of the label
    [-0.2, 0.2].forEach((x) => add(lad, BOX(0.05, Hh + 0.2, 0.05), '#4A4A52', [x, (Hh + 0.2) / 2, 0.06])); for (let y = 0.3; y < Hh; y += 0.3) add(lad, BOX(0.42, 0.035, 0.035), '#4A4A52', [0, y, 0.06]);
    if (o.crack) {
      const dc = mat(o.drip || '#4A2410', { roughness: 0.2 }), drips = [];
      for (let i = 0; i < 4; i++) { const d = add(g, CAP(0.06, 0.18), dc, [0, 0, 0]); const a = -Math.PI / 2 - 0.4 + Math.PI / 2 + 0.1 + i * 0.06; d.position.set(Math.sin(a) * (R + 0.04), 0.9 - i * 0.18, Math.cos(a) * (R + 0.04)); drips.push([d, d.position.y]); }
      add(g, SPH(0.9, 24, 12), dc, [0.55, 0, 1.25], [0, 0, 0], [1.3, 0.08, 0.8]);
      g.userData.tick = (t) => drips.forEach(([d, y0], i) => { const k = (t * 0.6 + i * 0.27) % 1; d.position.y = y0 - k * 0.7; d.scale.set(1, 1 + k * 0.8, 1); });
    }
    return g;
  } },
  /** a towering wave of liquid rolling to +x (molasses by default; col '#3FA8E0' = water). A 3D wall 3 m deep with a curling crest and flying blobs */
  wave: { m: 2.6, ink: 0.04, build(o) {
    const g = new THREE.Group(), c = o.col || '#5A2E12';
    const s = new THREE.Shape(); s.moveTo(-1.9, 0); s.lineTo(-1.9, 0.8); s.bezierCurveTo(-1.6, 1.9, -0.6, 2.55, 0.35, 2.55); s.bezierCurveTo(1.2, 2.55, 1.65, 2.0, 1.45, 1.55); s.bezierCurveTo(1.32, 1.25, 0.95, 1.3, 0.98, 1.6);
    s.bezierCurveTo(1.0, 1.85, 0.7, 1.9, 0.62, 1.55); s.bezierCurveTo(0.55, 1.0, 1.4, 0.6, 1.9, 0); s.lineTo(-1.9, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.12, bevelSegments: 5, curveSegments: 24 }); geo.translate(0, 0, -1.3);
    add(g, geo, mat(c, { roughness: 0.18, metalness: 0.05 }));
    const blobs = []; for (let i = 0; i < 7; i++) { const b = add(g, SPH(0.08 + rnd(i) * 0.08, 14, 10), mat(c, { roughness: 0.18 }), [1.3, 1.8, -1 + i * 0.33]); b.userData.fx = true; blobs.push(b); }
    add(g, SPH(1.6, 24, 12), mat(c, { roughness: 0.2 }), [1.8, 0, 0], [0, 0, 0], [1.4, 0.06, 1.1]);
    g.userData.tick = (t) => blobs.forEach((b, i) => { const k = (t * 0.7 + i * 0.17) % 1; b.position.set(1.35 + k * 0.9, 1.9 + Math.sin(k * Math.PI) * 0.5 - k * 1.2, -1 + i * 0.33); });
    g.userData.tick(0); return g;
  } },
  /** a woven basket heaped with potatoes (basket: false = a loose heap on the ground). col = potato skin */
  potatoes: { m: 0.55, ink: 0.015, build(o) {
    const g = new THREE.Group(), c = o.col || '#B98A52';
    const weave = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#C89A5A'; x.fillRect(0, 0, w, h); x.strokeStyle = '#8A6232'; x.lineWidth = 5; for (let y = 0; y < h; y += 16) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } for (let q = 0; q < w; q += 20) { x.beginPath(); x.moveTo(q, 0); x.lineTo(q + 4, h); x.stroke(); } });
    const top = o.basket === false ? 0.02 : 0.34;
    if (o.basket !== false) { add(g, new THREE.CylinderGeometry(0.4, 0.3, 0.34, 28, 1, true), new THREE.MeshStandardMaterial({ map: weave, roughness: 0.9, side: THREE.DoubleSide }), [0, 0.17, 0]); add(g, TOR(0.4, 0.035, 30), '#9A6A3A', [0, 0.34, 0], [Math.PI / 2, 0, 0]); add(g, CYL(0.3, 0.3, 0.03, 24), '#8A6232', [0, 0.02, 0]); }
    const pm = mat(c, { roughness: 0.95 });
    for (let i = 0; i < 16; i++) { const a = rnd(i) * Math.PI * 2, r = Math.sqrt(rnd(i + 9)) * 0.3, y = top + 0.04 + (0.3 - r) * 0.55 + rnd(i * 3) * 0.04; add(g, SPH(0.085, 14, 10), pm, [Math.cos(a) * r, y, Math.sin(a) * r], [rnd(i) * 3, rnd(i + 2) * 3, 0], [1.3, 0.85, 0.95]); }
    return g;
  } },
  /** a WWII four-engine bomber, nose to +x (6 m long, wings along z). col (olive by default), holes: true = bullet holes over the wings and the tail
   *  (the engines stay clean), props spin; 'smoke': true = a smoking engine */
  plane: { m: 1.9, ink: 0.035, ry: -48, build(o) {
    const g = new THREE.Group(), c = o.col || '#6B7A4A', dk = shade(c, 0.75), L = 6.0, y0 = 1.25;
    const prof = [[0, 0], [0.18, 0.06], [0.36, 0.3], [0.46, 0.8], [0.48, 2.2], [0.44, 3.6], [0.3, 5.0], [0.16, 5.8], [0, 6.0]].map(([r, y]) => new THREE.Vector2(r, y));
    add(g, new THREE.LatheGeometry(prof, 28), c, [L / 2, y0, 0], [0, 0, Math.PI / 2]);
    add(g, SPH(0.3, 20, 12), mat('#9FD0E8', { roughness: 0.1, metalness: 0.2 }), [1.95, y0 + 0.38, 0], [0, 0, 0], [1.6, 0.8, 0.9]);
    add(g, SPH(0.2, 16, 12), mat('#9FD0E8', { roughness: 0.1 }), [2.9, y0 + 0.05, 0], [0, 0, 0], [0.9, 1, 1]);
    const wing = (span, root, tip, sweep, t) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(root, 0); s.lineTo(sweep + tip, span); s.lineTo(sweep, span); s.lineTo(0, 0);
      return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: t * 0.6, bevelSegments: 2 }); };
    [-1, 1].forEach((s) => {
      add(g, wing(3.4, 1.3, 0.55, 0.45, 0.08), c, [0.55, y0 + 0.05, 0], [-s * Math.PI / 2, 0, 0]);
      add(g, wing(1.2, 0.7, 0.35, 0.3, 0.05), c, [-2.65, y0 + 0.15, 0], [-s * Math.PI / 2, 0, 0]);
      [1.2, 2.4].forEach((z, i) => {
        add(g, CAP(0.17, 0.5), dk, [1.15 - i * 0.12, y0 - 0.02, s * z], [0, 0, Math.PI / 2]);
        const pr = new THREE.Group(); pr.position.set(1.52 - i * 0.12, y0 - 0.02, s * z); g.add(pr); add(pr, CONE(0.09, 0.18, 14), '#3A3A42', [0.06, 0, 0], [0, 0, -Math.PI / 2]);
        for (let b = 0; b < 3; b++) { const bl = add(pr, BOX(0.03, 0.62, 0.07), '#2A2A30', [0, 0, 0], [b / 3 * Math.PI * 2, 0, 0]); bl.position.set(0, Math.cos(b / 3 * Math.PI * 2) * 0.3, Math.sin(b / 3 * Math.PI * 2) * 0.3); bl.rotation.x = b / 3 * Math.PI * 2; }
        pr.userData.prop = true;
      });
    });
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(1.1, 0); fin.lineTo(0.55, 1.15); fin.lineTo(0.15, 1.15); fin.lineTo(0, 0);
    add(g, new THREE.ExtrudeGeometry(fin, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2 }), c, [-2.95, y0 + 0.3, -0.035]);
    const star = canvasTex(256, 256, (x, w) => { x.fillStyle = '#1F3A7A'; x.beginPath(); x.arc(w / 2, w / 2, w * 0.48, 0, 7); x.fill(); x.fillStyle = '#F4EFE4'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? w * 0.17 : w * 0.42; x.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } x.fill(); });
    [-1, 1].forEach((s) => plain(add(g, new THREE.CircleGeometry(0.32, 28), new THREE.MeshStandardMaterial({ map: star, roughness: 0.7 }), [-0.9, y0 + 0.05, s * 0.475], [0, s > 0 ? 0 : Math.PI, 0])));
    [-1, 1].forEach((s) => { add(g, CYL(0.05, 0.05, 0.75, 10), '#3A3A42', [1.3, 0.62, s * 1.2]); add(g, TOR(0.25, 0.1, 20), '#25242B', [1.3, 0.3, s * 1.2]); });
    add(g, CYL(0.035, 0.035, 0.75, 8), '#3A3A42', [-2.55, 0.62, 0], [0, 0, 0.35]); add(g, TOR(0.11, 0.05, 14), '#25242B', [-2.42, 0.16, 0]);
    if (o.holes) {
      const hm = new THREE.MeshBasicMaterial({ color: '#141218' });
      for (let i = 0; i < 36; i++) { const s = i % 2 ? 1 : -1, z = s * (0.6 + rnd(i) * 2.9), x = 0.65 + rnd(i * 7) * 1.0 - (Math.abs(z) / 3.4) * 0.2; if (Math.abs(Math.abs(z) - 1.2) < 0.25 || Math.abs(Math.abs(z) - 2.4) < 0.25) continue;
        plain(add(g, new THREE.CircleGeometry(0.035 + rnd(i * 3) * 0.03, 10), hm, [x, y0 + 0.2, z], [-Math.PI / 2, 0, 0])); }
      for (let i = 0; i < 12; i++) [-1, 1].forEach((s) => plain(add(g, new THREE.CircleGeometry(0.045 + rnd(i) * 0.035, 10), hm, [-2.8 + rnd(i * 5) * 0.7, y0 + 0.4 + rnd(i * 9) * 0.75, s * 0.11], [0, s > 0 ? 0 : Math.PI, 0])));
      for (let i = 0; i < 16; i++) [-1, 1].forEach((s) => { const x = -0.3 - rnd(i * 11) * 2.2, r = 0.47 - (Math.max(0, -x - 1.4) / 2.6) * 0.3; plain(add(g, new THREE.CircleGeometry(0.045 + rnd(i + 40) * 0.035, 10), hm, [x, y0 + 0.05 + (rnd(i * 13) - 0.5) * 0.45, s * (r + 0.01)], [0, s > 0 ? 0 : Math.PI, 0])); });
    }
    const props = []; g.traverse((m) => { if (m.userData.prop) props.push(m); });
    const sm = o.smoke ? puffs(g, 6, [1.0, y0 + 0.1, 2.4], '#5A5A62') : null;
    g.userData.tick = (t) => { props.forEach((p, i) => { p.rotation.x = t * 22 + i; }); if (sm) sm(t, 1); };
    return g;
  } },
  /** a wooden barrel with iron hoops (label: stencil text on the front) */
  barrel: { m: 0.95, ink: 0.02, build(o) {
    const g = new THREE.Group(), c = o.col || '#9A6337';
    const prof = []; for (let i = 0; i <= 12; i++) { const y = i / 12 * 0.95; prof.push(new THREE.Vector2(0.3 + 0.06 * Math.sin(i / 12 * Math.PI), y)); }
    const tex = canvasTex(512, 256, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = shade(c, 0.75); for (let q = 0; q < 16; q++) x.fillRect(q * w / 16, 0, 3, h); if (o.label) { x.fillStyle = shade(c, 0.35); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 60px Inter'; x.fillText(o.label, w * 0.25, h / 2); } });
    add(g, new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), [0, 0, 0], [0, -Math.PI / 2, 0]);
    add(g, CYL(0.3, 0.3, 0.02, 28), shade(c, 0.85), [0, 0.95, 0]);
    [0.12, 0.83].forEach((y) => add(g, TOR(0.335, 0.018, 32), '#3A3A42', [0, y, 0], [Math.PI / 2, 0, 0]));
    return g;
  } },
  /** a wooden crate (label: stencil text on the front, e.g. TNT, GOLD) */
  crate: { m: 0.75, ink: 0.02, build(o) {
    const g = new THREE.Group(), c = o.col || '#C8935A', s = 0.75;
    const tex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = shade(c, 0.78); for (let i = 1; i < 5; i++) x.fillRect(0, i * h / 5, w, 4); x.fillStyle = shade(c, 0.85); x.fillRect(0, 0, w, 30); x.fillRect(0, h - 30, w, 30); x.fillRect(0, 0, 30, h); x.fillRect(w - 30, 0, 30, h);
      x.save(); x.translate(w / 2, h / 2); x.rotate(Math.atan2(h, w)); x.fillRect(-w * 0.62, -14, w * 1.24, 28); x.restore();
      if (o.label) { x.fillStyle = o.labelCol || '#B5372E'; x.textAlign = 'center'; x.textBaseline = 'middle'; let f = 80; x.font = `900 ${f}px Inter`; while (x.measureText(o.label).width > w * 0.8) { f -= 4; x.font = `900 ${f}px Inter`; } x.fillText(o.label, w / 2, h / 2); } });
    add(g, BOX(s, s, s), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), [0, s / 2, 0]);
    return g;
  } },
  /** a cow, head to +x. col (white default, black spots), mood, pose 'dead' | 'side' */
  cow: { m: 1.4, ink: 0.025, build(o) {
    const g = new THREE.Group(), c = o.col || '#F4F1EA', blk = '#2A2630', pink = '#F2A0B2';
    const tex = canvasTex(512, 256, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = blk; for (let i = 0; i < 18; i++) { if (rnd(i + 40) < 0.25) continue; x.beginPath(); x.ellipse(((i % 4) + 0.2 + rnd(i) * 0.6) * w / 4, (Math.floor(i / 4) + 0.2 + rnd(i + 20) * 0.6) * h / 4.5, 32 + rnd(i + 5) * 22, 17 + rnd(i + 9) * 12, rnd(i + 3) * 3, 0, 7); x.fill(); } });
    add(g, CAP(0.33, 0.72), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), [0, 0.86, 0], [0, 0, Math.PI / 2], [1, 1, 0.9]);
    add(g, CAP(0.17, 0.2), c, [0.74, 1.0, 0], [0, 0, -0.9]);                                   // neck
    add(g, SPH(0.2), c, [0.97, 0.93, 0], [0, 0, 0], [1.2, 1, 0.9]);                            // head
    add(g, SPH(0.1), blk, [0.93, 1.1, 0], [0, 0, 0], [1.3, 0.7, 1.6]).castShadow = false;       // dark patch between the ears
    add(g, CYL(0.12, 0.14, 0.14, 20), pink, [1.2, 0.84, 0], [0, 0, Math.PI / 2 + 0.2]);        // snout
    [-1, 1].forEach((s) => {
      plain(add(g, SPH(0.018, 8, 6), '#8A4A5A', [1.275, 0.86, s * 0.05]));
      add(g, CAP(0.035, 0.12), '#EDE3C8', [0.95, 1.2, s * 0.14], [s * 0.6, 0, 0.15]);          // horns
      add(g, SPH(0.075), c, [0.86, 1.04, s * 0.26], [0, 0, 0], [1.2, 0.55, 1]);                // ears
      [0.5, -0.5].forEach((x) => { add(g, CYL(0.085, 0.065, 0.58, 16), c, [x, 0.34, s * 0.2]); add(g, CYL(0.07, 0.075, 0.07, 14), '#3A3036', [x, 0.035, s * 0.2]); });
    });
    eyes(g, 1.07, 0.99, 0.14, 0.05, o.mood);
    add(g, SPH(0.15), '#F5A9B8', [-0.3, 0.5, 0], [0, 0, 0], [1.2, 0.8, 1]);                    // udder
    [-0.1, 0.1].forEach((z) => add(g, CYL(0.025, 0.02, 0.09, 8), '#F5A9B8', [-0.3, 0.42, z]));
    add(g, tube([[-0.68, 1.0, 0], [-0.8, 0.8, 0], [-0.82, 0.5, 0], [-0.8, 0.3, 0]], 0.025), c);
    add(g, SPH(0.07), blk, [-0.8, 0.26, 0], [0, 0, 0], [1, 1.5, 1]);
    return lay(g, o);
  } },
  /** a horse, head to +x. col (brown), mane = mane/tail colour, mood, pose 'dead' | 'side' */
  horse: { m: 1.7, ink: 0.028, build(o) {
    const g = new THREE.Group(), c = o.col || '#9A5B33', mane = o.mane || shade(c, 0.35);
    add(g, CAP(0.29, 0.85), c, [0, 1.0, 0], [0, 0, Math.PI / 2], [1, 1, 0.82]);
    add(g, CAP(0.15, 0.35), c, [0.62, 1.38, 0], [0, 0, -0.55]);                                // neck
    add(g, CAP(0.115, 0.3), c, [1.02, 1.62, 0], [0, 0, -2.47]);                                // head
    add(g, SPH(0.105), shade(c, 0.85), [1.19, 1.43, 0], [0, 0, 0], [1.1, 0.9, 0.95]);          // muzzle
    plain(add(g, SPH(0.02, 8, 6), INK, [1.27, 1.43, 0.06])); plain(add(g, SPH(0.02, 8, 6), INK, [1.27, 1.43, -0.06]));
    [-1, 1].forEach((s) => {
      add(g, CONE(0.05, 0.17, 12), c, [0.9, 1.92, s * 0.07], [s * 0.15, 0, 0.1]);
      [[0.5, 0.12], [-0.57, 0.12]].forEach(([x, z]) => {
        add(g, CYL(0.085, 0.052, 0.62, 16), c, [x, 0.42, s * z * 1.1]);
        add(g, CYL(0.056, 0.064, 0.1, 14), '#2E2118', [x, 0.05, s * z * 1.1]);                 // hoof
        add(g, CYL(0.058, 0.058, 0.07, 14), '#EDE3D0', [x, 0.14, s * z * 1.1]);                // white sock
      });
    });
    eyes(g, 1.0, 1.7, 0.1, 0.04, o.mood);
    for (let i = 0; i < 6; i++) { const a = i / 5; add(g, CAP(0.045, 0.16), mane, [0.52 + a * 0.4 - 0.08, 1.72 - a * 0.45 + 0.08, 0], [0, 0, -0.55 + 0.3]); }   // mane along the neck
    add(g, SPH(0.08), mane, [0.93, 1.88, 0], [0, 0, 0], [1.2, 1, 0.8]);                         // forelock
    add(g, tube([[-0.82, 1.15, 0], [-1.0, 1.1, 0], [-1.1, 0.8, 0], [-1.06, 0.45, 0]], 0.06), mane);
    add(g, CAP(0.07, 0.2), mane, [-1.07, 0.42, 0], [0, 0, 0.1]);
    return lay(g, o);
  } },
  /** a dog, head to +x. col (brown), mood ('happy' = tongue out), pose 'dead' | 'side' */
  dog: { m: 0.6, ink: 0.015, build(o) {
    const g = new THREE.Group(), c = o.col || '#B97A45', dk = shade(c, 0.6);
    add(g, CAP(0.14, 0.36), c, [0, 0.36, 0], [0, 0, Math.PI / 2], [1, 1, 0.9]);
    add(g, CAP(0.09, 0.1), c, [0.3, 0.45, 0], [0, 0, -0.7]);
    add(g, SPH(0.14), c, [0.43, 0.52, 0], [0, 0, 0], [1.05, 1, 0.95]);
    add(g, CAP(0.065, 0.1), tint(c, 0.35), [0.57, 0.47, 0], [0, 0, Math.PI / 2 - 0.15]);        // snout
    add(g, SPH(0.035), INK, [0.665, 0.5, 0]);                                                  // nose
    [-1, 1].forEach((s) => {
      add(g, SPH(0.075), dk, [0.37, 0.58, s * 0.13], [0, 0, 0.5 * s], [0.6, 1.4, 0.45]);       // floppy ears
      [[0.2, 0.09], [-0.2, 0.09]].forEach(([x, z]) => { add(g, CYL(0.048, 0.04, 0.26, 12), c, [x, 0.14, s * z]); add(g, SPH(0.05), tint(c, 0.4), [x + 0.015, 0.03, s * z], [0, 0, 0], [1.3, 0.6, 1]); });
    });
    eyes(g, 0.53, 0.58, 0.085, 0.028, o.mood);
    add(g, TOR(0.075, 0.016, 16), '#C8372D', [0.3, 0.46, 0], [0, Math.PI / 2, -0.7]);          // collar
    if (o.mood === 'happy') add(g, SPH(0.03), '#F06A7E', [0.6, 0.4, 0], [0, 0, 0], [1, 1.8, 0.8]);
    add(g, tube([[-0.36, 0.4, 0], [-0.5, 0.48, 0], [-0.55, 0.62, 0]], 0.025), c);
    return lay(g, o);
  } },
  /** a hen, beak to +x. col (white), mood, pose 'dead' | 'side' */
  chicken: { m: 0.45, ink: 0.012, build(o) {
    const g = new THREE.Group(), c = o.col || '#F4EFE4', red = '#D9342B';
    add(g, SPH(0.18), c, [0, 0.3, 0], [0, 0, 0], [1.2, 1, 0.88]);
    add(g, CAP(0.065, 0.1), c, [0.19, 0.44, 0], [0, 0, -0.35]);
    add(g, SPH(0.085), c, [0.24, 0.55, 0]);
    add(g, CONE(0.035, 0.1, 12), '#F2A93B', [0.33, 0.54, 0], [0, 0, -Math.PI / 2]);
    for (let i = 0; i < 3; i++) add(g, SPH(0.035 + (i === 1 ? 0.012 : 0)), red, [0.2 + i * 0.045, 0.64 + (i === 1 ? 0.02 : 0), 0]);   // comb
    add(g, SPH(0.03), red, [0.3, 0.47, 0], [0, 0, 0], [0.8, 1.5, 0.8]);                       // wattle
    eyes(g, 0.28, 0.57, 0.065, 0.02, o.mood);
    [-1, 1].forEach((s) => {
      add(g, SPH(0.1), shade(c, 0.88), [-0.02, 0.31, s * 0.15], [0, 0, 0.2], [1.2, 0.8, 0.35]);   // wing
      add(g, CYL(0.014, 0.014, 0.17, 8), '#F2A93B', [0.0, 0.085, s * 0.07]);
      [-0.03, 0.03].forEach((dz) => add(g, SPH(0.02), '#F2A93B', [0.035, 0.012, s * 0.07 + dz], [0, 0, 0], [2.2, 0.5, 0.7]));
    });
    [['#2F6E6B', -0.45], ['#7A4A2A', 0], ['#2F6E6B', 0.45]].forEach(([col, a], i) => add(g, CAP(0.045, 0.16), col, [-0.24, 0.43 + (i === 1 ? 0.03 : 0), a * 0.1], [a * 0.6, 0, 0.7 + (i === 1 ? 0.2 : 0)]));
    return lay(g, o);
  } },
  /** a woolly sheep, head to +x. col = wool, mood, pose 'dead' | 'side' */
  sheep: { m: 0.9, ink: 0.02, build(o) {
    const g = new THREE.Group(), w = o.col || '#F3EEE2', dk = '#3A3238';
    add(g, SPH(0.3, 20, 14), w, [0, 0.52, 0], [0, 0, 0], [1.45, 0.9, 0.95]);
    for (let i = 0; i < 46; i++) { const k = (i + 0.5) / 46, y = 1 - 2 * k, r = Math.sqrt(1 - y * y), a = i * 2.39996; add(g, SPH(0.12 + rnd(i) * 0.04, 14, 10), tint(w, rnd(i + 3) * 0.1), [Math.cos(a) * r * 0.42, 0.52 + y * 0.27, Math.sin(a) * r * 0.29]); }
    add(g, SPH(0.13), w, [0.34, 0.8, 0]);                                                       // top-knot
    add(g, SPH(0.12), dk, [0.5, 0.58, 0], [0, 0, 0.2], [1.25, 1.1, 0.85]);                      // face
    add(g, CAP(0.06, 0.08), dk, [0.42, 0.62, 0], [0, 0, -0.6]);
    [-1, 1].forEach((s) => {
      add(g, SPH(0.06), dk, [0.4, 0.66, s * 0.15], [0, 0, 0.25 * s], [1.3, 0.5, 0.8]);          // ears
      [[0.28, 0.12], [-0.28, 0.12]].forEach(([x, z]) => { add(g, CYL(0.04, 0.034, 0.33, 12), dk, [x, 0.17, s * z]); add(g, CYL(0.04, 0.045, 0.04, 12), '#1F1C24', [x, 0.02, s * z]); });
    });
    eyes(g, 0.58, 0.63, 0.075, 0.03, o.mood);
    add(g, SPH(0.1), w, [-0.45, 0.5, 0]);
    return lay(g, o);
  } },
  /** a rat, nose to +x. col (grey), mood, pose 'dead' | 'side' */
  rat: { m: 0.22, ink: 0.006, build(o) {
    const g = new THREE.Group(), c = o.col || '#8D8A92', pk = '#F0A9B0';
    add(g, CAP(0.055, 0.13), c, [0, 0.08, 0], [0, 0, Math.PI / 2 + 0.1], [1, 1, 0.9]);
    add(g, SPH(0.052), c, [0.13, 0.095, 0], [0, 0, 0], [1.5, 1, 0.95]);
    add(g, CONE(0.04, 0.09, 12), c, [0.22, 0.09, 0], [0, 0, -Math.PI / 2]);
    add(g, SPH(0.016), pk, [0.268, 0.09, 0]);                                                   // nose
    [-1, 1].forEach((s) => {
      add(g, SPH(0.052), c, [0.1, 0.15, s * 0.045], [0, s * 0.35, 0], [1, 1, 0.22]);            // big ears
      plain(add(g, SPH(0.036), pk, [0.105, 0.15, s * 0.056], [0, s * 0.35, 0], [1, 1, 0.16]));
      add(g, SPH(0.022), pk, [0.05, 0.012, s * 0.035], [0, 0, 0], [1.6, 0.6, 0.9]);
      add(g, SPH(0.022), pk, [-0.08, 0.012, s * 0.035], [0, 0, 0], [1.6, 0.6, 0.9]);
      for (let i = 0; i < 3; i++) plain(add(g, CYL(0.002, 0.002, 0.1, 4), '#E8E4EE', [0.245, 0.095 + (i - 1) * 0.014, s * 0.05], [Math.PI / 2 + (i - 1) * 0.25, 0, 0]));
    });
    eyes(g, 0.17, 0.12, 0.04, 0.018, o.mood);
    add(g, tube([[-0.12, 0.07, 0], [-0.26, 0.03, 0.03], [-0.4, 0.07, -0.03], [-0.52, 0.03, 0.02]], 0.012), pk);
    return lay(g, o);
  } },
  /** a wooden farm wagon, pull bar to +x. col = planks, load: 'hay' | 'crates' | none */
  cart: { m: 1.2, ink: 0.025, build(o) {
    const g = new THREE.Group(), c = o.col || '#C68C52', dk = shade(c, 0.75);
    add(g, BOX(1.6, 0.08, 0.86), dk, [0, 0.58, 0]);
    [-1, 1].forEach((s) => {
      add(g, BOX(1.6, 0.3, 0.06), c, [0, 0.77, s * 0.43]); add(g, BOX(1.6, 0.05, 0.09), dk, [0, 0.94, s * 0.43]);
      for (let i = 0; i < 5; i++) add(g, BOX(0.06, 0.3, 0.09), dk, [-0.7 + i * 0.35, 0.77, s * 0.43]);
    });
    add(g, BOX(0.06, 0.3, 0.86), c, [-0.8, 0.77, 0]);
    add(g, CYL(0.03, 0.03, 1.2, 10), '#4A4A52', [0.05, 0.4, 0], [Math.PI / 2, 0, 0]);          // axle
    [-1, 1].forEach((s) => wheel(g, 0.4, 0.05, '#D8A868', '#7A4A2A', [0.05, 0.4, s * 0.6], 6));
    add(g, tube([[0.7, 0.62, 0], [1.4, 0.45, 0], [1.9, 0.3, 0]], 0.04), dk);                    // pull bar
    add(g, CYL(0.03, 0.03, 0.6, 10), dk, [1.9, 0.3, 0], [Math.PI / 2, 0, 0]);                  // yoke
    [-1, 1].forEach((s) => add(g, CYL(0.04, 0.04, 0.38, 10), dk, [0.5, 1.05 - 0.18, s * 0.34]));   // seat posts
    add(g, BOX(0.28, 0.06, 0.86), c, [0.5, 1.07, 0]);                                           // driver's bench
    if (o.load === 'hay') {
      const hay = mat('#E2C25A', { roughness: 1 });
      add(g, SPH(0.4), hay, [-0.35, 0.95, 0], [0, 0, 0], [1.5, 0.8, 1.05]);
      for (let i = 0; i < 9; i++) add(g, SPH(0.2 + rnd(i) * 0.06), tint('#E2C25A', rnd(i + 4) * 0.2), [-0.65 + (i % 3) * 0.3, 1.0 + (i % 2) * 0.12, (Math.floor(i / 3) - 1) * 0.26]);
    } else if (o.load === 'crates') {
      [[-0.45, 0.2, 0], [-0.45, -0.2, 0], [0.1, 0, 0], [-0.3, 0, 1]].forEach(([x, z, up], i) => {
        const cr = add(g, BOX(0.34, 0.34, 0.34), '#D5A56A', [x, 0.66 + 0.17 + up * 0.34, z], [0, rnd(i) * 0.25 - 0.1, 0]);
        [-1, 1].forEach((s) => add(cr, BOX(0.36, 0.05, 0.36), '#8A5A36', [0, s * 0.1, 0]));
      });
    }
    return g;
  } },
  /** a 1910s Model-T style car, nose to +x. col (black), wheels spin when it rolls */
  carold: { m: 1.8, ink: 0.03, build(o) {
    const g = new THREE.Group(), c = o.col || '#2B2B33', brass = mat('#D9A93A', { metalness: 0.5, roughness: 0.35 }), tyre = '#232328';
    add(g, BOX(2.6, 0.1, 0.62), '#1C1C22', [0, 0.42, 0]);                                       // chassis
    add(g, RBOX(1.45, 0.5, 0.82, 0.07), c, [-0.5, 0.72, 0]);                                    // passenger tub
    add(g, RBOX(0.95, 0.52, 0.62, 0.07), c, [0.55, 0.76, 0]);                                   // bonnet
    add(g, RBOX(0.1, 0.62, 0.55, 0.03), brass, [1.05, 0.78, 0]);                                // radiator
    [-1, 1].forEach((s) => {
      add(g, SPH(0.08), brass, [1.0, 1.12, s * 0.3]);                                           // lamps
      add(g, SPH(0.055), '#FFF3C4', [1.07, 1.12, s * 0.3]).material = glow('#FFF3C4');
      [[0.75, 0.38], [-0.88, 0.42]].forEach(([x, r]) => {
        wheel(g, r, 0.045, '#D4A866', '#2A2A2E', [x, r, s * 0.5], 6);
        add(g, TOR(r + 0.04, 0.05, 28), tyre, [x, r, s * 0.5]);
        add(g, new THREE.TorusGeometry(r + 0.09, 0.035, 8, 20, Math.PI), c, [x, r, s * 0.5], [0, 0, 0], [1, 1, 3]);   // mudguard
      });
      add(g, BOX(1.5, 0.04, 0.2), '#1C1C22', [-0.05, 0.46, s * 0.52]);                           // running board
      [-1.05, -0.12].forEach((x) => add(g, CYL(0.025, 0.025, 0.8, 8), brass, [x, 1.38, s * 0.37]));   // roof posts
    });
    [0.75, -0.88].forEach((x, i) => add(g, CYL(0.03, 0.03, 1.0, 8), '#4A4A52', [x, i ? 0.42 : 0.38, 0], [Math.PI / 2, 0, 0]));
    add(g, RBOX(1.35, 0.09, 0.9, 0.04), c, [-0.58, 1.8, 0]);                                    // roof
    add(g, BOX(0.5, 0.28, 0.7), '#7A4A2A', [-0.85, 1.0, 0]);                                    // seat back
    add(g, BOX(0.5, 0.08, 0.7), '#7A4A2A', [-0.5, 0.97, 0]);
    plain(add(g, BOX(0.03, 0.5, 0.68), mat('#BFE3F2', { transparent: true, opacity: 0.55, roughness: 0.1 }), [-0.08, 1.2, 0], [0, 0, 0.2])).receiveShadow = false;   // upright windscreen
    add(g, BOX(0.04, 0.54, 0.04), brass, [-0.1, 1.2, 0.35], [0, 0, 0.2]); add(g, BOX(0.04, 0.54, 0.04), brass, [-0.1, 1.2, -0.35], [0, 0, 0.2]);
    add(g, TOR(0.1, 0.018, 16), '#3A3A42', [0.12, 1.1, 0], [Math.PI / 2 - 0.5, 0, 0]);          // steering wheel
    return g;
  } },
  /** a steam locomotive, chimney to +x. col = boiler/cab, wheels red, smoke from the chimney */
  train: { m: 3.0, ink: 0.04, build(o) {
    const g = new THREE.Group(), c = o.col || '#2F6B4A', red = '#C8372D', iron = '#26262C', brass = mat('#D9A93A', { metalness: 0.5, roughness: 0.35 });
    add(g, BOX(3.8, 0.2, 0.9), iron, [0.1, 0.62, 0]);                                           // frame
    add(g, CYL(0.5, 0.5, 2.3, 32), c, [0.5, 1.25, 0], [0, 0, Math.PI / 2]);                     // boiler
    add(g, CYL(0.53, 0.53, 0.4, 32), iron, [1.55, 1.25, 0], [0, 0, Math.PI / 2]);               // smokebox
    add(g, CYL(0.45, 0.45, 0.05, 28), '#3A3A44', [1.78, 1.25, 0], [0, 0, Math.PI / 2]);
    add(g, SPH(0.07), brass, [1.82, 1.25, 0]);
    add(g, CYL(0.13, 0.13, 0.16, 16), brass, [1.82, 1.6, 0], [0, 0, Math.PI / 2]);              // headlamp
    add(g, SPH(0.1), '#FFF3C4', [1.92, 1.6, 0]).material = glow('#FFF3C4');
    add(g, LATH([[0.0, 0], [0.12, 0], [0.1, 0.25], [0.09, 0.55], [0.2, 0.7], [0.21, 0.78], [0, 0.78]]), iron, [1.4, 1.7, 0]);   // flared chimney
    add(g, SPH(0.2), brass, [0.5, 1.72, 0], [0, 0, 0], [1, 1.1, 1]); add(g, SPH(0.15), brass, [-0.1, 1.7, 0], [0, 0, 0], [1, 1.2, 1]);   // domes
    add(g, BOX(1.1, 1.15, 1.05), c, [-1.15, 1.35, 0]);                                          // cab
    add(g, RBOX(1.35, 0.1, 1.3, 0.04), iron, [-1.15, 2.0, 0]);                                  // roof
    [-1, 1].forEach((s) => {
      plain(add(g, BOX(0.4, 0.4, 0.03), '#F6E7A8', [-1.15, 1.55, s * 0.54])).material = glow('#F6E7A8');
      [-0.5, 0.35, 1.2].forEach((x) => { wheel(g, 0.42, 0.05, red, shade(red, 0.8), [x, 0.42, s * 0.52], 6); });
      wheel(g, 0.22, 0.04, red, shade(red, 0.8), [1.8, 0.22, s * 0.45], 5);
      add(g, BOX(1.7, 0.07, 0.05), '#7C7C86', [0.35, 0.42, s * 0.6]);                            // side rod
      add(g, CYL(0.1, 0.1, 0.4, 14), iron, [1.6, 0.78, s * 0.42], [0, 0, Math.PI / 2]);      // steam cylinder
      add(g, BOX(1.7, 0.12, 0.08), '#4A4A52', [0.2, 0.9, s * 0.47]);                            // running board
    });
    add(g, new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.45, 0); s.lineTo(0, 0.55); s.closePath(); return s; })(), { depth: 0.8, bevelEnabled: false }), '#C8372D', [1.95, 0.25, -0.4], [0, 0, 0], [1, 0.8, 1]);   // cow-catcher
    const sm = puffs(g, 8, [1.4, 2.5, 0], '#EDEDF2'); g.userData.tick = (t) => sm(t, 1.4);
    return g;
  } },
  /** a wooden rowing boat, bow to +x, with two oars. col = hull */
  rowboat: { m: 0.7, ink: 0.02, build(o) {
    const g = new THREE.Group(), c = o.col || '#A9703F', hull = new THREE.Group(); hull.position.y = 0.34; g.add(hull);
    const dfm = (x, y, z) => [x * 0.95, y * 0.34 + 0.28 * Math.pow(x, 4), z * 0.42 * (1 - 0.3 * x)];
    const geo = new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...dfm(p.getX(i), p.getY(i), p.getZ(i)));
    geo.computeVertexNormals();
    add(hull, geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
    add(hull, tube(Array.from({ length: 36 }, (_, i) => dfm(Math.cos(i / 36 * Math.PI * 2), 0, Math.sin(i / 36 * Math.PI * 2))), 0.028, 90, true), shade(c, 0.7));   // gunwale
    [-0.18, 0.32].forEach((x) => { const xn = x / 0.95, len = 2 * 0.42 * (1 - 0.3 * xn) * Math.sqrt(Math.max(0, 1 - xn * xn - 0.04)) * 0.97; add(hull, BOX(0.15, 0.035, len), shade(c, 1.15), [x, -0.06 + 0.28 * Math.pow(xn, 4), 0]); });   // thwarts
    [-1, 1].forEach((s) => {
      const oar = new THREE.Group(); oar.position.set(0.05, 0.36, s * 0.4); oar.rotation.set(s * 1.1, -s * 0.25, 0); g.add(oar);
      add(oar, CYL(0.016, 0.016, 1.25, 10), '#C99A5A', [0, 0.3, 0]);
      add(oar, SPH(0.1), '#D8B070', [0, 0.95, 0], [0, 0, 0], [0.55, 1.5, 0.12]);                 // blade
      add(oar, CYL(0.026, 0.026, 0.1, 10), '#7A4A2A', [0, -0.25, 0]);                           // grip
    });
    return g;
  } },
  /** a tied burlap sack. label (e.g. '$', 'FLOUR') is stamped on the front, col = burlap */
  sack: { m: 0.8, ink: 0.02, build(o) {
    const g = new THREE.Group(), c = o.col || '#C9A56A';
    const tex = canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = c; x.fillRect(0, 0, w, h); x.strokeStyle = shade(c, 0.85); x.lineWidth = 2;
      for (let q = 0; q < h; q += 8) { x.beginPath(); x.moveTo(0, q); x.lineTo(w, q); x.stroke(); } for (let q = 0; q < w; q += 8) { x.beginPath(); x.moveTo(q, 0); x.lineTo(q, h); x.stroke(); }
      if (o.label) { x.fillStyle = o.labelCol || '#7A2A22'; x.textAlign = 'center'; x.textBaseline = 'middle'; let f = o.label.length < 3 ? 130 : 84; x.font = `900 ${f}px Inter`; while (x.measureText(o.label).width > w * 0.2) { f -= 4; x.font = `900 ${f}px Inter`; } x.fillText(o.label, w * 0.25, h * 0.6); } });
    add(g, LATH([[0, 0], [0.2, 0], [0.3, 0.07], [0.35, 0.22], [0.33, 0.4], [0.24, 0.54], [0.12, 0.62], [0.09, 0.68], [0.17, 0.77], [0.11, 0.81], [0, 0.78]]), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), [0, 0, 0], [0, -Math.PI / 2, 0]);
    add(g, TOR(0.105, 0.025, 20), '#8A5A36', [0, 0.665, 0], [Math.PI / 2, 0, 0]);               // the rope
    add(g, tube([[0.1, 0.665, 0], [0.18, 0.6, 0.05], [0.2, 0.52, 0.04]], 0.014), '#8A5A36');
    return g;
  } },
  /** a stack of green banknote bundles with a paper band and some loose bills */
  money: { m: 0.3, ink: 0.01, build(o) {
    const g = new THREE.Group(), c = o.col || '#6DAE72', w = 0.36, h = 0.095, d = 0.17;
    const side = canvasTex(256, 32, (x, W, H) => { x.fillStyle = c; x.fillRect(0, 0, W, H); x.fillStyle = tint(c, 0.4); for (let q = 3; q < H; q += 5) x.fillRect(0, q, W, 2); });
    const topT = canvasTex(256, 128, (x, W, H) => { x.fillStyle = c; x.fillRect(0, 0, W, H); x.strokeStyle = shade(c, 0.65); x.lineWidth = 5; x.strokeRect(10, 10, W - 20, H - 20); x.fillStyle = shade(c, 0.75); x.beginPath(); x.arc(W / 2, H / 2, 34, 0, 7); x.fill(); x.fillStyle = tint(c, 0.6); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 46px Inter'; x.fillText('$', W / 2, H / 2 + 2); });
    const sm = new THREE.MeshStandardMaterial({ map: side, roughness: 0.8 }), tm = new THREE.MeshStandardMaterial({ map: topT, roughness: 0.8 }), bm = mat(shade(c, 0.8));
    const bundle = (x, y, z, ry) => { const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.y = ry; g.add(b);
      add(b, BOX(w, h, d), [sm, sm, tm, bm, sm, sm], [0, h / 2, 0]); add(b, BOX(0.07, h + 0.008, d + 0.008), '#E8D9A8', [0, h / 2, 0]); };
    bundle(0, 0, -0.1, 0.03); bundle(0, 0, 0.1, -0.04); bundle(0.01, h, 0, 0.14);
    [[0.05, 0.3, 0.5], [0.2, 0.24, -0.3]].forEach(([x, z, ry], i) => add(g, BOX(0.3, 0.008, 0.14), [sm, sm, tm, bm, sm, sm], [x, 0.004 + i * 0.009, z], [0, ry, 0]));
    return g;
  } },
  /** a pyramid of gold bars (shiny) */
  gold: { m: 0.5, ink: 0.014, build(o) {
    const g = new THREE.Group(), gm = mat(o.col || '#FFD34A', { metalness: 0.5, roughness: 0.3, emissive: '#9A6A00', emissiveIntensity: 0.55 });
    const bar = CYL(0.075, 0.105, 0.1, 4); bar.rotateY(Math.PI / 4); bar.scale(2.0, 1, 1);
    const L = [[[-0.16, -0.16], [-0.16, 0], [-0.16, 0.16], [0.16, -0.16], [0.16, 0], [0.16, 0.16]], [[-0.16, -0.08], [-0.16, 0.08], [0.16, -0.08], [0.16, 0.08]], [[0, -0.08], [0, 0.08]], [[0, 0]]];
    L.forEach((row, li) => row.forEach(([x, z], i) => add(g, bar, gm, [x, 0.05 + li * 0.1, z], [0, (rnd(li * 7 + i) - 0.5) * 0.08, 0])));
    return g;
  } },
  /** a heap of gold coins */
  coins: { m: 0.3, ink: 0.006, build(o) {
    const g = new THREE.Group(), gold = '#FFD34A', gm = (k) => mat(shade(gold, k), { metalness: 0.5, roughness: 0.3, emissive: '#9A6A00', emissiveIntensity: 0.55 });
    add(g, SPH(0.2, 24, 14), gm(0.8), [0, 0.12, 0], [0, 0, 0], [1.05, 0.95, 1.05]);
    for (let i = 0; i < 44; i++) {
      const a = i * 2.4, r = Math.sqrt((i + 0.5) / 44) * 0.2, k = Math.min(1, r / 0.21), y = 0.12 + 0.19 * Math.sqrt(1 - k * k) + 0.012, tilt = Math.asin(k) * 0.9 + (rnd(i + 3) - 0.5) * 0.3;
      add(g, CYL(0.075, 0.075, 0.018, 22), gm(0.9 + rnd(i + 2) * 0.25), [Math.cos(a) * r * 1.05, y, Math.sin(a) * r * 1.05], [Math.sin(a) * tilt, rnd(i) * 3, -Math.cos(a) * tilt]);
    }
    [[0.27, 0.075, 0.14, 0.2], [0.3, 0.075, -0.1, 0.05]].forEach(([x, y, z, q]) => add(g, CYL(0.075, 0.075, 0.018, 22), gm(1), [x, y, z], [Math.PI / 2 - 0.15, q, 0]));   // coins on edge
    return g;
  } },
  /** an envelope with a red wax seal on a small stand. label = a line of address text, e.g. 'TO: THE KING' */
  letter: { m: 0.35, ink: 0.01, build(o) {
    const g = new THREE.Group(), c = o.col || '#F3E8CE', W = 0.46, H = 0.3;
    const tex = canvasTex(512, 330, (x, w, h) => {
      x.fillStyle = c; x.fillRect(0, 0, w, h); x.strokeStyle = shade(c, 0.6); x.lineWidth = 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(w / 2, h * 0.58); x.lineTo(w, 0); x.moveTo(0, h); x.lineTo(w * 0.42, h * 0.5); x.moveTo(w, h); x.lineTo(w * 0.58, h * 0.5); x.stroke();
      x.fillStyle = '#C8372D'; x.fillRect(w * 0.82, h * 0.66, 56, 66); x.strokeStyle = '#F3E8CE'; x.lineWidth = 4; x.setLineDash([6, 5]); x.strokeRect(w * 0.82 + 5, h * 0.66 + 5, 46, 56); x.setLineDash([]);
      if (o.label) { x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; let f = 52; x.font = `800 ${f}px Inter`; while (x.measureText(o.label).width > w * 0.62) { f -= 3; x.font = `800 ${f}px Inter`; } x.fillText(o.label, w * 0.38, h * 0.82); }
      else { x.fillStyle = shade(c, 0.55); [0.76, 0.86, 0.95].forEach((q, i) => x.fillRect(w * 0.14, h * q - 4, w * (0.5 - i * 0.08), 6)); } });
    const side = mat(shade(c, 0.9)), env = new THREE.Group(); env.position.set(0, 0.2, -0.005); env.rotation.x = -0.2; g.add(env);
    add(env, BOX(W, H, 0.025), [side, side, side, side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), side]);
    add(env, CYL(0.05, 0.05, 0.03, 20), '#C8372D', [0, H * 0.08, 0.025], [Math.PI / 2, 0, 0]);   // wax seal
    add(env, TOR(0.032, 0.008, 14), '#9E241C', [0, H * 0.08, 0.042]);
    add(g, BOX(0.4, 0.04, 0.17), '#8A5A36', [0, 0.02, -0.01]); add(g, BOX(0.4, 0.06, 0.025), '#7A4A2A', [0, 0.06, 0.075]);   // stand
    return g;
  } },
  /** a folded newspaper standing on a stand. label = the front-page headline (big, bold) */
  newspaper: { m: 0.5, ink: 0.01, build(o) {
    const g = new THREE.Group(), c = '#EDE6D2', hl = (o.label || 'BIG NEWS').toUpperCase();
    const tex = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'italic 900 56px Georgia, serif'; x.fillText('THE DAILY NEWS', w / 2, 52); x.fillRect(24, 92, w - 48, 6); x.fillRect(24, 102, w - 48, 2);
      const words = hl.split(/\s+/), lines = []; let cur = ''; words.forEach((wd) => { const t = cur ? cur + ' ' + wd : wd; if (cur && t.length > 11) { lines.push(cur); cur = wd; } else cur = t; }); lines.push(cur);
      let f = 120; const fit = () => { x.font = `900 ${f}px Inter, Impact, sans-serif`; return Math.max(...lines.map((l) => x.measureText(l).width)); }; while (fit() > w * 0.88 && f > 30) f -= 4;
      lines.forEach((l, i) => x.fillText(l, w / 2, 132 + f * 0.62 + i * f * 1.02));
      const y0 = 140 + lines.length * f * 1.02 + 20; x.fillStyle = '#B9B2A0'; x.fillRect(24, y0, 200, Math.max(60, 470 - y0 - 100)); x.fillStyle = '#8A8575'; x.beginPath(); x.arc(124, y0 + 40, 22, 0, 7); x.fill();
      x.fillStyle = '#7A7565'; for (let q = 0; q < 6; q++) x.fillRect(240, y0 + q * 22, 245, 8);
      for (let q = 0; q < 3; q++) x.fillRect(24, 440 + q * 22, 460, 8); });
    const t1 = tex, t2 = tex.clone(); t1.repeat.set(0.5, 1); t1.offset.set(0, 0); t2.repeat.set(0.5, 1); t2.offset.set(0.5, 0); t2.needsUpdate = true;
    const side = mat('#D5CDB5'), pw = 0.25, ph = 0.46;
    [[-1, t1], [1, t2]].forEach(([s, t]) => { const p = new THREE.Group(); p.position.set(0, 0.23, 0); p.rotation.set(-0.22, 0, 0); g.add(p); const q = new THREE.Group(); q.rotation.y = -s * 0.22; q.position.x = 0; p.add(q);
      add(q, BOX(pw, ph, 0.012), [side, side, side, side, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), mat(c)], [s * pw / 2, 0, 0]); });
    add(g, BOX(0.06, 0.34, 0.015), '#8A5A36', [0, 0.17, -0.1], [0.3, 0, 0]);                      // kickstand
    return g;
  } },
  /** a round black bomb with a lit, flickering fuse */
  bomb: { m: 0.6, ink: 0.016, build(o) {
    const g = new THREE.Group(), c = o.col || '#26262E', iron = mat(c, { roughness: 0.35, metalness: 0.3 });
    add(g, SPH(0.28, 32, 24), iron, [0, 0.28, 0]);
    add(g, CYL(0.08, 0.1, 0.1, 18), '#3A3A44', [0, 0.57, 0]);
    add(g, TOR(0.09, 0.018, 16), '#4A4A54', [0, 0.52, 0], [Math.PI / 2, 0, 0]);
    plain(add(g, SPH(0.06, 12, 8), glow('#6A6A78'), [-0.1, 0.4, 0.2], [0, 0, 0], [1, 1.4, 0.4])).userData.fx = true;   // glint
    add(g, tube([[0, 0.62, 0], [0.03, 0.72, 0], [0.12, 0.76, 0], [0.18, 0.7, 0], [0.2, 0.8, 0]], 0.014), '#C2A878');
    const sp = new THREE.Group(); sp.position.set(0.2, 0.84, 0); g.add(sp);
    const star = plain(add(sp, new THREE.IcosahedronGeometry(0.06, 0), glow('#FFD43B'))), halo = plain(add(sp, SPH(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: '#FF8A1F', transparent: true, opacity: 0.55, toneMapped: false })));
    halo.castShadow = false; const bits = []; for (let i = 0; i < 5; i++) { const b = plain(add(sp, SPH(0.016, 6, 5), glow('#FFE36B'))); b.userData.fx = true; b.castShadow = false; bits.push(b); }
    g.userData.tick = (t) => { const k = 1 + 0.35 * Math.sin(t * 38) * Math.sin(t * 23 + 1); star.scale.setScalar(k); star.rotation.set(t * 9, t * 7, 0); halo.scale.setScalar(0.9 + 0.5 * Math.abs(Math.sin(t * 29))); bits.forEach((b, i) => { const q = (t * 3 + i / 5) % 1; b.position.set(Math.cos(i * 2.4 + t) * q * 0.14, 0.02 + q * 0.12, Math.sin(i * 2.4 + t) * q * 0.14); b.scale.setScalar(1 - q); }); };
    g.userData.tick(0); return g;
  } },
  /** a campfire: crossed logs, stones and flickering flames */
  fire: { m: 1.0, ink: 0.014, build(o) {
    const g = new THREE.Group(), wood = '#7A4A2A';
    for (let i = 0; i < 5; i++) { const a = new THREE.Group(); a.rotation.y = i / 5 * Math.PI * 2 + 0.3; g.add(a); add(a, CYL(0.07, 0.07, 0.85, 12), i % 2 ? wood : shade(wood, 0.8), [0.26, 0.16, 0], [0, 0, Math.PI / 2 - 0.35]); add(a, CYL(0.05, 0.05, 0.02, 12), '#D9B07A', [0.52, 0.04 + 0.16, 0], [0, 0, Math.PI / 2 - 0.35]).visible = false; }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; add(g, SPH(0.1 + rnd(i) * 0.03, 14, 10), mat(i % 2 ? '#8A8D94' : '#767980'), [Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62], [0, 0, 0], [1.1, 0.8, 1]); }
    const flame = (R, H, col, x, z, lean, zs = 1) => { const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([R * Math.pow(1 - t, 0.9) * Math.sin(Math.pow(t, 0.45) * Math.PI) + 0.002, t * H]); }
      const f = plain(add(g, LATH(pts, 20).scale(1, 1, zs), glow(col), [x, 0.14, z])); f.castShadow = false; f.userData.lean = lean; f.userData.base = [x, z]; return f; };
    const fl = [flame(0.3, 0.86, '#E5391F', 0, 0, [0, 0], 0.4)];
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; fl.push(flame(0.15, 0.5, i % 2 ? '#E5391F' : '#F25A1F', Math.cos(a) * 0.22, Math.sin(a) * 0.22, [-Math.sin(a) * 0.3, Math.cos(a) * 0.3])); }
    fl.push(flame(0.22, 0.66, '#FF8A1F', 0, 0, [0, 0], 0.8), flame(0.14, 0.46, '#FFD83B', 0, 0, [0, 0], 1.1));
    g.userData.tick = (t) => fl.forEach((f, i) => { f.scale.set(1 + 0.08 * Math.sin(t * 11 + i * 2), 1 + 0.14 * Math.sin(t * 13 + i * 1.7) + 0.05 * Math.sin(t * 31 + i), 1 + 0.08 * Math.cos(t * 12 + i)); f.rotation.set(f.userData.lean[1] + 0.06 * Math.sin(t * 7 + i), 0, -f.userData.lean[0] + 0.07 * Math.sin(t * 9 + i * 2)); });
    return g;
  } },
  /** a round, leafy cartoon tree. col = leaves */
  tree: { m: 4.0, ink: 0.04, build(o) {
    const g = new THREE.Group(), lc = o.col || '#4FA54B', bark = '#7A4F30';
    add(g, LATH([[0.4, 0], [0.26, 0.25], [0.19, 0.7], [0.17, 1.4], [0.15, 2.0], [0, 2.0]], 18), bark);
    add(g, CAP(0.07, 0.6), bark, [0.25, 1.9, 0], [0, 0, -0.8]); add(g, CAP(0.06, 0.5), bark, [-0.22, 1.7, 0.05], [0, 0, 0.8]);
    add(g, SPH(1.2, 28, 20), lc, [0, 2.85, 0]);
    [[0.95, 2.45, 0.2, 0.85], [-0.95, 2.5, -0.1, 0.8], [0.35, 3.45, 0.55, 0.78], [-0.4, 3.4, -0.5, 0.8], [0.15, 3.1, 0.95, 0.7], [-0.15, 2.55, -0.9, 0.75], [0.75, 3.2, -0.5, 0.65]].forEach(([x, y, z, r], i) => add(g, SPH(r, 22, 16), i % 3 === 0 ? tint(lc, 0.12) : i % 3 === 1 ? lc : shade(lc, 0.9), [x, y, z]));
    return g;
  } },
  /** a chunky grey boulder with two small rocks. col = stone */
  rock: { m: 1.0, ink: 0.02, build(o) {
    const g = new THREE.Group(), c = o.col || '#8A8D94';
    const blob = (r, sx, sy, sz, seed) => { const geo = new THREE.IcosahedronGeometry(r, 2), p = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(), d = 1 + 0.14 * Math.sin(n.x * 3.1 + seed) * Math.sin(n.y * 2.7 + seed * 2) + 0.1 * Math.sin(n.z * 4.3 + seed * 3) + 0.05 * Math.sin((n.x + n.y + n.z) * 7 + seed); p.setXYZ(i, n.x * r * d * sx, Math.max(n.y * r * d * sy, -r * sy * 0.6), n.z * r * d * sz); }
      geo.computeVertexNormals(); return geo; };
    add(g, blob(0.5, 1.25, 1.0, 1.05, 1), c, [0, 0.3, 0]);
    add(g, blob(0.22, 1.1, 0.9, 1, 4), shade(c, 0.92), [0.62, 0.13, 0.35]); add(g, blob(0.16, 1, 0.9, 1, 7), tint(c, 0.1), [-0.55, 0.1, 0.45]);
    return g;
  } },
  /** an army canvas tent, door to +x. col = canvas */
  tent: { m: 2.0, ink: 0.03, build(o) {
    const g = new THREE.Group(), c = o.col || '#7B8350', HW = 1.0, HH = 1.6, LEN = 2.4, slope = Math.atan2(HH, HW), sl = Math.hypot(HW, HH);
    const tex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.strokeStyle = shade(c, 0.78); x.lineWidth = 3; for (let q = 0; q < w; q += 64) { x.beginPath(); x.moveTo(q, 0); x.lineTo(q, h); x.stroke(); } x.fillStyle = shade(c, 0.9); x.fillRect(70, 100, 60, 50); x.strokeStyle = shade(c, 0.6); x.setLineDash([6, 4]); x.strokeRect(70, 100, 60, 50); });
    const pm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), dm = mat(shade(c, 0.8));
    [-1, 1].forEach((s) => add(g, BOX(LEN, 0.04, sl), [dm, dm, pm, dm, dm, dm], [0, HH / 2 + 0.02, s * HW / 2], [s * slope, 0, 0]));
    const gab = new THREE.Shape(); gab.moveTo(-HW, 0); gab.lineTo(HW, 0); gab.lineTo(0, HH); gab.closePath();
    [-1, 1].forEach((s) => add(g, new THREE.ExtrudeGeometry(gab, { depth: 0.04, bevelEnabled: false }), shade(c, s > 0 ? 0.85 : 0.7), [s > 0 ? LEN / 2 - 0.04 : -LEN / 2, 0, 0], [0, Math.PI / 2, 0]));
    const door = new THREE.Shape(); door.moveTo(-0.45, 0); door.lineTo(0.45, 0); door.lineTo(0, 1.15); door.closePath();
    plain(add(g, new THREE.ShapeGeometry(door), '#1B1A20', [LEN / 2 + 0.03, 0.01, 0], [0, Math.PI / 2, 0])).receiveShadow = false;
    [-1, 1].forEach((s) => { const q = -s, fl = new THREE.Shape(); fl.moveTo(q * 0.45, 0); fl.lineTo(q * 0.92, 0); fl.lineTo(q * 0.2, 1.05); fl.closePath(); plain(add(g, new THREE.ShapeGeometry(fl), shade(c, 1.12), [LEN / 2 + 0.035, 0.0, 0], [0, Math.PI / 2, 0])).receiveShadow = false; });
    add(g, CYL(0.03, 0.03, 0.06 + LEN + 0.3, 10), '#7A4A2A', [0, HH + 0.01, 0], [0, 0, Math.PI / 2]);
    add(g, CYL(0.03, 0.03, 1.95, 10), '#7A4A2A', [LEN / 2 + 0.15, 0.975, 0]);
    plain(add(g, CONE(0.1, 0.4, 3), '#C8372D', [LEN / 2 + 0.35, 1.8, 0], [0, 0, -Math.PI / 2], [1, 1, 0.15]));
    [[1, 1], [1, -1]].forEach(([sx, sz]) => { add(g, CYL(0.025, 0.025, 0.22, 8), '#7A4A2A', [LEN / 2 + 0.8, 0.07, sz * 1.25], [0, 0, 0.5]); add(g, tube([[LEN / 2 + 0.15, 1.6, 0], [LEN / 2 + 0.5, 0.8, sz * 0.7], [LEN / 2 + 0.78, 0.12, sz * 1.22]], 0.01), '#D9C79A'); });
    return g;
  } },
  /** an old oil lantern with a warm glow (flickers) */
  lantern: { m: 0.45, ink: 0.01, build(o) {
    const g = new THREE.Group(), iron = mat(o.col || '#2E2D36', { roughness: 0.45, metalness: 0.4 });
    add(g, CYL(0.115, 0.125, 0.04, 20), iron, [0, 0.02, 0]); add(g, CYL(0.1, 0.115, 0.07, 20), iron, [0, 0.075, 0]);
    const gm = new THREE.MeshStandardMaterial({ color: '#FFD58A', emissive: '#FF9A2E', emissiveIntensity: 1.0, roughness: 0.3, transparent: true, opacity: 0.88 });
    add(g, LATH([[0.085, 0.11], [0.105, 0.17], [0.105, 0.27], [0.085, 0.33], [0.0, 0.33]], 20), gm, [0, 0, 0]);
    const fl = plain(add(g, SPH(0.05, 12, 10), glow('#FFE9A0'), [0, 0.2, 0], [0, 0, 0], [0.8, 1.5, 0.8])); fl.castShadow = false;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; add(g, CYL(0.007, 0.007, 0.24, 6), iron, [Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1]); }
    add(g, CONE(0.12, 0.09, 20), iron, [0, 0.375, 0]); add(g, CYL(0.04, 0.04, 0.03, 14), iron, [0, 0.43, 0]);
    add(g, new THREE.TorusGeometry(0.09, 0.011, 8, 22, Math.PI), iron, [0, 0.4, 0], [0, 0, 0], [1, 0.55, 1]);
    g.userData.tick = (t) => { gm.emissiveIntensity = 1.0 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5 + 1); fl.scale.set(0.8, 1.5 + 0.2 * Math.sin(t * 21), 0.8); };
    g.userData.tick(0); return g;
  } },
  /** a wooden pail with a rope handle. fill = colour of the contents (water, milk, paint...), col = wood */
  bucket: { m: 0.45, ink: 0.012, build(o) {
    const g = new THREE.Group(), c = o.col || '#A8744A', H = 0.36, rr = (y) => 0.15 + 0.05 * (y / H);
    const tex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = shade(c, 0.75); for (let q = 0; q < 12; q++) x.fillRect(q * w / 12, 0, 3, h); });
    add(g, new THREE.CylinderGeometry(0.2, 0.15, H, 28, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }), [0, H / 2, 0]);
    add(g, CYL(0.15, 0.15, 0.025, 28), shade(c, 0.7), [0, 0.0125, 0]);
    [0.07, 0.28].forEach((y) => add(g, TOR(rr(y) + 0.004, 0.013, 30), '#4A4A52', [0, y, 0], [Math.PI / 2, 0, 0]));
    if (o.fill) add(g, SPH(0.19, 24, 10), mat(o.fill, { roughness: 0.2 }), [0, 0.3, 0], [0, 0, 0], [1, 0.2, 1]); else add(g, CYL(0.19, 0.19, 0.01, 28), shade(c, 0.5), [0, 0.2, 0]);
    add(g, new THREE.TorusGeometry(0.2, 0.012, 8, 26, Math.PI), '#4A4A52', [0, 0.34, 0], [0, 0, 0], [1, 0.62, 1]);
    [-1, 1].forEach((s) => add(g, SPH(0.022, 10, 8), '#4A4A52', [s * 0.2, 0.34, 0]));
    return g;
  } },
  /** a green glass bottle with a label (label: text on it, e.g. 'RUM'), col = glass */
  bottle: { m: 0.4, ink: 0.008, build(o) {
    const g = new THREE.Group(), c = o.col || '#2F8F4F';
    add(g, LATH([[0, 0.0], [0.07, 0], [0.085, 0.02], [0.09, 0.05], [0.09, 0.2], [0.083, 0.245], [0.05, 0.3], [0.034, 0.34], [0.034, 0.375], [0.042, 0.39], [0.0, 0.39]], 28), mat(c, { roughness: 0.12, metalness: 0.1 }));
    add(g, CYL(0.028, 0.032, 0.05, 14), '#C99A5A', [0, 0.405, 0]);
    const tex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#F2E8CC'; x.fillRect(0, 0, w, h); x.strokeStyle = shade('#F2E8CC', 0.5); x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
      x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; const t = o.label || 'X'; let f = 62; x.font = `900 ${f}px Inter`; while (x.measureText(t).width > w * 0.2) { f -= 3; x.font = `900 ${f}px Inter`; } x.fillText(t, w * 0.25, h / 2); });
    const lb = plain(add(g, new THREE.CylinderGeometry(0.093, 0.093, 0.1, 28, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), [0, 0.115, 0], [0, -Math.PI / 2, 0])); lb.receiveShadow = false;
    return g;
  } },
};

/** the bounds of the object itself: smoke, flashes and flying drops (userData.fx) and ink hulls do not count */
function solidBox(root) {
  root.updateMatrixWorld(true); const b = new THREE.Box3(), tmp = new THREE.Box3();
  root.traverse((m) => { if (!m.isMesh || m.userData.fx || m.userData.isInk) return; let p = m, fx = false; while (p) { if (p.userData && p.userData.fx) fx = true; p = p.parent; } if (fx) return; m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); b.union(tmp); });
  return b;
}
const ANIMS = new Set(['none', 'bob', 'wobble', 'hop', 'shake', 'sway', 'roll', 'spin']);
export const MODEL_ANIMS = ANIMS;

/** a story object ready for the set: scaled to h (m), turned to a 3/4 view toward the camera (ry, flip = face left), inked, animated */
export function model(name, o = {}) {
  const D = MODELS[name]; if (!D) throw new Error(`model "${name}" is not in the 3D library (${Object.keys(MODELS).join(', ')})`);
  const inner = D.build(o); inkAll(inner, D.ink);
  const box0 = solidBox(inner), h0 = box0.max.y - box0.min.y, k = (o.h || D.m) / h0;
  inner.scale.setScalar(k); inner.position.y = -box0.min.y * k;
  const y0 = D.ry ?? -25, yaw = new THREE.Group(); yaw.add(inner); yaw.rotation.y = rad(o.ry ?? (o.flip ? 180 - y0 : y0));   // default: the front (+x) turns toward the camera (25 deg; a plane 48 to show its wings)
  const anim = new THREE.Group(); anim.add(yaw); const group = new THREE.Group(); group.add(anim);
  group.updateMatrixWorld(true); const b = solidBox(group);
  group.size = { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z }; group.model = name;
  const an = o.anim || 'none', wheels = []; inner.traverse((m) => { if (m.userData.wheel) wheels.push(m); });
  group.reveal = (kk, t = 0) => {
    if (inner.userData.tick) inner.userData.tick(t);
    anim.position.set(0, 0, 0); anim.rotation.set(0, 0, 0);
    const H = group.size.h, Wd = group.size.w;
    if (an === 'bob') anim.position.y = 0.04 * H * Math.abs(Math.sin(t * 3.2));
    else if (an === 'hop') anim.position.y = 0.12 * H * Math.abs(Math.sin(t * 6));
    else if (an === 'wobble') anim.rotation.z = 0.06 * Math.sin(t * 7);
    else if (an === 'sway') anim.rotation.z = 0.035 * Math.sin(t * 2.2);
    else if (an === 'shake') anim.position.x = 0.02 * Wd * Math.sin(t * 40);
    else if (an === 'spin') anim.rotation.y = t * 0.8;
    else if (an === 'roll') { const e = Math.min(1, kk / 0.5), s = 1 - (1 - e) * (1 - e); anim.position.x = -(1 - s) * Wd * 1.2; wheels.forEach((w) => { w.rotation.z = -anim.position.x * 3; }); }
  };
  group.reveal(0, 0); return group;
}
