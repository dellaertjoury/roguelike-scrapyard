# v3: pump edge arrow + pump badge while playing (arrows are hidden in pause), at 3 sizes.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()
MEASURE = """(() => { const vis = [...document.querySelectorAll('#fx .edge')].filter(a => a.style.display === 'block'); const pa = vis.find(a => a.classList.contains('pu'));
  const bd = document.querySelector('#fx .pbadge'); const br = bd.getBoundingClientRect();
  const panels = [...document.querySelectorAll('#hud > .pnl, #touch button')].filter(p => p.offsetParent !== null && getComputedStyle(p).display !== 'none').map(p => [p.id || p.className || p.dataset.key, p.getBoundingClientRect()]);
  const hit = r => panels.filter(([n, q]) => Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2).map(([n]) => n);
  return { arrows: vis.length, pumpArrow: !!pa, badgeShown: bd.style.display === 'block', badgeInView: br.left >= 0 && br.top >= 0 && br.right <= innerWidth && br.bottom <= innerHeight, badgeOverPanels: bd.style.display === 'block' ? hit(br) : [], arrowOverPanels: pa ? hit(pa.getBoundingClientRect()) : [] } })()"""
async def main():
    out = {}
    async with async_playwright() as pw:
        for (w, h) in [(390, 844), (768, 1024), (1366, 800)]:
            b, g = await open_game(pw, f'v3_pumparrow_{w}', vw=w, vh=h, touch=w < 800)
            await g.start(1); await g.ev(LIB)
            res = []
            for k in range(16):
                import math
                a = k / 16 * 2 * math.pi
                px, py = 1000 + math.cos(a) * 780, 680 + math.sin(a) * 560
                await g.ev(f"""(() => {{ const G = M.G; G.enemies = []; G.pend = []; G.spawnT = 1e9; G.P.hp = G.S.maxhp = 1e6; G.pump = {{ x: {px}, y: {py}, res: 20, acc: 0, id: {k} }}; G.pumpT = 1e9;
                  G.P.x = 1000; G.P.y = 680; G.P.vx = G.P.vy = 0; G.cam.x = 1000; G.cam.y = 680; G.fuel = 50; G.state = 'play' }})()""")
                await g.page.wait_for_timeout(400)
                r = await g.ev(MEASURE); r['at'] = [round(px), round(py)]; res.append(r)
                if k in (2, 10): await g.page.screenshot(path=f'shots/v3_pump_arrow_{w}x{h}_{k}.png')
            await g.ev("M.G.state='pause'")
            out[f'{w}x{h}'] = {'n': len(res), 'pumpArrowShown': sum(r['pumpArrow'] for r in res), 'badgeShown': sum(r['badgeShown'] for r in res), 'badgeOutOfView': sum(not r['badgeInView'] for r in res if r['badgeShown']),
                               'badgeOverPanels': [(r['at'], r['badgeOverPanels']) for r in res if r['badgeOverPanels']], 'arrowOverPanels': [(r['at'], r['arrowOverPanels']) for r in res if r['arrowOverPanels']], 'missing': [r['at'] for r in res if not r['pumpArrow']]}
            print(w, json.dumps(out[f'{w}x{h}']), flush=True)
            await b.close()
    json.dump(out, open('results_v3_pumparrow.json', 'w'), indent=1)
asyncio.run(main())
