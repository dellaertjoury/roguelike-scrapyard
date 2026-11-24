# v3: draw calls per enemy type and per jerrycan / pump (renderer.info after one render).
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()
JS = r"""
() => { const G = M.G, R = SC.renderer, out = {};
  const calls = () => { SC.render(1 / 30); SC.render(1 / 30); return R.info.render.calls };
  reset3(1); G.P.x = 1000; G.P.y = 680; G.cam.x = 1000; G.cam.y = 680; G.pumpT = 1e9; G.pump = null; G.parts = [];
  const base = calls(); out.base = base;
  for (const t of ['rust', 'spit', 'brute', 'thief', 'harvester']) {
    G.enemies = Array.from({ length: 10 }, (_, i) => mkE(t, 5, 700 + (i % 5) * 120, 560 + Math.floor(i / 5) * 200, { col: D.ECOL[i % 10] })); G.parts = [];
    out[t + '_x10'] = calls() - base;
  }
  G.enemies = []; G.cans = Array.from({ length: 20 }, (_, i) => ({ x: 800 + i * 20, y: 700, l: 6, t: 0 })); out.cans_x20 = calls() - base;
  G.cans = []; G.pump = { x: 1100, y: 600, res: 20, acc: 1, id: 1 }; out.pump = calls() - base; G.pump = null;
  return out }
"""
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v3_drawcalls')
        await g.start(1); await g.ev(LIB)
        r = await g.ev(JS); print(json.dumps(r))
        json.dump(r, open('results_v3_drawcalls.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
