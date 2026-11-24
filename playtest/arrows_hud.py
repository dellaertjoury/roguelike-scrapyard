# Are off-screen spawn arrows hidden under HUD panels? Sample many directions and sizes.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game
JS = r"""
async () => {
  const G = M.G, res = { arrows: 0, underPanel: 0, byPanel: {} };
  for (let k = 0; k < 36; k++) {
    const a = k / 36 * Math.PI * 2;
    G.enemies = []; G.P.x = 1000; G.P.y = 680; G.cam.x = 1000; G.cam.y = 680;
    G.pend = [{ x: 1000 + Math.cos(a) * 900, y: 680 + Math.sin(a) * 640, t: 99, max: 99, type: 'rust', elite: false }];
    G.state = 'play';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ar = [...document.querySelectorAll('#fx .edge')].filter(x => x.style.display === 'block');
    for (const x of ar) {
      res.arrows++; const r = x.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      for (const p of document.querySelectorAll('#hud > .pnl, #touch button')) {
        if (p.offsetParent === null) continue; const q = p.getBoundingClientRect();
        if (cx > q.left && cx < q.right && cy > q.top && cy < q.bottom) { res.underPanel++; const n = p.id || p.className; res.byPanel[n] = (res.byPanel[n] || 0) + 1; break }
      }
    }
  }
  G.state = 'pause'; return res;
}
"""
async def main():
    async with async_playwright() as pw:
        for (w, h) in [(1366, 800), (390, 844)]:
            b, g = await open_game(pw, 'arrows', vw=w, vh=h)
            await g.start(0)
            await g.ev("(() => { const G = M.G; G.spawnT = 1e9; G.fuel = 1e9; G.P.hp = G.S.maxhp = 1e9 })()")
            print(w, h, json.dumps(await g.ev(JS)))
            await b.close()
asyncio.run(main())
