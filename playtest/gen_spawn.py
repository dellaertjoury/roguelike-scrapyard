# Level generation over many seeds + spawn-position sampling, using the real game code.
import asyncio, json, sys
from playwright.async_api import async_playwright
from harness import open_game

GEN = r"""
() => {
  const m = M, G = m.G, AW = m.AW, AH = m.AH, EDGE = m.EDGE;
  const N = 3000, out = { runs: N, fewRamps: 0, fewObs: 0, obsHist: {}, obsOnRamp: 0, obsInJumpPath: 0, lipNearWall: 0, rampsOverlap: 0,
    minLipToWall: 1e9, minLandToWall: 1e9, rampBackBlocked: 0, minObsGap: 1e9, obsTouchWall: 0, examples: [] };
  const segCircle = (r, o, pad) => { // circle vs ramp rectangle (u along, v across)
    const dx = o.x - r.x, dy = o.y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
    const cu = Math.max(0, Math.min(r.L, u)), cv = Math.max(-r.W / 2, Math.min(r.W / 2, v));
    return Math.hypot(u - cu, v - cv) < o.r + pad;
  };
  for (let i = 0; i < N; i++) {
    m.makeObs();
    const R = G.ramps, O = G.obs;
    if (R.length < 2) out.fewRamps++;
    if (O.length < 12) out.fewObs++;
    out.obsHist[O.length] = (out.obsHist[O.length] || 0) + 1;
    for (const r of R) {
      const lipx = r.x + r.c * r.L, lipy = r.y + r.s * r.L;
      const dl = Math.min(lipx - EDGE, AW - EDGE - lipx, lipy - EDGE, AH - EDGE - lipy);
      out.minLipToWall = Math.min(out.minLipToWall, dl);
      // a base-speed jump (210 u/s) flies ~200 units; a nitro+v8 jump ~800
      const dlz = Math.min(r.lx - EDGE, AW - EDGE - r.lx, r.ly - EDGE, AH - EDGE - r.ly);
      out.minLandToWall = Math.min(out.minLandToWall, dlz);
      if (dl < 260) out.lipNearWall++;
      // back of ramp (run-up) blocked by wall?
      const bx = r.x - r.c * 150, by = r.y - r.s * 150;
      if (bx < EDGE + 20 || bx > AW - EDGE - 20 || by < EDGE + 20 || by > AH - EDGE - 20) out.rampBackBlocked++;
      for (const o of O) {
        if (segCircle(r, o, 20)) { out.obsOnRamp++; if (out.examples.length < 3) out.examples.push({ r, o }) }
        // obstacle within the straight flight path of a base-speed jump (lip to lip+260), car half-width 14
        const dx = o.x - lipx, dy = o.y - lipy, u = dx * r.c + dy * r.s, v = Math.abs(-dx * r.s + dy * r.c);
        if (u > 0 && u < 260 && v < o.r + 14) out.obsInJumpPath++;
      }
    }
    if (R.length === 2) { const [a, b] = R; if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 200) out.rampsOverlap++ }
    for (let a = 0; a < O.length; a++) {
      const o = O[a];
      if (Math.min(o.x - o.r, AW - o.x - o.r, o.y - o.r, AH - o.y - o.r) - EDGE < 50) out.obsTouchWall++;
      for (let b = a + 1; b < O.length; b++) out.minObsGap = Math.min(out.minObsGap, Math.hypot(o.x - O[b].x, o.y - O[b].y) - o.r - O[b].r);
    }
  }
  return out;
}
"""

SPAWN = r"""
(where) => {
  const m = M, G = m.G, AW = m.AW, AH = m.AH, EDGE = m.EDGE, ENEMY = D.ENEMY;
  const res = {};
  const spots = { center: [AW / 2, AH / 2], corner_tl: [EDGE + 20, EDGE + 20], corner_br: [AW - EDGE - 20, AH - EDGE - 20],
    wall_mid_top: [AW / 2, EDGE + 20], wall_left: [EDGE + 20, AH / 2], random: null };
  const rectHit = (r, x, y, rad) => { const dx = x - r.x, dy = y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
    const cu = Math.max(0, Math.min(r.L, u)), cv = Math.max(-r.W / 2, Math.min(r.W / 2, v)); return Math.hypot(u - cu, v - cv) < rad };
  for (const [name, pos] of Object.entries(spots)) {
    const st = { asked: 0, got: 0, minD: 1e9, inObs: 0, onRampBody: 0, eliteOnRamp: 0, eliteInObs: 0, inWall: 0, offscreen: 0, n: 0, dHist: {} };
    for (let it = 0; it < 400; it++) {
      if (it % 20 === 0) m.makeObs();
      const P = G.P;
      if (pos) { P.x = pos[0]; P.y = pos[1] } else { P.x = 100 + Math.random() * (AW - 200); P.y = 100 + Math.random() * (AH - 200) }
      P.vx = P.vy = 0; G.cam.x = Math.max(420, Math.min(AW - 420, P.x)); G.cam.y = Math.max(300, Math.min(AH - 300, P.y));
      G.pend = []; G.enemies = [];
      G.wave = 9 + (it % 5 === 4 ? 0 : 1); // wave 10 is an elite lap
      m.nextWave(); G.state = 'pause';
      const expected = Math.min(5, 1 + Math.floor(G.wave / 2)) + (G.wave % 5 === 0 ? 1 : 0);
      st.asked += expected; st.got += G.pend.length;
      for (const s of G.pend) {
        const r = s.elite ? ENEMY(G.wave)[s.type].r : 17;
        const d = Math.hypot(s.x - P.x, s.y - P.y); st.minD = Math.min(st.minD, d); st.n++;
        const bucket = Math.floor(d / 100) * 100; st.dHist[bucket] = (st.dHist[bucket] || 0) + 1;
        if (G.obs.some(o => Math.hypot(o.x - s.x, o.y - s.y) < o.r + r)) { st.inObs++; if (s.elite) st.eliteInObs++ }
        if (G.ramps.some(rr => rectHit(rr, s.x, s.y, r))) { st.onRampBody++; if (s.elite) st.eliteOnRamp++ }
        if (s.x < EDGE + r || s.x > AW - EDGE - r || s.y < EDGE + r || s.y > AH - EDGE - r) st.inWall++;
        // landscape 1366x800: visible ground is ~1180 wide, ~690 tall around the camera
        if (Math.abs(s.x - G.cam.x) > 590 || Math.abs(s.y - G.cam.y) > 345) st.offscreen++;
      }
    }
    res[name] = st;
  }
  G.pend = []; G.enemies = [];
  return res;
}
"""


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'gen_spawn')
        await g.start(0)
        gen = await g.ev(GEN)
        print('GEN', json.dumps(gen, indent=1)[:3000])
        sp = await g.ev(SPAWN, 1)
        print('SPAWN', json.dumps(sp, indent=1))
        json.dump({'gen': gen, 'spawn': sp}, open('results_gen_spawn.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
