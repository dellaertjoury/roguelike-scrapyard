# v4 smoke: boot, start a run, watch the pit entry frame by frame, handover continuity
import asyncio, json, sys
from playwright.async_api import async_playwright
from harness import open_game

JS = r"""
() => {
  const m = M, G = m.G, P = G.P, out = { frames: [] };
  G.state = 'pause';
  out.atStart = { x: P.x, y: P.y, intro: P.intro, startT: G.startT, enemies: G.enemies.length, pend: G.pend.length, gate: m.gateOpen() };
  let i = 0;
  step(130, 1/30, ['KeyW'], k => {
    out.frames.push({ k, t: +G.startT.toFixed(3), x: +P.x.toFixed(1), y: +P.y.toFixed(1), vx: +P.vx.toFixed(1), vy: +P.vy.toFixed(1), a: +P.a.toFixed(3), sp: +P.sp.toFixed(1), slip: P.slipDeg, lat: +P.lat.toFixed(1), intro: P.intro, slideT: +(P.slideT||0).toFixed(2), gate: +m.gateOpen().toFixed(3), en: G.enemies.length, pend: G.pend.length, fuel: +G.fuel.toFixed(2), shake: +G.shake.toFixed(2), stun: +(P.stun||0).toFixed(2) });
  });
  return out;
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4smoke')
        await g.shot('v4_menu_1366.png')
        await g.start(0)
        await g.ev("M.G.state='play'")
        await g.page.wait_for_timeout(200)
        await g.shot('v4_countdown_1366.png')
        await g.ev("M.G.state='pause'")
        r = await g.ev(JS)
        print(json.dumps(r['atStart']))
        for f in r['frames']:
            print(json.dumps(f))
        print('ERRS', g.errs)
        await b.close()
asyncio.run(main())
