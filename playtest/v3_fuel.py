# v3: fuel system. Lap length with/without refuelling, pump rules and exploits, pump placement over
# many seeds, pump post collision, dying / lap end at the pump, thieves and jerrycans.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game

LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()

LAPLEN = r"""
() => {
  const m = M, G = m.G, out = {};
  const lapSecs = (setup, keysF, each) => { reset3(1, { keepLevel: true }); setup && setup(); let pumps = 0, got = 0, last = null;
    const f = runLap3(keysF, i => { if (G.pump && G.pump !== last) { last = G.pump; pumps++ } each && each(i) });
    return { gameSeconds: +(f / 30).toFixed(1), pumpsOpened: pumps, state: G.state };
  };
  out.parked = lapSecs(null, () => []);
  out.nitroAlways = lapSecs(null, () => ['ShiftLeft'], () => { G.P.nitro = 1 });
  // perfect camper: teleported onto every pump the moment it opens (upper bound)
  let fills = 0;
  out.teleportCamper = lapSecs(null, () => [], () => { const pu = G.pump; if (pu) { G.P.x = pu.x + 20; G.P.y = pu.y; G.P.vx = G.P.vy = 0 } });
  // same but holding nitro the whole time (burns 2 L/s)
  out.teleportCamperNitro = lapSecs(null, () => ['ShiftLeft'], () => { G.P.nitro = 1; const pu = G.pump; if (pu) { G.P.x = pu.x + 20; G.P.y = pu.y; G.P.vx = G.P.vy = 0 } });
  // driving camper: drives to every pump and parks in it (real driving, empty arena with obstacles)
  out.drivingCamper = [];
  for (let k = 0; k < 6; k++) { let travel = 0; const r = lapSecs(null, () => G.pump ? goStop(G.pump.x + 30, G.pump.y, 24) : goStop(1000, 680, 60), () => { if (G.pump && !G.filling) travel++ }); r.framesNotFillingWhilePumpOpen = travel; out.drivingCamper.push(r) }
  // fuel accounting inside one pump: total given, ticks, time standing in zone
  reset3(1, { keepLevel: true }); G.pumpT = .01; step(1, 1 / 30, []); const pu = G.pump; let given = 0, ticks = 0, prevF = G.fuel, t = 0, maxFuel = 0;
  step(900, 1 / 30, [], () => { G.P.x = pu.x + 20; G.P.y = pu.y; G.P.vx = G.P.vy = 0; const d = G.fuel - prevF + 1 / 30; if (d > .5) { given += d; ticks++ } prevF = G.fuel; t++; maxFuel = Math.max(maxFuel, G.fuel); if (!G.pump || G.pump !== pu) return false });
  out.onePump = { given: +given.toFixed(2), ticks, secondsToEmpty: +(t / 30).toFixed(1), pumpClosed: G.pump !== pu, nextPumpIn: +G.pumpT.toFixed(1) };
  // pump near a full tank: arrive with 59 L. How many litres does the pump hand out in total, how long does it stay open?
  reset3(1, { keepLevel: true }); G.pumpT = .01; step(1, 1 / 30, []); { const pu = G.pump; let t = 0, gotL = 0, pf = G.fuel; G.fuel = 59.6;
    step(3000, 1 / 30, [], () => { G.P.x = pu.x + 20; G.P.y = pu.y; G.P.vx = G.P.vy = 0; t++; const d = G.fuel - pf + 1 / 30; if (d > .05) gotL += d; pf = G.fuel; if (G.pump !== pu || G.state !== 'pause' && G.state !== 'play') return false });
    out.pumpWithNearlyFullTank = { secondsOpen: +(t / 30).toFixed(1), litresGiven: +gotL.toFixed(1), closed: G.pump !== pu, state: G.state } }
  // leaving and coming back: is partial progress kept? enter 2.5 s, leave 0.5 s, re-enter
  reset3(1, { keepLevel: true }); G.pumpT = .01; step(1, 1 / 30, []); { const pu = G.pump; let t = 0;
    const at = (i) => i < 75 || i >= 90; let first = null, f0 = G.fuel;
    step(200, 1 / 30, [], () => { if (at(t)) { G.P.x = pu.x + 20; G.P.y = pu.y } else { G.P.x = pu.x + 200; G.P.y = pu.y } G.P.vx = G.P.vy = 0; t++; if (first === null && G.fuel > f0 - t / 30 + 1) first = t });
    out.leaveAndReturn = { firstTickAfterSeconds: first && +(first / 30).toFixed(2), note: 'in 2.5 s, out 0.5 s, back in' } }
  // airborne over the pad: no fill
  reset3(1, { keepLevel: true }); G.pumpT = .01; step(1, 1 / 30, []); { const pu = G.pump; const f0 = G.fuel;
    step(200, 1 / 30, [], () => { G.P.x = pu.x + 20; G.P.y = pu.y; G.P.z = 20; G.P.air = true; G.P.vz = 0; });
    out.hoveringOverPad = { fuelChange: +(G.fuel - f0).toFixed(2), expectedBurnOnly: -6.67 } }
  G.state = 'pause'; return out;
}
"""

PLACE = r"""
() => {
  // pump placement over many levels: generate a level, put the player somewhere, force a pump to open
  const m = M, G = m.G, out = { levels: 0, pumps: 0, retries: 0, inObstacle: 0, zoneTouchesObstacle: 0, onRamp: 0, zoneOnRamp: 0, onLandingPath: 0, postOnRunUp: 0, nearWall: 0, tooClose: 0, minDistObstacleEdge: 1e9, minDistRamp: 1e9, minWall: 1e9, minLandingPath: 1e9, minRunUp: 1e9, samples: [] };
  const segDist = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))); return Math.hypot(px - ax - vx * t, py - ay - vy * t) };
  const rampBoxDist = (x, y, r) => { const dx = x - r.x, dy = y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c; return Math.hypot(Math.max(-u, 0, u - r.L), Math.max(Math.abs(v) - r.W / 2, 0)) };
  m.start(1); G.state = 'pause';
  for (let lv = 0; lv < 600; lv++) {
    m.makeObs(); out.levels++;
    for (let k = 0; k < 8; k++) {
      G.enemies = []; G.pend = []; G.spawnT = 1e9; G.P.x = 100 + Math.random() * 1800; G.P.y = 100 + Math.random() * 1160; G.P.vx = G.P.vy = 0; G.P.z = 0; G.P.air = false; G.fuel = 60;
      // keep the player out of obstacles/ramps
      if (G.obs.some(o => Math.hypot(o.x - G.P.x, o.y - G.P.y) < o.r + 30) || G.ramps.some(r => rampBoxDist(G.P.x, G.P.y, r) < 30)) continue;
      G.pump = null; G.pumpT = .001; G.state = 'play'; m.update(1 / 30);
      let tries = 0; while (!G.pump && tries < 20) { tries++; out.retries++; G.pumpT = .001; m.update(1 / 30) }
      G.state = 'pause'; const pu = G.pump; if (!pu) continue; out.pumps++;
      const px = G.P.x, py = G.P.y;
      if (Math.hypot(pu.x - px, pu.y - py) < 350) out.tooClose++;
      for (const o of G.obs) { const d = Math.hypot(o.x - pu.x, o.y - pu.y); out.minDistObstacleEdge = Math.min(out.minDistObstacleEdge, d - o.r - m.PUMP_R); if (d < o.r + 13) out.inObstacle++; if (d < o.r + m.PUMP_R) out.zoneTouchesObstacle++ }
      for (const r of G.ramps) {
        const bd = rampBoxDist(pu.x, pu.y, r); out.minDistRamp = Math.min(out.minDistRamp, bd - m.PUMP_R);
        if (bd < 13) out.onRamp++; if (bd < m.PUMP_R) out.zoneOnRamp++;
        // landing path: from the lip to 520 units beyond it (longest jumps measured ~ 450), 60 wide
        const lx0 = r.x + r.c * r.L, ly0 = r.y + r.s * r.L, ld = segDist(pu.x, pu.y, lx0, ly0, lx0 + r.c * 520, ly0 + r.s * 520);
        out.minLandingPath = Math.min(out.minLandingPath, ld); if (ld < 13 + 30) out.onLandingPath++;
        // run-up: 250 units behind the ramp foot
        const rd = segDist(pu.x, pu.y, r.x, r.y, r.x - r.c * 250, r.y - r.s * 250); out.minRunUp = Math.min(out.minRunUp, rd); if (rd < 13 + 25) out.postOnRunUp++;
      }
      const w = Math.min(pu.x, pu.y, m.AW - pu.x, m.AH - pu.y) - m.EDGE; out.minWall = Math.min(out.minWall, w); if (w < m.PUMP_R + 40) out.nearWall++;
      if (out.samples.length < 5 && (out.onLandingPath || out.postOnRunUp)) out.samples.push({ pu: [Math.round(pu.x), Math.round(pu.y)], ramps: G.ramps.map(r => [Math.round(r.x), Math.round(r.y), +r.d.toFixed(2)]) });
    }
  }
  for (const k of ['minDistObstacleEdge', 'minDistRamp', 'minWall', 'minLandingPath', 'minRunUp']) out[k] = Math.round(out[k]);
  return out;
}
"""

LANDING = r"""
() => {
  // where do real ramp jumps land? full-speed and nitro runs over each ramp of 40 levels; distance lip -> touchdown
  const m = M, G = m.G, res = { jumps: 0, maxLand: 0, minLand: 1e9 };
  for (let lv = 0; lv < 40; lv++) {
    for (const car of [0, 2]) {
      reset3(car, { keepLevel: true }); if (lv) m.makeObs(); G.obs = [];
      for (const r of G.ramps) for (const nitro of [false, true]) {
        const P = G.P; P.x = r.x - r.c * 260; P.y = r.y - r.s * 260; P.a = r.d; P.vx = r.c * 150; P.vy = r.s * 150; P.z = 0; P.air = false; P.vz = 0;
        let flew = false, land = null;
        step(240, 1 / 30, nitro ? ['KeyW', 'ShiftLeft'] : ['KeyW'], () => { G.P.nitro = 1; if (P.air) flew = true; if (flew && !P.air) { land = [P.x, P.y]; return false } });
        if (land) { res.jumps++; const lx = r.x + r.c * r.L, ly = r.y + r.s * r.L, d = Math.hypot(land[0] - lx, land[1] - ly); res.maxLand = Math.max(res.maxLand, Math.round(d)); res.minLand = Math.min(res.minLand, Math.round(d)) }
      }
    }
  }
  G.state = 'pause'; return res;
}
"""

POST = r"""
() => {
  // drive into the pump post at different speeds and angles; tunnelling and pinning
  const m = M, G = m.G, out = { runs: 0, tunnelled: 0, maxPen: 0, stuckRuns: 0, details: [] };
  for (const speed of [150, 300, 480, 800, 1200]) for (let k = 0; k < 8; k++) {
    reset3(1); G.pump = { x: 1000, y: 680, res: 20, acc: 0, id: 1 }; G.pumpT = 1e9; const P = G.P;
    const a = k / 8 * Math.PI * 2, off = (k % 3 - 1) * 10;
    P.x = 1000 - Math.cos(a) * 140 - Math.sin(a) * off; P.y = 680 - Math.sin(a) * 140 + Math.cos(a) * off; P.a = a; P.vx = Math.cos(a) * speed; P.vy = Math.sin(a) * speed;
    let side0 = Math.sign((P.x - 1000) * Math.cos(a) + (P.y - 680) * Math.sin(a)), crossed = false, minD = 1e9, still = 0;
    step(90, 1 / 30, ['KeyW'], () => { const d = Math.hypot(P.x - 1000, P.y - 680); minD = Math.min(minD, d); const s = Math.sign((P.x - 1000) * Math.cos(a) + (P.y - 680) * Math.sin(a)); if (s !== side0 && Math.abs(-(P.x - 1000) * Math.sin(a) + (P.y - 680) * Math.cos(a)) < 10 && minD < 13 + P.r - 1) crossed = true; if (d < 13 + P.r + 2 && P.sp < 5) still++ });
    out.runs++; const pen = Math.max(0, 13 + P.r - minD); out.maxPen = Math.max(out.maxPen, +pen.toFixed(1)); if (pen > P.r) out.tunnelled++; if (still > 45) out.stuckRuns++;
    if (k === 0) out.details.push({ speed, minCentreDist: Math.round(minD), contactDist: 13 + P.r, speedAfter: Math.round(P.sp) });
  }
  // enemies: rust cars chasing a player parked behind the pump post: do they pile up on it?
  reset3(1); G.pump = { x: 1000, y: 680, res: 1e9, acc: 0, id: 1 }; G.pumpT = 1e9; G.P.x = 1040; G.P.y = 680; G.P.hp = 1e9; G.fuel = 1e6; G.tank = 1e6;
  G.enemies = [0, 1, 2, 3].map(i => mkE('rust', 3, 700, 560 + i * 80, { spd: 100 }));
  let stuckE = 0; step(300, 1 / 30, [], () => { G.P.x = 1040; G.P.y = 680; G.P.vx = G.P.vy = 0; G.P.inv = 1; for (const e of G.enemies) if (Math.hypot(e.x - 1000, e.y - 680) < 13 + e.r + 2 && Math.hypot(e.vx, e.vy) < 5) stuckE++ });
  out.enemiesPinnedOnPostFrames = stuckE; G.tank = 60;
  G.state = 'pause'; return out;
}
"""

EDGES = r"""
() => {
  const m = M, G = m.G, out = {};
  // dying at the pump while it is filling
  reset3(1, { god: false }); G.pump = { x: 1000, y: 680, res: 20, acc: 2.9, id: 1 }; G.pumpT = 1e9; G.P.x = 1020; G.P.y = 680; G.fuel = 30; G.P.hp = 1;
  G.enemies = [mkE('brute', 5, 1060, 680, { a: Math.PI, vx: -200 })];
  let st = []; step(120, 1 / 30, [], () => { if (st[st.length - 1] !== G.state) st.push(G.state) });
  out.dieAtPump = { states: st, fuel: +G.fuel.toFixed(2), pumpRes: G.pump && G.pump.res, filling: G.filling };
  // lap ends while filling: fuel .05 L with the tick 1 frame away vs 3 frames away
  for (const [lbl, acc] of [['tickSameFrame', 2.99], ['tick3FramesLater', 2.9]]) {
    reset3(1); G.pump = { x: 1000, y: 680, res: 20, acc, id: 1 }; G.pumpT = 1e9; G.P.x = 1020; G.P.y = 680; G.fuel = .05; G.P.vx = G.P.vy = 0;
    let st = []; step(60, 1 / 30, [], () => { if (st[st.length - 1] !== G.state) st.push(G.state) });
    out['lapEnd_' + lbl] = { states: st, fuel: +G.fuel.toFixed(2), bannerKey: G.banner && G.banner.s && G.banner.s[0], fillingFlagAfter: G.filling, pumpKept: !!G.pump, cansKept: G.cans.length };
  }
  // after the lap: next lap state is clean?
  m.nextWave(); G.state = 'pause'; out.nextLapClean = { fuel: G.fuel, pump: G.pump, pumpT: G.pumpT, cans: G.cans.length, filling: G.filling };
  // nitro: burn rate measured
  reset3(1); G.pumpT = 1e9; { const f0 = G.fuel; step(150, 1 / 30, ['ShiftLeft', 'KeyW'], () => { G.P.nitro = 1; if (G.P.x > 1700) G.P.x = 300 }); out.nitroBurnPerSec = +((f0 - G.fuel) / 5).toFixed(2) }
  reset3(1); G.pumpT = 1e9; { const f0 = G.fuel; step(150, 1 / 30, ['KeyW'], () => { if (G.P.x > 1700) G.P.x = 300 }); out.normalBurnPerSec = +((f0 - G.fuel) / 5).toFixed(2) }
  // nitro key held with an EMPTY nitro bar: does it still burn 2 L/s?
  reset3(1); G.pumpT = 1e9; { G.P.nitro = 0; const f0 = G.fuel; step(150, 1 / 30, ['ShiftLeft']); out.emptyNitroHeldBurnPerSec = +((f0 - G.fuel) / 5).toFixed(2) }
  // no spawns in the last 2 L; pending spawns still pop?
  reset3(1, { keepLevel: true }); G.wave = 3; G.fuel = 2.5; G.spawnT = .01; { let q = 0; step(30, 1 / 30, [], () => { q = Math.max(q, G.pend.length) }); out.spawnsQueuedBelow2L = q }
  G.state = 'pause'; return out;
}
"""

THIEF = r"""
() => {
  const m = M, G = m.G, out = {};
  // single thief: steal amount, flee time, can drop when wrecked
  reset3(1); G.wave = 3; G.pumpT = 1e9; G.P.x = 1000; G.P.y = 680; G.fuel = 40;
  let th = mkE('thief', 3, 1060, 680, { a: Math.PI }); G.enemies = [th];
  let stolenAt = null, fleeFrames = 0, back = null; step(200, 1 / 30, [], () => { G.P.x = 1000; G.P.y = 680; G.P.vx = G.P.vy = 0; if (th.stolen && stolenAt === null) stolenAt = G.time; if (th.flee > 0) fleeFrames++ });
  out.single = { fuelAfter: +G.fuel.toFixed(2), stolen: th.stolen, fleeSeconds: +(fleeFrames / 30).toFixed(1), stealsIn200Frames: Math.round(th.stolen / 6) };
  th.hp = .001; G.P.x = th.x - 30; G.P.y = th.y; G.P.vx = 400; G.P.vy = 0; G.P.a = 0; step(1, 1 / 30, ['KeyW']);
  out.single.cansAfterKill = G.cans.map(c => ({ l: c.l, distFromPlayer: Math.round(Math.hypot(c.x - G.P.x, c.y - G.P.y)) }));
  { const f0 = G.fuel; if (G.cans[0]) { G.P.x = G.cans[0].x; G.P.y = G.cans[0].y; G.P.vx = G.P.vy = 0 } step(1, 1 / 30, []); out.single.fuelFromCan = +(G.fuel - f0 + 1 / 30).toFixed(2) }
  // stealing at low fuel: 3 L in the tank. The can holds max(5, stolen)
  reset3(1); G.wave = 3; G.pumpT = 1e9; G.fuel = 3; th = mkE('thief', 3, 1040, 680, { a: Math.PI }); G.enemies = [th]; G.P.x = 1000; G.P.y = 680;
  step(1, 1 / 30, []); const stolenLow = th.stolen; th.hp = .001; G.P.x = th.x - 25; G.P.y = th.y; G.P.vx = 400; G.P.vy = 0; step(1, 1 / 30, ['KeyW']);
  const canL = G.cans[0] && G.cans[0].l; const before = G.fuel; if (G.cans[0]) { G.P.x = G.cans[0].x; G.P.y = G.cans[0].y } step(1, 1 / 30, []);
  out.lowFuel = { tankBefore: 3, stolen: stolenLow, canLitres: canL, fuelAfterPickup: +G.fuel.toFixed(2), netGainLitres: +(G.fuel - 3 + 3 / 30).toFixed(2) };
  // five thieves touching at once
  reset3(1); G.wave = 5; G.pumpT = 1e9; G.fuel = 40; G.P.x = 1000; G.P.y = 680;
  G.enemies = [0, 1, 2, 3, 4].map(i => mkE('thief', 5, 1000 + Math.cos(i * 1.25) * 36, 680 + Math.sin(i * 1.25) * 36, { a: i * 1.25 + Math.PI }));
  step(1, 1 / 30, []); out.fiveThieves = { fuelLostInOneFrame: +(40 - G.fuel - 1 / 30).toFixed(2), thievesThatStole: G.enemies.filter(e => e.stolen).length };
  // thief at almost 0 fuel: steals the last litres -> lap ends this frame?
  reset3(1); G.wave = 3; G.pumpT = 1e9; G.fuel = .5; G.enemies = [mkE('thief', 3, 1036, 680, { a: Math.PI })]; G.P.x = 1000; G.P.y = 680;
  step(1, 1 / 30, [], null, true); out.stealLastLitres = { state: G.state, fuel: G.fuel, stolen: G.enemies[0] && G.enemies[0].stolen };
  G.state = 'pause';
  // can on a ramp: thief wrecked on the upper half of a ramp; can the player pick the can up?
  reset3(1, { keepLevel: true }); G.obs = []; const R = G.ramps[0]; G.pumpT = 1e9; G.fuel = 30;
  const res = [];
  for (const u of [.2, .4, .6, .8, .95]) {
    G.cans = [{ x: R.x + R.c * R.L * u, y: R.y + R.s * R.L * u, l: 6, t: 0 }]; const P = G.P;
    // drive straight up the ramp through the can, and also across it from the side
    let got = false;
    for (const [sx, sy, a] of [[R.x - R.c * 200, R.y - R.s * 200, R.d]]) {
      P.x = sx; P.y = sy; P.a = a; P.vx = Math.cos(a) * 120; P.vy = Math.sin(a) * 120; P.z = 0; P.air = false; G.fuel = 30;
      step(120, 1 / 30, ['KeyW'], () => { if (!G.cans.length) { got = true; return false } });
    }
    res.push({ alongRamp: u, rampHeightThere: +(R.H * u).toFixed(1), pickedUp: got });
  }
  out.canOnRamp = res;
  // thieves in a natural lap 4-8 run: share of spawns, steals, cans dropped, cans never collected, thieves stuck (speed<10 for >2 s)
  reset3(1, { keepLevel: true }); G.wave = 3; m.nextWave(); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e9;
  const types = {}; let seen = new Set(), steals = 0, litres = 0, cansDropped = 0, cansLeftAtLapEnd = 0, stuck = new Map(), stuckThieves = 0, cornerThief = 0;
  for (let lap = 4; lap <= 9; lap++) {
    let prevCans = 0;
    runLap3(i => ramKeys(), () => {
      for (const s of G.pend) if (!seen.has(s)) { seen.add(s); types[s.type] = (types[s.type] || 0) + 1 }
      for (const e of G.enemies) if (e.type === 'thief') {
        if (e.flee > 2.95 && !e._c) { steals++; e._c = 1; litres += 0 } if ((e.stolen || 0) > (e._s || 0)) { litres += e.stolen - (e._s || 0); e._s = e.stolen } if (e.flee <= 0) e._c = 0;
        const sp = Math.hypot(e.vx, e.vy), n = sp < 10 ? (stuck.get(e) || 0) + 1 : 0; stuck.set(e, n); if (n === 60) stuckThieves++;
        if (Math.min(e.x, m.AW - e.x) < 80 && Math.min(e.y, m.AH - e.y) < 80) cornerThief++;
      }
      if (G.cans.length > prevCans) cansDropped += G.cans.length - prevCans; prevCans = G.cans.length;
      if (G.fuel < .2) cansLeftAtLapEnd = Math.max(cansLeftAtLapEnd, G.cans.length);
    });
    m.nextWave(); G.state = 'pause';
  }
  const tot = Object.values(types).reduce((a, b) => a + b, 0);
  out.natural = { spawnsByType: types, thiefShare: +((types.thief || 0) / tot).toFixed(3), steals, litresStolenPerLap: +(litres / 6).toFixed(1), cansDropped, cansLeftOnGroundAtSomeLapEnd: cansLeftAtLapEnd, thievesStuckOver2s: stuckThieves, thiefFramesInCorners: cornerThief };
  G.state = 'pause'; return out;
}
"""


async def main():
    out = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v3_fuel')
        await g.start(1)
        await g.ev(LIB)
        for name, js in [('lapLength', LAPLEN), ('placement', PLACE), ('landing', LANDING), ('post', POST), ('edges', EDGES), ('thief', THIEF)]:
            try:
                out[name] = await g.ev(js)
            except Exception as e:
                out[name] = {'error': str(e)[:400]}
            print(name, json.dumps(out[name]), flush=True)
        out['errors'] = g.errs
        json.dump(out, open('results_v3_fuel.json', 'w'), indent=1)
        await b.close()

asyncio.run(main())
