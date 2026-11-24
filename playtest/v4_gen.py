# v4 generation: ramps / tyre barriers / obstacles / cones / pumps vs the pit lane over many seeds,
# pit-entry run per seed (collisions during intro + 1.5 s coast after GO), spawn-spot sampling.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

GEN = r"""
() => {
  const m = M, G = m.G, { AW, AH, EDGE, GATE } = m;
  m.start(0); G.state = 'pause';
  const N = 1500, out = { N, rampCount: {}, rampNearGateLane: 0, rampLaneHitsPit: 0, rampLandOutside: 0, rampOverlap: 0, obsInPit: 0, obsOverlapRamp: 0, rtOutside: 0,
    coneOnObs: 0, coneInPit: 0, obsCount: {}, minRampGateDist: 1e9, minObsGateDist: 1e9, rtGapMin: 1e9, worstRampSideGap: 1e9, examples: [] };
  // the pit lane: from the gate up to the handover point plus the 1 s slide after it (sampled from a real run)
  const pit = []; for (let y = AH; y >= AH - 220; y -= 10) pit.push([GATE.x + (y < AH - 150 ? 70 * (AH - y - 150) / 70 : 0), y]);
  for (let k = 0; k < 30; k++) pit.push([590 + k * 6, 1147 - k * 6.5]); // ENE slide after GO (from v4_smoke)
  const inRamp = (r, x, y, m0) => { const dx = x - r.x, dy = y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c; return u > -m0 && u < r.L + m0 && Math.abs(v) < r.W / 2 + m0 };
  for (let s = 0; s < N; s++) {
    m.makeObs();
    out.rampCount[G.ramps.length] = (out.rampCount[G.ramps.length] || 0) + 1;
    const real = G.obs.filter(o => o.k !== 'rt'); out.obsCount[real.length] = (out.obsCount[real.length] || 0) + 1;
    for (const r of G.ramps) {
      out.minRampGateDist = Math.min(out.minRampGateDist, Math.min(...pit.map(([x, y]) => { let d = 1e9; for (let u = 0; u <= r.L; u += 10) for (const v of [-r.W/2, 0, r.W/2]) d = Math.min(d, Math.hypot(r.x + r.c*u - r.s*v - x, r.y + r.s*u + r.c*v - y)); return d })));
      if (pit.some(([x, y]) => inRamp(r, x, y, 30))) { out.rampNearGateLane++; if (out.examples.length < 5) out.examples.push({ kind: 'rampPit', r: { x: r.x|0, y: r.y|0, d: +r.d.toFixed(2) } }) }
      if (pit.some(([x, y]) => m.inLane(r, x, y, 20))) out.rampLaneHitsPit++;
      const ex = r.x + r.c * (r.L + m.JUMP_MAX), ey = r.y + r.s * (r.L + m.JUMP_MAX);
      if (ex < EDGE + 20 || ex > AW - EDGE - 20 || ey < EDGE + 20 || ey > AH - EDGE - 20) out.rampLandOutside++;
    }
    if (G.ramps.length === 2) { const [a, b] = G.ramps; for (let u = 0; u <= a.L; u += 15) for (const v of [-a.W/2, 0, a.W/2]) if (inRamp(b, a.x + a.c*u - a.s*v, a.y + a.s*u + a.c*v, 20)) { out.rampOverlap++; u = 1e9; break } }
    for (const o of real) {
      if (pit.some(([x, y]) => Math.hypot(o.x - x, o.y - y) < o.r + 30)) out.obsInPit++;
      out.minObsGateDist = Math.min(out.minObsGateDist, Math.min(...pit.map(([x, y]) => Math.hypot(o.x - x, o.y - y) - o.r)));
      if (G.ramps.some(r => inRamp(r, o.x, o.y, o.r + 10))) out.obsOverlapRamp++;
    }
    for (const o of G.obs.filter(o => o.k === 'rt')) if (o.x < EDGE + o.r || o.x > AW - EDGE - o.r || o.y < EDGE + o.r || o.y > AH - EDGE - o.r) out.rtOutside++;
    // gap between a ramp's barrier tyres and the nearest other obstacle / wall: can a car (r 16-19) wedge in?
    for (const o of G.obs.filter(o => o.k === 'rt')) for (const b of real) { const gap = Math.hypot(o.x - b.x, o.y - b.y) - o.r - b.r; out.rtGapMin = Math.min(out.rtGapMin, gap) }
    for (const c of G.cones) { if (G.obs.some(o => Math.hypot(o.x - c.hx, o.y - c.hy) < o.r + 10)) out.coneOnObs++; if (pit.some(([x, y]) => Math.hypot(c.hx - x, c.hy - y) < 30)) out.coneInPit++ }
  }
  return out;
}
"""

# real pit entry per seed: collisions, ramp contact, speed at GO, with no input and with throttle
PIT = r"""
(n) => {
  const m = M, G = m.G; const out = { n, hitObsDuringIntro: 0, hitWallDuringIntro: 0, onRampAfterGO: 0, obsHitWithin1_5s: 0, coneHit: 0, enemyBeforeGO: 0, pendBeforeGO: 0, goSpeed: [], goSlip: [], pumpNextBeforeGO: 0, examples: [] };
  for (let s = 0; s < n; s++) {
    m.start(s % 3); G.state = 'pause';
    const P = G.P; let goT = null, hitT = null, ramp = false, wall = false, preEn = 0, prePend = 0, cone = false;
    const c0 = G.cones.map(c => [c.x, c.y]);
    step(Math.round(3 / (1/30)) + 50, 1/30, s % 2 ? ['KeyW'] : [], k => {
      if (G.startT > 0) { if (G.enemies.length) preEn++; if (G.pend.length) prePend++; if (G.pumpNext) out.pumpNextBeforeGO++ }
      if (G.startT <= 0 && goT == null) goT = G.time;
      if (P.hitObs != null && P.hitObs > G.time - 1/30 - 1e-6 && hitT == null) { const o = G.obs.reduce((b, o) => Math.hypot(o.x - P.x, o.y - P.y) - o.r < Math.hypot(b.x - P.x, b.y - P.y) - b.r ? o : b); hitT = { afterGO: goT == null ? -1 : +(G.time - goT).toFixed(2), startT: G.startT, x: P.x|0, y: P.y|0, sp: P.sp|0, kind: o.k, thr: s % 2 } }
      if (G.startT <= 0 && P.z > 1) ramp = true;
    });
    if (G.cones.some((c, i) => Math.hypot(c.x - c0[i][0], c.y - c0[i][1]) > 2)) cone = true;
    if (hitT) { if (hitT.startT > 0) out.hitObsDuringIntro++; else out.obsHitWithin1_5s++; out.examples.push(hitT) }
    if (ramp) out.onRampAfterGO++; if (cone) out.coneHit++;
    if (preEn) out.enemyBeforeGO++; if (prePend) out.pendBeforeGO++;
  }
  return out;
}
"""

SPAWN = r"""
(n) => {
  const m = M, G = m.G, { AW, AH, EDGE } = m;
  m.start(0); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.wave = 12; G.S.maxhp = G.P.hp = 1e9;
  const out = { n: 0, inObs: 0, onRamp: 0, onRampBarrierLane: 0, nearPump: 0, tooClose: 0, nearWall: 0, nullSpots: 0, attempts: 0, minDist: 1e9, distHist: {}, cornerNull: 0, cornerAttempts: 0 };
  for (let i = 0; i < n; i++) {
    if (i % 200 === 0) m.makeObs();
    const corner = i % 4 === 0;
    G.P.x = corner ? (Math.random() < .5 ? 60 : AW - 60) : 60 + Math.random() * (AW - 120);
    G.P.y = corner ? (Math.random() < .5 ? 60 : AH - 60) : 60 + Math.random() * (AH - 120);
    G.P.vx = G.P.vy = 0; G.enemies = []; G.pend = []; G.spawnT = 0; G.fuel = 30;
    G.pump = { x: 1000, y: 680, res: 30, got: 0, empty: false };
    G.state = 'play'; m.update(0); G.state = 'pause'; // dt 0: just runs the spawn queue
    const want = 1 + Math.floor((G.wave - 1) / 3);
    out.attempts += want; if (corner) out.cornerAttempts += want;
    const lost = Math.max(0, want - G.pend.length); out.nullSpots += lost; if (corner) out.cornerNull += lost;
    for (const s of G.pend) {
      out.n++;
      const d = Math.hypot(s.x - G.P.x, s.y - G.P.y); out.minDist = Math.min(out.minDist, d);
      const b = Math.floor(d / 100) * 100; out.distHist[b] = (out.distHist[b] || 0) + 1;
      if (d < 280) out.tooClose++;
      if (G.obs.some(o => Math.hypot(o.x - s.x, o.y - s.y) < o.r + 17)) out.inObs++;
      if (G.ramps.some(r => { const dx = s.x - r.x, dy = s.y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c; return u > -17 && u < r.L + 17 && Math.abs(v) < r.W / 2 + 17 })) out.onRamp++;
      if (Math.hypot(s.x - 1000, s.y - 680) < 18 + 17) out.nearPump++;
      if (s.x < EDGE + 17 || s.x > AW - EDGE - 17 || s.y < EDGE + 17 || s.y > AH - EDGE - 17) out.nearWall++;
    }
  }
  return out;
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4gen')
        res = {}
        res['gen'] = await g.ev(GEN)
        print('GEN', json.dumps(res['gen']))
        res['pit'] = await g.ev(PIT, 300)
        print('PIT', json.dumps(res['pit']))
        res['spawn'] = await g.ev(SPAWN, 8000)
        print('SPAWN', json.dumps(res['spawn']))
        res['errs'] = g.errs
        json.dump(res, open('results_v4_gen.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
