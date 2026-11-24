# Screenshots of specific problems found by the sim probes:
#  - an enemy that got wedged inside a ramp during normal play
#  - a hatch nose clipping into a tyre stack / wall at the collision limit
#  - big nitro jump height
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

FIND_STUCK = r"""
() => {
  const m = M, G = m.G;
  const below = (o, R) => { const dx = o.x - R.x, dy = o.y - R.y, u = dx * R.c + dy * R.s, v = -dx * R.s + dy * R.c; return u >= 0 && u <= R.L && Math.abs(v) <= R.W / 2 && o.z + 8 < R.H * u / R.L };
  m.start(1); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e9; G.wave = 7; m.nextWave(); G.state = 'pause';
  const runs = new Map(); let found = null;
  const keys = [['KeyW'], ['KeyW', 'KeyD'], ['KeyW', 'KeyA', 'Space'], ['KeyW', 'ShiftLeft'], ['KeyS', 'KeyA'], ['KeyW', 'KeyD', 'Space']];
  for (let seg = 0; seg < 400 && !found; seg++) {
    step(30, 1 / 30, keys[seg % keys.length], () => {
      G.P.hp = 1e9; G.P.nitro = 1; if (G.fuel < 5) G.fuel = 60;
      for (const e of G.enemies) { const R = G.ramps.find(R => below(e, R)); if (R) { runs.set(e, (runs.get(e) || 0) + 1); if (runs.get(e) > 120 && !found) { found = { e, R } } } else runs.delete(e) }
      if (found) return false;
    });
  }
  if (!found) return null;
  const { e, R } = found; window.STUCK = e;
  G.cam.x = e.x; G.cam.y = e.y + 40; G.P.x = e.x + 260; G.P.y = e.y + 200; G.P.vx = G.P.vy = 0;
  G.state = 'pause';
  const dx = e.x - R.x, dy = e.y - R.y, u = dx * R.c + dy * R.s;
  return { type: e.type, x: Math.round(e.x), y: Math.round(e.y), z: e.z, rampHeightThere: +(R.H * u / R.L).toFixed(1), frames: runs.get(e) };
}
"""


async def main():
    out = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'visuals')
        await g.start(1)
        out['stuck'] = await g.ev(FIND_STUCK)
        print(out)
        await g.page.wait_for_timeout(800)
        await g.ev("(() => { const e = STUCK, G = M.G; G.cam.x = e.x; G.cam.y = e.y + 40 })()")
        await g.page.wait_for_timeout(500)
        await g.shot('enemy_stuck_inside_ramp.png')
        # keep simulating 5 more seconds of game time: is it still there?
        out['stuckAfter5s'] = await g.ev("(() => { const e = STUCK, x = e.x, y = e.y; step(150, 1/30, []); M.G.P.hp = 1e9; return { moved: Math.round(Math.hypot(e.x - x, e.y - y)), alive: M.G.enemies.includes(e), z: e.z } })()")
        # nose clip: hatch parked against a tyre stack head-on at the collision limit
        await g.ev("""(() => { const G = M.G; M.start(0); G.state = 'pause'; G.enemies = []; G.pend = []; G.obs = [{ x: 1000, y: 680, r: 30, k: 'tire' }, { x: 1150, y: 680, r: 30, k: 'hay' }]; G.ramps = [];
           const P = G.P; P.a = 0; P.x = 1000 - 30 - P.r; P.y = 680; P.vx = P.vy = 0; G.cam.x = 1060; G.cam.y = 670; })()""")
        await g.page.wait_for_timeout(900)
        await g.shot('hitbox_hatch_nose_into_tyres.png')
        await g.ev("""(() => { const G = M.G, P = G.P; P.a = 0; P.x = 1150 - 30 - P.r; P.y = 680 + 0; P.a = Math.PI; P.x = 1150 + 30 + P.r; })()""")
        await g.page.wait_for_timeout(600)
        await g.shot('hitbox_hatch_tail_into_hay.png')
        json.dump(out, open('results_visuals.json', 'w'), indent=1)
        print(out, g.errs)
        await b.close()

asyncio.run(main())
