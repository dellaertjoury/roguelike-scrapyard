# v3 economy with fuel: scrap per lap for laps 1-15 for six bots, including a pump camper,
# plus mortal runs (real HP) to see whether refuelling is worth the risk.
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from harness import open_game

LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()

BOTS = r"""
(cfg) => {
  const m = M, G = m.G;
  const { bot, laps = 15, mortal = false, car = 1 } = cfg;
  reset3(car, { keepLevel: true, god: !mortal, weapons: bot !== 'passive' });
  G.spawnT = 1.2;
  const rows = [];
  let rampPhase = 0, R = null;
  const P = () => G.P;
  const keysFor = (i) => {
    const p = G.P;
    if (bot === 'passive') return [];
    if (bot === 'aggressive') return ['KeyW', 'KeyD'];
    if (bot === 'drift') return driftKeys(i);
    if (bot === 'ramp') {
      R = R || G.ramps[0];
      const A = [R.x - R.c * 240, R.y - R.s * 240];
      if (rampPhase === 0) { if (Math.hypot(p.x - A[0], p.y - A[1]) < 70) rampPhase = 1; return steerKeys(A[0], A[1], ['KeyW']) }
      if (rampPhase === 1) { if (p.air) rampPhase = 2; if (Math.hypot(p.x - R.cx, p.y - R.cy) > 420) rampPhase = 0;
        const d = m.angDiff(Math.atan2(R.y + R.s * R.L - p.y, R.x + R.c * R.L - p.x), p.a); return ['KeyW', ...(d > .05 ? ['KeyD'] : d < -.05 ? ['KeyA'] : [])] }
      if (!p.air) rampPhase = 0; return [];
    }
    if (bot === 'pump' && G.pump) return goStop(G.pump.x + 30, G.pump.y, 24);
    return ramKeys();
  };
  for (let lap = 1; lap <= laps; lap++) {
    if (G.state === 'over' || G.state === 'dead') break;
    const s0 = G.scrap, w0 = G.wrecks; let dmg = 0, prevHp = G.P.hp, pumped = 0, stolen = 0, pf = G.fuel, frames = 0, pumpsUsed = new Set();
    runLap3(keysFor, () => {
      frames++;
      if (G.P.hp < prevHp) dmg += prevHp - G.P.hp; if (!mortal) G.P.hp = G.S.maxhp; prevHp = G.P.hp;
      if (bot === 'aggressive') { G.W.mg = 4; G.W.saw = 4; G.W.flame = 4; G.W.tesla = 4; G.S.dmg = 50; G.S.magnet = 3000 }
      if (G.filling && G.pump) pumpsUsed.add(G.pump.id);
      const df = G.fuel - pf + (G.P.boost ? 2 : 1) / 30; if (df > .5) pumped += df; pf = G.fuel;
      for (const e of G.enemies) if (e.type === 'thief' && (e.stolen || 0) > (e._s || 0)) { stolen += e.stolen - (e._s || 0); e._s = e.stolen }
    }, 9000);
    rows.push({ lap, scrap: G.scrap - s0, secs: Math.round(frames / 30), wrecks: G.wrecks - w0, dmg: Math.round(dmg), pumps: pumpsUsed.size, refuelL: Math.round(pumped), stolenL: Math.round(stolen), end: G.state });
    if (G.state !== 'shop') break;
    if (bot === 'shop' || bot === 'pump') shopBot();
    m.nextWave(); G.state = 'pause'; rampPhase = 0;
  }
  const build = Object.entries(G.build).map(([k, v]) => v.id + v.lvl).join(' ');
  G.state = 'pause';
  return { bot, mortal, rows, build, totalScrap: rows.reduce((a, r) => a + r.scrap, 0), score: G.score, reached: rows.length };
}
"""

PRICES = r"""
() => { const m = M, G = m.G; m.start(0); G.state = 'pause'; G.build = {}; const rows = [];
  for (let w = 1; w <= 15; w++) { G.wave = w; const p1 = D.PARTS.map(p => m.price({ id: p.id })); const avg = p1.reduce((a, b) => a + b) / p1.length;
    rows.push({ lap: w, avgLv1: Math.round(avg), cheapest: Math.min(...p1), priciest: Math.max(...p1), reroll: Math.round(2 * m.priceScale()) + w, repair: m.repairCost() }) }
  return rows }
"""


async def main():
    out = {'bots': [], 'mortal': []}
    only = sys.argv[1:] or None
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'econ3')
        await g.start(1)
        await g.ev(LIB)
        out['prices'] = await g.ev(PRICES)
        for bot in ['passive', 'aggressive', 'drift', 'ramp', 'shop', 'pump']:
            if only and bot not in only: continue
            r = await g.ev(BOTS, {'bot': bot})
            out['bots'].append(r)
            print(bot, r['totalScrap'], r['build'], json.dumps([(x['lap'], x['scrap'], x['secs'], x['dmg'], x['pumps'], x['stolenL']) for x in r['rows']]), flush=True)
        for bot in ['shop', 'pump']:
            if only and bot not in only: continue
            for k in range(4):
                r = await g.ev(BOTS, {'bot': bot, 'mortal': True, 'laps': 30})
                out['mortal'].append({'bot': bot, 'reached': r['reached'], 'total': r['totalScrap'], 'build': r['build'], 'lastEnd': r['rows'][-1]['end'], 'secs': sum(x['secs'] for x in r['rows'])})
                print('mortal', bot, out['mortal'][-1], flush=True)
        out['errors'] = g.errs
        json.dump(out, open('results_econ3.json', 'w'), indent=1)
        await b.close()

asyncio.run(main())
