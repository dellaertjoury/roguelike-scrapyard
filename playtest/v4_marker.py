# v4 spawn-on-marker: park on the red X; count hits and damage over the next 2 s (no chains?), also two
# overlapping markers, and a marker next to a wall / obstacle (where does the shove put us?).
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

JS = r"""
({ n, keys, pair, wall }) => {
  const m = M, G = m.G, out = { n, keys, pair, wall, hitsHist: {}, dmgMean: 0, maxDmg: 0, maxHits: 0, inObsAfter: 0, outsideAfter: 0, firstHit: 0, ramDmg: 0 };
  m.start(1); G.state = 'pause'; G.wave = 6; m.nextWave(); G.state = 'pause';
  let tot = 0;
  for (let i = 0; i < n; i++) {
    m.nextWave(); G.wave = 6; G.state = 'pause'; G.startT = 0; G.P.intro = false; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0; G.eliteDue = null; G.enemies = []; G.pend = []; G.crane.t = 1e9;
    const P = G.P; P.hp = G.S.maxhp = 1e6; P.inv = 0; P.vx = P.vy = 0; P.a = Math.random() * 6.28;
    let x = 300 + Math.random() * 1400, y = 300 + Math.random() * 760;
    if (wall) { const s = Math.random() * 4 | 0; if (s === 0) y = m.EDGE + 60; if (s === 1) y = m.AH - m.EDGE - 60; if (s === 2) x = m.EDGE + 60; if (s === 3) x = m.AW - m.EDGE - 60 }
    P.x = x + (Math.random() - .5) * 10; P.y = y + (Math.random() - .5) * 10;
    G.pend.push({ x, y, t: .05, max: 1.1, type: 'rust' });
    if (pair) G.pend.push({ x: x + 8, y: y - 6, t: .05, max: 1.1, type: Math.random() < .5 ? 'rust' : 'thief' });
    let hits = 0, dmg = 0;
    for (let f = 0; f < 60; f++) {
      G.keys = {}; for (const k of keys) G.keys[k] = true; G.fuel = 30;
      const h = P.hp; G.state = 'play'; m.update(1 / 30); G.state = 'pause';
      if (P.hp < h) { hits++; dmg += h - P.hp; if (hits === 1) out.firstHit += h - P.hp }
    }
    if (G.obs.some(o => Math.hypot(o.x - P.x, o.y - P.y) < o.r + P.r - 1)) out.inObsAfter++;
    out.hitsHist[hits] = (out.hitsHist[hits] || 0) + 1; out.maxHits = Math.max(out.maxHits, hits); out.maxDmg = Math.max(out.maxDmg, dmg); tot += dmg;
  }
  out.dmgMean = +(tot / n).toFixed(1); out.firstHit = +(out.firstHit / n).toFixed(1); out.rustDmg = +m.G.enemies.concat([]).length;
  return out;
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4marker')
        res = []
        for cfg in [dict(keys=[], pair=False, wall=False), dict(keys=['KeyW'], pair=False, wall=False), dict(keys=[], pair=True, wall=False), dict(keys=[], pair=False, wall=True)]:
            r = await g.ev(JS, dict(n=300, **cfg)); print(json.dumps(r)); res.append(r)
        json.dump({'runs': res, 'errs': g.errs}, open('results_v4_marker.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
