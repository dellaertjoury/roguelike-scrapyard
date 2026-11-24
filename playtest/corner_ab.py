# Corner check, comparable between versions (GAME_URL): ram a corner head-on, then hold W+D for 6 s.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
JS = r"""
() => {
  const m = M, G = m.G, AW = m.AW, AH = m.AH; const res = { runs: 0, stuck: 0, pathMin: 1e9, dispMin: 1e9 };
  for (let k = 0; k < 10; k++) for (const car of [0, 1, 2]) for (const [cx, cy] of [[0, 0], [AW, 0], [0, AH], [AW, AH]]) {
    m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9; G.fuel = 1e9; G.P.hp = G.S.maxhp = 1e6; G.obs = []; G.ramps = [];
    const P = G.P; P.a = Math.atan2(cy - P.y, cx - P.x); P.nitro = 1;
    step(240, 1 / 30, ['KeyW', 'ShiftLeft']);
    const x0 = P.x, y0 = P.y; let path = 0, px = P.x, py = P.y, far = 0;
    step(180, 1 / 30, ['KeyW', 'KeyD'], () => { path += Math.hypot(P.x - px, P.y - py); px = P.x; py = P.y; far = Math.max(far, Math.hypot(P.x - cx, P.y - cy)) });
    res.runs++; if (far < 150) res.stuck++; res.pathMin = Math.min(res.pathMin, Math.round(path));
  }
  G.state = 'pause'; return res;
}
"""
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'corner_ab_' + os.environ.get('GAME_URL', 'v2'))
        await g.start(0)
        print(os.environ.get('GAME_URL', 'v2'), json.dumps(await g.ev(JS)))
        await b.close()
asyncio.run(main())
