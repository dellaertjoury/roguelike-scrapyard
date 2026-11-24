# Game time vs wall-clock time in the real rAF loop (SwiftShader is slow, so this shows the low-fps behaviour).
import asyncio, os, time
from playwright.async_api import async_playwright
from harness import open_game
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'gamespeed')
        await g.start(1)
        await g.ev("(() => { const G = M.G; G.P.hp = G.S.maxhp = 1e9; G.state = 'play' })()")
        await g.page.wait_for_timeout(500)
        f0 = await g.ev("new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r([n, M.G.time]) }; requestAnimationFrame(f) })")
        t0 = await g.ev("M.G.time"); w0 = time.time(); await g.page.wait_for_timeout(3000); t1 = await g.ev("M.G.time"); w1 = time.time()
        print(os.environ.get('GAME_URL', 'v2'), 'fps≈', round(f0[0] / 3, 1), 'game s per wall s =', round((t1 - t0) / (w1 - w0), 2))
        await b.close()
asyncio.run(main())
