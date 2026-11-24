# Ramp-loop farming bot (empty arena): repeatedly drive to a run-up point behind a ramp and jump it.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
JS = r"""
() => {
  const m = M, G = m.G, out = [];
  for (const car of [0, 1]) {
    m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9; G.obs = [];
    const P = G.P, R = G.ramps[0]; G.ramps = [R];
    const A = [R.x - R.c * 420, R.y - R.s * 420], lip = [R.x + R.c * R.L, R.y + R.s * R.L];
    let phase = 0, jumps = 0, t1 = 0; const s0 = G.scrap, sc0 = G.score;
    const steer = (tx, ty) => { const d = m.angDiff(Math.atan2(ty - P.y, tx - P.x), P.a); return d > .05 ? ['KeyD'] : d < -.05 ? ['KeyA'] : [] };
    for (let i = 0; i < 1800 && G.state !== 'clear' && G.state !== 'shop'; i++) {
      let k;
      if (phase === 0) { k = ['KeyW', ...steer(A[0], A[1])]; if (Math.hypot(P.x - A[0], P.y - A[1]) < 90) { phase = 1; t1 = 0 } }
      else if (phase === 1) { t1++; k = ['KeyW', ...steer(lip[0], lip[1])]; if (P.air) phase = 2; if (t1 > 150) phase = 0 }
      else { k = []; if (!P.air) { jumps++; phase = 0 } }
      step(1, 1 / 30, k, null, true); G.P.hp = G.S.maxhp;
    }
    out.push({ car: D.CARS[car].id, jumps, scrap: G.scrap - s0, score: G.score - sc0 });
  }
  G.state = 'pause'; return out;
}
"""
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'ramploop')
        await g.start(0)
        print(os.environ.get('GAME_URL', 'v2'), json.dumps(await g.ev(JS)))
        await b.close()
asyncio.run(main())
