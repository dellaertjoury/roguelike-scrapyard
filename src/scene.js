// Low-poly three.js renderer. Reads the simulation state (G) and draws it.
// Sim (x, y) maps to world (x, z); y is up.
import * as THREE from 'three';
import { G, AW, AH, EDGE, TAU, ground, rnd, clamp, sawLayout, harvesterBlades, PUMP_R, PUMP_TICK, PUMP_RESERVE } from './game.js';
import { A } from './assets.js';
import { SLOTS } from './data.js';
import { ECOL } from './data.js';

const host = document.getElementById('gl');
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const SKY = 0x9fcf7e;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 1500, 3200);
const camera = new THREE.PerspectiveCamera(36, 1, 10, 6000);
let VW = 800, VH = 500;
function resize() {
  const r = host.getBoundingClientRect(); VW = Math.max(200, r.width); VH = Math.max(200, r.height);
  renderer.setSize(VW, VH, false); camera.aspect = VW / VH; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host); resize();

/* ---------- lights ---------- */
scene.add(new THREE.HemisphereLight(0xeef6ff, 0x7a8f55, 1.7));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1000, right: 1000, top: 1000, bottom: -1000, near: 50, far: 3200 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = .8;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-520, 1100, 380);

/* ---------- helpers ---------- */
// Batching: many small static meshes are baked into a few meshes with per-vertex colours,
// which cuts draw calls (and shadow draws) a lot. Geometry/materials flagged keep are shared.
const keep = (...xs) => { for (const x of xs) x.userData.keep = true; return xs[0] };
function dispose(obj) {
  obj.traverse(m => {
    if (!m.isMesh) return;
    if (!m.geometry.userData.keep) m.geometry.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (!mt.userData.keep) mt.dispose();
  });
}
function bake(m, matrix) {
  const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  g.applyMatrix4(matrix);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), mats = Array.isArray(m.material) ? m.material : [m.material];
  if (Array.isArray(m.material) && g.groups.length) { for (const gr of g.groups) { const c = mats[gr.materialIndex].color; for (let i = gr.start; i < Math.min(n, gr.start + gr.count); i++) c.toArray(col, i * 3) } }
  else { const c = mats[0].color; for (let i = 0; i < n; i++) c.toArray(col, i * 3) }
  const out = { pos: g.attributes.position.array, nor: g.attributes.normal.array, col }; g.dispose(); return out;
}
function joinBaked(list) {
  let n = 0; for (const b of list) n += b.pos.length;
  const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n); let o = 0;
  for (const b of list) { pos.set(b.pos, o); nor.set(b.nor, o); col.set(b.col, o); o += b.pos.length }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
const VC_LIT = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const VC_LIT2 = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
const VC_BASIC = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
const isLit = m => (Array.isArray(m) ? m : [m]).every(x => x.isMeshLambertMaterial);
const isBasic = m => !Array.isArray(m) && m.isMeshBasicMaterial;
// Merge the meshes in `meshes` (with their matrices relative to `parent`) into one lit and one unlit mesh.
function mergeInto(parent, meshes, matrixOf, litMat = VC_LIT) {
  const lit = [], basic = [];
  for (const m of meshes) { if (isLit(m.material)) lit.push(m); else if (isBasic(m.material)) basic.push(m) }
  const add = (list, mat, shadow) => {
    if (!list.length) return null;
    const mm = new THREE.Mesh(joinBaked(list.map(m => bake(m, matrixOf(m)))), mat); mm.castShadow = shadow; mm.receiveShadow = true; parent.add(mm);
    for (const m of list) { m.parent && m.parent.remove(m); if (!m.geometry.userData.keep) m.geometry.dispose(); for (const mt of [].concat(m.material)) if (!mt.userData.keep) mt.dispose() }
    return mm;
  };
  return [add(lit, litMat, true), add(basic, VC_BASIC, false)];
}
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m };
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

/* ---------- static world ---------- */
const groundTex = new THREE.CanvasTexture(ground);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const arena = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: groundTex }));
arena.position.set(AW / 2, 0, AH / 2); arena.receiveShadow = true; scene.add(arena);

const sand = new THREE.Mesh(new THREE.PlaneGeometry(AW + 180, AH + 180).rotateX(-Math.PI / 2), lam(0xd2b88c));
sand.position.set(AW / 2, -.6, AH / 2); sand.receiveShadow = true; scene.add(sand);

{ // rolling low-poly grass with faceted colours
  const geo = new THREE.PlaneGeometry(AW + 4200, AH + 4200, 80, 60).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + AW / 2, z = pos.getZ(i) + AH / 2;
    const out = Math.max(-x, x - AW, -z, z - AH);
    const n = Math.sin(x * .004) + Math.sin(z * .005 + 1.3) + Math.sin((x + z) * .003);
    pos.setY(i, out < 110 ? -3 : Math.min(140, (out - 110) * .06 * (1.2 + n * .4)) + ((x * 13 + z * 7) % 9));
  }
  const greens = [0x86bb5c, 0x91c466, 0x7cb052, 0x9ccc6c, 0x88b85a].map(c => new THREE.Color(c));
  const col = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) { const c = greens[Math.random() * greens.length | 0]; for (let k = 0; k < 3; k++) c.toArray(col, (f + k) * 3) }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const grass = new THREE.Mesh(geo, lam(0xffffff, { vertexColors: true })); grass.position.set(AW / 2, -1, AH / 2); grass.receiveShadow = true; scene.add(grass);
}

// tyre wall around the arena (low-poly torus = tyre with a hole)
const tireGeo = keep(new THREE.TorusGeometry(11, 5.5, 5, 10).rotateX(Math.PI / 2));
const STATIC = new THREE.Group(); scene.add(STATIC);
{
  const spots = [];
  for (let x = EDGE / 2; x < AW; x += 34) spots.push([x, EDGE / 2], [x, AH - EDGE / 2]);
  for (let y = EDGE / 2 + 34; y < AH - 20; y += 34) spots.push([EDGE / 2, y], [AW - EDGE / 2, y]);
  const im = new THREE.InstancedMesh(tireGeo, lam(0xffffff), spots.length * 2);
  im.castShadow = im.receiveShadow = true;
  let i = 0;
  for (const [x, z] of spots) for (let l = 0; l < 2; l++) {
    dummy.position.set(x, 5.5 + l * 11, z); dummy.rotation.set(0, rnd(0, TAU), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    const k = Math.round(x / 34 + z / 34);
    im.setColorAt(i++, tmpC.setHex(l === 1 && k % 4 === 0 ? (k % 8 === 0 ? 0xe24a32 : 0xf2ede2) : 0x2a2826));
  }
  scene.add(im);
}

// grandstands with a bobbing crowd
const crowd = [];
const crowdMesh = (() => {
  const stands = [[AW * .3, -95, 1], [AW * .7, -95, 1], [AW * .5, AH + 95, -1]];
  const concrete = lam(0xd9d4cb), roofM = lam(0xe8553a);
  for (const [cx, cz, dir] of stands) {
    for (let r = 0; r < 3; r++) { const step = mesh(new THREE.BoxGeometry(380, 12 * (r + 1), 22), concrete); step.position.set(cx, 6 * (r + 1), cz - dir * r * 22); STATIC.add(step) }
    const roof = mesh(new THREE.BoxGeometry(400, 4, 80), roofM); roof.position.set(cx, 78, cz - dir * 22); STATIC.add(roof);
    for (const px of [-190, 190]) { const pole = mesh(new THREE.CylinderGeometry(2.5, 2.5, 78, 6), concrete); pole.position.set(cx + px, 39, cz - dir * 56); STATIC.add(pole) }
    for (let r = 0; r < 3; r++) for (let k = 0; k < 30; k++) crowd.push({ x: cx - 170 + k * 11.7 + rnd(-2, 2), y: 12 * (r + 1) + 8, z: cz - dir * r * 22, ph: rnd(0, TAU) });
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 15, 6), lam(0xffffff), crowd.length);
  im.castShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const cols = [0xe8553a, 0xffc23d, 0x4fa3d9, 0xf2ede2, 0x7cc46a, 0xb86ad9, 0x333333, 0xff8fb0];
  crowd.forEach((c, i) => im.setColorAt(i, tmpC.setHex(cols[i * 7 % cols.length])));
  scene.add(im); return im;
})();

// trees, rocks, scrap piles, floodlights, flags
{
  const trunkG = new THREE.CylinderGeometry(4, 6, 30, 5), crownG = new THREE.IcosahedronGeometry(1, 0), rockG = new THREE.DodecahedronGeometry(1, 0);
  const trunkM = lam(0x7a5434), crownMs = [0x4f9a4a, 0x5fae52, 0x3f8a46, 0x6dbb5a].map(c => lam(c)), rockM = lam(0x9a9a94);
  const outside = (x, z, m) => x < -m || x > AW + m || z < -m || z > AH + m;
  const nearStand = (x, z) => (z < 0 && z > -260 && ((x > AW * .3 - 230 && x < AW * .3 + 230) || (x > AW * .7 - 230 && x < AW * .7 + 230))) || (z > AH && z < AH + 260 && x > AW * .5 - 230 && x < AW * .5 + 230);
  let placed = 0;
  for (let t = 0; t < 2000 && placed < 110; t++) {
    const x = rnd(-1100, AW + 1100), z = rnd(-900, AH + 900);
    if (!outside(x, z, 150) || nearStand(x, z)) continue;
    const s = rnd(30, 62), tr = new THREE.Group();
    const trunk = mesh(trunkG, trunkM); trunk.position.y = 15; tr.add(trunk);
    const crown = mesh(crownG, crownMs[placed % 4]); crown.scale.set(s, s * rnd(1, 1.3), s); crown.position.y = 30 + s * .7; crown.rotation.set(rnd(0, 3), rnd(0, 3), 0); tr.add(crown);
    tr.position.set(x, 0, z); STATIC.add(tr); placed++;
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd(-700, AW + 700), z = rnd(-600, AH + 600);
    if (!outside(x, z, 120) || nearStand(x, z)) continue;
    const r = mesh(rockG, rockM); r.scale.set(rnd(10, 30), rnd(8, 20), rnd(10, 30)); r.rotation.set(rnd(0, 3), rnd(0, 3), 0); r.position.set(x, 4, z); STATIC.add(r);
  }
  // crushed-car piles in the corners
  const crushed = new THREE.InstancedMesh(new THREE.BoxGeometry(48, 14, 26), lam(0xffffff), 4 * 14);
  crushed.castShadow = crushed.receiveShadow = true; let i = 0;
  for (const [cx, cz] of [[-150, -150], [AW + 150, -150], [-150, AH + 150], [AW + 150, AH + 150]]) {
    for (let k = 0; k < 14; k++) {
      const layer = k < 7 ? 0 : k < 11 ? 1 : k < 13 ? 2 : 3;
      dummy.position.set(cx + rnd(-50, 50) * (1 - layer * .25), 7 + layer * 14, cz + rnd(-50, 50) * (1 - layer * .25));
      dummy.rotation.set(rnd(-.08, .08), rnd(0, TAU), rnd(-.08, .08)); dummy.scale.setScalar(1); dummy.updateMatrix();
      crushed.setMatrixAt(i, dummy.matrix); crushed.setColorAt(i++, tmpC.set(ECOL[k % ECOL.length]).multiplyScalar(.85));
    }
  }
  scene.add(crushed);
  const poleM = lam(0x8d9096), headM = lam(0x3a3d42), glowM = new THREE.MeshBasicMaterial({ color: 0xfffbe0 });
  for (const [x, z] of [[-60, -60], [AW + 60, -60], [-60, AH + 60], [AW + 60, AH + 60]]) {
    const p = mesh(new THREE.CylinderGeometry(4, 6, 240, 6), poleM); p.position.set(x, 120, z); STATIC.add(p);
    const h = mesh(new THREE.BoxGeometry(60, 26, 14), headM); h.position.set(x, 245, z); h.lookAt(AW / 2, 0, AH / 2); STATIC.add(h);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(52, 18), glowM); l.position.copy(h.position); l.lookAt(AW / 2, 0, AH / 2); l.translateZ(7.2); STATIC.add(l);
  }
  const flagM = new THREE.MeshLambertMaterial({ color: 0xe8553a, side: THREE.DoubleSide, flatShading: true });
  for (const [x, z] of [[AW * .15, -70], [AW * .85, -70], [AW * .15, AH + 70], [AW * .85, AH + 70], [-70, AH * .5], [AW + 70, AH * .5]]) {
    const p = mesh(new THREE.CylinderGeometry(1.5, 1.5, 90, 5), poleM); p.position.set(x, 45, z); STATIC.add(p);
    const f = mesh(new THREE.PlaneGeometry(34, 22), flagM); f.position.set(x + 17, 78, z); f.rotation.y = .3; STATIC.add(f);
  }
}

// bake all static scenery (stands, trees, rocks, poles, flags) into two meshes
{ STATIC.updateMatrixWorld(true); const ms = []; STATIC.traverse(m => { if (m.isMesh) ms.push(m) }); mergeInto(STATIC, ms, m => m.matrixWorld, VC_LIT2) }

/* ---------- obstacles (rebuilt each run) ---------- */
const obsGroup = new THREE.Group(); scene.add(obsGroup);
let obsBuilt = -1;
const tireM = keep(lam(0x2a2826)), tireRed = keep(lam(0xe24a32)), hayM = keep(lam(0xe2bf62)), hayTop = keep(lam(0xedd283));
// A wooden kicker: triangular profile extruded across its width, red-white side
// boards, hazard-yellow edge rails and a white lip so you can read it from above.
const woodM = keep(lam(0xb98a55)), rampSideM = keep(lam(0xe24a32)), railM = keep(lam(0xffc23d)), lipM = keep(lam(0xf4efe4)), plankM = keep(lam(0x8f6438));
function buildRamp(r) {
  const g = new THREE.Group(), sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(r.L, 0); sh.lineTo(r.L, r.H); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: r.W, bevelEnabled: false }); geo.translate(0, 0, -r.W / 2);
  g.add(mesh(geo, [rampSideM, woodM]));
  const hyp = Math.hypot(r.L, r.H), ang = Math.atan2(r.H, r.L);
  for (const z of [-r.W / 2 + 3, r.W / 2 - 3]) { const rail = mesh(new THREE.BoxGeometry(hyp, 2.5, 5), railM); rail.position.set(r.L / 2, r.H / 2 + 1.2, z); rail.rotation.z = ang; g.add(rail) }
  for (let i = 1; i < 6; i++) { const pl = mesh(new THREE.BoxGeometry(2, .8, r.W - 12), plankM, false); const u = i / 6; pl.position.set(r.L * u, r.H * u + .5, 0); pl.rotation.z = ang; g.add(pl) }
  const lip = mesh(new THREE.BoxGeometry(5, 2, r.W), lipM); lip.position.set(r.L - 2.5, r.H + .6, 0); g.add(lip);
  g.position.set(r.x, 0, r.y); g.rotation.y = -r.d;
  return g;
}
function buildObstacles() {
  dispose(obsGroup); obsGroup.clear();
  for (const o of G.obs) {
    if (o.k === 'tire') {
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + o.x, s = o.r * .55 / 16;
        for (let l = 0; l < 3 - (i === 2 ? 1 : 0); l++) {
          const t = mesh(tireGeo, l === 2 && i === 0 ? tireRed : tireM);
          t.scale.setScalar(s); t.position.set(o.x + Math.cos(a) * o.r * .42, 5.5 * s + l * 11 * s, o.y + Math.sin(a) * o.r * .42); obsGroup.add(t);
        }
      }
    } else {
      const b = mesh(new THREE.CylinderGeometry(o.r, o.r, 28, 10), [hayM, hayTop, hayTop]); b.position.set(o.x, 14, o.y); b.rotation.y = rnd(0, 3); obsGroup.add(b);
    }
  }
  for (const r of G.ramps) obsGroup.add(buildRamp(r));
  // one batched mesh for every tyre, bale and ramp of this run
  obsGroup.updateMatrixWorld(true); const ms = []; obsGroup.traverse(m => { if (m.isMesh) ms.push(m) });
  const keepMs = obsGroup.children.slice(); mergeInto(obsGroup, ms, m => m.matrixWorld);
  for (const c of keepMs) if (c.isGroup) obsGroup.remove(c);
  obsBuilt = G.obsVersion;
}

/* ---------- cars ---------- */
const DARK = new THREE.Color(0x1e1a16);
const tyreM = keep(lam(0x1f1d1c)), rimM = keep(lam(0xb8bcc2)), glassM = keep(lam(0x26313a)), bumperM = keep(lam(0x4a4c50)), whiteM = keep(lam(0xf4efe4));
const headM = keep(new THREE.MeshBasicMaterial({ color: 0xfff2c0 })), tailM = keep(new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
const wheelG = keep(new THREE.CylinderGeometry(1, 1, 1, 8));

export function buildCar({ len: L, wid: W, color, kind, shape }) {
  shape = shape || { cabL: .42, cabX: -.1, cabH: .36 };
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const body = lam(color), roof = lam(new THREE.Color(color).multiplyScalar(.82));
  const r = kind === 'monster' ? W * .42 : W * .22, bh = W * .4, by = (kind === 'monster' ? r * 1.5 : r * .9) + bh / 2;
  const b = mesh(new THREE.BoxGeometry(L, bh, W), body); b.position.y = by; tilt.add(b);
  // hood slope: a thin wedge-ish top plate in body colour
  const hood = mesh(new THREE.BoxGeometry(L * .28, bh * .2, W * .86), body); hood.position.set(L * .3, by + bh * .55, 0); tilt.add(hood);
  // glass cabin with a painted roof plate set back, so the windshield shows from above
  const cabH = W * shape.cabH, cabL = L * shape.cabL, cab = mesh(new THREE.BoxGeometry(cabL, cabH, W * .84), glassM);
  cab.position.set(L * shape.cabX, by + bh / 2 + cabH / 2, 0); tilt.add(cab);
  const roofP = mesh(new THREE.BoxGeometry(cabL * .62, 1.4, W * .8), roof); roofP.position.set(L * shape.cabX - cabL * .12, by + bh / 2 + cabH + .5, 0); tilt.add(roofP);
  const roundel = mesh(new THREE.CylinderGeometry(W * .17, W * .17, .6, 10), whiteM, false); roundel.position.set(L * .32, by + bh / 2 + bh * .12, 0); tilt.add(roundel);
  for (const s of [1, -1]) {
    const bp = mesh(new THREE.BoxGeometry(3, bh * .45, W * 1.04), bumperM); bp.position.set(s * (L / 2 + 1), r * .9 + bh * .25, 0); tilt.add(bp);
    for (const z of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.5, bh * .22, W * .18), s > 0 ? headM : tailM); l.position.set(s * (L / 2 + .3), by + bh * .15, z * W * .34); tilt.add(l);
    }
  }
  const wheels = [], front = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * L * .3, r, sz * (W / 2 - 1 + (kind === 'monster' ? r * .35 : 0)));
    const w = mesh(wheelG, tyreM); w.scale.set(r, W * (kind === 'monster' ? .38 : .22), r); w.rotation.x = Math.PI / 2; pivot.add(w);
    const hub = mesh(wheelG, rimM, false); hub.scale.set(r * .5, W * .23, r * .5); hub.rotation.x = Math.PI / 2; pivot.add(hub);
    root.add(pivot); wheels.push(w); if (sx > 0) front.push(pivot);
  }
  let turret = null;
  if (kind === 'spit') {
    turret = new THREE.Group(); turret.position.set(L * shape.cabX - cabL * .12, by + bh / 2 + cabH + 1.2, 0);
    const base = mesh(new THREE.CylinderGeometry(5.5, 6.5, 4, 8), lam(0x3a3c40)); base.position.y = 2; turret.add(base);
    const barrelM = kind === 'spit' ? new THREE.MeshBasicMaterial({ color: 0xa8f060 }) : lam(0x55585e);
    for (const z of [0]) { const br = mesh(new THREE.BoxGeometry(16, 2.6, 2.6), barrelM); br.position.set(9, 3.5, z); br.name = 'barrel'; turret.add(br) }
    tilt.add(turret);
  }
  if (kind === 'brute' || kind === 'harvester') {
    const bar = mesh(new THREE.BoxGeometry(5, bh * .9, W * 1.12), lam(0x9a9c9e)); bar.position.set(L / 2 + 4, by, 0); tilt.add(bar);
  }
  if (kind === 'monster') { // lifted body on struts, light bar
    for (const sx of [1, -1]) for (const sz of [1, -1]) { const st = mesh(new THREE.BoxGeometry(3, r * 1.2, 3), lam(0x3a3a3a)); st.position.set(sx * L * .3, r * 1.1, sz * W * .36); tilt.add(st) }
    const lb = mesh(new THREE.BoxGeometry(4, 3, W * .9), lam(0x2a2a2a)); lb.position.set(L * .05, by + bh / 2 + cabH + 2, 0); tilt.add(lb);
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 3), headM); l.position.set(L * .05 + 2.2, by + bh / 2 + cabH + 2, -W * .33 + i * W * .22); tilt.add(l) }
  }
  if (kind === 'thief') { // siphon tank on the roof and a hose trailing out the back
    const tk = mesh(new THREE.CylinderGeometry(4, 4, W * .7, 8), lam(0x9fe070)); tk.rotation.x = Math.PI / 2; tk.position.set(-L * .2, by + bh / 2 + cabH + 4, 0); tilt.add(tk);
    const hose = mesh(new THREE.BoxGeometry(L * .45, 1.6, 1.6), lam(0x1d1b1a)); hose.position.set(-L * .5, by, W * .25); hose.rotation.y = .3; tilt.add(hose);
  }
  if (kind === 'tow') { // crane boom out the back with a hook
    const boom = mesh(new THREE.BoxGeometry(L * .55, 4, 4), lam(0xf2c230)); boom.position.set(-L * .3, by + bh / 2 + 12, 0); boom.rotation.z = -.35; tilt.add(boom);
    const post = mesh(new THREE.BoxGeometry(6, 14, 8), lam(0x3a3a3a)); post.position.set(-L * .12, by + bh / 2 + 7, 0); tilt.add(post);
    for (const z of [-1, 1]) { const ab = mesh(new THREE.BoxGeometry(3, 3, W * .2), lam(0xff7a2a)); ab.position.set(-L * .12, by + bh / 2 + 15, z * W * .3); tilt.add(ab) }
  }
  if (kind === 'harvester') {
    const comb = mesh(new THREE.BoxGeometry(12, 14, W + 34), lam(0xe0b040)); comb.position.set(L / 2 + 14, 10, 0); tilt.add(comb);
    const toothG = new THREE.ConeGeometry(3, 14, 4).rotateZ(-Math.PI / 2), toothM = lam(0x6b6b6b);
    for (let i = 0; i < 9; i++) { const t = mesh(toothG, toothM); t.position.set(L / 2 + 26, 8, -W / 2 - 15 + i * (W + 30) / 8); tilt.add(t) }
    for (const z of [-1, 1]) { const ex = mesh(new THREE.CylinderGeometry(3, 3, 30, 6), lam(0x3a3a3a)); ex.position.set(-L * .3, by + 22, z * W * .3); tilt.add(ex) }
  }
  const dims = { L, W, r, bh, by, top: by + bh / 2, cabL, cabX: L * shape.cabX, cabH, roofY: by + bh / 2 + cabH };
  // batch: body-coloured pieces into one mesh, everything else into one vertex-coloured mesh, each wheel into one mesh
  const bodyMs = tilt.children.filter(c => c.isMesh && c.material === body);
  if (bodyMs.length > 1) { const bm = new THREE.Mesh(joinBaked(bodyMs.map(m => { m.updateMatrix(); return bake(m, m.matrix) })), body); bm.castShadow = bm.receiveShadow = true; for (const m of bodyMs) { tilt.remove(m); m.geometry.dispose() } tilt.add(bm) }
  const rest = tilt.children.filter(c => c.isMesh && c.material !== body); rest.forEach(m => m.updateMatrix());
  mergeInto(tilt, rest, m => m.matrix);
  for (let i = 0; i < wheels.length; i++) {
    const pv = wheels[i].parent; pv.children.forEach(m => m.updateMatrix());
    const [wm] = mergeInto(pv, pv.children.slice(), m => m.matrix); wheels[i] = wm;
  }
  return { root, tilt, body, roof, base: new THREE.Color(color), wheels, front, turret, r, kind, dims };
}

/* enemy car pooling */
const pools = {}, active = new Map();
function acquire(e) {
  const p = pools[e.type] || (pools[e.type] = []);
  const o = p.pop() || buildCar({ len: e.len, wid: e.wid, color: e.col, kind: e.type });
  o.base.set(e.col); o.root.visible = true; scene.add(o.root); return o;
}
function release(o, type) { o.root.visible = false; scene.remove(o.root); (pools[type] || (pools[type] = [])).push(o) }

let player = null, playerCarId = null;

/* ---------- instanced effect pools ---------- */
function pool(geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
  m.setColorAt(0, tmpC.setHex(0xffffff)); scene.add(m); return m;
}
const blobs = pool(new THREE.IcosahedronGeometry(1, 0), lam(0xffffff), 1200);
const glows = pool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1200);
const streaks = pool(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1600);
const scrapPool = pool(new THREE.CylinderGeometry(7, 7, 3, 6), lam(0xffffff), 400); scrapPool.castShadow = true;
const minePool = pool(new THREE.CylinderGeometry(9, 10, 4, 8), lam(0x2e2e30), 20); minePool.castShadow = true;
const sawG = (() => { const sh = new THREE.Shape(); for (let k = 0; k <= 16; k++) { const r = k % 2 ? 9 : 13, b = k / 16 * TAU; k ? sh.lineTo(Math.cos(b) * r, Math.sin(b) * r) : sh.moveTo(r, 0) } return new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false }).rotateX(-Math.PI / 2) })();
const sawM = keep(lam(0xd0d3d8)), armM = keep(lam(0x6b6e74)), hubM = keep(lam(0x2f3033)); keep(sawG);
// ---------- visible garage parts ----------
// Every installed part gets a model on its slot. Rebuilt when the build changes.
const M = {
  steel: lam(0x8d9096), dark: lam(0x2f3033), chrome: lam(0xc9ccd2), copper: lam(0xc8743a), red: lam(0xc0392b),
  yellow: lam(0xf2c230), blue: lam(0x3fa4e0), olive: lam(0x6b6b3a), concrete: lam(0xa7a39a), green: lam(0x3f5f4f),
  gun: lam(0x55585e), white: lam(0xf4efe4), glowBlue: new THREE.MeshBasicMaterial({ color: 0xbfe8ff }),
  glowRed: new THREE.MeshBasicMaterial({ color: 0xff3a2a }), glowOrange: new THREE.MeshBasicMaterial({ color: 0xff8a2a })
};
for (const m of Object.values(M)) keep(m);
const box = (w, h, d, m, x, y, z, g) => { const o = mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o };
const cyl = (r1, r2, h, n, m, x, y, z, g, rot) => { const o = mesh(new THREE.CylinderGeometry(r1, r2, h, n), m); o.position.set(x, y, z); if (rot) o.rotation.set(...rot); g.add(o); return o };
function partMesh(o, id, l, P) {
  const g = new THREE.Group(), D = o.dims, { L, W, by, bh, top, cabL, cabX, roofY } = D, hx = L * .28, tx = -L * .33, Z = Math.PI / 2;
  switch (id) {
    case 'mg': { // roof turret, twin barrels from Lv 3
      const tu = new THREE.Group(); tu.position.set(cabX - cabL * .12, roofY + 1.2, 0);
      cyl(5.5, 6.5, 4, 8, M.dark, 0, 2, 0, tu);
      for (const z of l >= 3 ? [-2.2, 2.2] : [0]) box(16 + l, 2.6, 2.6, M.gun, 9, 3.5, z, tu);
      box(5, 3, 4, M.yellow, -4, 4.5, 0, tu);
      g.add(tu); o.turret = tu; break;
    }
    case 'tesla': {
      const x = cabX - cabL * .1; cyl(5, 6, 2.5, 8, M.dark, x, roofY + 1.2, 0, g);
      const h = 8 + l * 2; cyl(2.2, 2.2, h, 8, M.copper, x, roofY + 2.5 + h / 2, 0, g);
      for (let i = 0; i < 2 + l; i++) { const t = mesh(new THREE.TorusGeometry(3.6, .9, 5, 10), M.chrome); t.rotation.x = Z; t.position.set(x, roofY + 4 + i * (h - 3) / (1 + l), 0); g.add(t) }
      const ball = mesh(new THREE.IcosahedronGeometry(3.2, 0), M.glowBlue, false); ball.position.set(x, roofY + 4 + h, 0); g.add(ball); break;
    }
    case 'magnet': {
      const x = cabX - cabL * .25; box(2.4, 10, 2.4, M.yellow, x, roofY + 5, 0, g);
      const arm = box(20, 2.4, 2.4, M.yellow, x + 8, roofY + 11, 0, g); arm.rotation.z = -.25;
      box(1, 6, 1, M.dark, x + 17, roofY + 6, 0, g);
      cyl(5 + l, 5 + l, 2.5, 10, M.red, x + 17, roofY + 2.5, 0, g); break;
    }
    case 'cage': {
      const y = roofY + 2.2, x0 = cabX - cabL * .5, x1 = cabX + cabL * .5, t = 1.4 + l * .3;
      for (const z of [-W * .43, W * .43]) { box(cabL * 1.08, t, t, M.dark, cabX, y, z, g); for (const x of [x0, x1]) box(t, 4, t, M.dark, x, y - 2, z, g) }
      for (const x of [x0, cabX, x1]) box(t, t, W * .86, M.dark, x, y, 0, g);
      if (l >= 2) { const d = box(cabL * 1.1, t, t, M.dark, cabX, y + .3, 0, g); d.rotation.y = .55 }
      break;
    }
    case 'v8': {
      box(7, 4 + l, 8, M.chrome, hx, top + 2 + l / 2, 0, g); box(6, 2.5, 6, M.dark, hx + 1, top + 5 + l, 0, g);
      for (const z of [-W * .34, W * .34]) cyl(1.2, 1.2, L * .3, 6, M.chrome, hx - 2, top + 1, z, g, [0, 0, Z]); break;
    }
    case 'flame': {
      cyl(3, 3, 10 + l, 8, M.red, hx - 3, top + 3, 0, g, [0, 0, Z]);
      for (const z of [-W * .22, W * .22]) { cyl(1.4, 1.9, 9, 6, M.dark, L / 2 + 1, top + 1, z, g, [0, 0, Z]); const tip = mesh(new THREE.IcosahedronGeometry(1.4, 0), M.glowOrange, false); tip.position.set(L / 2 + 6, top + 1, z); g.add(tip) }
      break;
    }
    case 'rounds': {
      box(10, 4 + l, 9, M.olive, hx, top + 2 + l / 2, 0, g); box(10.4, 1.2, 9.4, M.yellow, hx, top + 2 + l * .8, 0, g);
      for (let i = 0; i < 4; i++) box(1.2, 1.2, 3, M.copper, hx - 3 + i * 2, top + 4.6 + l, 2, g); break;
    }
    case 'cooler': {
      box(9, 3, W * .7, M.dark, hx, top + 1.5, 0, g);
      for (let i = 0; i < 4 + l; i++) box(.8, 3.6, W * .72, lam(0x6fa8c8), hx - 4 + i * 8 / (3 + l), top + 2, 0, g); break;
    }
    case 'plow': {
      for (const s of [-1, 1]) {
        const pl = box(3, bh * (1 + l * .15), W * .62, M.steel, L / 2 + 6, by, s * W * .26, g); pl.rotation.y = s * .42;
        const st = box(3.2, 2, W * .5, M.yellow, L / 2 + 6.2, by + bh * .3, s * W * .26, g); st.rotation.y = s * .42;
      }
      break;
    }
    case 'spikes': {
      const n = 4 + l * 2;
      for (let i = 0; i < n; i++) cyl(0, 1.8, 7 + l, 5, M.chrome, L / 2 + 5, by, -W * .45 + i * W * .9 / (n - 1), g, [0, 0, -Z]);
      box(2, bh * .5, W * .95, M.dark, L / 2 + 1.5, by, 0, g); break;
    }
    case 'bullbar': {
      const t = 1.1 + l * .3;
      for (const z of [-W * .3, W * .3]) cyl(t, t, bh * 1.4, 6, M.dark, L / 2 + 4, by + bh * .1, z, g);
      for (const y of [by - bh * .3, by + bh * .45]) cyl(t, t, W * .78, 6, M.dark, L / 2 + 4, y, 0, g, [Z, 0, 0]);
      break;
    }
    case 'mines': {
      box(9, bh * .9, W * .62, M.yellow, -L / 2 - 3, by, 0, g);
      for (const z of [-W * .2, 0, W * .2]) { const s2 = box(9.2, bh * .92, 2, M.dark, -L / 2 - 3, by, z, g); s2.rotation.x = .5 }
      const lt = mesh(new THREE.BoxGeometry(2, 2, 2), M.glowRed, false); lt.position.set(-L / 2 - 3, by + bh * .5 + 1, 0); g.add(lt); break;
    }
    case 'exhaust': {
      const zs = l >= 3 ? [-W * .36, -W * .14, W * .14, W * .36] : [-W * .28, W * .28]; o.pipeGlow = [];
      for (const z of zs) {
        cyl(1.8 + l * .4, 2.3 + l * .4, 12, 8, M.chrome, -L / 2 - 2, by - 1, z, g, [0, 0, Z]);
        const gl = mesh(new THREE.IcosahedronGeometry(2.4 + l * .5, 0), M.glowOrange, false); gl.position.set(-L / 2 - 9, by - 1, z); gl.visible = false; g.add(gl); o.pipeGlow.push(gl);
      }
      break;
    }
    case 'spoiler': {
      const h = 5 + l * 1.5; box(6 + l, 1.2, W * 1.08, M.dark, -L * .43, top + h, 0, g);
      for (const z of [-W * .3, W * .3]) box(1.5, h, 1.5, M.dark, -L * .43, top + h / 2, z, g);
      const finM = lam(o.base); for (const z of [-W * .54, W * .54]) box(6 + l, 4, 1, finM, -L * .43, top + h + 1, z, g);
      break;
    }
    case 'nitro': {
      for (let i = 0; i <= l; i++) { const x = tx + (i - l / 2) * 5.5; cyl(2.4, 2.4, W * .7, 8, M.blue, x, top + 2.6, 0, g, [Z, 0, 0]); cyl(1, 1, W * .76, 6, M.white, x, top + 2.6, 0, g, [Z, 0, 0]) }
      break;
    }
    case 'ballast': box(10 + l * 2, 4 + l, W * .6, M.concrete, tx, top + 2 + l / 2, 0, g); break;
    case 'toolbox': {
      for (let i = 0; i < l; i++) { box(8, 4, 6, M.red, tx + (i - (l - 1) / 2) * 9, top + 2, 0, g); box(4, 1.2, 1.2, M.dark, tx + (i - (l - 1) / 2) * 9, top + 4.6, 0, g) }
      break;
    }
    case 'scrapbin': {
      box(11, 5, W * .62, M.green, tx, top + 2.5, 0, g);
      for (let i = 0; i < 3 + l * 2; i++) { const b = box(2 + Math.random() * 3, 1.5, 2 + Math.random() * 3, lam(new THREE.Color(ECOL[i % ECOL.length])), tx + rnd(-4, 4), top + 5.5 + rnd(0, 1.5), rnd(-W * .22, W * .22), g); b.rotation.set(rnd(0, 1), rnd(0, 3), 0) }
      break;
    }
    case 'saw': {
      const { R, reach, fwd } = sawLayout(l, P.len, P.wid), y = by;
      for (const side of [-1, 1]) for (const f of fwd) {
        const len = reach - W / 2 + 2;
        box(4, 3, len, M.gun, f, y, side * (W / 2 + len / 2 - 2), g);
        const br = box(2, 2, len * .8, M.gun, f - 6, y - 1, side * (W / 2 + len * .4 - 2), g); br.rotation.y = side * .35;
        cyl(3, 3, 6, 8, M.dark, f, y, side * reach, g);
        const blade = mesh(sawG, sawM); blade.scale.set(R / 13, 1, R / 13); blade.position.set(f, y + 1, side * reach); g.add(blade); o.blades.push(blade);
      }
      break;
    }
    case 'plate': {
      for (const s of [-1, 1]) { box(L * .56, bh * .85, 1.4 + l * .4, M.steel, -L * .02, by, s * (W / 2 + .8), g); for (const x of [-L * .25, 0, L * .22]) box(1.2, 1.2, 1, M.dark, x, by + bh * .3, s * (W / 2 + 1.6 + l * .2), g) }
      break;
    }
    case 'skirts': {
      o.skirtGlow = [];
      for (const s of [-1, 1]) { box(L * .7, 2.4, 2, M.dark, 0, D.r * .9, s * (W / 2 + .6), g); const gl = mesh(new THREE.BoxGeometry(L * .66, .9, .7), new THREE.MeshBasicMaterial({ color: 0xff8a2a }), false); gl.position.set(0, D.r * .6, s * (W / 2 + 1.5)); g.add(gl); o.skirtGlow.push(gl) }
      break;
    }
    case 'slicks': for (const w of o.wheels) w.scale.z = 1 + .28 * l; break;
  }
  return g;
}
function syncParts(o, P) {
  const sig = SLOTS.map(s => G.build[s] ? G.build[s].id + G.build[s].lvl : '-').join('|') + P.car.id;
  if (o.partSig !== sig) {
    if (o.parts) { o.tilt.remove(o.parts); dispose(o.parts) }
    o.turret = null; o.blades = []; o.pipeGlow = null; o.skirtGlow = null;
    for (const w of o.wheels) w.scale.z = 1;
    const g = new THREE.Group();
    for (const s of SLOTS) { const b = G.build[s]; if (b) g.add(partMesh(o, b.id, b.lvl, P)) }
    o.tilt.add(g); o.parts = g; o.partSig = sig;
  }
  for (const b of o.blades) b.rotation.y += .5;
  const hot = G.drift.on, heat = G.drift.heat, hc = heat > .66 ? 0xff4a1a : heat > .33 ? 0xff8a2a : 0xffc04a;
  if (o.pipeGlow) for (const gl of o.pipeGlow) { gl.visible = hot; gl.scale.setScalar(.8 + Math.random() * .6) }
  if (o.skirtGlow) for (const gl of o.skirtGlow) gl.material.color.setHex(hot ? hc : 0x5a3a20);
}

// soft additive glow discs and thin rings, for spawn markers, telegraphs, fire and blast radii
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c) })();
const addMat = map => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const soft = pool(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), addMat(glowTex), 500);
const rings = pool(new THREE.RingGeometry(.88, 1, 48).rotateX(-Math.PI / 2), addMat(null), 120);
let fireDecal = null; // optional painted flame sprite (assets/fx/fire-trail.png)
export function initFx() {
  if (A.ui.jerrycan && !canSprites) {
    const tx = new THREE.TextureLoader().load(A.ui.jerrycan); tx.colorSpace = THREE.SRGBColorSpace;
    const mt = new THREE.SpriteMaterial({ map: tx, depthWrite: false });
    canSprites = Array.from({ length: 30 }, () => { const sp = new THREE.Sprite(mt); sp.scale.set(40, 40, 1); sp.visible = false; scene.add(sp); return sp });
  }
  if (A.fx.pad && !padDecal) { const tx = new THREE.Texture(A.fx.pad); tx.needsUpdate = true; tx.colorSpace = THREE.SRGBColorSpace;
    padDecal = new THREE.Mesh(new THREE.PlaneGeometry(PUMP_R * 2.3, PUMP_R * 2.3).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tx, transparent: true, depthWrite: false })); padDecal.position.y = .9; padDecal.receiveShadow = true; pumpG.add(padDecal); pumpG.getObjectByName('pad').visible = false }
  if (A.fx.fire && !fireDecal) { const tx = new THREE.Texture(A.fx.fire); tx.needsUpdate = true; tx.colorSpace = THREE.SRGBColorSpace;
    fireDecal = pool(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), addMat(tx), 300) } // additive: paint the flame on pure black
}
const eliteSaws = pool(sawG, sawM, 8); eliteSaws.castShadow = true;
let eliteSawN = 0;
// gas pump: a concrete pad (or a painted pad decal) with a red low-poly pump in the middle
const pumpG = new THREE.Group(); pumpG.visible = false; scene.add(pumpG);
{
  const pad = mesh(new THREE.CylinderGeometry(PUMP_R, PUMP_R, 1.2, 20), lam(0x8a857c), false); pad.position.y = .6; pad.name = 'pad'; pumpG.add(pad);
  const body = mesh(new THREE.BoxGeometry(14, 26, 11), lam(0xd23a2a)); body.position.y = 14; pumpG.add(body);
  const top = mesh(new THREE.BoxGeometry(15, 6, 12), lam(0xa82a20)); top.position.y = 29; pumpG.add(top);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(.6, 4, 7), new THREE.MeshBasicMaterial({ color: 0x7fdcaa })); screen.position.set(7.4, 20, 0); screen.name = 'screen'; pumpG.add(screen);
  const hose = mesh(new THREE.BoxGeometry(2, 18, 2), lam(0x1d1b1a)); hose.position.set(0, 12, 7); hose.rotation.x = .25; pumpG.add(hose);
  const noz = mesh(new THREE.BoxGeometry(3, 3, 6), lam(0x55585e)); noz.position.set(0, 20, 8.5); pumpG.add(noz);
  const base = mesh(new THREE.BoxGeometry(20, 2, 16), lam(0x8d9096)); base.position.y = 1.8; pumpG.add(base);
}
let padDecal = null;
const canPool = pool(new THREE.BoxGeometry(9, 12, 6), lam(0xd23a2a), 30); canPool.castShadow = true;
let canSprites = null; // painted jerrycan (assets/ui/jerrycan.png) as camera-facing sprites
function put(m, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, hexc) {
  dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix); if (hexc !== undefined) m.setColorAt(i, tmpC.setHex(hexc));
}
function streak(i, x1, y1, z1, x2, y2, z2, th, c) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) + .5;
  put(streaks, i, (x1 + x2) / 2, (z1 + z2) / 2, (y1 + y2) / 2, l, th, th, -Math.atan2(dy, dx), 0, c);
}
function finish(m, n) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true }

/* ---------- camera ---------- */
let camH = 1000;
function placeCamera(cx, cz, shake) {
  const asp = VW / VH, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camH = (asp > 1 ? 1180 : 820) / (2 * t * asp);
  const sx = shake ? rnd(-shake, shake) : 0, sz = shake ? rnd(-shake, shake) : 0;
  camera.position.set(cx + sx, camH, cz + camH * .34 + sz); camera.lookAt(cx + sx, 0, cz + sz);
  scene.fog.near = camH + 700; scene.fog.far = camH + 2800;
  sun.position.set(cx + SUN_OFF.x, SUN_OFF.y, cz + SUN_OFF.z); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
}

let texT = 0;
function syncGround(dt) {
  texT -= dt;
  if (G.groundDirty && texT <= 0) { groundTex.needsUpdate = true; G.groundDirty = false; texT = .25 } // ~4 uploads/s max
  if (obsBuilt !== G.obsVersion) buildObstacles();
}
let cheer = 0;
function animateCrowd(dt) {
  cheer = Math.max(cheer, G.cheer); G.cheer = 0; cheer = Math.max(0, cheer - dt * .8);
  const t = G.time;
  crowd.forEach((c, i) => {
    const j = Math.max(0, Math.sin(t * (6 + cheer * 6) + c.ph)) * (1 + cheer * 7);
    dummy.position.set(c.x, c.y + j, c.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); crowdMesh.setMatrixAt(i, dummy.matrix);
  });
  crowdMesh.instanceMatrix.needsUpdate = true;
}

function poseCar(o, x, y, a, lat, accel, sp, steer, dt, z = 0, pitch = 0) {
  o.root.position.set(x, z, y); o.root.rotation.y = -a;
  o.tilt.rotation.x += (clamp(-lat / 900, -.1, .1) - o.tilt.rotation.x) * Math.min(1, dt * 8);
  o.tilt.rotation.z += (clamp(-accel / 4000, -.05, .05) + pitch - o.tilt.rotation.z) * Math.min(1, dt * 10);
  for (const f of o.front) f.rotation.y = -steer * .45;
  for (const w of o.wheels) w.rotation.z -= sp * dt / o.r;
}

/* ---------- main render ---------- */
let lastFwd = 0;
export function render(dt) {
  syncGround(dt); animateCrowd(dt);
  const P = G.P;
  placeCamera(G.cam.x, G.cam.y, G.shake * .6);

  // player car
  if (P) {
    if (playerCarId !== P.car.id) { if (player) { scene.remove(player.root); dispose(player.root); player.partSig = null } player = buildCar({ ...P.car, kind: 'player' }); scene.add(player.root); playerCarId = P.car.id }
    const alive = ['play', 'clear', 'shop', 'pause'].includes(G.state);
    player.root.visible = alive && !(P.inv > 0 && Math.sin(G.time * 40) > 0);
    poseCar(player, P.x, P.y, P.a, P.air ? 0 : P.lat, P.air ? 0 : (P.fwd - lastFwd) / Math.max(dt, .001), P.fwd, P.steer, dt, P.z, P.pitch); lastFwd = P.fwd;
    syncParts(player, P);
    if (player.turret) player.turret.rotation.y = -(P.gunA - P.a);
    player.turret && (player.turret.visible = G.W.mg > 0);
    const dmg = 1 - P.hp / G.S.maxhp;
    player.body.color.copy(player.base).lerp(DARK, dmg * .45);
  }

  // enemies
  const seen = new Set();
  for (const e of G.enemies) {
    let o = active.get(e); if (!o) { o = acquire(e); active.set(e, o) }
    seen.add(e);
    poseCar(o, e.x, e.y, e.a, 0, 0, Math.hypot(e.vx, e.vy), 0, dt, e.z, e.pitch);
    o.body.color.copy(o.base).lerp(DARK, (1 - e.hp / e.max) * .55);
    o.body.emissive.setScalar(e.flash > 0 ? .9 : 0);
    if (o.turret) o.turret.rotation.y = -(Math.atan2(P.y - e.y, P.x - e.x) - e.a);
  }
  for (const [e, o] of active) if (!seen.has(e)) { release(o, e.type); active.delete(e) }

  // particles
  let nb = 0, ng = 0, ns = 0;
  for (const p of G.parts) {
    const t = p.life / p.max;
    if (p.k === 's') { if (ns < 1600) { const k = .035; streak(ns++, p.x, p.y, p.z, p.x - p.vx * k, p.y - p.vy * k, p.z - p.vz * k, 1.6, p.c) } continue }
    const s = p.glow ? p.size * Math.max(.05, t) : p.size * Math.min(1, t * 2.5);
    if (p.glow) { if (ng < 1200) put(glows, ng++, p.x, p.z, p.y, s, s, s, p.rot, p.rot * 1.3, p.c) }
    else if (nb < 1200) put(blobs, nb++, p.x, p.z, p.y, s, s, s, p.rot, p.rot * 1.3, p.c);
  }
  // exhaust fire trail: a painted flame sprite if provided, otherwise a soft orange glow with a small flicker
  let nsoft = 0, nring = 0, nfire = 0;
  for (const f of G.fires) {
    const t = f.life / f.max, fl = 1 + Math.sin(G.time * 22 + f.x) * .1, k = Math.min(1, t * 1.6);
    if (fireDecal) { if (nfire < 300) put(fireDecal, nfire++, f.x, .7, f.y, f.r * 2.4 * k, 1, f.r * 2.4 * k, f.rot) }
    else if (nsoft < 498) {
      put(soft, nsoft++, f.x, .7, f.y, f.r * 2.6 * k * fl, 1, f.r * 2.6 * k * fl, 0, 0, t > .5 ? 0x8a3a10 : 0x5a2208);
      if (ng < 1200 && Math.random() < .35) put(glows, ng++, f.x + rnd(-4, 4), 2 + (1 - t) * 6, f.y + rnd(-4, 4), 1.6 * k, 2.4 * k, 1.6 * k, G.time * 3, 0, 0xffa040);
    }
  }
  // mines: subtle dashed blast radius once armed
  for (const m of G.mines) {
    if (m.arm > 0) continue; const R = 90 + G.W.mines * 14, n = 20;
    for (let k = 0; k < n && ns < 1600; k++) { const a0 = k / n * TAU + G.time * .3, a1 = a0 + TAU / n * .5; streak(ns++, m.x + Math.cos(a0) * R, m.y + Math.sin(a0) * R, .8, m.x + Math.cos(a1) * R, m.y + Math.sin(a1) * R, .8, 1.3, 0xc8402a) }
  }
  // elite moves
  for (const e of G.enemies) {
    if (e.type === 'harvester') {
      for (const b of harvesterBlades(e)) {
        if (e.saw && e.saw.d > 2 && ns < 1600) streak(ns++, b.bx, b.by, 10, b.x, b.y, 10, 1.8, 0x3a3c40);
        put(eliteSaws, eliteSawN++, b.x, 10 + (e.z || 0), b.y, 17 / 13, 1, 17 / 13, G.time * 25);
      }
      if (e.saw && e.saw.st === 'wind' && nring < 120) { const fx = Math.cos(e.a), fy = Math.sin(e.a); for (const side of [-1, 1]) if (ns < 1600) { const bx = e.x + fx * e.len / 2 - fy * side * e.wid * .42, by = e.y + fy * e.len / 2 + fx * side * e.wid * .42; streak(ns++, bx, by, 1, bx + fx * 316, by + fy * 316, 1, 3, 0xff3a2a) } }
    }
    if (e.type === 'monster' && e.slam && e.air) {
      const p = .8 + .2 * Math.sin(G.time * 16);
      if (nring < 120) put(rings, nring++, e.slam.x, 1, e.slam.y, 150 * p, 1, 150 * p, 0, 0, 0xff3a2a);
      if (nsoft < 500) put(soft, nsoft++, e.slam.x, .9, e.slam.y, 320, 1, 320, 0, 0, 0x5a0d06);
    }
    if (e.type === 'tow') {
      const H = e.hook, fx = Math.cos(e.a), fy = Math.sin(e.a), tx = e.x - fx * e.len * .55, ty = e.y - fy * e.len * .55;
      const hx = H && H.st !== 'idle' ? H.x : tx, hy = H && H.st !== 'idle' ? H.y : ty, hz = H && H.st !== 'idle' ? 12 : 22;
      if (ns < 1600) streak(ns++, tx, ty, 36, hx, hy, hz, 1.5, 0x3a3c40);
      if (nb < 1200) put(blobs, nb++, hx, hz, hy, 4.5, 4.5, 4.5, G.time * 4, 0, 0x55585e);
    }
  }
  for (const b of G.ebul) if (ng < 1200) put(glows, ng++, b.x, 14, b.y, 5.5, 5.5, 5.5, G.time * 5, G.time * 4, 0xb8ff70);
  for (const m of G.mines) if (ng < 1200) put(glows, ng++, m.x, 5.5, m.y, 2.6, 2.6, 2.6, 0, 0, m.arm > 0 ? 0x888888 : (Math.sin(m.t * 10) > 0 ? 0xff3a2a : 0x6a1a10));
  for (const b of G.bullets) if (ns < 1600) streak(ns++, b.x, b.y, 16, b.x - b.vx * .018, b.y - b.vy * .018, 16, 2.4, 0xffe9a0);
  for (const z of G.zaps) {
    let px = z.x1, py = z.y1;
    for (let i = 1; i <= 6 && ns < 1600; i++) {
      const t = i / 6, nx = i === 6 ? z.x2 : z.x1 + (z.x2 - z.x1) * t + rnd(-10, 10), ny = i === 6 ? z.y2 : z.y1 + (z.y2 - z.y1) * t + rnd(-10, 10);
      streak(ns++, px, py, 18, nx, ny, 18, 2.6, 0xbfe8ff); px = nx; py = ny;
    }
  }
  // gas pump: zone ring, fill progress ring, and the reserve shown by the screen colour
  const pu = G.pump; pumpG.visible = !!pu;
  if (pu) {
    pumpG.position.set(pu.x, 0, pu.y);
    const pulse = 1 + Math.sin(G.time * 4) * .03;
    if (nring < 118) {
      put(rings, nring++, pu.x, 1.4, pu.y, PUMP_R * pulse, 1, PUMP_R * pulse, 0, 0, G.filling ? 0x7fdcaa : 0xffc23d);
      if (pu.acc > .05) { const k = Math.min(1, pu.acc / PUMP_TICK); put(rings, nring++, pu.x, 1.5, pu.y, PUMP_R * k, 1, PUMP_R * k, 0, 0, 0x7fdcaa) }
    }
    if (nsoft < 500) put(soft, nsoft++, pu.x, 1.2, pu.y, PUMP_R * 2.4, 1, PUMP_R * 2.4, 0, 0, G.filling ? 0x0e2e1c : 0x241a04);
    pumpG.getObjectByName('screen').material.color.setHex(pu.res > PUMP_RESERVE * .5 ? 0x7fdcaa : pu.res > PUMP_RESERVE * .2 ? 0xffc23d : 0xff4a30);
  }
  // jerrycans dropped by fuel thieves
  let ncan = 0;
  for (const c of G.cans) {
    if (ncan >= 30) break;
    const bob = 8 + Math.sin(G.time * 4 + c.x) * 2;
    if (canSprites) { canSprites[ncan].visible = true; canSprites[ncan].position.set(c.x, bob + 10, c.y); ncan++ }
    else put(canPool, ncan++, c.x, bob, c.y, 1, 1, 1, G.time * 2 + c.x);
    if (nring < 120) put(rings, nring++, c.x, 1.2, c.y, 22 + Math.sin(G.time * 6) * 3, 1, 22 + Math.sin(G.time * 6) * 3, 0, 0, 0x7fdcaa);
  }
  if (canSprites) { for (let k = ncan; k < 30; k++) canSprites[k].visible = false; finish(canPool, 0) } else finish(canPool, ncan);
  // spawn markers: red X, a ring that tightens as the car is about to appear, and a red glow
  for (const s of G.pend) {
    const pulse = .75 + .25 * Math.abs(Math.sin(G.time * 10)), base = s.elite ? 38 : 16, r = base * pulse, k = s.t / s.max;
    if (ns < 1598) { streak(ns++, s.x - r, s.y - r, 1, s.x + r, s.y + r, 1, 4, 0xff4a30); streak(ns++, s.x + r, s.y - r, 1, s.x - r, s.y + r, 1, 4, 0xff4a30) }
    if (nring < 119) { put(rings, nring++, s.x, 1.1, s.y, base * (1.6 + k * 1.4), 1, base * (1.6 + k * 1.4), 0, 0, 0xff3a2a); put(rings, nring++, s.x, 1.1, s.y, base * 1.5, 1, base * 1.5, 0, 0, 0x7a160c) }
    if (nsoft < 500) put(soft, nsoft++, s.x, 1, s.y, base * 5.5 * pulse, 1, base * 5.5 * pulse, 0, 0, 0x7a1408);
  }
  // underglow while drifting, from yellow to red as the heat builds
  if (P && G.drift.on && ng < 1200 && !P.air) {
    const h = G.drift.heat, c = h > .66 ? 0xff4a1a : h > .33 ? 0xff8a2a : 0xffc04a, pulse = 1 + Math.sin(G.time * 18) * .08;
    put(glows, ng++, P.x, .8 + P.z, P.y, P.len * .62 * pulse, .3, P.wid * .95 * pulse, -P.a, 0, c);
  }
  finish(blobs, nb); finish(glows, ng); finish(streaks, ns); finish(soft, nsoft); finish(rings, nring); finish(eliteSaws, eliteSawN); eliteSawN = 0;
  if (fireDecal) finish(fireDecal, nfire);

  let nsc = 0;
  for (const s of G.scraps) if (nsc < 400) put(scrapPool, nsc++, s.x, 4 + Math.sin(G.time * 4 + s.x) * 1.5, s.y, 1, 1, 1, G.time * 3 + s.x, .5, s.v > 1 ? 0xffc23d : 0xb9bcc0);
  finish(scrapPool, nsc);
  let nm = 0; for (const m of G.mines) put(minePool, nm++, m.x, 2, m.y, 1, 1, 1); finish(minePool, nm);

  renderer.render(scene, camera);
}

/* ---------- menu backdrop: cars circling the arena ---------- */
const demo = [];
let demoT = 0;
export function attract(dt) {
  demoT += dt; G.time += dt;
  syncGround(dt); animateCrowd(dt);
  for (const [e, o] of active) release(o, e.type); active.clear();
  if (player) player.root.visible = false;
  if (!demo.length) for (let i = 0; i < 6; i++) { const o = buildCar({ len: 46, wid: 24, color: i ? ECOL[(i * 2) % ECOL.length] : '#e8553a', kind: i ? 'rust' : 'player' }); scene.add(o.root); demo.push(o) }
  demo.forEach((o, i) => {
    const a = demoT * .45 + i * TAU / 6, x = AW / 2 + Math.cos(a) * 520, y = AH / 2 + Math.sin(a) * 330;
    const head = a + Math.PI / 2 + .55;
    o.root.visible = true; poseCar(o, x, y, head, 280, 0, 280, -.6, dt);
    if (Math.random() < .35) G.parts.push({ x: x - Math.cos(head) * 16, y: y - Math.sin(head) * 16, z: 4, vx: rnd(-20, 20), vy: rnd(-20, 20), vz: rnd(5, 20), life: .9, max: .9, size: rnd(3, 5), c: 0xdccbad, glow: false, grow: 9, drag: 1.5, k: 'b', grav: 0, rot: rnd(0, 6) });
  });
  for (const p of G.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += p.grow * dt }
  G.parts = G.parts.filter(p => p.life > 0);
  const ca = demoT * .05;
  placeCamera(AW / 2 + Math.cos(ca) * 120, AH / 2 + Math.sin(ca) * 80, 0);
  let nb = 0; for (const p of G.parts) { const s = p.size * Math.min(1, p.life / p.max * 2.5); put(blobs, nb++, p.x, p.z, p.y, s, s, s, p.rot, p.rot, p.c) }
  finish(blobs, nb); finish(glows, 0); finish(streaks, 0); finish(scrapPool, 0); finish(minePool, 0); finish(canPool, 0); if (canSprites) for (const sp of canSprites) sp.visible = false; pumpG.visible = false; finish(soft, 0); finish(rings, 0); finish(eliteSaws, 0); if (fireDecal) finish(fireDecal, 0);
  renderer.render(scene, camera);
}
export function hideDemo() { for (const o of demo) o.root.visible = false; G.parts = [] }

/* ---------- utilities for the UI ---------- */
const v3 = new THREE.Vector3();
export function project(x, y, z) { v3.set(x, z, y).project(camera); return { x: (v3.x + 1) / 2 * VW, y: (1 - v3.y) / 2 * VH, ok: v3.z < 1 } }

// Renders a 3/4 studio shot of each car for the garage cards.
export function portraits(cars) {
  const w = 480, h = 260;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(w, h, false); r.setPixelRatio(1); r.shadowMap.enabled = true;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xeef6ff, 0x7a8f55, 1.8));
  const l = new THREE.DirectionalLight(0xfff0d6, 2.6); l.position.set(-60, 140, 80); l.castShadow = true;
  Object.assign(l.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80 }); sc.add(l);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(58, 62, 6, 12), lam(0xc8a476)); pad.position.y = -3; pad.receiveShadow = true; sc.add(pad);
  const cam = new THREE.PerspectiveCamera(30, w / h, 1, 1000); cam.position.set(95, 75, 125); cam.lookAt(0, 8, 0);
  const out = cars.map(c => {
    const o = buildCar({ ...c, kind: 'player' }); o.root.rotation.y = .5; sc.add(o.root);
    const s = 52 / c.len; o.root.scale.setScalar(s);
    r.render(sc, cam); const url = r.domElement.toDataURL('image/png'); sc.remove(o.root); dispose(o.root); return url;
  });
  r.dispose(); r.forceContextLoss && r.forceContextLoss();
  return out;
}
