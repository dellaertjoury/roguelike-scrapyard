# v4 top speed: real cruising speed holding W (and W+nitro) vs S.top for each car, and vs enemy speeds;
# plus a screenshot of a seed where a tyre pile sits on the post-GO slide line.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

JS = r"""
() => {
  const m = M, G = m.G, out = [];
  for (const car of [0, 1, 2]) {
    m.start(car); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0; G.obs = []; G.ramps = []; G.crane.t = 1e9;
    const P = G.P; P.x = 100; P.y = 680; P.a = 0; P.vx = P.vy = 0;
    let t60 = null; for (let i = 0; i < 300; i++) { G.fuel = 30; P.x = Math.min(P.x, 300); step(1, 1/30, ['KeyW']); if (t60 == null && P.sp >= G.S.top) t60 = +(i / 30).toFixed(2) }
    const cruise = P.sp; P.nitro = 1; for (let i = 0; i < 40; i++) { G.fuel = 30; P.x = Math.min(P.x, 300); step(1, 1/30, ['KeyW', 'ShiftLeft']) }
    out.push({ car: G.car.id, statTop: G.S.top, statKmh: Math.round(G.S.top * .6), cruise: Math.round(cruise), cruiseKmh: Math.round(cruise * .6), ratio: +(cruise / G.S.top).toFixed(2), reachStatTopAt_s: t60, nitro: Math.round(P.sp),
      rustSpd_lap1: Math.round(G.S.top * (.86 + .004)), thiefSpd_lap5: Math.round(G.S.top * (.9 + .02)), rustShareOfReal: +((G.S.top * .864) / cruise).toFixed(2), thiefShareOfReal: +((G.S.top * .92) / cruise).toFixed(2) });
  }
  return out;
}
"""
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4top')
        await g.start(0)
        r = await g.ev(JS)
        for x in r: print(json.dumps(x))
        # find a seed with an obstacle right on the post-GO line and show it at GO
        await g.ev("""(() => { const m = M, G = m.G; m.start(0); for (let i = 0; i < 500; i++) { m.makeObs(); if (G.obs.some(o => o.k !== 'rt' && Math.hypot(o.x - 700, o.y - 1000) < o.r + 15)) break } G.wave = 0; m.nextWave(); G.state = 'pause'; step(88, 1/30, ['KeyW']) })()""")
        await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(120); await g.ev("M.G.state='pause'")
        await g.shot('v4_pit_obstacle_on_line.png')
        hit = await g.ev("(() => { const G = M.G, P = G.P; let t = null; step(60, 1/30, ['KeyW'], k => { if (t == null && P.hitObs > G.time - .04) t = k }); return { hitAfterFrames: t, sp: Math.round(P.sp) } })()")
        print('PITHIT', hit)
        json.dump({'top': r, 'pit': hit}, open('results_v4_topspeed.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
