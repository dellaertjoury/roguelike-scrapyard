// Low-poly three.js renderer. Reads the simulation state (G) and draws it.
// Sim (x, y) maps to world (x, z); y is up.
import * as THREE from 'three';
import { G, AW, AH, EDGE, TAU, ground, rnd, clamp } from './game.js';
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
const tireGeo = new THREE.TorusGeometry(11, 5.5, 5, 10).rotateX(Math.PI / 2);
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
    for (let r = 0; r < 3; r++) { const step = mesh(new THREE.BoxGeometry(380, 12 * (r + 1), 22), concrete); step.position.set(cx, 6 * (r + 1), cz - dir * r * 22); scene.add(step) }
    const roof = mesh(new THREE.BoxGeometry(400, 4, 80), roofM); roof.position.set(cx, 78, cz - dir * 22); scene.add(roof);
    for (const px of [-190, 190]) { const pole = mesh(new THREE.CylinderGeometry(2.5, 2.5, 78, 6), concrete); pole.position.set(cx + px, 39, cz - dir * 56); scene.add(pole) }
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
    tr.position.set(x, 0, z); scene.add(tr); placed++;
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd(-700, AW + 700), z = rnd(-600, AH + 600);
    if (!outside(x, z, 120) || nearStand(x, z)) continue;
    const r = mesh(rockG, rockM); r.scale.set(rnd(10, 30), rnd(8, 20), rnd(10, 30)); r.rotation.set(rnd(0, 3), rnd(0, 3), 0); r.position.set(x, 4, z); scene.add(r);
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
    const p = mesh(new THREE.CylinderGeometry(4, 6, 240, 6), poleM); p.position.set(x, 120, z); scene.add(p);
    const h = mesh(new THREE.BoxGeometry(60, 26, 14), headM); h.position.set(x, 245, z); h.lookAt(AW / 2, 0, AH / 2); scene.add(h);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(52, 18), glowM); l.position.copy(h.position); l.lookAt(AW / 2, 0, AH / 2); l.translateZ(7.2); scene.add(l);
  }
  const flagM = new THREE.MeshLambertMaterial({ color: 0xe8553a, side: THREE.DoubleSide, flatShading: true });
  for (const [x, z] of [[AW * .15, -70], [AW * .85, -70], [AW * .15, AH + 70], [AW * .85, AH + 70], [-70, AH * .5], [AW + 70, AH * .5]]) {
    const p = mesh(new THREE.CylinderGeometry(1.5, 1.5, 90, 5), poleM); p.position.set(x, 45, z); scene.add(p);
    const f = mesh(new THREE.PlaneGeometry(34, 22), flagM); f.position.set(x + 17, 78, z); f.rotation.y = .3; scene.add(f);
  }
}

/* ---------- obstacles (rebuilt each run) ---------- */
const obsGroup = new THREE.Group(); scene.add(obsGroup);
let obsBuilt = -1;
const tireM = lam(0x2a2826), tireRed = lam(0xe24a32), hayM = lam(0xe2bf62), hayTop = lam(0xedd283);
function buildObstacles() {
  obsGroup.clear();
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
  obsBuilt = G.obsVersion;
}

/* ---------- cars ---------- */
const DARK = new THREE.Color(0x1e1a16);
const tyreM = lam(0x1f1d1c), rimM = lam(0xb8bcc2), glassM = lam(0x26313a), bumperM = lam(0x4a4c50), whiteM = lam(0xf4efe4);
const headM = new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), tailM = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
const wheelG = new THREE.CylinderGeometry(1, 1, 1, 8);

export function buildCar({ len: L, wid: W, color, kind, shape }) {
  shape = shape || { cabL: .42, cabX: -.1, cabH: .36 };
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const body = lam(color), roof = lam(new THREE.Color(color).multiplyScalar(.82));
  const r = W * .22, bh = W * .4, by = r * .9 + bh / 2;
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
    const pivot = new THREE.Group(); pivot.position.set(sx * L * .3, r, sz * (W / 2 - 1));
    const w = mesh(wheelG, tyreM); w.scale.set(r, W * .22, r); w.rotation.x = Math.PI / 2; pivot.add(w);
    const hub = mesh(wheelG, rimM, false); hub.scale.set(r * .5, W * .23, r * .5); hub.rotation.x = Math.PI / 2; pivot.add(hub);
    root.add(pivot); wheels.push(w); if (sx > 0) front.push(pivot);
  }
  let turret = null;
  if (kind === 'player' || kind === 'spit') {
    turret = new THREE.Group(); turret.position.set(L * shape.cabX - cabL * .12, by + bh / 2 + cabH + 1.2, 0);
    const base = mesh(new THREE.CylinderGeometry(5.5, 6.5, 4, 8), lam(0x3a3c40)); base.position.y = 2; turret.add(base);
    const barrelM = kind === 'spit' ? new THREE.MeshBasicMaterial({ color: 0xa8f060 }) : lam(0x55585e);
    for (const z of kind === 'player' ? [-2.2, 2.2] : [0]) { const br = mesh(new THREE.BoxGeometry(16, 2.6, 2.6), barrelM); br.position.set(9, 3.5, z); br.name = 'barrel'; turret.add(br) }
    tilt.add(turret);
  }
  if (kind === 'brute' || kind === 'boss') {
    const bar = mesh(new THREE.BoxGeometry(5, bh * .9, W * 1.12), lam(0x9a9c9e)); bar.position.set(L / 2 + 4, by, 0); tilt.add(bar);
  }
  if (kind === 'boss') {
    const comb = mesh(new THREE.BoxGeometry(12, 14, W + 34), lam(0xe0b040)); comb.position.set(L / 2 + 14, 10, 0); tilt.add(comb);
    const toothG = new THREE.ConeGeometry(3, 14, 4).rotateZ(-Math.PI / 2), toothM = lam(0x6b6b6b);
    for (let i = 0; i < 9; i++) { const t = mesh(toothG, toothM); t.position.set(L / 2 + 26, 8, -W / 2 - 15 + i * (W + 30) / 8); tilt.add(t) }
    for (const z of [-1, 1]) { const ex = mesh(new THREE.CylinderGeometry(3, 3, 30, 6), lam(0x3a3a3a)); ex.position.set(-L * .3, by + 22, z * W * .3); tilt.add(ex) }
  }
  return { root, tilt, body, roof, base: new THREE.Color(color), wheels, front, turret, r, kind };
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
const sawPool = pool(sawG, lam(0xd0d3d8), 6); sawPool.castShadow = true;

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
  if (G.groundDirty && texT <= 0) { groundTex.needsUpdate = true; G.groundDirty = false; texT = .1 }
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

function poseCar(o, x, y, a, lat, accel, sp, steer, dt) {
  o.root.position.set(x, 0, y); o.root.rotation.y = -a;
  o.tilt.rotation.x += (clamp(-lat / 900, -.1, .1) - o.tilt.rotation.x) * Math.min(1, dt * 8);
  o.tilt.rotation.z += (clamp(-accel / 4000, -.05, .05) - o.tilt.rotation.z) * Math.min(1, dt * 6);
  for (const f of o.front) f.rotation.y = -steer * .45;
  for (const w of o.wheels) w.rotation.y += sp * dt / o.r;
}

/* ---------- main render ---------- */
let lastFwd = 0;
export function render(dt) {
  syncGround(dt); animateCrowd(dt);
  const P = G.P;
  placeCamera(G.cam.x, G.cam.y, G.shake * .6);

  // player car
  if (P) {
    if (playerCarId !== P.car.id) { if (player) scene.remove(player.root); player = buildCar({ ...P.car, kind: 'player' }); scene.add(player.root); playerCarId = P.car.id }
    const alive = ['play', 'clear', 'shop', 'pause'].includes(G.state);
    player.root.visible = alive && !(P.inv > 0 && Math.sin(G.time * 40) > 0);
    poseCar(player, P.x, P.y, P.a, P.lat, (P.fwd - lastFwd) / Math.max(dt, .001), P.fwd, P.steer, dt); lastFwd = P.fwd;
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
    poseCar(o, e.x, e.y, e.a, 0, 0, Math.hypot(e.vx, e.vy), 0, dt);
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
  for (const f of G.fires) {
    const t = f.life / f.max, fl = 1 + Math.sin(G.time * 22 + f.x) * .12;
    if (ng < 1198) { put(glows, ng++, f.x, 2, f.y, f.r * t * fl, f.r * .4 * t, f.r * t * fl, f.x, 0, 0xff6a24); put(glows, ng++, f.x, 4, f.y, f.r * .55 * t, f.r * .5 * t, f.r * .55 * t, f.y, 0, 0xffc040) }
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
  for (const s of G.pend) {
    const pulse = .7 + .3 * Math.abs(Math.sin(G.time * 12)), r = (s.type === 'boss' ? 38 : 15) * (1.3 - .3 * (1 - s.t / s.max)) * pulse;
    if (ns < 1598) { streak(ns++, s.x - r, s.y - r, 1, s.x + r, s.y + r, 1, 3.5, 0xff4a30); streak(ns++, s.x + r, s.y - r, 1, s.x - r, s.y + r, 1, 3.5, 0xff4a30) }
  }
  finish(blobs, nb); finish(glows, ng); finish(streaks, ns);

  let nsc = 0;
  for (const s of G.scraps) if (nsc < 400) put(scrapPool, nsc++, s.x, 4 + Math.sin(G.time * 4 + s.x) * 1.5, s.y, 1, 1, 1, G.time * 3 + s.x, .5, s.v > 1 ? 0xffc23d : 0xb9bcc0);
  finish(scrapPool, nsc);
  let nm = 0; for (const m of G.mines) put(minePool, nm++, m.x, 2, m.y, 1, 1, 1); finish(minePool, nm);
  let nw = 0;
  if (P && G.W && G.W.saw && ['play', 'clear', 'shop', 'pause'].includes(G.state)) {
    const n = G.W.saw, R = P.r + 44;
    for (let i = 0; i < n; i++) { const a = G.time * 4.5 + i * TAU / n; put(sawPool, nw++, P.x + Math.cos(a) * R, 10, P.y + Math.sin(a) * R, 1, 1, 1, G.time * 20) }
  }
  finish(sawPool, nw);

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
  if (!demo.length) for (let i = 0; i < 6; i++) { const o = buildCar({ len: 46, wid: 24, color: i ? ECOL[i * 2] : '#e8553a', kind: i ? 'rust' : 'player' }); scene.add(o.root); demo.push(o) }
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
  finish(blobs, nb); finish(glows, 0); finish(streaks, 0); finish(scrapPool, 0); finish(minePool, 0); finish(sawPool, 0);
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
    r.render(sc, cam); const url = r.domElement.toDataURL('image/png'); sc.remove(o.root); return url;
  });
  r.dispose(); r.forceContextLoss && r.forceContextLoss();
  return out;
}
