# Score / economy probes: drift farming, scrap income per lap for passive vs active play,
# airtime farming, camping, and part prices for laps 1-15.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

PROBES = r"""
() => {
  const m = M, G = m.G, out = {};
  const reset = (car = 0) => { m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; };

  /* 1. drift farming in an empty arena for one full 60 s lap */
  {
    const r = [];
    const patterns = {
      'W+D+Space held': i => ['KeyW', 'KeyD', 'Space'],
      'W+D held': i => ['KeyW', 'KeyD'],
      'W+D, Space tapped 0.3s every 1s': i => (i % 30) < 9 ? ['KeyW', 'KeyD', 'Space'] : ['KeyW', 'KeyD'],
      'W+D, Space tapped 0.2s every 0.5s': i => (i % 15) < 6 ? ['KeyW', 'KeyD', 'Space'] : ['KeyW', 'KeyD'],
    };
    for (const car of [0, 1, 2]) for (const [name, f] of Object.entries(patterns)) {
      reset(car); G.spawnT = 1e9; G.obs = []; G.ramps = []; G.P.hp = G.S.maxhp = 1e6;
      const P = G.P; P.x = 1000; P.y = 680; let drifting = 0, maxMult = 0, banks = 0, maxPts = 0;
      const sc0 = G.scrap;
      for (let i = 0; i < 1800 && G.state !== 'clear'; i++) {
        step(1, 1 / 30, f(i), () => { if (G.drift.on) drifting++; maxMult = Math.max(maxMult, G.drift.mult); maxPts = Math.max(maxPts, G.drift.pts) });
      }
      // lap ends by itself after 60 s (waveT), bankDrift at endWave
      r.push({ car: D.CARS[car].id, pattern: name, state: G.state, driftFrac: +(drifting / 1800).toFixed(2), maxMult: +maxMult.toFixed(1), biggestCombo: Math.round(maxPts), scrap: G.scrap - sc0, score: G.score, bestDrift: G.bestDrift });
    }
    out.driftFarm = r;
  }

  /* 2. scrap per lap, laps 1..15: passive (parked, no weapons, invulnerable) vs active (god-tier weapons, circling) */
  {
    const res = { passive: [], active: [] };
    for (const mode of ['passive', 'active']) {
      reset(1); G.P.hp = G.S.maxhp = 1e9;
      let prev = 0;
      for (let lap = 1; lap <= 15; lap++) {
        G.P.x = 1000; G.P.y = 680; G.P.vx = G.P.vy = 0;
        let killsScrap = 0, drift0 = 0, frames = 0, spawned = 0, sc0 = G.scrap, wr0 = G.wrecks;
        const keys = mode === 'active' ? ['KeyW', 'KeyD'] : [];
        while (G.state === 'play' || G.state === 'pause') {
          if (mode === 'passive') { G.W.mg = 0; G.W.mines = 0; G.drift.pts = 0 } else { G.W.mg = 4; G.W.saw = 4; G.W.flame = 4; G.W.tesla = 4; G.S.dmg = 50; G.S.magnet = 3000; G.drift.pts = 0 }
          G.P.hp = 1e9; step(1, 1 / 30, keys, null, true); frames++;
          if (frames > 2100) break;
        }
        for (let i = 0; i < 60 && G.state !== 'shop'; i++) step(1, 1 / 30, []);
        res[mode].push({ lap, scrap: G.scrap - sc0, wrecks: G.wrecks - wr0 });
        m.nextWave(); G.state = 'pause';
      }
    }
    out.perLap = res;
  }

  /* 3. part prices per lap, from the game's own price() (Lv1 buy / Lv2 / Lv3 upgrade) */
  {
    reset(0); const rows = []; G.build = {};
    for (let w = 1; w <= 15; w++) {
      G.wave = w; const p1 = D.PARTS.map(p => m.price({ id: p.id }));
      const avg = p1.reduce((a, b) => a + b) / p1.length;
      rows.push({ lap: w, avgLv1: Math.round(avg), cheapest: Math.min(...p1), priciest: Math.max(...p1), avgLv2: Math.round(avg * 1.5), avgLv3: Math.round(avg * 2), reroll: (m.priceScale ? Math.round(2 * m.priceScale()) + w : 2 + w), repair: m.repairCost() });
    }
    out.prices = rows;
  }

  /* 4. camping: lap 6, parked in a corner vs centre, no weapons: damage taken */
  {
    const r = {};
    for (const [name, x, y] of [['corner', 60, 60], ['centre', 1000, 680], ['moving circle', 1000, 680]]) {
      reset(1); G.wave = 5; m.nextWave(); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e6; G.W.mg = 0;
      G.P.x = x; G.P.y = y; let lost = 0, prev = G.P.hp;
      for (let i = 0; i < 1700; i++) { step(1, 1 / 30, name === 'moving circle' ? ['KeyW', 'KeyD'] : [], () => { if (name !== 'moving circle') { G.P.x = x; G.P.y = y; G.P.vx = G.P.vy = 0 } }); }
      r[name] = Math.round(1e6 - G.P.hp);
    }
    out.camping = r;
  }
  G.state = 'pause';
  return out;
}
"""


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'econ')
        await g.start(0)
        res = await g.ev(PROBES)
        print(json.dumps(res, indent=1))
        json.dump(res, open('results_econ.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
