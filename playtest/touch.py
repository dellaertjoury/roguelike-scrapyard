# Touch controls (v2): layout vs HUD panels on touch devices, and real touch input through CDP.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game

LAYOUT = r"""
() => {
  const vis = el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
  const R = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
  const btns = [...document.querySelectorAll('#touch button')].filter(vis);
  const pnls = [...document.querySelectorAll('#hud > .pnl')].filter(p => getComputedStyle(p).display !== 'none');
  const ov = [];
  for (const b of btns) for (const p of pnls) { const a = b.getBoundingClientRect(), q = p.getBoundingClientRect();
    const ox = Math.min(a.right, q.right) - Math.max(a.left, q.left), oy = Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top);
    if (ox > 2 && oy > 2) ov.push(`${b.dataset.key || b.id} x ${p.id || p.className} (${Math.round(ox)}x${Math.round(oy)})`) }
  const pp = []; for (let i = 0; i < pnls.length; i++) for (let j = i + 1; j < pnls.length; j++) { const a = pnls[i].getBoundingClientRect(), q = pnls[j].getBoundingClientRect();
    const ox = Math.min(a.right, q.right) - Math.max(a.left, q.left), oy = Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top);
    if (ox > 2 && oy > 2) pp.push(`${pnls[i].id || pnls[i].className} x ${pnls[j].id || pnls[j].className} (${Math.round(ox)}x${Math.round(oy)})`) }
  return { touchVisible: getComputedStyle(document.getElementById('touch')).display, buttons: btns.length, btnRects: Object.fromEntries(btns.map(b => [b.dataset.key || b.id, R(b)])), buttonPanelOverlaps: ov, panelPanelOverlaps: pp, speedPanel: getComputedStyle(document.querySelector('.bl')).display };
}
"""


async def touch_hold(cdp, x, y, ms, pg):
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 1}]})
    await pg.wait_for_timeout(ms // 2)
    keys = await pg.evaluate("Object.entries(M.G.keys).filter(([k, v]) => v).map(([k]) => k)")
    await pg.wait_for_timeout(ms // 2)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    return keys


async def main():
    out = {}
    async with async_playwright() as pw:
        for (w, h) in [(390, 844), (768, 1024), (1366, 800)]:
            b, g = await open_game(pw, f'touch_{w}', lang='de', vw=w, vh=h, touch=True)
            pg = g.page
            await pg.tap('.car[data-i="1"]'); await pg.wait_for_timeout(400)
            # elite lap so the boss panel shows too
            await g.ev("(() => { const G = M.G; G.wave = 9; M.nextWave(); G.pend.forEach(s => s.t = .01); G.P.hp = G.S.maxhp = 1e6 })()")
            await pg.wait_for_timeout(2500)
            r = await g.ev(LAYOUT)
            cdp = await pg.context.new_cdp_session(pg)
            gas = r['btnRects'].get('ArrowUp'); rt = r['btnRects'].get('ArrowRight')
            if gas:
                sp0 = await g.ev("M.G.P.sp")
                r['keysWhileHoldingGas'] = await touch_hold(cdp, (gas[0] + gas[2]) / 2, (gas[1] + gas[3]) / 2, 1500, pg)
                r['speedAfterGas'] = round(await g.ev("M.G.P.sp"))
                r['keysAfterRelease'] = await g.ev("Object.entries(M.G.keys).filter(([k, v]) => v).map(([k]) => k)")
                # two fingers: gas + right
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': (gas[0] + gas[2]) / 2, 'y': (gas[1] + gas[3]) / 2, 'id': 1}, {'x': (rt[0] + rt[2]) / 2, 'y': (rt[1] + rt[3]) / 2, 'id': 2}]})
                await pg.wait_for_timeout(400)
                r['multiTouchKeys'] = await g.ev("Object.entries(M.G.keys).filter(([k, v]) => v).map(([k]) => k)")
                await pg.screenshot(path=f'shots/touch_{w}x{h}_hud.png')
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
                await pg.wait_for_timeout(200)
                r['keysAfterMultiRelease'] = await g.ev("Object.entries(M.G.keys).filter(([k, v]) => v).map(([k]) => k)")
                pb = await g.ev("(() => { const r = document.getElementById('tPause').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()")
                await pg.touchscreen.tap(pb[0], pb[1]); await pg.wait_for_timeout(300)
                r['stateAfterPauseTap'] = await g.ev("M.G.state")
                await pg.screenshot(path=f'shots/touch_{w}x{h}_paused.png')
                # garage on touch
                await g.ev("(() => { const G = M.G; G.state = 'play'; G.scrap = 500; G.fuel = .01 })()")
                await pg.wait_for_selector('#shop:not(.hide)', timeout=30000)
                await pg.wait_for_timeout(300)
                await pg.screenshot(path=f'shots/touch_{w}x{h}_garage.png')
                r['touchVisibleInGarage'] = await g.ev("document.getElementById('touch').offsetParent !== null")
            r['errors'] = g.errs
            out[f'{w}x{h}'] = r
            print(w, h, json.dumps(r))
            await b.close()
    json.dump(out, open(os.environ.get('OUT', 'results_v2_touch.json'), 'w'), indent=1)

asyncio.run(main())
