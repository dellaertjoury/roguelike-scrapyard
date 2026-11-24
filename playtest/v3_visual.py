# v3: art pass and fuel HUD. Fuel gauge needle at empty/half/full at 390/768/1366 wide, pump and jerrycan
# visuals, pump edge arrow + badge, thief and elite banners vs the boss bar, boss panel vs fuel panel (N1/N2).
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
from PIL import Image

LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()
SIZES = [(390, 844), (768, 1024), (1366, 800)]

GAUGE = r"""
() => {
  const n = document.getElementById('needle'), f = document.getElementById('gface'), gs = getComputedStyle(n);
  const fr = f.getBoundingClientRect();
  // unrotated needle box inside the gauge
  const piv = { x: n.offsetLeft + n.offsetWidth * parseFloat(gs.transformOrigin.split(' ')[0]) / n.offsetWidth, y: n.offsetTop + parseFloat(gs.transformOrigin.split(' ')[1]) };
  const hub = { x: f.offsetWidth * .5, y: f.offsetHeight * .87 };
  return { faceW: Math.round(fr.width), faceH: Math.round(fr.height), needleW: +n.offsetWidth.toFixed(1), needleH: +n.offsetHeight.toFixed(1), pivot: [+piv.x.toFixed(1), +piv.y.toFixed(1)], hub: [+hub.x.toFixed(1), +hub.y.toFixed(1)], offsetPx: +Math.hypot(piv.x - hub.x, piv.y - hub.y).toFixed(1), rot: n.style.getPropertyValue('--rot'), art: n.classList.contains('art'), fuelTxt: document.getElementById('fuelTxt').textContent };
}
"""

OVERLAP = r"""
(sel) => {
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false } return true };
  const els = [...document.querySelectorAll(sel)].filter(e => vis(e) && (e.id !== 'banner' || +getComputedStyle(e).opacity > .05));
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 2 && oy > 2) out.push(`${els[i].id || els[i].className} x ${els[j].id || els[j].className} (${Math.round(ox)}x${Math.round(oy)})`);
  }
  return out;
}
"""

RECT = "(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }"


async def clip(pg, sel, path, pad=6):
    r = await pg.evaluate(RECT, sel)
    if not r: return None
    vw = pg.viewport_size
    x0, y0 = max(0, r[0] - pad), max(0, r[1] - pad)
    await pg.screenshot(path=path, clip={'x': x0, 'y': y0, 'width': min(vw['width'] - x0, r[2] - r[0] + 2 * pad), 'height': min(vw['height'] - y0, r[3] - r[1] + 2 * pad)})
    return path


async def main():
    out = {'gauge': {}, 'banners': {}, 'pump': {}, 'cans': {}}
    sheet = []
    async with async_playwright() as pw:
        for (w, h) in SIZES:
            touch = w < 800
            b, g = await open_game(pw, f'v3_visual_{w}', vw=w, vh=h, touch=touch)
            pg = g.page
            if touch: await pg.tap('.car[data-i="1"]')
            else: await pg.click('.car[data-i="1"]')
            await pg.wait_for_timeout(400)
            await g.ev(LIB)
            await g.ev("(() => { const G = M.G; G.state = 'pause'; G.spawnT = 1e9; G.pend = []; G.enemies = []; G.P.hp = G.S.maxhp = 1e6 })()")
            # gauge at empty / half / full (fuel 0.01 would end the lap, so use 0.05 and stay paused)
            row = []
            for fuel in [0.05, 30, 60]:
                await g.ev(f"(() => {{ M.G.fuel = {fuel}; M.G.state = 'pause' }})()")
                await pg.wait_for_timeout(500)
                r = await g.ev(GAUGE)
                out['gauge'][f'{w}_{fuel}'] = r
                p = await clip(pg, '#fuelPnl', f'shots/v3_gauge_{w}_{int(fuel)}.png')
                row.append(p)
            sheet.append(row)
            print(w, 'gauge', json.dumps(out['gauge'][f'{w}_30']), flush=True)

            # lap 2: thief banner over the HUD
            await g.ev("(() => { const G = M.G; G.wave = 1; M.nextWave(); G.spawnT = 1e9; G.pend = []; G.P.hp = G.S.maxhp = 1e6 })()")
            await pg.wait_for_timeout(700)
            await g.ev("M.G.state = 'pause'")
            out['banners'][f'{w}_thief'] = {'overlaps': await g.ev(OVERLAP, '#hud > .pnl, #banner, #touch button'), 'banner': await g.ev(RECT, '#banner'), 'art': await g.ev(RECT, '#bannerArt')}
            await pg.screenshot(path=f'shots/v3_banner_thief_{w}x{h}.png')
            # lap 5: harvester banner + boss bar: sample the banner over its 2.6 s animation
            await g.ev("(() => { const G = M.G; G.wave = 4; M.nextWave(); G.spawnT = 1e9; G.pend.forEach(s => s.t = .01); G.P.hp = G.S.maxhp = 1e6 })()")
            worst = []
            for k in range(8):
                await pg.wait_for_timeout(300)
                ov = await g.ev(OVERLAP, '#hud > .pnl, #banner, #touch button')
                if len(ov) > len(worst): worst = ov
                if k == 2: await pg.screenshot(path=f'shots/v3_banner_elite_{w}x{h}.png')
            await g.ev("M.G.state = 'pause'")
            out['banners'][f'{w}_elite'] = {'worstOverlaps': worst, 'boss': await g.ev(RECT, '#bossPnl'), 'fuel': await g.ev(RECT, '#fuelPnl')}
            print(w, 'banners', json.dumps(out['banners'][f'{w}_elite']), flush=True)

            # pump on screen, player filling (progress ring), then off screen (edge arrow + pump badge)
            await g.ev("""(() => { const G = M.G; G.enemies = []; G.pend = []; G.fuel = 30; G.pump = { x: 1000, y: 680, res: 12, acc: 1.6, id: 7 }; G.pumpT = 1e9;
              G.P.x = 1030; G.P.y = 690; G.P.vx = G.P.vy = 0; G.P.a = -1; G.cam.x = 1000; G.cam.y = 680; G.state = 'play' })()""")
            await pg.wait_for_timeout(900)
            await g.ev("M.G.state = 'pause'")
            await pg.screenshot(path=f'shots/v3_pump_filling_{w}x{h}.png')
            out['pump'][f'{w}_on'] = {'filling': await g.ev("M.G.filling"), 'panelClass': await g.ev("document.getElementById('fuelPnl').className")}
            res = []
            for (px, py) in [(1800, 1200), (200, 1200), (1800, 200), (200, 200), (1000, 1250), (1900, 680)]:
                await g.ev(f"""(() => {{ const G = M.G; G.pump = {{ x: {px}, y: {py}, res: 20, acc: 0, id: 8 }}; G.P.x = {2000 - px}; G.P.y = {1360 - py}; G.P.vx = G.P.vy = 0; G.cam.x = G.P.x; G.cam.y = G.P.y; G.fuel = 30; G.state = 'play' }})()""")
                await pg.wait_for_timeout(500)
                await g.ev("M.G.state = 'pause'")
                await pg.wait_for_timeout(150)
                r = await g.ev("""(() => { const vis = [...document.querySelectorAll('#fx .edge')].filter(a => a.style.display === 'block'); const pa = vis.find(a => a.classList.contains('pu'));
                  const bd = document.querySelector('#fx .pbadge'); const br = bd.getBoundingClientRect();
                  const panels = [...document.querySelectorAll('#hud > .pnl, #touch button')].filter(p => p.offsetParent !== null).map(p => [p.id || p.className, p.getBoundingClientRect()]);
                  const hit = r => panels.filter(([n, q]) => Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2).map(([n]) => n);
                  return { pumpArrow: !!pa, badgeShown: bd.style.display === 'block', badgeInView: br.left >= 0 && br.top >= 0 && br.right <= innerWidth && br.bottom <= innerHeight, badgeOverPanels: bd.style.display === 'block' ? hit(br) : [], arrowOverPanels: pa ? hit(pa.getBoundingClientRect()) : [] } })()""")
                r['at'] = [px, py]; res.append(r)
                if (px, py) == (1800, 1200): await pg.screenshot(path=f'shots/v3_pump_offscreen_{w}x{h}.png')
            out['pump'][f'{w}_off'] = res
            print(w, 'pump', json.dumps(res), flush=True)

            # jerrycans on the ground
            await g.ev("""(() => { const G = M.G; G.pump = { x: 1150, y: 600, res: 20, acc: 0, id: 9 }; G.P.x = 960; G.P.y = 700; G.cam.x = 1000; G.cam.y = 680; G.fuel = 59.9;
              G.cans = [{ x: 900, y: 640, l: 6, t: 0 }, { x: 1040, y: 720, l: 12, t: 0 }, { x: 980, y: 600, l: 6, t: 0 }];
              G.enemies = [mkE('thief', 3, 1100, 760, { a: 2.5, spd: 0, cd: 1e9 })]; G.state = 'play' })()""")
            await pg.wait_for_timeout(700)
            await g.ev("M.G.state = 'pause'")
            await pg.screenshot(path=f'shots/v3_cans_thief_pump_{w}x{h}.png')
            out['errors_' + str(w)] = g.errs
            out['http_' + str(w)] = g.http
            await b.close()
    # contact sheet of the gauge crops
    ims = [[Image.open(p) for p in row] for row in sheet]
    W = sum(max(r[k].width for r in ims) for k in range(3)) + 40; H = sum(max(i.height for i in r) for r in ims) + 40
    S = Image.new('RGB', (W, H), (60, 60, 60)); y = 10
    for r in ims:
        x = 10
        for k, im in enumerate(r): S.paste(im, (x, y)); x += max(rr[k].width for rr in ims) + 10
        y += max(i.height for i in r) + 10
    S.save('shots/v3_gauge_sheet.png')
    json.dump(out, open('results_v3_visual.json', 'w'), indent=1)
    print(json.dumps(out['gauge'], indent=0))

asyncio.run(main())
