// Low-poly three.js renderer. Reads the simulation state (G) and draws it.
// Sim (x, y) maps to world (x, z); y is up.
import * as THREE from 'three';
import { G, OPTS, AW, AH, EDGE, GATE, gateOpen, CRANE, ground, composeGround, TAU, rnd, clamp, sawLayout, harvesterBlades, PUMP_R, PUMP_RESERVE, PUMP_WARN, canZ } from './game.js';
import { A } from './assets.js';
import { t } from './i18n.js';
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
    const flat = (Math.abs(x - GATE.x) < 190 && z > AH && z < AH + GATE.drive + 260) || (x < 60 && z < 60 && x > -420 && z > -420); // driveway and crane pad
    pos.setY(i, out < 110 || flat ? -3 : Math.min(140, (out - 110) * .06 * (1.2 + n * .4)) + ((x * 13 + z * 7) % 9));
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
  for (let x = EDGE / 2; x < AW; x += 34) { spots.push([x, EDGE / 2]); if (Math.abs(x - GATE.x) > GATE.w / 2 + 6) spots.push([x, AH - EDGE / 2]) } // gap for the pit gate
  for (let y = EDGE / 2 + 34; y < AH - 20; y += 34) spots.push([EDGE / 2, y], [AW - EDGE / 2, y]);
  // mostly two high, now and then a taller stack, and a tyre stood on its tread leaning on the outside of the wall
  const plan = spots.map(([x, z]) => ({ x, z, h: Math.random() < .16 ? 3 + (Math.random() < .4 ? 1 : 0) : 2, lean: Math.random() < .08 }));
  const total = plan.reduce((n, p) => n + p.h + (p.lean ? 1 : 0), 0);
  const im = new THREE.InstancedMesh(tireGeo, lam(0xffffff), total);
  im.castShadow = im.receiveShadow = true;
  let i = 0;
  const lean = new THREE.Object3D(); lean.rotation.order = 'YXZ';
  for (const p of plan) {
    const k = Math.round(p.x / 34 + p.z / 34);
    for (let l = 0; l < p.h; l++) {
      dummy.position.set(p.x, 5.5 + l * 11, p.z); dummy.rotation.set(0, rnd(0, TAU), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i++, tmpC.setHex(l === p.h - 1 && (k % 4 === 0 || p.h > 2) ? (k % 8 === 0 ? 0xe24a32 : 0xf2ede2) : 0x2a2826));
    }
    if (p.lean) { // outside the arena, so it never sits in the driving line
      const ox = p.z < EDGE ? 0 : p.z > AH - EDGE ? 0 : p.x < AW / 2 ? -1 : 1, oz = p.z < EDGE ? -1 : p.z > AH - EDGE ? 1 : 0;
      lean.position.set(p.x + ox * 20, 15, p.z + oz * 20); lean.rotation.set(Math.PI / 2 - .3, Math.atan2(ox, oz), 0); lean.scale.setScalar(1); lean.updateMatrix();
      im.setMatrixAt(i, lean.matrix); im.setColorAt(i++, tmpC.setHex(Math.random() < .3 ? 0xe24a32 : 0x2a2826));
    }
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
  const nearCrane = (x, z) => x < -40 && z < -40 && x > -380 && z > -380;
  const nearGate = (x, z) => z > AH - 40 && z < AH + GATE.drive + 200 && Math.abs(x - GATE.x) < 280;
  const nearStand = (x, z) => nearGate(x, z) || nearCrane(x, z) || (z < 0 && z > -260 && ((x > AW * .3 - 230 && x < AW * .3 + 230) || (x > AW * .7 - 230 && x < AW * .7 + 230))) || (z > AH && z < AH + 260 && x > AW * .5 - 230 && x < AW * .5 + 230);
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
  const crushed = new THREE.InstancedMesh(new THREE.BoxGeometry(48, 14, 26), lam(0xffffff), 3 * 14);
  crushed.castShadow = crushed.receiveShadow = true; let i = 0;
  for (const [cx, cz] of [[AW + 150, -150], [-150, AH + 150], [AW + 150, AH + 150]]) { // top-left corner holds the crane
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

// wrecking-ball crane: a crawler crane outside the top-left corner (rusty tracks, a cream cab with a red
// counterweight, a dark lattice boom). The whole upper half slews; the boom reaches out to the swing radius
// with its tip TIP_Y up, and the iron ball hangs from the tip on a cable.
const craneG = new THREE.Group(); craneG.position.set(CRANE.x, 0, CRANE.y); scene.add(craneG);
const TIP_Y = 250, upper = new THREE.Group(), boomG = new THREE.Group(), ballG = new THREE.Group();
{
  const cream = lam(0xe8c27a), rustT = lam(0x6a3a22), dark = lam(0x3a3a38), red = lam(0xb8402a), steel = lam(0x5d6064), boomM = lam(0x4a4a46);
  // tracks and undercarriage, angled toward the arena
  const under = new THREE.Group(); under.rotation.y = -Math.PI / 4; craneG.add(under);
  for (const z of [-34, 34]) {
    const tr = mesh(new THREE.BoxGeometry(150, 22, 22), rustT); tr.position.set(0, 11, z); under.add(tr);
    for (let x = -60; x <= 60; x += 20) { const w = mesh(new THREE.CylinderGeometry(8, 8, 23, 8), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 11, z); under.add(w) }
    for (let x = -70; x <= 70; x += 10) { const pad = mesh(new THREE.BoxGeometry(5, 2, 24), dark, false); pad.position.set(x, 23, z); under.add(pad) }
  }
  const frame = mesh(new THREE.BoxGeometry(110, 10, 50), steel); frame.position.y = 22; under.add(frame);
  // upper works: cab, engine house, counterweight, A-frame
  upper.position.y = 28; craneG.add(upper);
  const house = mesh(new THREE.BoxGeometry(110, 46, 56), cream); house.position.set(-10, 23, 0); upper.add(house);
  const roofH = mesh(new THREE.BoxGeometry(112, 4, 58), lam(0xc99a52)); roofH.position.set(-10, 48, 0); upper.add(roofH);
  const cab = mesh(new THREE.BoxGeometry(34, 40, 24), cream); cab.position.set(52, 20, -18); upper.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2, 22, 20), lam(0x2e5468)); glass.position.set(69.5, 24, -18); upper.add(glass);
  for (let i = 0; i < 4; i++) { const wdw = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 1), lam(0x2e5468)); wdw.position.set(-50 + i * 24, 30, 28.6); upper.add(wdw) }
  const cw = mesh(new THREE.BoxGeometry(30, 44, 60), red); cw.position.set(-78, 22, 0); upper.add(cw);
  for (const y of [12, 32]) { const band = mesh(new THREE.BoxGeometry(31, 4, 61), lam(0xe8c27a), false); band.position.set(-78, y, 0); upper.add(band) }
  const aFrame = mesh(new THREE.BoxGeometry(8, 40, 40), dark); aFrame.position.set(10, 66, 0); aFrame.rotation.z = -.25; upper.add(aFrame);
  const drum = mesh(new THREE.CylinderGeometry(9, 9, 30, 10), steel); drum.rotation.x = Math.PI / 2; drum.position.set(0, 56, 0); upper.add(drum);
  // lattice boom, built 1 unit long along +x and scaled to the reach each frame
  boomG.position.set(40, 30, 0); upper.add(boomG);
  const unitBoom = new THREE.Group(); unitBoom.name = 'unitBoom'; boomG.add(unitBoom);
  for (const z of [-9, 9]) for (const y of [-5, 5]) { const ch = mesh(new THREE.BoxGeometry(1, 3, 3), boomM); ch.position.set(.5, y, z); unitBoom.add(ch) }
  for (let i = 1; i < 24; i++) { const br = mesh(new THREE.BoxGeometry(.004, 2, 20), boomM, false); br.position.set(i / 24, 0, 0); br.rotation.x = i % 2 ? .45 : -.45; unitBoom.add(br) }
  const pend = mesh(new THREE.CylinderGeometry(.8, .8, 1, 4), dark, false); pend.name = 'pendant'; upper.add(pend);
  const sheave = mesh(new THREE.CylinderGeometry(7, 7, 14, 8), steel); sheave.rotation.x = Math.PI / 2; sheave.name = 'sheave'; scene.add(sheave);
  const hookB = mesh(new THREE.BoxGeometry(10, 12, 8), lam(0xffc23d)); hookB.name = 'hookBlock'; scene.add(hookB);
  const cable = mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 5), dark, false); cable.name = 'cable'; ballG.add(cable);
  const ball = mesh(new THREE.IcosahedronGeometry(CRANE.ball, 1), new THREE.MeshLambertMaterial({ color: 0x3a3c40, flatShading: true })); ball.name = 'ball'; ballG.add(ball);
  const ring = mesh(new THREE.TorusGeometry(8, 2.5, 4, 8), dark); ring.position.y = CRANE.ball + 6; ring.name = 'eye'; ball.add(ring);
  scene.add(ballG);
}
// pit entry: a concrete driveway from a garage shed, through two hazard-striped gate doors in the tyre wall.
// Optional art: assets/pit/gate.png (one door leaf, front view) and assets/pit/driveway.jpg (tileable, top view).
const pitG = new THREE.Group(); scene.add(pitG); const gateDoors = [];
function stripeTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
function buildPit() {
  const X = GATE.x, W = GATE.w, top = AH;
  const D = GATE.drive;
  // a muddy, scrappy track: ruts, puddles, gravel, oil and bits of junk (or the painted assets/pit/driveway.jpg)
  const drTex = A.pit && A.pit.driveway ? (() => { const t = new THREE.Texture(A.pit.driveway); t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t })()
    : stripeTex(256, 1024, (c, w, h) => {
      c.fillStyle = '#7a5a3c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40; const gr = c.createRadialGradient(x, y, 0, x, y, r); const col = Math.random() < .5 ? '70,50,32' : '150,120,86'; gr.addColorStop(0, `rgba(${col},.45)`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2) }
      for (const rx of [w * .3, w * .7]) { c.strokeStyle = 'rgba(52,36,22,.65)'; c.lineWidth = 22; c.beginPath(); c.moveTo(rx, 0); for (let y = 0; y <= h; y += 32) c.lineTo(rx + Math.sin(y * .02) * 8, y); c.stroke();
        c.strokeStyle = 'rgba(30,20,12,.35)'; c.lineWidth = 3; c.setLineDash([6, 8]); c.beginPath(); c.moveTo(rx - 6, 0); c.lineTo(rx - 6, h); c.moveTo(rx + 6, 0); c.lineTo(rx + 6, h); c.stroke(); c.setLineDash([]) }
      for (let i = 0; i < 6; i++) { const x = 40 + Math.random() * (w - 80), y = Math.random() * h; c.fillStyle = 'rgba(70,84,92,.75)'; c.beginPath(); c.ellipse(x, y, 20 + Math.random() * 26, 9 + Math.random() * 10, Math.random(), 0, 7); c.fill(); c.fillStyle = 'rgba(200,215,225,.35)'; c.beginPath(); c.ellipse(x - 5, y - 3, 8, 3, .3, 0, 7); c.fill() }
      for (let i = 0; i < 700; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(160,150,135,.6)' : 'rgba(50,40,30,.5)'; c.fillRect(Math.random() * w, Math.random() * h, 3, 3) }
      for (let i = 0; i < 14; i++) { c.save(); c.translate(Math.random() * w, Math.random() * h); c.rotate(Math.random() * 3); c.fillStyle = ['#6b6e72', '#8a4a2a', '#4a4c50'][i % 3]; c.fillRect(-6, -3, 12 + Math.random() * 8, 5); c.restore() }
      for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(15,12,10,.5)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 14, 8, Math.random(), 0, 7); c.fill() }
    });
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: drTex })); drive.position.set(X, .8, top + D / 2); drive.receiveShadow = true; pitG.add(drive);
  // tyres lining both sides of the driveway (one instanced mesh), with a few junk crates and oil drums
  const side = [];
  for (let y = top + 30; y < top + D - 60; y += 26) for (const sx of [-1, 1]) side.push([X + sx * (W / 2 + 26), y]);
  const tm = new THREE.InstancedMesh(tireGeo, lam(0xffffff), side.length * 2); tm.castShadow = tm.receiveShadow = true; let ti = 0;
  for (const [x, z] of side) { const hh = Math.random() < .25 ? 2 : 1; for (let l = 0; l < hh; l++) { dummy.position.set(x + rnd(-3, 3), 5.5 + l * 11, z); dummy.rotation.set(0, rnd(0, 6), 0); dummy.scale.setScalar(.85); dummy.updateMatrix(); tm.setMatrixAt(ti, dummy.matrix); tm.setColorAt(ti++, tmpC.setHex(Math.random() < .15 ? 0xe24a32 : Math.random() < .12 ? 0xf2ede2 : 0x2a2826)) } }
  tm.count = ti; pitG.add(tm);
  for (let i = 0; i < 6; i++) { const sx = i % 2 ? 1 : -1, y = top + 90 + i * 100 + rnd(-20, 20);
    if (i % 3 === 0) { const dr = mesh(new THREE.CylinderGeometry(9, 9, 24, 10), lam([0x2f6a9a, 0xb8402a, 0x5a6a3a][i % 3])); dr.position.set(X + sx * (W / 2 + 60), 12, y); pitG.add(dr) }
    else { const cr = mesh(new THREE.BoxGeometry(26, 18, 22), lam(0x8a5a32)); cr.position.set(X + sx * (W / 2 + 62), 9, y); cr.rotation.y = rnd(-.4, .4); pitG.add(cr) } }
  // posts with red/white bands
  for (const sx of [-1, 1]) {
    const post = mesh(new THREE.BoxGeometry(16, 44, 16), lam(0xd8d2c4)); post.position.set(X + sx * (W / 2 + 6), 22, top - EDGE / 2); pitG.add(post);
    for (const y of [10, 30]) { const band = mesh(new THREE.BoxGeometry(17, 7, 17), lam(0xe24a32), false); band.position.set(X + sx * (W / 2 + 6), y, top - EDGE / 2); pitG.add(band) }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), new THREE.MeshBasicMaterial({ color: 0xffa020 })); lamp.position.set(X + sx * (W / 2 + 6), 47, top - EDGE / 2); lamp.name = 'lamp'; pitG.add(lamp);
  }
  // two door leaves hinged on the posts; they swing outwards (toward the driveway)
  const gTex = A.pit && A.pit.gate ? (() => { const t = new THREE.Texture(A.pit.gate); t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; return t })()
    : stripeTex(256, 128, (c, w, h) => { c.fillStyle = '#ffc23d'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d1b1a'; for (let x = -h; x < w; x += 48) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, h); c.lineTo(x + 24 + h, 0); c.lineTo(x + h, 0); c.fill() } c.strokeStyle = '#55514b'; c.lineWidth = 14; c.strokeRect(0, 0, w, h); c.fillStyle = '#8a857c'; for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill() } });
  const dm = new THREE.MeshLambertMaterial({ map: gTex }), dEnd = lam(0x55514b);
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(X + sx * W / 2, 0, top - EDGE / 2); pitG.add(hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(W / 2, 30, 4), [dEnd, dEnd, dEnd, dEnd, dm, dm]); leaf.position.set(-sx * W / 4, 16, 0); leaf.castShadow = true; hinge.add(leaf);
    gateDoors.push({ hinge, sx });
  }
  // the garage shed at the end of the driveway, roll-up door open toward the arena
  const sy = top + D + 50, shed = new THREE.Group(); shed.position.set(X, 0, sy); pitG.add(shed);
  const wallM = lam(0x9a6a48), roofM2 = lam(0x5d6064);
  for (const sx of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(50, 70, 120), wallM); w.position.set(sx * (W / 2 + 25), 35, 0); shed.add(w) }
  const back = mesh(new THREE.BoxGeometry(W + 100, 70, 14), wallM); back.position.set(0, 35, 55); shed.add(back);
  const lintel = mesh(new THREE.BoxGeometry(W + 100, 18, 14), wallM); lintel.position.set(0, 61, -55); shed.add(lintel);
  const roofS = mesh(new THREE.BoxGeometry(W + 120, 8, 140), roofM2); roofS.position.set(0, 74, 0); roofS.rotation.x = -.06; shed.add(roofS);
  const signTex = stripeTex(256, 64, (c, w, h) => { c.fillStyle = '#e8553a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '800 40px Rubik, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t('pitSign'), w / 2, h / 2 + 2) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(110, 28), new THREE.MeshBasicMaterial({ map: signTex })); sign.rotation.x = -Math.PI / 2 + .9; sign.rotation.y = Math.PI; sign.position.set(0, 84, -60); shed.add(sign);
  const inside = mesh(new THREE.BoxGeometry(W, 2, 110), lam(0x3a3835), false); inside.position.set(0, .6, 0); shed.add(inside);
}
// bake all static scenery (stands, trees, rocks, poles, flags) into two meshes
{ STATIC.updateMatrixWorld(true); const ms = []; STATIC.traverse(m => { if (m.isMesh) ms.push(m) }); mergeInto(STATIC, ms, m => m.matrixWorld, VC_LIT2) }

/* ---------- obstacles (rebuilt each run) ---------- */
const obsGroup = new THREE.Group(); scene.add(obsGroup);
let obsBuilt = -1;
const tireM = keep(lam(0x2a2826)), tireWhite = keep(lam(0xf2ede2)), tireRed = keep(lam(0xe24a32)), hayM = keep(lam(0xe2bf62)), hayTop = keep(lam(0xedd283));
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
// Painted hay bales (assets/obstacles/hay-side.jpg + hay-top.png): one instanced, textured mesh
// kept outside the vertex-coloured batch. Without the art the bales are plain flat-shaded cylinders.
let hayMats = null, hayInst = null;
const hayArt = () => A.obs && A.obs.side && A.obs.top;
function buildHay() {
  if (hayInst) { scene.remove(hayInst); hayInst.geometry.dispose(); hayInst.dispose(); hayInst = null }
  const bales = G.obs.filter(o => o.k === 'hay'); if (!hayArt() || !bales.length) return;
  if (!hayMats) {
    const tex = (img, rep) => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); t.needsUpdate = true; return t };
    hayMats = [new THREE.MeshLambertMaterial({ map: tex(A.obs.side, 3) }), new THREE.MeshLambertMaterial({ map: tex(A.obs.top, 1) }), new THREE.MeshLambertMaterial({ map: tex(A.obs.top, 1) })];
  }
  hayInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 28, 18), hayMats, bales.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  bales.forEach((o, i) => { q.setFromAxisAngle(up, (o.x * 7.3 + o.y) % 6.28); m.compose(new THREE.Vector3(o.x, 14, o.y), q, new THREE.Vector3(o.r, 1, o.r)); hayInst.setMatrixAt(i, m) });
  hayInst.castShadow = hayInst.receiveShadow = true; scene.add(hayInst);
}
function buildObstacles() {
  dispose(obsGroup); obsGroup.clear();
  for (const o of G.obs) {
    if (o.k === 'rt') { // ramp barrier: one stack of two tyres, the top one red or white
      const s = o.r / 14;
      for (let l = 0; l < 2; l++) { const t = mesh(tireGeo, l ? ((o.x + o.y) % 3 < 1 ? tireRed : tireM) : tireM); t.scale.setScalar(s); t.position.set(o.x, 5.5 * s + l * 11 * s, o.y); obsGroup.add(t) }
      continue;
    }
    if (o.k === 'tire') { // tyre piles: a few tall stacks side by side (black, red or white), sometimes tyres stood on their tread leaning against them
      const sd = o.x * 13.7 + o.y, rr = k => (Math.sin(sd * 1.31 + k * 91.3) + 1) / 2, s = .68, TH = 11 * s, TR = 16.5 * s;
      const mat = k => { const v = rr(k); return v < .62 ? tireM : v < .82 ? tireRed : tireWhite };
      const flat = (x, y, z, m, yaw) => { const t = mesh(tireGeo, m); t.scale.setScalar(s); t.position.set(x, y, z); t.rotation.y = yaw; obsGroup.add(t) };
      const upright = (x, z, yaw, lean, m) => { const t = mesh(tireGeo, m); t.scale.setScalar(s); t.rotation.set(Math.PI / 2 + lean, yaw, 0, 'YXZ'); t.position.set(x, TR * Math.cos(lean) + .5, z); obsGroup.add(t) };
      const nStacks = 2 + Math.floor(rr(1) * 3.99), spread = Math.min(o.r * .55, 8 + nStacks * 6), stacks = [];
      for (let i = 0; i < nStacks; i++) { const a = i / nStacks * TAU + rr(2) * 6, d = nStacks === 1 ? 0 : spread * (.75 + rr(i + 3) * .3); stacks.push([o.x + Math.cos(a) * d, o.y + Math.sin(a) * d]) }
      stacks.forEach(([x, z], i) => {
        const h = 3 + Math.floor(rr(i + 10) * 4), m = mat(i + 20), banded = rr(i + 30) < .3;
        for (let l = 0; l < h; l++) flat(x + (rr(i * 7 + l) - .5) * 2.4, 5.5 * s + l * TH, z + (rr(i * 5 + l + 40) - .5) * 2.4, banded && l % 2 ? (m === tireM ? tireRed : tireM) : m, rr(l + i) * 3);
      });
      if (o.v % 2 === 0) { // one or two tyres stood up on their tread, leaning on the pile
        const n = 1 + (o.v === 4 ? 1 : 0);
        for (let k = 0; k < n; k++) { const a = rr(50 + k) * TAU, d = spread + TR * .9; upright(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, -a + Math.PI / 2, -.28, mat(60 + k)) }
      }
    } else if (!hayArt()) {
      const b = mesh(new THREE.CylinderGeometry(o.r, o.r, 28, 10), [hayM, hayTop, hayTop]); b.position.set(o.x, 14, o.y); b.rotation.y = rnd(0, 3); obsGroup.add(b);
    }
  }
  for (const r of G.ramps) obsGroup.add(buildRamp(r));
  buildHay();
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

// Painted skins (assets/skins/<id>-top.png + <id>-side.png): the top image covers the car's roof, the side image
// both flanks (body and cabin, transparent outside the car). Front of the car = right edge of both images.
const skinTex = {};
function skinFor(key) {
  const sk = A.skins && A.skins[key]; if (!sk) return null;
  if (!skinTex[key]) { const tx = img => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; t.userData.keep = true; return t }; skinTex[key] = { top: tx(sk.top), side: tx(sk.side) } }
  return skinTex[key];
}
export function buildCar({ id, len: L, wid: W, color, kind, shape }) {
  shape = shape || { cabL: .42, cabX: -.1, cabH: .36 };
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const sk = skinFor(kind === 'player' ? id : kind);
  if (sk) color = '#ffffff'; // the paint comes from the skin; tinting (damage, hit flash) multiplies it
  const body = sk ? new THREE.MeshLambertMaterial({ map: sk.top }) : lam(color), roof = lam(new THREE.Color(color).multiplyScalar(.82));
  const r = kind === 'monster' ? W * .42 : W * .22, bh = W * .4, by = (kind === 'monster' ? r * 1.5 : r * .9) + bh / 2;
  const cabH = W * shape.cabH, cabL = L * shape.cabL, roofX = L * shape.cabX - cabL * .12;
  if (sk) {
    // one full-height block (body + cabin): the top image covers its roof, the side image both flanks (with windows,
    // cut-out arches show the wheels). Width follows the painting's proportions, within reason.
    W = clamp(L / (sk.top.image.width / sk.top.image.height), W * .75, W * 1.05);
    const H = bh + cabH, sideM = new THREE.MeshLambertMaterial({ map: sk.side, alphaTest: .45 }); sideM.color = body.color; sideM.emissive = body.emissive;
    body.alphaTest = .45; body.needsUpdate = true;
    const endM = lam(0x3a3835);
    const b = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), [endM, endM, body, endM, sideM, sideM]); b.position.y = by - bh / 2 + H / 2; b.castShadow = b.receiveShadow = true; b.userData.skin = true; tilt.add(b);
  } else {
    const b = mesh(new THREE.BoxGeometry(L, bh, W), body); b.position.y = by; tilt.add(b);
    // hood slope: a thin wedge-ish top plate in body colour
    const hood = mesh(new THREE.BoxGeometry(L * .28, bh * .2, W * .86), body); hood.position.set(L * .3, by + bh * .55, 0); tilt.add(hood);
  }
  // glass cabin with a painted roof plate set back, so the windshield shows from above
  if (!sk) {
    const cab = mesh(new THREE.BoxGeometry(cabL, cabH, W * .84), glassM);
    cab.position.set(L * shape.cabX, by + bh / 2 + cabH / 2, 0); tilt.add(cab);
    const roofP = mesh(new THREE.BoxGeometry(cabL * .62, 1.4, W * .8), roof); roofP.position.set(roofX, by + bh / 2 + cabH + .5, 0); tilt.add(roofP);
    const roundel = mesh(new THREE.CylinderGeometry(W * .17, W * .17, .6, 10), whiteM, false); roundel.position.set(L * .32, by + bh / 2 + bh * .12, 0); tilt.add(roundel);
  }
  if (!sk) for (const s of [1, -1]) { // bumpers and lights (painted in on skinned cars)
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
  // enemy looks follow the portraits in assets/elites: one beat-up 80s sedan, rusty roof rack,
  // rust on the arches; the wrecker gets a primer door, the spitter primer patches, the brute chevrons and plates
  const roofY = by + bh / 2 + cabH;
  const rustM = lam(0x9a4a22), rackM = lam(0xa0522d);
  if (!sk && (kind === 'rust' || kind === 'spit' || kind === 'brute')) {
    for (const z of [-1, 1]) { const rl = mesh(new THREE.BoxGeometry(cabL * .78, 1.6, 1.6), rackM); rl.position.set(roofX, roofY + 3.2, z * W * .36); tilt.add(rl) }
    for (const u of [-.32, 0, .32]) { const cb = mesh(new THREE.BoxGeometry(1.6, 1.6, W * .74), rackM); cb.position.set(roofX + u * cabL * .78, roofY + 3.2, 0); tilt.add(cb) }
    for (const sx of [1, -1]) for (const z of [-1, 1]) { const ar = mesh(new THREE.BoxGeometry(L * .16, bh * .5, 1.2), rustM, false); ar.position.set(sx * L * .3, by - bh * .1, z * (W / 2 + .4)); tilt.add(ar) }
    const hr = mesh(new THREE.BoxGeometry(L * .1, .8, W * .22), rustM, false); hr.position.set(L * .4, by + bh / 2 + .3, -W * .28); tilt.add(hr);
  }
  if (!sk && kind === 'rust') { const door = mesh(new THREE.BoxGeometry(L * .2, bh * .8, .8), lam(0xbfc2c4), false); door.position.set(L * .02, by, W / 2 + .3); tilt.add(door) }
  if (!sk && kind === 'spit') for (const [u, z, w] of [[.32, .2, .2], [-.36, -.25, .18], [.18, -.3, .12]]) { const pt = mesh(new THREE.BoxGeometry(L * w, .8, W * .26), lam(0xe8e2d4), false); pt.position.set(L * u, by + bh / 2 + .3, z * W); tilt.add(pt) }
  if (kind === 'brute') {
    if (!sk) for (const u of [.36, .26]) { const ch = mesh(new THREE.BoxGeometry(L * .05, .8, W * .8), lam(0x2a2826), false); ch.position.set(L * u, by + bh / 2 + .35, 0); tilt.add(ch) }
    for (const z of [-1, 1]) { const pl = mesh(new THREE.BoxGeometry(cabL * .7, cabH * .8, 1), lam(0x5d6064)); pl.position.set(L * shape.cabX, by + bh / 2 + cabH * .45, z * W * .43); tilt.add(pl) }
    const spikeG = new THREE.ConeGeometry(2.4, 8, 4).rotateZ(-Math.PI / 2), spikeM = lam(0x8d9096);
    for (let i = 0; i < 4; i++) { const sp = mesh(spikeG, spikeM); sp.position.set(L / 2 + 9, by, -W * .42 + i * W * .28); tilt.add(sp) }
  }
  let turret = null;
  if (kind === 'spit') {
    turret = new THREE.Group(); turret.position.set(L * shape.cabX - cabL * .12, by + bh / 2 + cabH + 1.2, 0);
    const base = mesh(new THREE.CylinderGeometry(5.5, 6.5, 4, 8), lam(0x3a3c40)); base.position.y = 2; turret.add(base);
    const barrelM = kind === 'spit' ? new THREE.MeshBasicMaterial({ color: 0xff5a40 }) : lam(0x55585e);
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
  const rest = tilt.children.filter(c => c.isMesh && c.material !== body && !c.userData.skin); rest.forEach(m => m.updateMatrix());
  mergeInto(tilt, rest, m => m.matrix);
  for (let i = 0; i < wheels.length; i++) {
    const pv = wheels[i].parent; pv.children.forEach(m => m.updateMatrix());
    const [wm] = mergeInto(pv, pv.children.slice(), m => m.matrix); wheels[i] = wm;
  }
  return { root, tilt, body, roof, base: new THREE.Color(color), wheels, front, turret, r, kind, dims, skinned: !!sk };
}

/* enemy car pooling */
const pools = {}, active = new Map();
function acquire(e) {
  const p = pools[e.type] || (pools[e.type] = []);
  const o = p.pop() || buildCar({ len: e.len, wid: e.wid, color: e.col, kind: e.type });
  if (!o.skinned) o.base.set(e.col); o.root.visible = true; scene.add(o.root); return o;
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
const scrapRings = pool(new THREE.RingGeometry(.78, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthWrite: false }), 400); // white circle under every scrap pickup
let fireDecal = null; // optional painted flame sprite (assets/fx/fire-trail.png)
// traffic cones: one instanced, vertex-coloured mesh (orange cone, white band, dark square foot)
const coneMesh = (() => {
  const parts = [], add = (geo, col, y) => { const m = new THREE.Mesh(geo, lam(col)); m.position.y = y; m.updateMatrix(); parts.push(bake(m, m.matrix)) };
  add(new THREE.BoxGeometry(15, 2, 15), 0x2a2826, 1); add(new THREE.ConeGeometry(6, 18, 8), 0xff6a1a, 11); add(new THREE.CylinderGeometry(3.4, 4.6, 3.5, 8), 0xf4f0e8, 10.5);
  const m = new THREE.InstancedMesh(joinBaked(parts), VC_LIT, 24); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); return m;
})();
const coneDummy = new THREE.Object3D(); coneDummy.rotation.order = 'YXZ';
let scrapPts = null;
export function initFx() {
  if (!pitG.children.length) buildPit();
  if (A.ui.scrap && !scrapPts) {
    const tx = new THREE.TextureLoader().load(A.ui.scrap); tx.colorSpace = THREE.SRGBColorSpace;
    const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1200), 3)); gm.setAttribute('color', new THREE.BufferAttribute(new Float32Array(1200), 3)); gm.setDrawRange(0, 0);
    scrapPts = new THREE.Points(gm, new THREE.PointsMaterial({ map: tx, size: 34, sizeAttenuation: true, transparent: true, alphaTest: .35, depthWrite: false, vertexColors: true }));
    scrapPts.frustumCulled = false; scene.add(scrapPts);
  }
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
  const mdl = new THREE.Group(); mdl.scale.setScalar(1.35); mdl.name = 'model'; pumpG.add(mdl); // the pump itself, at 1.35× (car-sized) (post radius PUMP_POST)
  const body = mesh(new THREE.BoxGeometry(14, 26, 11), lam(0xd23a2a)); body.position.y = 14; mdl.add(body);
  const top = mesh(new THREE.BoxGeometry(15, 6, 12), lam(0xa82a20)); top.position.y = 29; mdl.add(top);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(.6, 4, 7), new THREE.MeshBasicMaterial({ color: 0x7fdcaa })); screen.position.set(7.4, 20, 0); screen.name = 'screen'; mdl.add(screen);
  const hose = mesh(new THREE.BoxGeometry(2, 18, 2), lam(0x1d1b1a)); hose.position.set(0, 12, 7); hose.rotation.x = .25; mdl.add(hose);
  const noz = mesh(new THREE.BoxGeometry(3, 3, 6), lam(0x55585e)); noz.position.set(0, 20, 8.5); mdl.add(noz);
  const base = mesh(new THREE.BoxGeometry(20, 2, 16), lam(0x8d9096)); base.position.y = 1.8; mdl.add(base);
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
  camH = (asp > 1 ? 1180 : 820) / (2 * t * asp) / OPTS.zoom;
  if (!OPTS.shake) shake = 0;
  const sx = shake ? rnd(-shake, shake) : 0, sz = shake ? rnd(-shake, shake) : 0;
  camera.position.set(cx + sx, camH, cz + camH * .34 + sz); camera.lookAt(cx + sx, 0, cz + sz);
  scene.fog.near = camH + 700; scene.fog.far = camH + 2800;
  sun.position.set(cx + SUN_OFF.x, SUN_OFF.y, cz + SUN_OFF.z); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
}

let texT = 0;
function syncGround(dt) {
  texT -= dt;
  if (G.groundDirty && texT <= 0) { composeGround(); groundTex.needsUpdate = true; G.groundDirty = false; texT = .25 } // ~4 uploads/s max
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
  { // crane: jib angle, trolley out at the swing radius, ball hanging under it; red dashed arc while the warning runs
    const C = G.crane || { st: 'idle', a: CRANE.rest[0], R: 900 }, a = C.a ?? CRANE.rest[0], R = C.R || 900;
    // slew the upper works to face the ball, stretch the boom from its foot to the tip above the ball
    upper.rotation.y = -a;
    const bx = CRANE.x + Math.cos(a) * R, bz = CRANE.y + Math.sin(a) * R, by = C.st === 'swing' ? CRANE.ball + 4 : CRANE.ball + 30;
    const footR = 40, footY = 28 + 30, reach = R - footR, rise = TIP_Y - footY, len = Math.hypot(reach, rise);
    boomG.rotation.z = Math.atan2(rise, reach); boomG.getObjectByName('unitBoom').scale.set(len, 1, 1);
    const tipX = CRANE.x + Math.cos(a) * R, tipZ = CRANE.y + Math.sin(a) * R;
    scene.getObjectByName('sheave').position.set(tipX, TIP_Y, tipZ); scene.getObjectByName('sheave').rotation.y = -a;
    const pd = upper.getObjectByName('pendant'), ax = 10, ay = 86 - 28, tx = R, ty = TIP_Y - 28; // A-frame top → boom tip, in upper's frame
    pd.position.set((ax + tx) / 2, (ay + ty) / 2, 0); pd.scale.y = Math.hypot(tx - ax, ty - ay); pd.rotation.z = -Math.atan2(tx - ax, ty - ay);
    ballG.getObjectByName('ball').position.set(bx, by, bz); ballG.getObjectByName('ball').rotation.y = a * 6;
    scene.getObjectByName('hookBlock').position.set(bx, by + CRANE.ball + 14, bz);
    const cb = ballG.getObjectByName('cable'), top = TIP_Y; cb.position.set(bx, (top + by) / 2, bz); cb.scale.y = top - by;
    G._craneArc = C.st === 'warn' || C.st === 'swing' ? { R, from: CRANE.ends[C.from], to: CRANE.ends[C.to], k: C.st === 'warn' ? 1 - C.t / CRANE.warn : 1 } : null;
  }
  { const op = gateOpen(); for (const d of gateDoors) d.hinge.rotation.y = d.sx * op * 1.6; // pit gate swings shut as the countdown ends
    for (const c of pitG.children) if (c.name === 'lamp') c.material.color.setHex(op > 0 && Math.sin(G.time * 12) > 0 ? 0xffa020 : 0x553810) }

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
  for (const b of G.ebul) if (ng < 1200) put(glows, ng++, b.x, 14, b.y, 5.5, 5.5, 5.5, G.time * 5, G.time * 4, 0xff3a2a); // enemy shots: red
  for (const m of G.mines) if (ng < 1200) put(glows, ng++, m.x, 5.5, m.y, 2.6, 2.6, 2.6, 0, 0, m.arm > 0 ? 0x888888 : (Math.sin(m.t * 10) > 0 ? 0xff3a2a : 0x6a1a10));
  for (const b of G.bullets) if (ns < 1600) streak(ns++, b.x, b.y, 16, b.x - b.vx * .018, b.y - b.vy * .018, 16, 2.4, 0xffffff); // your shots: white
  for (const z of G.zaps) {
    let px = z.x1, py = z.y1;
    for (let i = 1; i <= 6 && ns < 1600; i++) {
      const t = i / 6, nx = i === 6 ? z.x2 : z.x1 + (z.x2 - z.x1) * t + rnd(-10, 10), ny = i === 6 ? z.y2 : z.y1 + (z.y2 - z.y1) * t + rnd(-10, 10);
      streak(ns++, px, py, 18, nx, ny, 18, 2.6, 0xbfe8ff); px = nx; py = ny;
    }
  }
  // gas pump: zone ring, fill progress ring, and the reserve shown by the screen colour
  const pu = G.pump; pumpG.visible = !!pu;
  // the next pump's spot: a pulsing green ring and glow before it opens
  const nx = G.pumpNext;
  if (nx && !pu && nring < 118) {
    const k = 1 - Math.max(0, G.pumpT) / PUMP_WARN, pulse = .85 + .15 * Math.abs(Math.sin(G.time * 6));
    put(rings, nring++, nx.x, 1.3, nx.y, PUMP_R * pulse, 1, PUMP_R * pulse, 0, 0, 0x2f8a5a);
    put(rings, nring++, nx.x, 1.4, nx.y, PUMP_R * k, 1, PUMP_R * k, 0, 0, 0x1f6a44);
    if (nsoft < 500) put(soft, nsoft++, nx.x, 1.2, nx.y, PUMP_R * 2.2 * pulse, 1, PUMP_R * 2.2 * pulse, 0, 0, 0x0e3a22);
  }
  if (pu && pu.empty) { // dry pump: grey ring, red blinking screen
    pumpG.position.set(pu.x, 0, pu.y);
    if (nring < 118) put(rings, nring++, pu.x, 1.4, pu.y, PUMP_R, 1, PUMP_R, 0, 0, 0x6a6560);
    pumpG.getObjectByName('screen').material.color.setHex(Math.sin(G.time * 8) > 0 ? 0xff3a2a : 0x401010);
  } else if (pu) {
    pumpG.position.set(pu.x, 0, pu.y);
    const pulse = 1 + Math.sin(G.time * 4) * .03;
    if (nring < 118) {
      put(rings, nring++, pu.x, 1.4, pu.y, PUMP_R * pulse, 1, PUMP_R * pulse, 0, 0, G.filling ? 0x7fdcaa : 0xffc23d);
      { const k = Math.max(.08, pu.res / PUMP_RESERVE); put(rings, nring++, pu.x, 1.5, pu.y, PUMP_R * .82 * k, 1, PUMP_R * .82 * k, 0, 0, k > .5 ? 0x7fdcaa : k > .2 ? 0xffc23d : 0xff4a30) } // reserve: the inner ring shrinks as the pump drains
    }
    if (nsoft < 500) put(soft, nsoft++, pu.x, 1.2, pu.y, PUMP_R * 2.4, 1, PUMP_R * 2.4, 0, 0, G.filling ? 0x0e2e1c : 0x241a04);
    pumpG.getObjectByName('screen').material.color.setHex(pu.res > PUMP_RESERVE * .5 ? 0x7fdcaa : pu.res > PUMP_RESERVE * .2 ? 0xffc23d : 0xff4a30);
  }
  // jerrycans dropped by fuel thieves
  let ncan = 0;
  for (const c of G.cans) {
    if (ncan >= 30) break;
    if (c.t > 2 && Math.sin(c.t * 30) < 0) continue; // blink before it evaporates
    const bob = 8 + canZ(c) + Math.sin(G.time * 4 + c.x) * 2;
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
  // thief hoses: a sagging black hose from the thief to your car, green fuel blobs running along it to the thief
  if (P) for (const e of G.enemies) {
    if (!e.hose || ns > 1590) continue;
    const N = 7, pt = k => { const u = k / N; return [P.x + (e.x - P.x) * u, P.y + (e.y - P.y) * u, 10 + (P.z || 0) * (1 - u) - Math.sin(Math.PI * u) * 7] };
    for (let k = 0; k < N; k++) { const a = pt(k), b = pt(k + 1); streak(ns++, a[0], a[1], a[2], b[0], b[1], b[2], 4, 0x1d1b1a) }
    for (let j = 0; j < 3 && ng < 1200; j++) { const u = (G.time * 1.6 + j / 3) % 1, a = pt(u * N); put(glows, ng++, a[0], a[2] + 1, a[1], 2.6, 2.6, 2.6, 0, 0, 0x9fe070) }
  }
  // crane danger zone: two red dashed arcs (the ball's path, edge to edge) that blink faster as the swing nears
  const ca = G._craneArc;
  if (ca && ns < 1500) {
    const blink = ca.k < 1 ? Math.sin(G.time * (8 + ca.k * 16)) > -.2 : true, N = 48;
    if (blink) for (const rr of [ca.R - CRANE.ball - 6, ca.R + CRANE.ball + 6]) for (let i = 0; i < N; i += 2) {
      const u0 = ca.from + (ca.to - ca.from) * i / N, u1 = ca.from + (ca.to - ca.from) * (i + 1) / N;
      streak(ns++, CRANE.x + Math.cos(u0) * rr, CRANE.y + Math.sin(u0) * rr, 1.2, CRANE.x + Math.cos(u1) * rr, CRANE.y + Math.sin(u1) * rr, 1.2, 5, 0xff3a2a);
    }
    if (nsoft < 480) for (let i = 0; i <= 8; i++) { const u = ca.from + (ca.to - ca.from) * i / 8; put(soft, nsoft++, CRANE.x + Math.cos(u) * ca.R, 1, CRANE.y + Math.sin(u) * ca.R, CRANE.ball * 3.2, 1, CRANE.ball * 3.2, 0, 0, 0x5a0a04) }
  }
  { let nc = 0; for (const c of G.cones || []) { if (nc >= 24) break; coneDummy.position.set(c.x, c.z + (c.tip > .3 ? 6 * Math.sin(c.tip) : 0), c.y); coneDummy.rotation.set(c.tip, -c.h, 0); coneDummy.updateMatrix(); coneMesh.setMatrixAt(nc++, coneDummy.matrix) } coneMesh.count = nc; coneMesh.instanceMatrix.needsUpdate = true }
  finish(blobs, nb); finish(glows, ng); finish(streaks, ns); finish(soft, nsoft); finish(rings, nring); finish(eliteSaws, eliteSawN); eliteSawN = 0;
  if (fireDecal) finish(fireDecal, nfire);

  let nsc = 0;
  if (scrapPts) { // painted scrap icons (assets/ui/scrap.png) as camera-facing points, one draw call
    const pa = scrapPts.geometry.attributes.position, ca = scrapPts.geometry.attributes.color;
    for (const s of G.scraps) { if (nsc >= 400) break; const pr = (s.v > 1 ? 17 : 14) * (1 + Math.sin(G.time * 5 + s.x) * .08); put(scrapRings, nsc, s.x, 1.3, s.y, pr, 1, pr, 0, 0, s.v > 1 ? 0xffd36a : 0xffffff); pa.setXYZ(nsc, s.x, 11 + Math.sin(G.time * 4 + s.x) * 2, s.y); const c = s.v > 1 ? [1, .85, .45] : [1, 1, 1]; ca.setXYZ(nsc, c[0], c[1], c[2]); nsc++ }
    scrapPts.geometry.setDrawRange(0, nsc); pa.needsUpdate = ca.needsUpdate = true; finish(scrapPool, 0); finish(scrapRings, nsc);
  } else {
    for (const s of G.scraps) if (nsc < 400) { put(scrapRings, nsc, s.x, 1.3, s.y, 14, 1, 14, 0, 0, 0xffffff); put(scrapPool, nsc++, s.x, 4 + Math.sin(G.time * 4 + s.x) * 1.5, s.y, 1, 1, 1, G.time * 3 + s.x, .5, s.v > 1 ? 0xffc23d : 0xb9bcc0) }
    finish(scrapPool, nsc); finish(scrapRings, nsc);
  }
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
  finish(blobs, nb); finish(glows, 0); finish(streaks, 0); finish(scrapPool, 0); finish(scrapRings, 0); if (scrapPts) scrapPts.geometry.setDrawRange(0, 0); finish(minePool, 0); finish(canPool, 0); if (canSprites) for (const sp of canSprites) sp.visible = false; pumpG.visible = false; finish(soft, 0); finish(rings, 0); finish(eliteSaws, 0); if (fireDecal) finish(fireDecal, 0);
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
