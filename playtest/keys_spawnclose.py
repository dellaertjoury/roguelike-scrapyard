# Real keyboard driving (input, page scroll, P pause) + how close enemies appear to a moving player.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

SPAWNCLOSE = r"""
() => {
  const m = M, G = m.G; const res = { spawns: 0, within60: 0, overlapping: 0, minD: 1e9, offscreenAtSpawn: 0 };
  m.start(0); G.state = 'pause';
  Object.assign(G.build, { hood: { id: 'v8', lvl: 3 }, trunk: { id: 'nitro', lvl: 3 } }); m.recompute(); G.P.hp = G.S.maxhp = 1e9;
  G.wave = 7; m.nextWave(); G.state = 'pause';
  const keys = [['KeyW', 'ShiftLeft'], ['KeyW', 'KeyD'], ['KeyW', 'ShiftLeft', 'KeyA'], ['KeyW']];
  for (let seg = 0; seg < 240; seg++) {
    // steer toward the newest pending spawn marker half the time (worst case: driving at the telegraph)
    step(15, 1 / 30, keys[seg % 4], () => {
      G.P.hp = 1e9; G.P.nitro = 1; if (G.waveT < 5) G.waveT = 60;
      const s = G.pend[G.pend.length - 1]; if (s && seg % 2) G.P.a = Math.atan2(s.y - G.P.y, s.x - G.P.x);
      for (const e of G.enemies) if (!e._seen) { e._seen = 1; res.spawns++; const d = Math.hypot(e.x - G.P.x, e.y - G.P.y); res.minD = Math.min(res.minD, d); if (d < e.r + G.P.r + 60) res.within60++; if (d < e.r + G.P.r) res.overlapping++; if (Math.abs(e.x - G.cam.x) > 590 || Math.abs(e.y - G.cam.y) > 345) res.offscreenAtSpawn++ }
    });
  }
  res.minD = Math.round(res.minD); G.state = 'pause';
  return res;
}
"""


async def main():
    out = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'keys')
        pg = g.page
        await pg.click('.car[data-i="1"]'); await pg.wait_for_timeout(300)
        p0 = await g.ev("[M.G.P.x, M.G.P.y]")
        await pg.keyboard.down('KeyW'); await pg.wait_for_timeout(1500)
        await pg.keyboard.down('KeyD'); await pg.keyboard.down('Space'); await pg.wait_for_timeout(1200)
        await pg.keyboard.down('ShiftLeft'); await pg.wait_for_timeout(800)
        out['driving'] = await g.ev("({ sp: Math.round(M.G.P.sp), slip: M.G.P.slipDeg, drift: Math.round(M.G.drift.pts), scrollY: scrollY, state: M.G.state })")
        await pg.screenshot(path='shots/keys_drift.png')
        for k in ['ShiftLeft', 'Space', 'KeyD', 'KeyW']: await pg.keyboard.up(k)
        p1 = await g.ev("[M.G.P.x, M.G.P.y]")
        out['moved'] = round(((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** .5)
        await pg.keyboard.press('KeyP'); await pg.wait_for_timeout(200)
        out['afterP'] = await g.ev("M.G.state")
        await pg.keyboard.press('KeyP'); await pg.wait_for_timeout(200)
        out['afterP2'] = await g.ev("M.G.state")
        out['spawnClose'] = await g.ev(SPAWNCLOSE)
        out['errors'] = g.errs
        print(json.dumps(out, indent=1))
        json.dump(out, open('results_keys_spawnclose.json', 'w'), indent=1)
        await b.close()

asyncio.run(main())
