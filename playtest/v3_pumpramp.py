# v3: a pump that opens on a ramp's run-up line or landing strip. Finds such a level with the real generator +
# openPump, screenshots it, and drives a nitro jump / run-up through it to see whether the post gets in the way.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()
FIND = r"""
(kind) => { const m = M, G = m.G;
  const segDist = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))); return [Math.hypot(px - ax - vx * t, py - ay - vy * t), t] };
  for (let tries = 0; tries < 4000; tries++) {
    reset3(1, { keepLevel: true }); G.pumpT = 1e9;
    G.P.x = 100 + Math.random() * 1800; G.P.y = 100 + Math.random() * 1160;
    if (G.obs.some(o => Math.hypot(o.x - G.P.x, o.y - G.P.y) < o.r + 40)) continue;
    G.pump = null; G.pumpT = .001; step(1, 1 / 30, []); const pu = G.pump; if (!pu) continue;
    for (const R of G.ramps) {
      const lx = R.x + R.c * R.L, ly = R.y + R.s * R.L;
      if (kind === 'landing') { const [d, t] = segDist(pu.x, pu.y, lx, ly, lx + R.c * 520, ly + R.s * 520); if (d < 20 && t * 520 > 300) { window.FOUND = { R, pu: { ...pu } }; return { pump: [Math.round(pu.x), Math.round(pu.y)], pastLip: Math.round(t * 520), offLine: Math.round(d) } } }
      else { const [d, t] = segDist(pu.x, pu.y, R.x, R.y, R.x - R.c * 250, R.y - R.s * 250); if (d < 15) { window.FOUND = { R, pu: { ...pu } }; return { pump: [Math.round(pu.x), Math.round(pu.y)], behindFoot: Math.round(t * 250), offLine: Math.round(d) } } }
    }
  }
  return null }
"""
JUMP = r"""
(kind) => { const m = M, G = m.G, { R } = FOUND, P = G.P; const pu = G.pump; G.obs = []; const res = [];
  for (const nitro of [false, true]) for (const car of [0, 1, 2]) {
    const keep = { ...pu }; G.car = D.CARS[car]; m.recompute(); G.pump = { ...keep }; G.fuel = 59.9;
    P.x = R.x - R.c * 330; P.y = R.y - R.s * 330; P.a = R.d; P.vx = R.c * 120; P.vy = R.s * 120; P.z = 0; P.air = false; P.vz = 0; P.len = G.car.len; P.wid = G.car.wid; P.r = (G.car.len + G.car.wid) / 4 + 2;
    let jumped = false, minD = 1e9, hitPost = false, landed = null;
    step(150, 1 / 30, nitro ? ['KeyW', 'ShiftLeft'] : ['KeyW'], () => { P.nitro = 1; if (P.air) jumped = true; const d = Math.hypot(P.x - pu.x, P.y - pu.y); if (P.z < 26) { minD = Math.min(minD, d); if (d < 13 + P.r + .5) hitPost = true } if (jumped && !P.air && !landed) landed = Math.round(Math.hypot(P.x - R.x - R.c * R.L, P.y - R.y - R.s * R.L)); if (landed && d > 300) return false });
    res.push({ car: D.CARS[car].id, nitro, jumped, landedPastLip: landed, hitPumpPost: hitPost, minDistToPost: Math.round(minD) });
  }
  G.P.x = R.x - R.c * 200; G.P.y = R.y - R.s * 200; G.P.vx = G.P.vy = 0; G.P.a = R.d; G.cam.x = (R.x + pu.x) / 2; G.cam.y = (R.y + pu.y) / 2; G.state = 'pause'; return res }
"""
async def main():
    out = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v3_pumpramp')
        await g.start(1); await g.ev(LIB)
        for kind in ['runup', 'landing']:
            f = await g.ev(FIND, kind); out[kind] = {'found': f}
            if f:
                out[kind]['jumps'] = await g.ev(JUMP, kind)
                await g.ev("(() => { const G = M.G; G.state = 'play' })()"); await g.page.wait_for_timeout(700); await g.ev("M.G.state = 'pause'")
                await g.page.screenshot(path=f'shots/v3_pump_on_ramp_{kind}.png')
            print(kind, json.dumps(out[kind]), flush=True)
        json.dump(out, open('results_v3_pumpramp.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
