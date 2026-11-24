// v3 in-page helpers (installed after harness INSTALL): enemy factory, resets, simple driving bots.
(() => {
  const m = M, G = m.G;
  window.mkE = (type, wave, x, y, extra = {}) => {
    const D0 = D.ENEMY(wave)[type];
    return Object.assign({ type, x, y, a: 0, vx: 0, vy: 0, max: D0.hp, flash: 0, cd: 0, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: D0.col || '#888', num: 1, seed: 1 }, D0, extra);
  };
  // empty arena, no spawns, nothing in the way
  window.reset3 = (car = 1, { god = true, keepLevel = false, weapons = false } = {}) => {
    m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9;
    if (!weapons) for (const k in G.W) G.W[k] = 0;
    if (!keepLevel) { G.obs = []; G.ramps = [] }
    if (god) G.P.hp = G.S.maxhp = 1e6;
  };
  // steering towards a point, with a crude obstacle/ramp avoidance
  window.steerKeys = (tx, ty, extra = []) => {
    const P = G.P; let a = Math.atan2(ty - P.y, tx - P.x);
    const d = Math.hypot(tx - P.x, ty - P.y);
    for (const o of G.obs) {
      const ox = o.x - P.x, oy = o.y - P.y, along = ox * Math.cos(a) + oy * Math.sin(a), side = -ox * Math.sin(a) + oy * Math.cos(a);
      if (along > 0 && along < Math.min(d, 220) && Math.abs(side) < o.r + P.r + 18) { a += side > 0 ? -.9 : .9; break }
    }
    for (const r of G.ramps) {
      const ox = r.cx - P.x, oy = r.cy - P.y, along = ox * Math.cos(a) + oy * Math.sin(a), side = -ox * Math.sin(a) + oy * Math.cos(a);
      if (along > 0 && along < Math.min(d, 260) && Math.abs(side) < 100) { a += side > 0 ? -.9 : .9; break }
    }
    const df = m.angDiff(a, P.a), k = [...extra];
    if (df > .1) k.push('KeyD'); else if (df < -.1) k.push('KeyA');
    return k;
  };
  // drive to (x, y) and stop inside radius rr
  window.goStop = (x, y, rr = 30) => {
    const P = G.P, d = Math.hypot(x - P.x, y - P.y);
    if (d > rr + 60) return steerKeys(x, y, ['KeyW']);
    if (P.sp > 35) return ['KeyS'];
    if (d > rr) return steerKeys(x, y, P.sp < 25 ? ['KeyW'] : []);
    return [];
  };
  window.nearestE = () => { let b = null, bd = 1e9; for (const e of G.enemies) { const d = Math.hypot(e.x - G.P.x, e.y - G.P.y); if (d < bd) { bd = d; b = e } } return b };
  // ram bot: chase the nearest car, nitro when lined up
  window.ramKeys = () => {
    const e = nearestE(); if (!e) return goStop(1000, 680, 80);
    const P = G.P, lined = Math.abs(m.angDiff(Math.atan2(e.y - P.y, e.x - P.x), P.a)) < .3;
    return steerKeys(e.x, e.y, ['KeyW', ...(lined && Math.hypot(e.x - P.x, e.y - P.y) < 260 ? ['ShiftLeft'] : [])]);
  };
  // drift bot: W+D circles with a short handbrake tap
  window.driftKeys = i => (i % 45) < 6 ? ['KeyW', 'KeyD', 'Space'] : ['KeyW', 'KeyD'];
  // run one lap with a key function; returns frames and stats; each(i) runs after every step
  window.runLap3 = (keysF, each, maxFrames = 12000) => {
    let i = 0;
    while ((G.state === 'play' || G.state === 'pause') && i < maxFrames) { step(1, 1 / 30, keysF(i), each ? () => each(i) : null, true); i++ }
    for (let k = 0; k < 80 && G.state !== 'shop' && G.state !== 'over'; k++) step(1, 1 / 30, []);
    return i;
  };
  // simple shopper: buy affordable parts, weapons and their levels first
  window.shopBot = () => {
    if (G.state !== 'shop') return 0; let n = 0;
    for (let pass = 0; pass < 3; pass++) {
      const order = G.offer.map((it, i) => [it, i]).filter(([it]) => !it.sold).sort((a, b) => (D.PART[b[0].id].w ? 1 : 0) - (D.PART[a[0].id].w ? 1 : 0));
      for (const [it, i] of order) {
        const d = D.PART[it.id], cur = G.build[d.slot];
        if (cur && cur.id !== it.id && D.PART[cur.id].w && !d.w) continue; // don't swap a weapon for a stat part
        if (m.buy(i)) n++;
      }
    }
    return n;
  };
  return true;
})()
