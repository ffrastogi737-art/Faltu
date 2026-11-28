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
