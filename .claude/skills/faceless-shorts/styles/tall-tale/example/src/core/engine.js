// Renderer + cartoon-film look: neutral tone curve (keeps colours saturated), soft shadows, environment light, bloom, depth of field, vignette + grain.
//   const E = makeEngine(canvas)   ·   E.render(scene, camera, { bloom, focus, aperture, maxblur, grade })
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const W = 1080, H = 1920;
/** render quality from the URL: ?res=0.6 renders 3D at 60% size (upscaled), ?aa=0 turns MSAA off, ?shadow=1024 */
const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const RES = +(Q.get('res') || 1), AA = +(Q.get('aa') ?? 4), SHADOW = +(Q.get('shadow') || 2048);
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.35 }, uGrain: { value: 0.025 }, uTime: { value: 0 }, uWarm: { value: 0.04 }, uSat: { value: 1.12 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uGrain, uTime, uWarm, uSat; uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.13) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; d.x *= 0.5625;
      c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.75, length(d) * 1.4);
      c.rgb += (h(vUv * 1000.0) - 0.5) * uGrain; c.r += uWarm * 0.5; c.b -= uWarm * 0.5; float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, uSat); c.rgb *= uTint; gl_FragColor = c; }`,
};

export function makeEngine(canvas, { w = W, h = H, samples = 4, shadowSize = 2048 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer), envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
  renderer.userData = { shadowSize };
  const composer = new EffectComposer(renderer, rt); composer.setSize(w, h);
  const rp = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera()); composer.addPass(rp);
  const bokeh = new BokehPass(rp.scene, rp.camera, { focus: 3, aperture: 0.002, maxblur: 0.008 }); composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.85); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  return {
    renderer, envMap, composer,
    /** look = { bloom, bloomThreshold, focus (m), aperture (0 = all sharp), maxblur, exposure, vignette, grain, warm, t } */
    render(scene, camera, look = {}) {
      rp.scene = scene; rp.camera = camera; bokeh.scene = scene; bokeh.camera = camera;
      bokeh.enabled = (look.aperture ?? 0.0015) > 0;
      bokeh.uniforms.focus.value = look.focus ?? 3; bokeh.uniforms.aperture.value = look.aperture ?? 0.0015; bokeh.uniforms.maxblur.value = look.maxblur ?? 0.006;
      bloom.strength = look.bloom ?? 0.3; bloom.threshold = look.bloomThreshold ?? 1.0; bloom.radius = 0.6;
      renderer.toneMappingExposure = look.exposure ?? 1.0;
      grade.uniforms.uVig.value = look.vignette ?? 0.18; grade.uniforms.uGrain.value = look.grain ?? 0.008; grade.uniforms.uSat.value = look.sat ?? 1.12; grade.uniforms.uWarm.value = look.warm ?? 0.02; grade.uniforms.uTime.value = look.t ?? 0; grade.uniforms.uTint.value.set(...(look.tint || [1, 1, 1]));
      composer.render();
    },
  };
}
/** the default light rig: warm key with soft shadow, cool fill, rim, sky/ground bounce. Returns { key, rim, group } */
export function lightRig(scene, { key = '#FFE2C2', keyI = 3.2, keyPos = [2.5, 4, 3], rimCol = '#BFD8FF', rimI = 2.2, sky = '#FFF4E6', ground = '#8C6E55', hemiI = 0.9, shadowBox = 3, target = [0, 1, 0] } = {}) {
  const g = new THREE.Group(); scene.add(g);
  const k = new THREE.DirectionalLight(key, keyI); k.position.set(...keyPos); k.target.position.set(...target); k.castShadow = true;
  k.shadow.mapSize.set(SHADOW, SHADOW); k.shadow.bias = -0.0004; k.shadow.normalBias = 0.02; k.shadow.radius = 6;
  Object.assign(k.shadow.camera, { left: -shadowBox, right: shadowBox, top: shadowBox, bottom: -shadowBox, near: 0.1, far: 20 }); k.shadow.camera.updateProjectionMatrix();
  g.add(k, k.target);
  const r = new THREE.DirectionalLight(rimCol, rimI); r.position.set(-3, 3, -3); g.add(r);
  g.add(new THREE.HemisphereLight(sky, ground, hemiI));
  return { key: k, rim: r, group: g };
}
export function camera(fov = 30) { return new THREE.PerspectiveCamera(fov, W / H, 0.05, 800); }

// ---------- per-shot 3D light rigs (owner 22 Nov 2026: real lighting, not a colour tint) ----------
// A rig moves and recolours the SET'S OWN lights per shot: key (the shadow-casting sun / lamp) swings by `az` degrees around its target and
// is raised / lowered by `el`, then drifts `sweep` degrees across the shot; rim, hemisphere (sky / ground bounce), point lights and the
// environment get their own colour and strength; `tint` colours the whole frame (sky too), `exposure` / `vig` / `bloom` set the mood.
// key / rim / hemi / point = [colour, strength]. `pulse` (Hz) flashes the key and points (alarm).
export const LIGHT_RIGS = {
  day:   { key: ['#FFFFFF', 1.0], az: 0,   el: 0,   sweep: 8,  rim: ['#FFFFFF', 1.0], hemi: ['#FFFFFF', '#FFFFFF', 1.0],  point: ['#FFFFFF', 1.0], env: 1.0,  tint: [1, 1, 1],          exposure: 1.0,  vig: 0.18, bloom: 0.18, contact: 0.60 },
  warm:  { key: ['#FFD39A', 1.15], az: 22,  el: -8,  sweep: 10, rim: ['#FFE9C8', 0.8], hemi: ['#FFE0B8', '#B88A5C', 0.9],  point: ['#FFC27A', 1.25], env: 0.85, tint: [1.04, 0.99, 0.9], exposure: 1.02, vig: 0.24, bloom: 0.2, contact: 0.70 },
  dusk:  { key: ['#FF8A55', 1.1],  az: -68, el: -26, sweep: 14, rim: ['#9AB4FF', 1.7], hemi: ['#B79AD0', '#7A4A3A', 0.75], point: ['#FFB070', 1.0],  env: 0.6,  tint: [1.06, 0.92, 0.9], exposure: 0.95, vig: 0.32, bloom: 0.22, contact: 0.80 },
  night: { key: ['#7F9CFF', 0.6],  az: 44,  el: 8,   sweep: 6,  rim: ['#B8D0FF', 1.6], hemi: ['#3A4A9A', '#141A3A', 0.5],  point: ['#FFD9A0', 0.9],  env: 0.3,  tint: [0.62, 0.72, 1.0], exposure: 0.92, vig: 0.40, bloom: 0.3, contact: 0.85 },
  alarm: { key: ['#FF3B2E', 1.1],  az: -34, el: -6,  sweep: 0,  rim: ['#FF9A8A', 1.5], hemi: ['#FF8A76', '#3A0A0A', 0.85], point: ['#FF4A3A', 1.6],  env: 0.45,  tint: [1.0, 0.64, 0.62],  exposure: 1.05, vig: 0.42, bloom: 0.26, contact: 0.85, pulse: 2.2 },
  spot:  { key: ['#FFF2D0', 1.8],  az: 6,   el: 26,  sweep: 0,  rim: ['#FFFFFF', 0.35], hemi: ['#554A44', '#1A1410', 0.15], point: ['#FFF2D0', 0.2],  env: 0.12, tint: [0.7, 0.68, 0.66], exposure: 1.0,  vig: 0.55, bloom: 0.18, contact: 0.95 },
};
const D2R = Math.PI / 180;
/** finds the set's lights once and remembers their authored values (colour, strength, position) */
function rigOf(S) {
  if (S.rig) return S.rig;
  const r = { key: null, rim: [], hemi: [], point: [], env: S.scene.environmentIntensity ?? 1 };
  S.scene.traverse((o) => {
    if (!o.isLight) return;
    const b = { o, i: o.intensity, c: o.color.clone(), g: o.groundColor ? o.groundColor.clone() : null, p: o.position.clone(), t: o.target ? o.target.position.clone() : new THREE.Vector3() };
    if (o.isDirectionalLight && o.castShadow && !r.key) r.key = b; else if (o.isDirectionalLight) r.rim.push(b); else if (o.isHemisphereLight) r.hemi.push(b); else r.point.push(b);
  });
  return (S.rig = r);
}
/** puts a set into rig `name` at shot progress k (0..1) and shot time t. Returns the render look (tint, exposure, vignette, bloom) and `contact` (ground-shadow strength) */
export function applyRig(S, name, k = 0, t = 0) {
  const R = LIGHT_RIGS[name] || LIGHT_RIGS.day, r = rigOf(S);
  const mix = (o, base, hex, w) => o.color.copy(base).lerp(new THREE.Color(hex), w);
  const pulse = R.pulse ? 0.55 + 0.45 * Math.sin(t * R.pulse * 2 * Math.PI) : 1;
  if (r.key) {
    const b = r.key, v = b.p.clone().sub(b.t), rad = v.length(), az = Math.atan2(v.x, v.z) + (R.az + (R.sweep || 0) * (k - 0.5)) * D2R;
    const el = Math.min(85 * D2R, Math.max(6 * D2R, Math.asin(v.y / rad) + R.el * D2R)), hz = rad * Math.cos(el);
    b.o.position.set(b.t.x + hz * Math.sin(az), b.t.y + rad * Math.sin(el), b.t.z + hz * Math.cos(az));
    mix(b.o, b.c, R.key[0], 0.7); b.o.intensity = b.i * R.key[1] * pulse;
  }
  r.rim.forEach((b) => { mix(b.o, b.c, R.rim[0], 0.7); b.o.intensity = b.i * R.rim[1]; });
  r.hemi.forEach((b) => { mix(b.o, b.c, R.hemi[0], 0.7); if (b.g) b.o.groundColor.copy(b.g).lerp(new THREE.Color(R.hemi[1]), 0.7); b.o.intensity = b.i * R.hemi[2]; });
  r.point.forEach((b) => { mix(b.o, b.c, R.point[0], 0.6); b.o.intensity = b.i * R.point[1] * pulse; });
  S.scene.environmentIntensity = r.env * R.env;
  return { tint: R.tint, exposure: R.exposure, vignette: R.vig, bloom: R.bloom, contact: R.contact };
}
