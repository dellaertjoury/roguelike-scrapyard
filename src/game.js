// Game simulation: driving, drifting, jumping, enemies, weapons, laps, garage.
// (Internally a lap is still called a 'wave'.)
// Runs on a flat 2D plane (x, y). The 3D scene maps sim y to world z.
import { CARS, BASE, PARTS, PART, SLOTS, WSTAT, ENEMY, ECOL, ELITES } from './data.js';
import { t, L, num, lang } from './i18n.js';

export const AW = 2000, AH = 1360, EDGE = 34, GS = .6;
export const TAU = Math.PI * 2;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d };
export const fmt = n => num(n);
const hex = s => parseInt(s.slice(1), 16);

export const G = {
  state: 'menu', S: null, P: null, W: null, CD: null,
  enemies: [], bullets: [], ebul: [], mines: [], fires: [], scraps: [], parts: [], texts: [], pend: [], zaps: [], obs: [], ramps: [],
  wave: 0, fuel: 60, tank: 60, pump: null, pumpT: 0, cans: [], spawnT: 0, scrap: 0, score: 0, wrecks: 0, bestDrift: 0, shake: 0, time: 0,
  banner: null, build: {}, car: null, offer: [], rerollCost: 0, clearT: 0,
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
  g.fillText(t('title').toUpperCase(), AW / 2, 210);
  g.lineCap = 'round';
  G.groundDirty = true;
}

// Ramps: a wedge that rises from (x, y) along direction d to height H over length L.
// The landing zone beyond the lip is kept clear of obstacles.
export function makeObs() {
  const ramps = []; let n = 0;
  while (ramps.length < 2 && n++ < 400) {
    const d = rnd(0, TAU), L = 150, W = 80, H = 30, x = rnd(300, AW - 300), y = rnd(260, AH - 260);
    const c = Math.cos(d), s = Math.sin(d), cx = x + c * L / 2, cy = y + s * L / 2, lx = x + c * (L + 200), ly = y + s * (L + 200);
    if (Math.hypot(cx - AW / 2, cy - AH / 2) < 300) continue;
    if (lx < 160 || lx > AW - 160 || ly < 160 || ly > AH - 160 || x + c * L < 120 || x + c * L > AW - 120 || y + s * L < 120 || y + s * L > AH - 120) continue;
    if (ramps.some(r => Math.hypot(r.cx - cx, r.cy - cy) < 600)) continue;
    ramps.push({ x, y, d, c, s, L, W, H, cx, cy, lx, ly });
  }
  const obs = []; n = 0;
  while (obs.length < 12 && n++ < 600) {
    const o = { x: rnd(220, AW - 220), y: rnd(220, AH - 220), r: rnd(26, 42), k: Math.random() < .6 ? 'tire' : 'hay' };
    if (Math.hypot(o.x - AW / 2, o.y - AH / 2) < 280) continue;
    if (obs.some(b => Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r + 140)) continue;
    if (ramps.some(r => Math.hypot(r.cx - o.x, r.cy - o.y) < r.L / 2 + o.r + 110 || Math.hypot(r.lx - o.x, r.ly - o.y) < o.r + 170 || Math.hypot(r.x - r.c * 120 - o.x, r.y - r.s * 120 - o.y) < o.r + 90)) continue;
    obs.push(o);
  }
  G.obs = obs; G.ramps = ramps; G.obsVersion++;
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
  G.S = null; G.P = null;
  G.car = c; G.build = Object.fromEntries(Object.entries(c.build).map(([k, v]) => [k, { id: v[0], lvl: v[1] }]));
  recompute();
  G.P = { x: AW / 2, y: AH / 2, a: -Math.PI / 2, vx: 0, vy: 0, hp: 0, inv: 0, nitro: .6, car: c, len: c.len, wid: c.wid, r: (c.len + c.wid) / 4 + 2, wl: null, boost: false, gunA: -Math.PI / 2, lat: 0, fwd: 0, steer: 0, slipDeg: 0, sp: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0 };
  G.P.hp = G.S.maxhp;
  G.CD = { mg: 0, mines: 0, tesla: 0, flame: 0 };
  for (const k of ['enemies', 'bullets', 'ebul', 'mines', 'fires', 'scraps', 'parts', 'texts', 'pend', 'zaps']) G[k] = [];
  Object.assign(G, { wave: 0, scrap: 0, score: 0, wrecks: 0, bestDrift: 0, offer: [] });
  Object.assign(G.drift, { on: false, pts: 0, mult: 1, heat: 0, off: 0 });
  makeGround(); makeObs(); G.cam.x = G.P.x; G.cam.y = G.P.y;
  nextWave();
}
export function nextWave() {
  G.wave++; G.driftScrap = 0; G.fuel = G.tank; G.pump = null; G.pumpT = PUMP_FIRST; G.cans = []; G.spawnT = 1.2; G.state = 'play';
  const elite = G.wave % 5 === 0 ? ELITES[(G.wave / 5 - 1) % ELITES.length] : null;
  G.banner = { s: ['lap', { n: G.wave }], elite, sub: elite ? ['eliteSub', { name: L().elites[elite][0], hint: L().elites[elite][1] }] : ['tankFull', { l: G.tank }], id: Math.random() };
  if (G.wave === 2) Object.assign(G.banner, { elite: 'thief', sub: ['thiefIntro'] }); // fuel thieves show up from lap 2
  if (elite) queue(elite);
  // gentle start: 1 car on lap 1, slowly more after that
  for (let i = 0; i < Math.min(5, 1 + Math.floor(G.wave / 2)); i++) queue('rust');
  G.on.play && G.on.play();
}
function spawnSpot() {
  const P = G.P;
  for (let t = 0; t < 30; t++) {
    const a = rnd(0, TAU), d = rnd(360, 640);
    const x = clamp(P.x + Math.cos(a) * d, EDGE + 60, AW - EDGE - 60), y = clamp(P.y + Math.sin(a) * d, EDGE + 60, AH - EDGE - 60);
    if (Math.hypot(x - P.x, y - P.y) < 280) continue;
    if (G.obs.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 50)) continue;
    if (G.ramps.some(r => Math.hypot(r.cx - x, r.cy - y) < r.L / 2 + 40)) continue;
    return { x, y };
  }
  return null;
}
function queue(type) {
  const p = spawnSpot(); if (!p) return;
  const tt = ELITES.includes(type) ? 1.8 : 1.1; G.pend.push({ x: p.x, y: p.y, t: tt, max: tt, type, elite: tt > 1.5 });
}
function spawn(type, x, y) {
  const D = ENEMY(G.wave)[type], P = G.P;
  G.enemies.push(Object.assign({
    type, x, y, a: Math.atan2(P.y - y, P.x - x), vx: 0, vy: 0, max: D.hp, flash: 0, cd: rnd(1, 2.5), charge: 0,
    hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, seed: Math.random() * 1e4 | 0,
    col: ECOL[Math.random() * ECOL.length | 0], num: 1 + (Math.random() * 98 | 0)
  }, D));
  if (D.elite) G.enemies[G.enemies.length - 1].cd = 2;
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
  G.shake = Math.max(G.shake, e.elite ? 18 : e.r / 3); G.cheer = 1;
  const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 2);
  gr.addColorStop(0, 'rgba(30,22,16,.5)'); gr.addColorStop(1, 'rgba(30,22,16,0)');
  g.fillStyle = gr; g.fillRect(e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4);
  for (let i = 0; i < 5; i++) { g.fillStyle = Math.random() < .5 ? e.col : '#3b3530'; g.save(); g.translate(e.x + rnd(-e.r, e.r), e.y + rnd(-e.r, e.r)); g.rotate(rnd(0, TAU)); g.fillRect(-4, -2, rnd(5, 10), rnd(3, 6)); g.restore() }
  G.groundDirty = true;
  let n = e.sc; for (let i = 0; i < e.sc; i++) if (Math.random() < G.S.luck) n++;
  if (scored && e.stolen > 0) G.cans.push({ x: e.x, y: e.y, l: Math.max(5, e.stolen), t: 0 });
  if (scored) {
    G.wrecks++; G.score += e.sc * 40;
    for (let i = 0; i < Math.min(n, 14); i++) { const a = rnd(0, TAU), s = rnd(40, 200); G.scraps.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v: n > 14 && i === 0 ? n - 13 : 1, t: 0 }) }
  } // cars still alive at the end of a lap just explode: no scrap for them
}
function endWave() {
  for (const e of G.enemies) kill(e, false);
  G.enemies = []; G.pend = []; G.ebul = [];
  for (const s of G.scraps) G.scrap += s.v; G.scraps = [];
  G.P.hp = Math.min(G.S.maxhp, G.P.hp + G.S.maxhp * .2);
  bankDrift(); G.state = 'clear'; G.clearT = 1.1;
  G.banner = { s: ['outOfFuel'], sub: ['garageOpen'], id: Math.random() };
}
function die() {
  G.state = 'dead'; G.clearT = 1.6; const P = G.P;
  boom(P.x, P.y, 50, P.car.color); boom(P.x + 20, P.y - 10, 30); G.shake = 24;
}
function bankDrift() {
  const d = G.drift;
  if (d.pts > 40) {
    // at most 3 scrap per combo and a per-lap cap, so circling alone can't out-earn wrecking cars
    const p = Math.round(d.pts), cap = Math.max(0, 6 + 2 * G.wave - G.driftScrap), s = Math.min(3, Math.floor(p / 250), cap);
    G.score += p; G.scrap += s; G.driftScrap += s; G.bestDrift = Math.max(G.bestDrift, p);
    txt(G.P.x, G.P.y - 30, t('fDrift', { p: fmt(p) }) + (s ? ' · ' + t('fScrap', { s }) : ''), '#ffc23d', 18, 1.2);
  }
  d.pts = 0; d.mult = 1; d.on = false; d.time = 0;
}

/* ---------- fuel: the tank is the lap clock ---------- */
// 60 L tank, burns 1 L/s (2 L/s on nitro), so a lap with no refuelling lasts 60 s.
// A pump opens somewhere on the map; standing in its zone adds 5 L every 3 s until its 20 L reserve
// is used up, then it closes and another opens 15 s later. Fuel keeps burning while you fill, so a pump
// is worth exactly its reserve (+20 s of lap) and there is no way to freeze the lap clock.
export const BURN = 1, PUMP_R = 64, PUMP_TICK = 3, PUMP_GIVE = 5, PUMP_RESERVE = 20, PUMP_RESPAWN = 15, PUMP_FIRST = 8, THIEF_STEAL = 6;
export const fmtL = l => (Math.round(l * 10) / 10).toLocaleString(lang() === 'en' ? 'en-US' : lang() === 'vls' ? 'nl-BE' : lang());
function openPump() {
  const P = G.P;
  for (let i = 0; i < 80; i++) {
    const x = rnd(220, AW - 220), y = rnd(220, AH - 220);
    if (Math.hypot(x - P.x, y - P.y) < 350) continue;
    if (G.obs.some(o => Math.hypot(o.x - x, o.y - y) < o.r + PUMP_R + 30)) continue;
    if (G.ramps.some(r => Math.hypot(r.cx - x, r.cy - y) < r.L / 2 + PUMP_R + 60 || Math.hypot(r.lx - x, r.ly - y) < PUMP_R + 120)) continue;
    G.pump = { x, y, res: PUMP_RESERVE, acc: 0, id: Math.random() }; return;
  }
  G.pumpT = 2; // no room right now, try again shortly
}
function fuelStep(dt) {
  const P = G.P, pu = G.pump;
  if (!pu) { G.pumpT -= dt; if (G.pumpT <= 0) openPump() }
  const filling = pu && G.fuel < G.tank - .5 && P.z < 6 && Math.hypot(P.x - pu.x, P.y - pu.y) < PUMP_R;
  G.filling = !!filling;
  if (filling) {
    pu.acc += dt;
    if (pu.acc >= PUMP_TICK) {
      pu.acc -= PUMP_TICK; const l = Math.min(PUMP_GIVE, pu.res, G.tank - G.fuel); G.fuel += l; pu.res -= l;
      txt(pu.x, pu.y - 30, t('fFuel', { l: fmtL(l) }), '#7fdcaa', 20, 1.1);
      if (pu.res <= .01) { G.pump = null; G.pumpT = PUMP_RESPAWN }
    }
  } else if (pu) pu.acc = Math.max(0, pu.acc - dt * 2);
  G.fuel -= dt * (BURN + (P.boost ? 1 : 0));
  for (const c of G.cans) {
    c.t += dt;
    if (P.z < 10 && Math.hypot(c.x - P.x, c.y - P.y) < P.r + 14 && G.fuel < G.tank) { const l = Math.min(c.l, G.tank - G.fuel); G.fuel += l; c.got = true; txt(c.x, c.y - 30, t('fFuel', { l: fmtL(l) }), '#7fdcaa', 20, 1.1) }
  }
  G.cans = G.cans.filter(c => !c.got);
}

/* ---------- garage: slot-based build ---------- */
// Stats are always rebuilt from the car's base stats plus every installed part,
// so replacing a part cleanly removes the old one's effect.
export function recompute() {
  const oldMax = G.S ? G.S.maxhp : 0;
  const S = Object.assign({}, BASE, G.car.st), W = { mg: 0, mines: 0, tesla: 0, flame: 0, saw: 0 };
  for (const slot of SLOTS) {
    const b = G.build[slot]; if (!b) continue;
    const d = PART[b.id]; if (d.w) W[d.w] = b.lvl; else d.f(S, b.lvl);
  }
  G.S = S; G.W = W;
  if (G.P && oldMax) G.P.hp = clamp(G.P.hp + Math.max(0, S.maxhp - oldMax), 1, S.maxhp);
}
export const lvlOf = it => { const b = G.build[PART[it.id].slot]; return b && b.id === it.id ? b.lvl : 0 };
// prices compound 15% per lap so late-lap income doesn't buy everything at once
export const priceScale = () => Math.pow(1.15, G.wave - 1);
export const price = it => Math.round(PART[it.id].cost * priceScale() * (1 + .5 * lvlOf(it)));
export const nameOf = it => { const d = PART[it.id]; return d.w ? L().w[d.w][0] : L().parts[it.id][0] };
export const descOf = it => {
  const d = PART[it.id]; if (!d.w) return L().parts[it.id][1];
  const l = Math.min(d.max, lvlOf(it) + 1); return L().w[d.w][1](l, ...WSTAT[d.w](l));
};
export const repairCost = () => Math.round(8 * priceScale()) + G.wave;
const canOffer = it => lvlOf(it) < PART[it.id].max;
const OFFER = 5;
// Locked cards survive rerolls and stay in the garage for the next lap.
function roll() {
  const out = G.offer.filter(it => it.locked && !it.sold && canOffer(it)).map(it => ({ id: it.id, locked: true }));
  const pool = PARTS.filter(p => !out.some(o => o.id === p.id) && canOffer(p));
  while (out.length < OFFER && pool.length) {
    const tot = pool.reduce((s, p) => s + (p.w ? 1.3 : 1), 0); let r = Math.random() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w ? 1.3 : 1; if (r <= 0) break }
    out.push({ id: pool[k].id }); pool.splice(k, 1);
  }
  return out;
}
function openShop() { G.state = 'shop'; G.rerollCost = Math.round(2 * priceScale()) + G.wave; G.offer = roll(); G.on.shop && G.on.shop() }
export function buy(i) {
  const it = G.offer[i]; if (!it || it.sold || !canOffer(it)) return false;
  const p = price(it); if (p > G.scrap) return false;
  const d = PART[it.id], cur = G.build[d.slot];
  G.scrap -= p; it.sold = true; it.locked = false;
  G.build[d.slot] = cur && cur.id === it.id ? { id: it.id, lvl: cur.lvl + 1 } : { id: it.id, lvl: 1 };
  recompute();
  return true;
}
export function repair() {
  const c = repairCost(); if (G.scrap < c || G.P.hp >= G.S.maxhp) return false;
  G.scrap -= c; G.P.hp = Math.min(G.S.maxhp, G.P.hp + G.S.maxhp * .5); return true;
}
export function toggleLock(i) { const it = G.offer[i]; if (it && !it.sold) it.locked = !it.locked }
export function reroll() { if (G.scrap < G.rerollCost) return; G.scrap -= G.rerollCost; G.rerollCost++; G.offer = roll() }

/* ---------- update ---------- */
const K = (...c) => c.some(k => G.keys[k]);
function nearest(x, y, max, skip) { let b = null, bd = max; for (const e of G.enemies) { if (e.dead || (skip && skip.has(e))) continue; const d = Math.hypot(e.x - x, e.y - y) - e.r; if (d < bd) { bd = d; b = e } } return b }
// Tyres are springy: they return most of the impact speed and always kick you
// back out a little. Hay bales just absorb the hit.
const TIRE_BOUNCE = .95, TIRE_KICK = 95;
function bounceOff(o, nx, ny, bounce, tire, cx, cy) {
  const vn = o.vx * nx + o.vy * ny; if (vn >= 0) return;
  let out = -vn * (tire ? TIRE_BOUNCE : bounce);
  if (tire && -vn > 15) out = Math.max(out, o === G.P ? TIRE_KICK : TIRE_KICK * .5);
  o.vx += (out - vn) * nx; o.vy += (out - vn) * ny;
  if (o !== G.P || vn > -45) return;
  const k = Math.min(1, -vn / 160);
  if (tire) { o.a += (Math.random() - .5) * .5 * k; o.stun = .35 * k; G.cheer = Math.max(G.cheer, k * .6) }
  G.shake = Math.max(G.shake, 3 + k * 9);
  puff(cx, cy, 6 + 10 * k | 0, { c: 0xffd27a, glow: true, k: 's', s0: 100, s1: 300, l0: .15, l1: .35, z: 8, vz0: 40, vz1: 140, grav: 400 });
  if (tire) puff(cx, cy, 4 + 6 * k | 0, { c: 0x2a2826, s0: 40, s1: 140, l0: .5, l1: .9, z0: 2, z1: 4, z: 10, vz0: 80, vz1: 200, grav: 600 });
  puff(cx, cy, 5, { c: 0xdccbad, s0: 10, s1: 50, l0: .5, l1: .9, z0: 3, z1: 6, grow: 10, z: 4, vz0: 10, vz1: 30 });
}
function collideStatic(o, r, bounce) {
  if (o.z < 26) for (const b of G.obs) {
    const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy), m = r + b.r;
    if (d < m) {
      const nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0; o.x = b.x + nx * m; o.y = b.y + ny * m;
      bounceOff(o, nx, ny, bounce, b.k === 'tire', o.x - nx * r, o.y - ny * r);
    }
  }
  const pu = G.pump; // the pump itself is a small solid post
  if (pu && o.z < 26) { const dx = o.x - pu.x, dy = o.y - pu.y, d = Math.hypot(dx, dy), m = r + 13; if (d < m) { const nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0; o.x = pu.x + nx * m; o.y = pu.y + ny * m; const vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= 1.3 * vn * nx; o.vy -= 1.3 * vn * ny } } }
  const lo = EDGE + r;
  if (o.x < lo) { o.x = lo; bounceOff(o, 1, 0, bounce, true, EDGE, o.y) }
  if (o.x > AW - lo) { o.x = AW - lo; bounceOff(o, -1, 0, bounce, true, AW - EDGE, o.y) }
  if (o.y < lo) { o.y = lo; bounceOff(o, 0, 1, bounce, true, o.x, EDGE) }
  if (o.y > AH - lo) { o.y = AH - lo; bounceOff(o, 0, -1, bounce, true, o.x, AH - EDGE) }
}
/* ---------- ramps & air time ---------- */
const GRAV = 560;
function rampAt(x, y) {
  for (const r of G.ramps) {
    const dx = x - r.x, dy = y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
    if (u >= 0 && u <= r.L && Math.abs(v) <= r.W / 2) return { r, h: r.H * u / r.L };
  }
  return null;
}
// Called after a car moved from (px, py). Rides up ramps, launches off the lip,
// handles gravity and landing. The steep back and sides of a ramp act as walls.
function rampStep(o, px, py, dt) {
  const ra = rampAt(o.x, o.y), h = ra ? ra.h : 0;
  if (o.air) {
    o.vz -= GRAV * dt; o.z += o.vz * dt; o.airT += dt; o.pitch = clamp(o.vz / 700, -.3, .3);
    if (o.z <= h) land(o, h);
    return;
  }
  if (h > o.z + 8) { rampPushOut(o, ra.r, true); return }
  if (!ra && o.z > 6) {
    const r = o.rampRef, along = r ? o.vx * r.c + o.vy * r.s : 0;
    o.air = true; o.airT = 0; o.vz = Math.max(0, along) * .95 + 30; o.rampRef = null; o.crushJump = false;
    return;
  }
  o.z = h; o.rampRef = ra ? ra.r : null;
  o.pitch = ra ? Math.atan2(ra.r.H, ra.r.L) * (Math.cos(o.a) * ra.r.c + Math.sin(o.a) * ra.r.s) : 0;
}
// Ramps are solid from the back and sides. Push a car that is inside out through the nearest
// face (back or side) and kill its velocity into that face. Also used after any other push.
function rampPushOut(o, r, bounce) {
  const dx = o.x - r.x, dy = o.y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
  const back = r.L - u, side = r.W / 2 - Math.abs(v);
  let nx, ny, dist;
  if (back < side) { nx = r.c; ny = r.s; dist = back } else { const sg = v >= 0 ? 1 : -1; nx = -r.s * sg; ny = r.c * sg; dist = side }
  o.x += nx * (dist + 1); o.y += ny * (dist + 1);
  const vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= vn * nx * (bounce ? 1.5 : 1); o.vy -= vn * ny * (bounce ? 1.5 : 1) }
  if (o === G.P && bounce) G.shake = Math.max(G.shake, 6);
}
function rampSolid(o) {
  if (o.air || o.dead) return;
  for (const r of G.ramps) {
    const dx = o.x - r.x, dy = o.y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
    if (u >= 0 && u <= r.L && Math.abs(v) <= r.W / 2 && r.H * u / r.L > o.z + 8) rampPushOut(o, r, false);
  }
}
function land(o, h) {
  const impact = -o.vz; o.air = false; o.z = h; o.vz = 0; o.pitch = 0;
  puff(o.x, o.y, 10, { c: 0xdccbad, s0: 60, s1: 160, l0: .5, l1: 1, z0: 6, z1: 10, grow: 12, z: 4, vz0: 10, vz1: 40 });
  if (o !== G.P) {
    if (o.slam) { // monster truck lands: shockwave
      const P = G.P, R = 150; boom(o.x, o.y, 26); G.shake = Math.max(G.shake, 14);
      puff(o.x, o.y, 26, { c: 0xdccbad, s0: 160, s1: 320, l0: .5, l1: .9, z0: 8, z1: 14, grow: 10, z: 4, vz0: 10, vz1: 40, drag: 3 });
      const d = Math.hypot(P.x - o.x, P.y - o.y);
      if (d < R + P.r && P.z < 12) { hitPlayer(o.dmg); const a = Math.atan2(P.y - o.y, P.x - o.x); P.vx += Math.cos(a) * 320; P.vy += Math.sin(a) * 320 }
      o.slam = null; o.vx *= .2; o.vy *= .2;
    }
    return;
  }
  const P = o, S = G.S;
  G.shake = Math.max(G.shake, 4 + impact / 40); G.cheer = 1;
  if (P.airT > .35 && !P.crushJump) {
    const pts = Math.round(P.airT * 300), sc = Math.floor(P.airT * 4);
    const cap = Math.max(0, 6 + 2 * G.wave - G.driftScrap), got = Math.min(sc, cap); // drift + air share one per-lap stunt cap
    G.score += pts; G.scrap += got; G.driftScrap += got;
    txt(P.x, P.y - 34, t('fAir', { t: P.airT.toFixed(1) }) + (got ? ' · ' + t('fScrap', { s: got }) : ''), '#8fd0ea', 18, 1.2);
  }
  // landing on a car crushes it, and you bounce off its roof
  let crushed = false;
  for (const e of G.enemies) {
    if (e.dead || e.air || (e.crushcd || 0) > G.time || Math.hypot(e.x - P.x, e.y - P.y) > P.r + e.r * .8) continue;
    e.crushcd = G.time + 1.5;
    hurt(e, (45 + impact * .3) * S.mass * S.dmg); crushed = true;
    puff(e.x, e.y, 14, { c: 0xffd27a, glow: true, k: 's', s0: 120, s1: 360, l0: .15, l1: .4, z: 18, vz0: 40, vz1: 200, grav: 500 });
  }
  if (crushed) { txt(P.x, P.y - 58, t('fCrush'), '#ffc23d', 22, 1); P.air = true; P.vz = 140; P.airT = 0; P.z = Math.max(P.z, 16); P.crushJump = true }
  else P.crushJump = false;
}

/* ---------- elite special moves ---------- */
// Returns a speed multiplier for this frame.
function eliteMove(e, dt, d) {
  const P = G.P; e.cd -= dt;
  if (e.type === 'harvester') { // fires two chained saw blades from its front bumper, then reels them in
    const S = e.saw || (e.saw = { st: 'idle', t: 0, d: 0 });
    if (S.st === 'idle') {
      if (e.cd <= 0 && d < 420 && Math.abs(angDiff(Math.atan2(P.y - e.y, P.x - e.x), e.a)) < .6) { S.st = 'wind'; S.t = .6; txt(e.x, e.y - e.r, '!', '#ff6b5a', 30, .6) }
      return 1;
    }
    if (S.st === 'wind') { S.t -= dt; if (S.t <= 0) S.st = 'out'; return .1 }
    if (S.st === 'out') {
      S.d += 640 * dt; if (S.d >= 300) { S.d = 300; S.st = 'hold'; S.t = .35 }
      // blades bite into tyres and bales instead of passing through them
      for (const b of harvesterBlades(e)) if (G.obs.some(o => Math.hypot(o.x - b.x, o.y - b.y) < o.r + b.R * .5)) {
        S.st = 'hold'; S.t = .35; puff(b.x, b.y, 10, { c: 0xfff0c0, glow: true, k: 's', s0: 150, s1: 350, l0: .1, l1: .25, z: 10, vz0: 30, vz1: 120, grav: 400 }); break;
      }
    }
    else if (S.st === 'hold') { S.t -= dt; if (S.t <= 0) S.st = 'in' }
    else if (S.st === 'in') { S.d -= 380 * dt; if (S.d <= 0) { S.d = 0; S.st = 'idle'; e.cd = rnd(3.5, 5) } }
    for (const b of harvesterBlades(e)) {
      if (S.d > 10 && P.z < 20 && Math.hypot(P.x - b.x, P.y - b.y) < P.r + b.R) { hitPlayer(e.dmg * .8); puff(b.x, b.y, 8, { c: 0xfff0c0, glow: true, k: 's', s0: 150, s1: 350, l0: .1, l1: .25, z: 10, vz0: 30, vz1: 120, grav: 400 }) }
    }
    return .25;
  }
  if (e.type === 'monster') { // leaps at where you will be and slams down
    if (!e.air && e.cd <= 0 && d < 560) {
      const T = 1.15, tx = clamp(P.x + P.vx * T * .8, EDGE + 60, AW - EDGE - 60), ty = clamp(P.y + P.vy * T * .8, EDGE + 60, AH - EDGE - 60);
      e.slam = { x: tx, y: ty }; e.vx = (tx - e.x) / T; e.vy = (ty - e.y) / T; e.air = true; e.vz = GRAV * T / 2; e.airT = 0; e.cd = rnd(4.5, 6);
      e.a = Math.atan2(ty - e.y, tx - e.x);
    }
    return 1;
  }
  if (e.type === 'tow') { // throws a hook; once it bites you get reeled in until nitro breaks you free
    const H = e.hook || (e.hook = { st: 'idle', x: e.x, y: e.y });
    if (H.st === 'idle') { H.x = e.x; H.y = e.y; if (e.cd <= 0 && d < 440 && d > 110) { const a = Math.atan2(P.y + P.vy * .3 - e.y, P.x + P.vx * .3 - e.x); Object.assign(H, { st: 'fly', vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, t: 1.1 }) } }
    else if (H.st === 'fly') {
      H.x += H.vx * dt; H.y += H.vy * dt; H.t -= dt;
      if (P.z < 20 && Math.hypot(P.x - H.x, P.y - H.y) < P.r + 8) { H.st = 'hooked'; H.t = 1.8; hitPlayer(e.dmg * .4); txt(P.x, P.y - 40, t('fHooked'), '#ff6b5a', 18, 1) }
      else if (H.t <= 0 || G.obs.some(o => Math.hypot(o.x - H.x, o.y - H.y) < o.r + 4)) H.st = 'back';
    } else if (H.st === 'hooked') {
      H.x = P.x; H.y = P.y; H.t -= dt;
      const dx = e.x - P.x, dy = e.y - P.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 80) { P.vx += dx / dd * 560 * dt; P.vy += dy / dd * 560 * dt }
      if (P.boost) { H.st = 'back'; txt(P.x, P.y - 40, t('fFree'), '#8fd0ea', 18, 1) } else if (H.t <= 0) H.st = 'back';
    } else if (H.st === 'back') {
      const dx = e.x - H.x, dy = e.y - H.y, dd = Math.hypot(dx, dy) || 1;
      H.x += dx / dd * 620 * dt; H.y += dy / dd * 620 * dt; if (dd < 24) { H.st = 'idle'; e.cd = rnd(3.5, 5) }
    }
    return H.st === 'hooked' ? .35 : d < 220 ? .5 : 1;
  }
  return 1;
}
// Blade positions of the Harvester (shared with the renderer).
export function harvesterBlades(e) {
  const fx = Math.cos(e.a), fy = Math.sin(e.a), d = e.saw ? e.saw.d : 0, out = [];
  for (const side of [-1, 1]) {
    const bx = e.x + fx * (e.len / 2 + 16) - fy * side * e.wid * .42, by = e.y + fy * (e.len / 2 + 16) + fx * side * e.wid * .42;
    out.push({ bx, by, x: bx + fx * d, y: by + fy * d, R: 17 });
  }
  return out;
}

// Collision circles of a car: its main circle, plus a nose circle for the Harvester's long comb.
const MAIN = [[0, 0, 0]];
function bodyCircles(e) {
  if (e.type !== 'harvester') { MAIN[0][2] = e.r; return MAIN }
  const k = e.len * .62; return [[0, 0, e.r], [Math.cos(e.a) * k, Math.sin(e.a) * k, 30]];
}

function hitPlayer(d) {
  const P = G.P;
  if (P.inv > 0 || G.state !== 'play') return;
  d *= 1 - Math.min(.7, G.S.armor); P.hp -= d; P.inv = .55; G.shake = Math.max(G.shake, 8);
  txt(P.x, P.y - 20, '-' + fmt(d), '#ff6b5a', 18, .7);
  if (G.drift.pts > 200) txt(P.x, P.y - 46, t('fCombo'), '#ff6b5a', 16, 1);
  G.drift.pts = 0; G.drift.mult = 1; G.drift.time = 0;
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
  P.stun = Math.max(0, (P.stun || 0) - dt);
  const gr = !P.air; // no throttle, brakes or grip while flying
  const up = K('KeyW', 'ArrowUp') && P.stun <= 0 && gr, dn = K('KeyS', 'ArrowDown') && gr, hb = K('Space') && gr, lt = K('KeyA', 'ArrowLeft'), rt = K('KeyD', 'ArrowRight');
  P.boost = K('ShiftLeft', 'ShiftRight') && P.nitro > .02;
  const bm = P.boost ? 1.8 * S.nitroPow : 1, top = S.top * (P.boost ? 1.35 * S.nitroPow : 1);
  if (P.boost) { P.nitro = Math.max(0, P.nitro - dt * .45); puff(P.x - fx * P.len * .55, P.y - fy * P.len * .55, 2, { c: 0x7fd4ff, glow: true, a: P.a + Math.PI, sp: .25, s0: 90, s1: 180, l0: .12, l1: .25, z0: 3, z1: 5, z: 8 }) }
  if (up) fwd += S.accel * bm * dt;
  if (dn && fwd > -top * .4) fwd -= (fwd > 0 ? S.accel * 1.4 : S.accel * .6) * dt; // reverse is capped, bounces are not
  if (hb) fwd -= fwd * .55 * dt;
  if (fwd > top) fwd += (top - fwd) * Math.min(1, dt * 3);
  fwd -= fwd * (!gr ? .05 : up || dn ? .12 : .9) * dt;
  if (gr) lat *= Math.max(0, 1 - (hb ? S.grip * .16 : S.grip) * dt);
  P.vx = fx * fwd - fy * lat; P.vy = fy * fwd + fx * lat;
  const sp = Math.hypot(P.vx, P.vy), steer = (rt ? 1 : 0) - (lt ? 1 : 0);
  P.steer += (steer - P.steer) * Math.min(1, dt * 10);
  P.a += steer * S.turn * Math.min(1, sp / 80) * (fwd < -5 ? -1 : 1) * (hb ? 1.35 : 1) * (gr ? 1 : .3) * dt;
  const px0 = P.x, py0 = P.y;
  P.x += P.vx * dt; P.y += P.vy * dt;
  rampStep(P, px0, py0, dt);
  collideStatic(P, P.r, .35);
  P.inv = Math.max(0, P.inv - dt);
  P.hp = Math.min(S.maxhp, P.hp + S.regen * dt);
  P.lat = lat; P.fwd = fwd; P.sp = sp; P.slipDeg = sp > 30 ? Math.round(Math.atan2(Math.abs(lat), Math.abs(fwd)) * 180 / Math.PI) : 0;

  /* drifting: skid marks, combo, heat (fire-rate boost), nitro refill */
  const slip = Math.abs(lat), isDrift = gr && slip > 36 && sp > 72;
  const wl = [[P.x - fx * P.len * .32 - fy * P.wid * .42, P.y - fy * P.len * .32 + fx * P.wid * .42], [P.x - fx * P.len * .32 + fy * P.wid * .42, P.y - fy * P.len * .32 - fx * P.wid * .42]];
  if ((isDrift || (hb && sp > 45)) && P.wl && P.z < 1) {
    // hot drifts burn an orange streak under the black rubber
    if (isDrift && drift.heat > .2) {
      g.strokeStyle = `rgba(255,120,40,${drift.heat * .22})`; g.lineWidth = 11;
      for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(P.wl[i][0], P.wl[i][1]); g.lineTo(wl[i][0], wl[i][1]); g.stroke() }
    }
    g.strokeStyle = `rgba(40,28,18,${clamp(slip / 250, .14, .4)})`; g.lineWidth = isDrift ? 6 : 5;
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(P.wl[i][0], P.wl[i][1]); g.lineTo(wl[i][0], wl[i][1]); g.stroke() }
    G.groundDirty = true;
    const back = Math.atan2(-P.vy, -P.vx), sparkC = drift.heat > .66 ? 0xff5a1f : drift.heat > .33 ? 0xff9a2a : 0xffd27a;
    for (const w of wl) {
      if (Math.random() < (isDrift ? .9 : .3)) puff(w[0], w[1], 1, { c: isDrift ? 0xf4f0e8 : 0xdccbad, s0: 5, s1: 40, l0: .6, l1: isDrift ? 1.5 : .9, z0: isDrift ? 5 : 3, z1: isDrift ? 9 : 5, grow: isDrift ? 18 : 9, drag: 1.5, z: 4, vz0: 8, vz1: 30, vx: -P.vx * .15, vy: -P.vy * .15 });
      if (isDrift && Math.random() < .45 + drift.heat * .55) puff(w[0], w[1], 1, { c: sparkC, glow: true, k: 's', a: back, sp: .7, s0: 60, s1: 200, l0: .12, l1: .3, z: 3, vz0: 20, vz1: 90, grav: 400 });
    }
  }
  P.wl = wl;
  if (isDrift) {
    drift.on = true; drift.off = 0; drift.time = (drift.time || 0) + dt;
    // drifting close to other cars is worth much more than drifting in an empty corner
    const near = G.enemies.some(e => !e.dead && Math.abs(e.x - P.x) < 200 && Math.abs(e.y - P.y) < 200 && Math.hypot(e.x - P.x, e.y - P.y) < 200);
    drift.near = near;
    drift.pts += slip * dt * drift.mult * (near ? 1.4 : .4);
    drift.mult = Math.min(5, drift.mult + dt * (near ? .7 : .3) * S.driftGain);
    if (drift.time > 8) bankDrift(); // one combo lasts at most 8 s
    drift.heat = Math.min(1, drift.heat + dt * .6 * S.driftGain);
    P.nitro = Math.min(1, P.nitro + dt * .18 * S.driftGain * S.nitroFill);
    const lf = G.fires[G.fires.length - 1];
    if (S.exhaust && (!lf || Math.hypot(lf.x - P.x, lf.y - P.y) > 16)) G.fires.push({ x: P.x - fx * P.len * .55, y: P.y - fy * P.len * .55, life: 1 + S.exhaust * .25, max: 1 + S.exhaust * .25, r: 11 + S.exhaust * 3, rot: rnd(0, TAU) });
  } else {
    drift.off += dt; drift.heat = Math.max(0, drift.heat - dt * .22);
    if (drift.on && drift.off > .45) bankDrift();
  }
  const rateMul = S.rate * (1 + drift.heat * .8);

  /* waves */
  fuelStep(dt);
  G.spawnT -= dt;
  if (G.spawnT <= 0 && G.fuel > 2) {
    // early laps are calm: one car every ~3 s and a low cap, ramping up from lap 4
    G.spawnT = Math.max(.5, 3.2 - G.wave * .3) * rnd(.8, 1.2);
    const n = 1 + Math.floor((G.wave - 1) / 3) + (G.wave >= 4 && Math.random() < .3 ? 1 : 0), cap = Math.min(60, 4 + G.wave * 3);
    for (let i = 0; i < n && G.enemies.length + G.pend.length < cap; i++) {
      const r = Math.random();
      queue(G.wave >= 2 && r > .86 ? 'thief' : G.wave >= 4 && r < .08 + G.wave * .012 ? 'brute' : G.wave >= 3 && r < .33 ? 'spit' : 'rust');
    }
  }
  for (const s of G.pend) {
    s.t -= dt; if (s.t > 0) continue;
    // the player may have driven onto the marker meanwhile: move it rather than spawn on top of them
    if (Math.hypot(s.x - P.x, s.y - P.y) < 170) { const p = spawnSpot(); if (p) { s.x = p.x; s.y = p.y; s.t = s.max * .6; continue } }
    spawn(s.type, s.x, s.y); s.done = true;
  }
  G.pend = G.pend.filter(s => !s.done);
  if (G.fuel <= 0) { G.fuel = 0; endWave(); return }

  /* enemies */
  for (const e of G.enemies) {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1; let spd = e.spd;
    let want = e.type === 'rust' ? Math.atan2(P.y + P.vy * .35 - e.y, P.x + P.vx * .35 - e.x) : Math.atan2(dy, dx);
    if (e.type === 'thief') { // siphon: grab fuel on contact, run off, come back for more
      if (e.flee > 0) { e.flee -= dt; want = Math.atan2(-dy, -dx); spd *= 1.15 }
      else if (d < e.r + P.r + 10 && P.z < 10 && G.fuel > 0) {
        const l = Math.min(THIEF_STEAL, G.fuel); G.fuel -= l; e.stolen = (e.stolen || 0) + l; e.flee = 3;
        txt(P.x, P.y - 40, t('fStolen', { l: fmtL(l) }), '#ff6b5a', 18, 1);
        puff(P.x, P.y, 8, { c: 0x9fe070, glow: true, s0: 40, s1: 140, l0: .3, l1: .6, z0: 2, z1: 4, z: 10, vz0: 20, vz1: 60 });
      }
    }
    if (e.type === 'spit') {
      if (d < 300) want += Math.PI * .55;
      e.cd -= dt;
      if (e.cd <= 0 && d < 600) {
        e.cd = rnd(1.8, 2.8); const a = Math.atan2(dy, dx);
        G.ebul.push({ x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 4, dmg: e.dmg });
        puff(e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22, 4, { c: 0xb8ff70, glow: true, a, sp: .4, s0: 60, s1: 160, l0: .1, l1: .25, z0: 3, z1: 5, z: 14 });
      }
    }
    if (e.elite) spd *= eliteMove(e, dt, d);
    else if (e.type === 'brute') {
      if (e.charge > 0) { e.charge -= dt; spd *= 2.2; if (Math.random() < .5) puff(e.x, e.y, 1, { c: 0xc8a878, s0: 10, s1: 40, l0: .5, l1: .9, z0: 8, z1: 14, grow: 14, z: 4, vz0: 10, vz1: 30 }) }
      else { e.cd -= dt; if (e.cd <= 0 && d < 520 && Math.abs(angDiff(Math.atan2(dy, dx), e.a)) < .5) { e.charge = 1.1; e.cd = rnd(3, 5); txt(e.x, e.y - e.r, '!', '#ff6b5a', 26, .6) } }
    }
    if (!e.air) {
      e.a += clamp(angDiff(want, e.a), -e.turn * dt, e.turn * dt);
      const k = Math.min(1, dt * 2.2);
      e.vx += (Math.cos(e.a) * spd - e.vx) * k; e.vy += (Math.sin(e.a) * spd - e.vy) * k;
    }
    const ex0 = e.x, ey0 = e.y;
    e.x += e.vx * dt; e.y += e.vy * dt; rampStep(e, ex0, ey0, dt); collideStatic(e, e.r, .3);
    e.flash = Math.max(0, e.flash - dt); e.hitcd -= dt; e.sawcd -= dt; e.burncd -= dt;
  }
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i], b = E[j], dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
    if (Math.abs(dx) > m || Math.abs(dy) > m || Math.abs(a.z - b.z) > 14) continue;
    const d = Math.hypot(dx, dy);
    if (d < m && d > 0) { const o = (m - d) / d, wa = b.mass / (a.mass + b.mass); a.x -= dx * o * wa; a.y -= dy * o * wa; b.x += dx * o * (1 - wa); b.y += dy * o * (1 - wa) }
  }

  /* ramming: both cars get hurt. Damage to you grows with impact speed and with
     how heavy the other car is compared to yours; whoever drove into whom also counts. */
  for (const e of E) {
    if (e.dead || Math.abs(P.z - e.z) > 14) continue;
    let ox = 0, oy = 0, er = e.r, best = Infinity; // only the circle you overlap most, so a hit never counts twice
    for (const [cx, cy, cr] of bodyCircles(e)) { const pen = Math.hypot(e.x + cx - P.x, e.y + cy - P.y) - cr; if (pen < best) { best = pen; ox = cx; oy = cy; er = cr } }
    const dx = e.x + ox - P.x, dy = e.y + oy - P.y, d = Math.hypot(dx, dy), m = P.r + er;
    if (d < m + 4 && S.spikes && e.hitcd <= 0) { e.hitcd = .3; hurt(e, 12 * S.spikes * S.dmg) }
    if (d < m && d > 0) {
      const nx = dx / d, ny = dy / d, ov = m - d, pm = S.mass, em = e.mass;
      P.x -= nx * ov * em / (pm + em); P.y -= ny * ov * em / (pm + em); e.x += nx * ov * pm / (pm + em); e.y += ny * ov * pm / (pm + em);
      const rel = (P.vx - e.vx) * nx + (P.vy - e.vy) * ny;
      if (rel > 0) {
        const pv = P.vx * nx + P.vy * ny, ev = -(e.vx * nx + e.vy * ny);
        const j = 1.5 * rel / (1 / pm + 1 / em);
        let self = 0;
        P.vx -= j / pm * nx; P.vy -= j / pm * ny; e.vx += j / em * nx; e.vy += j / em * ny;
        if (rel > 42) {
          hurt(e, rel * .25 * S.ram * pm * (P.boost ? 1.4 : 1));
          self = rel * .05 * Math.sqrt(em / pm) * S.ramGuard;
          puff(P.x + nx * P.r, P.y + ny * P.r, 10 + rel / 25 | 0, { c: 0xffd27a, glow: true, k: 's', s0: 120, s1: 360, l0: .15, l1: .4, z: 10, vz0: 40, vz1: 200, grav: 500 });
          G.shake = Math.max(G.shake, rel / 30);
        }
        const dd = self + (e.dead ? 0 : ev > pv ? e.dmg : e.dmg * .3); if (dd > 0) hitPlayer(dd);
      } else if (P.inv <= 0) hitPlayer(e.dmg * .6);
    }
  }

  for (const e of E) rampSolid(e); rampSolid(P);

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
    if (CD.mines <= 0 && sp > 25) { CD.mines = (4.6 - .5 * W.mines) / rateMul; G.mines.push({ x: P.x - fx * P.len * .6, y: P.y - fy * P.len * .6, arm: .5, t: 0 }); if (G.mines.length > 14) G.mines.shift() }
  }
  for (const m of G.mines) {
    m.arm -= dt; m.t += dt;
    if (m.arm <= 0 && E.some(e => !e.dead && e.z < 10 && Math.hypot(e.x - m.x, e.y - m.y) < e.r + 26)) {
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
    // blades sit on steel arms left and right of the car; they hit cars only, never tyres or bales
    for (const b of sawPoints(P, W.saw)) for (const e of E) {
      if (e.dead || e.sawcd > 0 || Math.abs(e.z - P.z) > 14 || Math.hypot(e.x - b.x, e.y - b.y) > e.r + b.R) continue;
      e.sawcd = .3; hurt(e, WSTAT.saw(W.saw)[0] * S.dmg);
      puff(b.x, b.y, 6, { c: 0xfff0c0, glow: true, k: 's', s0: 150, s1: 350, l0: .1, l1: .25, z: 10, vz0: 30, vz1: 120, grav: 400 });
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
    if (P.z < 20 && Math.hypot(P.x - b.x, P.y - b.y) < P.r + 5) { hitPlayer(b.dmg); b.life = 0 }
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

// Side-saw layout, shared with the 3D rig so the visible blades match the hitbox.
export function sawLayout(l, len, wid) {
  const R = 11 + l * 1.5;
  return { R, reach: wid / 2 + 12 + R, fwd: l >= 4 ? [len * .28, -len * .22] : [len * .06] };
}
export function sawPoints(P, l) {
  const { R, reach, fwd } = sawLayout(l, P.len, P.wid), fx = Math.cos(P.a), fy = Math.sin(P.a), out = [];
  for (const side of [-1, 1]) for (const f of fwd) out.push({ x: P.x + fx * f - fy * reach * side, y: P.y + fy * f + fx * reach * side, R });
  return out;
}
