// Game simulation: driving, drifting, enemies, weapons, waves, shop.
// Runs on a flat 2D plane (x, y). The 3D scene maps sim y to world z.
import { CARS, BASE, ITEMS, WNAME, WD, ENEMY, ECOL } from './data.js';

export const AW = 2000, AH = 1360, EDGE = 34, GS = .6;
export const TAU = Math.PI * 2;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d };
export const fmt = n => Math.round(n).toLocaleString('en-US');
const hex = s => parseInt(s.slice(1), 16);

export const G = {
  state: 'menu', S: null, P: null, W: null, CD: null,
  enemies: [], bullets: [], ebul: [], mines: [], fires: [], scraps: [], parts: [], texts: [], pend: [], zaps: [], obs: [],
  wave: 0, waveT: 0, waveLen: 1, spawnT: 0, scrap: 0, score: 0, wrecks: 0, bestDrift: 0, shake: 0, time: 0,
  banner: null, owned: {}, offer: [], rerollCost: 0, clearT: 0,
  cam: { x: AW / 2, y: AH / 2 }, drift: { on: false, pts: 0, mult: 1, off: 0, heat: 0 },
  keys: {}, groundDirty: true, obsVersion: 0, cheer: 0, on: {}
};

/* ---------- ground texture (dirt, skid marks, scorch decals) ---------- */
export const ground = document.createElement('canvas');
ground.width = Math.round(AW * GS); ground.height = Math.round(AH * GS);
const g = ground.getContext('2d');
let dirtImg = null;
export const setDirt = img => { dirtImg = img };

export function makeGround() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#a47f57'; g.fillRect(0, 0, ground.width, ground.height);
  g.setTransform(GS, 0, 0, GS, 0, 0);
  if (dirtImg) {
    const p = g.createPattern(dirtImg, 'repeat');
    p.setTransform(new DOMMatrix().scale(420 / dirtImg.width));
    g.fillStyle = p; g.fillRect(0, 0, AW, AH);
  }
  const k = dirtImg ? .5 : 1;
  for (let i = 0; i < 200; i++) {
    const x = rnd(0, AW), y = rnd(0, AH), r = rnd(40, 220);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = Math.random() < .55 ? '96,70,44' : '206,170,122';
    gr.addColorStop(0, `rgba(${c},${rnd(.12, .3) * k})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < (dirtImg ? 0 : 4500); i++) {
    g.fillStyle = Math.random() < .5 ? 'rgba(70,50,32,.4)' : 'rgba(225,200,160,.35)';
    const s = rnd(2, 4); g.fillRect(rnd(0, AW), rnd(0, AH), s, s);
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd(250, AW - 250), y = rnd(250, AH - 250), a = rnd(0, 3);
    g.fillStyle = 'rgba(120,92,64,.28)'; g.beginPath(); g.ellipse(x, y, rnd(50, 90), rnd(24, 40), a, 0, TAU); g.fill();
    g.fillStyle = 'rgba(150,175,190,.22)'; g.beginPath(); g.ellipse(x - 6, y - 4, rnd(20, 36), rnd(8, 14), a, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(250,245,232,.32)'; g.lineWidth = 8; g.setLineDash([36, 28]);
  g.strokeRect(300, 300, AW - 600, AH - 600); g.setLineDash([]);
  g.fillStyle = 'rgba(250,245,232,.16)'; g.font = '800 120px Rubik, Impact, sans-serif'; g.textAlign = 'center';
  g.fillText('SCRAPYARD', AW / 2, 210);
  g.lineCap = 'round';
  G.groundDirty = true;
}

export function makeObs() {
  const obs = []; let t = 0;
  while (obs.length < 12 && t++ < 500) {
    const o = { x: rnd(220, AW - 220), y: rnd(220, AH - 220), r: rnd(26, 42), k: Math.random() < .6 ? 'tire' : 'hay' };
    if (Math.hypot(o.x - AW / 2, o.y - AH / 2) < 280) continue;
    if (obs.some(b => Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r + 140)) continue;
    obs.push(o);
  }
  G.obs = obs; G.obsVersion++;
}

/* ---------- particles & floating text ----------
   k: 'b' blob (icosahedron) or 's' streak; glow: unlit bright; c: hex colour */
export function puff(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 900) G.parts.shift();
    const a = o.a !== undefined ? o.a + rnd(-(o.sp || .4), o.sp || .4) : rnd(0, TAU);
    const s = rnd(o.s0 ?? 20, o.s1 ?? 120), l = rnd(o.l0 ?? .4, o.l1 ?? .9);
    G.parts.push({
      x: x + rnd(-(o.jit || 0), o.jit || 0), y: y + rnd(-(o.jit || 0), o.jit || 0), z: o.z ?? 6,
      vx: Math.cos(a) * s + (o.vx || 0), vy: Math.sin(a) * s + (o.vy || 0), vz: rnd(o.vz0 ?? 0, o.vz1 ?? 0),
      life: l, max: l, size: rnd(o.z0 ?? 4, o.z1 ?? 10), c: o.c, glow: !!o.glow, grow: o.grow || 0,
      drag: o.drag ?? 2, k: o.k || 'b', grav: o.grav || 0, rot: rnd(0, TAU)
    });
  }
}
export function txt(x, y, s, col, size = 16, life = .8) { if (G.texts.length > 40) G.texts.shift(); G.texts.push({ x, y, s, col, size, life, max: life }) }
export function boom(x, y, r, col) {
  puff(x, y, Math.round(r * .5), { c: Math.random() < .5 ? 0xffa040 : 0xff6a20, glow: true, s0: 20, s1: r * 4, l0: .25, l1: .55, z0: r * .2, z1: r * .45, grow: 20, drag: 4, z: 10, vz0: 10, vz1: 80 });
  puff(x, y, Math.round(r * .3), { c: 0xffd070, glow: true, s0: 10, s1: r * 2, l0: .2, l1: .4, z0: r * .2, z1: r * .35, drag: 4, z: 14 });
  puff(x, y, Math.round(r * .3), { c: 0x77706a, s0: 15, s1: r * 2.2, l0: .7, l1: 1.3, z0: r * .15, z1: r * .3, grow: 10, drag: 2.5, z: 14, vz0: 30, vz1: 70 });
  puff(x, y, 14, { c: 0xffe08c, glow: true, k: 's', s0: 200, s1: 480, l0: .2, l1: .5, drag: 3, z: 10, vz0: 50, vz1: 220, grav: 500 });
  if (col) puff(x, y, 8, { c: hex(col), s0: 80, s1: 260, l0: .8, l1: 1.4, z0: 3, z1: 6, drag: 2, z: 10, vz0: 120, vz1: 320, grav: 700 });
}

/* ---------- run flow ---------- */
export function start(i) {
  const c = CARS[i];
  G.S = Object.assign({}, BASE, c.st);
  G.P = { x: AW / 2, y: AH / 2, a: -Math.PI / 2, vx: 0, vy: 0, hp: G.S.maxhp, inv: 0, nitro: .6, car: c, len: c.len, wid: c.wid, r: (c.len + c.wid) / 4 + 2, wl: null, boost: false, gunA: -Math.PI / 2, lat: 0, fwd: 0, steer: 0, slipDeg: 0, sp: 0 };
  G.W = Object.assign({ mg: 0, mines: 0, tesla: 0, flame: 0, saw: 0 }, c.w);
  G.CD = { mg: 0, mines: 0, tesla: 0, flame: 0 };
  for (const k of ['enemies', 'bullets', 'ebul', 'mines', 'fires', 'scraps', 'parts', 'texts', 'pend', 'zaps']) G[k] = [];
  Object.assign(G, { wave: 0, scrap: 0, score: 0, wrecks: 0, bestDrift: 0, owned: {} });
  Object.assign(G.drift, { on: false, pts: 0, mult: 1, heat: 0, off: 0 });
  makeGround(); makeObs(); G.cam.x = G.P.x; G.cam.y = G.P.y;
  nextWave();
}
export function nextWave() {
  G.wave++; G.waveLen = Math.min(60, 24 + G.wave * 3); G.waveT = G.waveLen; G.spawnT = 1.2; G.state = 'play';
  G.banner = { s: `Wave ${G.wave}`, sub: G.wave % 5 === 0 ? 'Boss incoming' : `Survive ${G.waveLen}s`, id: Math.random() };
  if (G.wave % 5 === 0) queue('boss');
  for (let i = 0; i < 2 + G.wave; i++) queue('rust');
  G.on.play && G.on.play();
}
function queue(type) {
  const P = G.P;
  for (let t = 0; t < 20; t++) {
    const a = rnd(0, TAU), d = rnd(360, 640);
    const x = clamp(P.x + Math.cos(a) * d, EDGE + 60, AW - EDGE - 60), y = clamp(P.y + Math.sin(a) * d, EDGE + 60, AH - EDGE - 60);
    if (Math.hypot(x - P.x, y - P.y) < 280) continue;
    if (G.obs.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 50)) continue;
    G.pend.push({ x, y, t: type === 'boss' ? 1.6 : .9, max: type === 'boss' ? 1.6 : .9, type }); return;
  }
}
function spawn(type, x, y) {
  const D = ENEMY(G.wave)[type], P = G.P;
  G.enemies.push(Object.assign({
    type, x, y, a: Math.atan2(P.y - y, P.x - x), vx: 0, vy: 0, max: D.hp, flash: 0, cd: rnd(1, 2.5), charge: 0,
    hitcd: 0, sawcd: 0, burncd: 0, seed: Math.random() * 1e4 | 0,
    col: type === 'boss' ? '#e0b040' : ECOL[Math.random() * ECOL.length | 0], num: 1 + (Math.random() * 98 | 0)
  }, D));
  puff(x, y, 12, { c: 0xc8a878, s0: 40, s1: 160, l0: .5, l1: 1, z0: 8, z1: 14, grow: 14, z: 6, vz0: 10, vz1: 40 });
}
function hurt(e, d, silent) {
  if (e.dead) return;
  e.hp -= d; e.flash = .09;
  if (!silent) txt(e.x + rnd(-8, 8), e.y - e.r, fmt(d), '#fff6e6', 13 + Math.min(10, d / 8), .55);
  if (e.hp <= 0) kill(e, true);
}
function kill(e, scored) {
  e.dead = true; boom(e.x, e.y, e.r * 1.3, e.col);
  G.shake = Math.max(G.shake, e.type === 'boss' ? 18 : e.r / 3); G.cheer = 1;
  const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 2);
  gr.addColorStop(0, 'rgba(30,22,16,.5)'); gr.addColorStop(1, 'rgba(30,22,16,0)');
  g.fillStyle = gr; g.fillRect(e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4);
  for (let i = 0; i < 5; i++) { g.fillStyle = Math.random() < .5 ? e.col : '#3b3530'; g.save(); g.translate(e.x + rnd(-e.r, e.r), e.y + rnd(-e.r, e.r)); g.rotate(rnd(0, TAU)); g.fillRect(-4, -2, rnd(5, 10), rnd(3, 6)); g.restore() }
  G.groundDirty = true;
  let n = e.sc; for (let i = 0; i < e.sc; i++) if (Math.random() < G.S.luck) n++;
  if (scored) {
    G.wrecks++; G.score += e.sc * 40;
    for (let i = 0; i < Math.min(n, 14); i++) { const a = rnd(0, TAU), s = rnd(40, 200); G.scraps.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v: n > 14 && i === 0 ? n - 13 : 1, t: 0 }) }
  } else G.scrap += n;
}
function endWave() {
  for (const e of G.enemies) kill(e, false);
  G.enemies = []; G.pend = []; G.ebul = [];
  for (const s of G.scraps) G.scrap += s.v; G.scraps = [];
  G.P.hp = Math.min(G.S.maxhp, G.P.hp + G.S.maxhp * .2);
  bankDrift(); G.state = 'clear'; G.clearT = 1.1;
  G.banner = { s: 'Wave cleared', sub: 'Garage is open', id: Math.random() };
}
function die() {
  G.state = 'dead'; G.clearT = 1.6; const P = G.P;
  boom(P.x, P.y, 50, P.car.color); boom(P.x + 20, P.y - 10, 30); G.shake = 24;
}
function bankDrift() {
  const d = G.drift;
  if (d.pts > 40) {
    const p = Math.round(d.pts), s = Math.floor(p / 160);
    G.score += p; G.scrap += s; G.bestDrift = Math.max(G.bestDrift, p);
    txt(G.P.x, G.P.y - 30, `Drift ${fmt(p)}${s ? ` · +${s} scrap` : ''}`, '#ffc23d', 18, 1.2);
  }
  d.pts = 0; d.mult = 1; d.on = false;
}

/* ---------- shop ---------- */
export const price = it => Math.round(it.cost * (1 + (G.wave - 1) * .14));
export const lvlOf = it => it.w ? G.W[it.w] : (G.owned[it.id] || 0);
export const nameOf = it => it.w ? WNAME[it.w] : it.name;
export const descOf = it => it.w ? WD[it.w](G.W[it.w] + 1) : it.d;
function roll() {
  const pool = ITEMS.filter(it => it.w ? G.W[it.w] < 5 : !(it.max && (G.owned[it.id] || 0) >= it.max));
  const out = [];
  while (out.length < 4 && pool.length) {
    const tot = pool.reduce((s, it) => s + (it.w ? 1.4 : 1), 0); let r = Math.random() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w ? 1.4 : 1; if (r <= 0) break }
    out.push({ ...pool[k] }); pool.splice(k, 1);
  }
  return out;
}
function openShop() { G.state = 'shop'; G.rerollCost = 2 + G.wave; G.offer = roll(); G.on.shop && G.on.shop() }
export function buy(i) {
  const it = G.offer[i], p = price(it);
  if (!it || it.sold || p > G.scrap) return false;
  G.scrap -= p; it.sold = true;
  if (it.w) G.W[it.w]++; else { G.owned[it.id] = (G.owned[it.id] || 0) + 1; it.f(G) }
  return true;
}
export function reroll() { if (G.scrap < G.rerollCost) return; G.scrap -= G.rerollCost; G.rerollCost++; G.offer = roll() }

/* ---------- update ---------- */
const K = (...c) => c.some(k => G.keys[k]);
function nearest(x, y, max, skip) { let b = null, bd = max; for (const e of G.enemies) { if (e.dead || (skip && skip.has(e))) continue; const d = Math.hypot(e.x - x, e.y - y) - e.r; if (d < bd) { bd = d; b = e } } return b }
function collideStatic(o, r, bounce) {
  for (const b of G.obs) {
    const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy), m = r + b.r;
    if (d < m && d > 0) {
      const nx = dx / d, ny = dy / d; o.x = b.x + nx * m; o.y = b.y + ny * m;
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) {
        o.vx -= (1 + bounce) * vn * nx; o.vy -= (1 + bounce) * vn * ny;
        if (o === G.P && vn < -85) { G.shake = Math.max(G.shake, 5); puff(o.x - nx * r, o.y - ny * r, 8, { c: 0xffd27a, glow: true, k: 's', s0: 100, s1: 300, l0: .15, l1: .35, z: 8, vz0: 40, vz1: 140, grav: 400 }) }
      }
    }
  }
  const lo = EDGE + r;
  if (o.x < lo) { o.x = lo; o.vx = Math.abs(o.vx) * bounce } if (o.x > AW - lo) { o.x = AW - lo; o.vx = -Math.abs(o.vx) * bounce }
  if (o.y < lo) { o.y = lo; o.vy = Math.abs(o.vy) * bounce } if (o.y > AH - lo) { o.y = AH - lo; o.vy = -Math.abs(o.vy) * bounce }
}
function hitPlayer(d) {
  const P = G.P;
  if (P.inv > 0 || G.state !== 'play') return;
  d *= 1 - Math.min(.7, G.S.armor); P.hp -= d; P.inv = .55; G.shake = Math.max(G.shake, 8);
  txt(P.x, P.y - 20, '-' + fmt(d), '#ff6b5a', 18, .7);
  if (G.drift.pts > 200) txt(P.x, P.y - 46, 'Combo wrecked', '#ff6b5a', 16, 1);
  G.drift.pts = 0; G.drift.mult = 1;
  if (P.hp <= 0) { P.hp = 0; die() }
}

export function update(dt) {
  G.time += dt;
  for (const p of G.parts) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
    if (p.z < 1) { p.z = 1; p.vz *= -.3; p.vx *= .6; p.vy *= .6 }
    const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.size += p.grow * dt; p.rot += dt * 3;
  }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const t of G.texts) t.life -= dt; G.texts = G.texts.filter(t => t.life > 0);
  for (const z of G.zaps) z.t -= dt; G.zaps = G.zaps.filter(z => z.t > 0);
  for (const f of G.fires) f.life -= dt; G.fires = G.fires.filter(f => f.life > 0);
  G.shake = Math.max(0, G.shake - dt * 40);
  if (G.state === 'clear' || G.state === 'dead') {
    G.clearT -= dt;
    if (G.clearT <= 0) { if (G.state === 'clear') openShop(); else { G.state = 'over'; G.on.over && G.on.over() } }
    return;
  }
  if (G.state !== 'play') return;
  const P = G.P, S = G.S, W = G.W, CD = G.CD, drift = G.drift;

  /* driving: split velocity into forward and lateral; grip eats lateral, handbrake drops grip */
  const fx = Math.cos(P.a), fy = Math.sin(P.a);
  let fwd = P.vx * fx + P.vy * fy, lat = -P.vx * fy + P.vy * fx;
  const up = K('KeyW', 'ArrowUp'), dn = K('KeyS', 'ArrowDown'), hb = K('Space'), lt = K('KeyA', 'ArrowLeft'), rt = K('KeyD', 'ArrowRight');
  P.boost = K('ShiftLeft', 'ShiftRight') && P.nitro > .02;
  const bm = P.boost ? 1.8 * S.nitroPow : 1, top = S.top * (P.boost ? 1.35 * S.nitroPow : 1);
  if (P.boost) { P.nitro = Math.max(0, P.nitro - dt * .45); puff(P.x - fx * P.len * .55, P.y - fy * P.len * .55, 2, { c: 0x7fd4ff, glow: true, a: P.a + Math.PI, sp: .25, s0: 90, s1: 180, l0: .12, l1: .25, z0: 3, z1: 5, z: 8 }) }
  if (up) fwd += S.accel * bm * dt;
  if (dn) fwd -= (fwd > 0 ? S.accel * 1.4 : S.accel * .6) * dt;
  if (hb) fwd -= fwd * .55 * dt;
  if (fwd > top) fwd += (top - fwd) * Math.min(1, dt * 3);
  if (fwd < -top * .4) fwd = -top * .4;
  fwd -= fwd * (up || dn ? .12 : .9) * dt;
  lat *= Math.max(0, 1 - (hb ? S.grip * .16 : S.grip) * dt);
  P.vx = fx * fwd - fy * lat; P.vy = fy * fwd + fx * lat;
  const sp = Math.hypot(P.vx, P.vy), steer = (rt ? 1 : 0) - (lt ? 1 : 0);
  P.steer += (steer - P.steer) * Math.min(1, dt * 10);
  P.a += steer * S.turn * Math.min(1, sp / 80) * (fwd < -5 ? -1 : 1) * (hb ? 1.35 : 1) * dt;
  P.x += P.vx * dt; P.y += P.vy * dt;
  collideStatic(P, P.r, .35);
  P.inv = Math.max(0, P.inv - dt);
  P.hp = Math.min(S.maxhp, P.hp + S.regen * dt);
  P.lat = lat; P.fwd = fwd; P.sp = sp; P.slipDeg = sp > 30 ? Math.round(Math.atan2(Math.abs(lat), Math.abs(fwd)) * 180 / Math.PI) : 0;

  /* drifting: skid marks, combo, heat (fire-rate boost), nitro refill */
  const slip = Math.abs(lat), isDrift = slip > 36 && sp > 72;
  const wl = [[P.x - fx * P.len * .32 - fy * P.wid * .42, P.y - fy * P.len * .32 + fx * P.wid * .42], [P.x - fx * P.len * .32 + fy * P.wid * .42, P.y - fy * P.len * .32 - fx * P.wid * .42]];
  if ((isDrift || (hb && sp > 45)) && P.wl) {
    g.strokeStyle = `rgba(40,28,18,${clamp(slip / 250, .14, .36)})`; g.lineWidth = 5;
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(P.wl[i][0], P.wl[i][1]); g.lineTo(wl[i][0], wl[i][1]); g.stroke() }
    G.groundDirty = true;
    if (Math.random() < .45) { const w = wl[Math.random() * 2 | 0]; puff(w[0], w[1], 1, { c: 0xdccbad, s0: 5, s1: 30, l0: .5, l1: .9, z0: 3, z1: 5, grow: 9, drag: 1.5, z: 4, vz0: 8, vz1: 25 }) }
  }
  P.wl = wl;
  if (isDrift) {
    drift.on = true; drift.off = 0;
    drift.pts += slip * dt * drift.mult * 1.05;
    drift.mult = Math.min(5, drift.mult + dt * .45 * S.driftGain);
    drift.heat = Math.min(1, drift.heat + dt * .6 * S.driftGain);
    P.nitro = Math.min(1, P.nitro + dt * .18 * S.driftGain * S.nitroFill);
    const lf = G.fires[G.fires.length - 1];
    if (S.exhaust && (!lf || Math.hypot(lf.x - P.x, lf.y - P.y) > 22)) G.fires.push({ x: P.x - fx * P.len * .5, y: P.y - fy * P.len * .5, life: 1.4 + S.exhaust * .3, max: 1.4 + S.exhaust * .3, r: 22 + S.exhaust * 4 });
  } else {
    drift.off += dt; drift.heat = Math.max(0, drift.heat - dt * .22);
    if (drift.on && drift.off > .45) bankDrift();
  }
  const rateMul = S.rate * (1 + drift.heat * .8);

  /* waves */
  G.waveT -= dt; G.spawnT -= dt;
  if (G.spawnT <= 0 && G.waveT > 2) {
    G.spawnT = Math.max(.32, 1.6 - G.wave * .1) * rnd(.7, 1.3);
    const n = 1 + Math.floor(G.wave / 3) + (Math.random() < .3 ? 1 : 0);
    for (let i = 0; i < n && G.enemies.length + G.pend.length < 90; i++) {
      const r = Math.random();
      queue(G.wave >= 3 && r < .1 + G.wave * .012 ? 'brute' : G.wave >= 2 && r < .38 ? 'spit' : 'rust');
    }
  }
  for (const s of G.pend) { s.t -= dt; if (s.t <= 0) { spawn(s.type, s.x, s.y); s.done = true } }
  G.pend = G.pend.filter(s => !s.done);
  if (G.waveT <= 0) { endWave(); return }

  /* enemies */
  for (const e of G.enemies) {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1; let spd = e.spd;
    let want = e.type === 'rust' ? Math.atan2(P.y + P.vy * .35 - e.y, P.x + P.vx * .35 - e.x) : Math.atan2(dy, dx);
    if (e.type === 'spit') {
      if (d < 300) want += Math.PI * .55;
      e.cd -= dt;
      if (e.cd <= 0 && d < 600) {
        e.cd = rnd(1.8, 2.8); const a = Math.atan2(dy, dx);
        G.ebul.push({ x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 4, dmg: e.dmg });
        puff(e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22, 4, { c: 0xb8ff70, glow: true, a, sp: .4, s0: 60, s1: 160, l0: .1, l1: .25, z0: 3, z1: 5, z: 14 });
      }
    }
    if (e.type === 'brute' || e.type === 'boss') {
      if (e.charge > 0) { e.charge -= dt; spd *= 2.2; if (Math.random() < .5) puff(e.x, e.y, 1, { c: 0xc8a878, s0: 10, s1: 40, l0: .5, l1: .9, z0: 8, z1: 14, grow: 14, z: 4, vz0: 10, vz1: 30 }) }
      else { e.cd -= dt; if (e.cd <= 0 && d < 520 && Math.abs(angDiff(Math.atan2(dy, dx), e.a)) < .5) { e.charge = e.type === 'boss' ? 1.6 : 1.1; e.cd = rnd(3, 5); txt(e.x, e.y - e.r, '!', '#ff6b5a', 26, .6) } }
    }
    e.a += clamp(angDiff(want, e.a), -e.turn * dt, e.turn * dt);
    const k = Math.min(1, dt * 2.2);
    e.vx += (Math.cos(e.a) * spd - e.vx) * k; e.vy += (Math.sin(e.a) * spd - e.vy) * k;
    e.x += e.vx * dt; e.y += e.vy * dt; collideStatic(e, e.r, .3);
    e.flash = Math.max(0, e.flash - dt); e.hitcd -= dt; e.sawcd -= dt; e.burncd -= dt;
  }
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i], b = E[j], dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
    if (Math.abs(dx) > m || Math.abs(dy) > m) continue;
    const d = Math.hypot(dx, dy);
    if (d < m && d > 0) { const o = (m - d) / d, wa = b.mass / (a.mass + b.mass); a.x -= dx * o * wa; a.y -= dy * o * wa; b.x += dx * o * (1 - wa); b.y += dy * o * (1 - wa) }
  }

  /* ramming */
  for (const e of E) {
    if (e.dead) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy), m = P.r + e.r;
    if (d < m + 4 && S.spikes && e.hitcd <= 0) { e.hitcd = .3; hurt(e, 12 * S.spikes * S.dmg) }
    if (d < m && d > 0) {
      const nx = dx / d, ny = dy / d, ov = m - d, pm = S.mass, em = e.mass;
      P.x -= nx * ov * em / (pm + em); P.y -= ny * ov * em / (pm + em); e.x += nx * ov * pm / (pm + em); e.y += ny * ov * pm / (pm + em);
      const rel = (P.vx - e.vx) * nx + (P.vy - e.vy) * ny;
      if (rel > 0) {
        const j = 1.5 * rel / (1 / pm + 1 / em);
        P.vx -= j / pm * nx; P.vy -= j / pm * ny; e.vx += j / em * nx; e.vy += j / em * ny;
        if (rel > 42) {
          hurt(e, rel * .25 * S.ram * pm * (P.boost ? 1.4 : 1));
          puff(P.x + nx * P.r, P.y + ny * P.r, 10 + rel / 25 | 0, { c: 0xffd27a, glow: true, k: 's', s0: 120, s1: 360, l0: .15, l1: .4, z: 10, vz0: 40, vz1: 200, grav: 500 });
          G.shake = Math.max(G.shake, rel / 30);
        }
        if (!e.dead) hitPlayer(e.dmg * (rel > 125 ? .35 : 1));
      } else if (P.inv <= 0) hitPlayer(e.dmg * .6);
    }
  }

  /* weapons */
  if (W.mg) {
    CD.mg -= dt; const t = nearest(P.x, P.y, 520);
    if (t) P.gunA += angDiff(Math.atan2(t.y - P.y, t.x - P.x), P.gunA) * Math.min(1, dt * 14);
    if (t && CD.mg <= 0) {
      CD.mg = .42 / (1 + .2 * (W.mg - 1)) / rateMul;
      for (const b of W.mg >= 3 ? [1, -1] : [0]) {
        const off = b * 5, a = P.gunA + rnd(-.04, .04), ox = -Math.sin(P.gunA) * off, oy = Math.cos(P.gunA) * off;
        G.bullets.push({ x: P.x + ox + Math.cos(a) * 16, y: P.y + oy + Math.sin(a) * 16, vx: Math.cos(a) * 700 + P.vx * .3, vy: Math.sin(a) * 700 + P.vy * .3, life: .8, dmg: (6 + W.mg * 3) * S.dmg });
      }
      puff(P.x + Math.cos(P.gunA) * 20, P.y + Math.sin(P.gunA) * 20, 2, { c: 0xffe08c, glow: true, a: P.gunA, sp: .3, s0: 60, s1: 160, l0: .05, l1: .1, z0: 3, z1: 5, z: 22 });
    }
  }
  if (W.mines) {
    CD.mines -= dt;
    if (CD.mines <= 0 && sp > 25) { CD.mines = (2.4 - .3 * W.mines) / rateMul; G.mines.push({ x: P.x - fx * P.len * .6, y: P.y - fy * P.len * .6, arm: .5, t: 0 }); if (G.mines.length > 14) G.mines.shift() }
  }
  for (const m of G.mines) {
    m.arm -= dt; m.t += dt;
    if (m.arm <= 0 && E.some(e => !e.dead && Math.hypot(e.x - m.x, e.y - m.y) < e.r + 26)) {
      m.dead = true; const R = 90 + W.mines * 14; boom(m.x, m.y, 30); G.shake = Math.max(G.shake, 7);
      for (const e of E) if (!e.dead && Math.hypot(e.x - m.x, e.y - m.y) < R + e.r) { hurt(e, (30 + W.mines * 20) * S.dmg); const a = Math.atan2(e.y - m.y, e.x - m.x); e.vx += Math.cos(a) * 400 / e.mass; e.vy += Math.sin(a) * 400 / e.mass }
    }
  }
  G.mines = G.mines.filter(m => !m.dead);
  if (W.tesla) {
    CD.tesla -= dt;
    if (CD.tesla <= 0) {
      let t = nearest(P.x, P.y, 270);
      if (t) {
        CD.tesla = (1.7 - .2 * W.tesla) / rateMul; const hit = new Set(); let px = P.x, py = P.y;
        for (let c = 0; c < W.tesla + 2 && t; c++) { hit.add(t); G.zaps.push({ x1: px, y1: py, x2: t.x, y2: t.y, t: .14 }); hurt(t, (10 + W.tesla * 7) * S.dmg); px = t.x; py = t.y; t = nearest(px, py, 190, hit) }
      }
    }
  }
  if (W.flame) {
    CD.flame -= dt; const R = 170 + W.flame * 20;
    const inCone = e => { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); return !e.dead && d < R + e.r && (dx * fx + dy * fy) / (d || 1) > .8 };
    if (E.some(inCone)) {
      puff(P.x + fx * P.len * .55, P.y + fy * P.len * .55, 3, { c: Math.random() < .5 ? 0xff9a3a : 0xffd25a, glow: true, a: P.a, sp: .32, s0: R * 1.6, s1: R * 2.4, l0: .25, l1: .4, z0: 4, z1: 7, grow: 22, drag: 1.2, vx: P.vx * .6, vy: P.vy * .6, z: 12, vz0: 0, vz1: 30 });
      if (CD.flame <= 0) { CD.flame = .12 / rateMul; for (const e of E) if (inCone(e)) hurt(e, (4 + W.flame * 2) * S.dmg, true) }
    }
  }
  if (W.saw) {
    const n = W.saw, R = P.r + 44;
    for (let i = 0; i < n; i++) {
      const a = G.time * 4.5 + i * TAU / n, sx = P.x + Math.cos(a) * R, sy = P.y + Math.sin(a) * R;
      for (const e of E) if (!e.dead && e.sawcd <= 0 && Math.hypot(e.x - sx, e.y - sy) < e.r + 13) { e.sawcd = .3; hurt(e, (12 + n * 5) * S.dmg); puff(sx, sy, 5, { c: 0xfff0c0, glow: true, k: 's', s0: 150, s1: 350, l0: .1, l1: .25, z: 10, vz0: 30, vz1: 120, grav: 400 }) }
    }
  }
  if (G.fires.length) for (const e of E) {
    if (e.dead || e.burncd > 0) continue;
    for (const f of G.fires) if (Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r * .6) { e.burncd = .25; hurt(e, 5 * S.exhaust * S.dmg, true); break }
  }

  for (const b of G.bullets) {
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    for (const e of E) { if (e.dead) continue; if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + 3) { hurt(e, b.dmg); b.life = 0; puff(b.x, b.y, 3, { c: 0xffe8a0, glow: true, k: 's', s0: 80, s1: 200, l0: .1, l1: .2, z: 12 }); break } }
    if (G.obs.some(o => Math.hypot(o.x - b.x, o.y - b.y) < o.r)) b.life = 0;
  }
  G.bullets = G.bullets.filter(b => b.life > 0);
  for (const b of G.ebul) {
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(P.x - b.x, P.y - b.y) < P.r + 5) { hitPlayer(b.dmg); b.life = 0 }
    if (G.obs.some(o => Math.hypot(o.x - b.x, o.y - b.y) < o.r)) b.life = 0;
  }
  G.ebul = G.ebul.filter(b => b.life > 0);
  G.enemies = G.enemies.filter(e => !e.dead);

  /* scrap pickup */
  for (const s of G.scraps) {
    s.t += dt; const dx = P.x - s.x, dy = P.y - s.y, d = Math.hypot(dx, dy) || 1;
    if (d < S.magnet && s.t > .25) { const p = 900 / Math.max(d, 30); s.vx += dx / d * p * dt * 60; s.vy += dy / d * p * dt * 60 }
    s.vx *= 1 - Math.min(1, 3 * dt); s.vy *= 1 - Math.min(1, 3 * dt); s.x += s.vx * dt; s.y += s.vy * dt;
    if (d < P.r + 10 && s.t > .25) { G.scrap += s.v; s.got = true }
  }
  G.scraps = G.scraps.filter(s => !s.got);

  /* camera target: ahead of the car */
  G.cam.x += (P.x + P.vx * .3 - G.cam.x) * Math.min(1, dt * 5);
  G.cam.y += (P.y + P.vy * .3 - G.cam.y) * Math.min(1, dt * 5);
  G.cam.x = clamp(G.cam.x, 420, AW - 420); G.cam.y = clamp(G.cam.y, 300, AH - 300);
}
