# v4 economy: a bot that chases/rams/shoots, uses pumps, dodges the crane and buys parts, laps 1-10.
# Records per lap: lap length, scrap income (wrecks vs stunts), fuel stolen, pump present/used, prices.
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from harness import open_game
BOTJS = open(os.path.join(os.path.dirname(__file__), 'v4_bot.js')).read()

RUN = r"""
({ car, laps, mode, shop, god }) => {
  const m = M, G = m.G, out = { car, mode, laps: [] };
  m.start(car); G.state = 'pause';
  for (let L = 1; L <= laps; L++) {
    const rec = { lap: G.wave, t0: G.time, scrap0: G.scrap, wreck0: G.wrecks, stunt: 0, pump: isFinite(G.pumpT), pumpGot: 0, stolen: 0, recovered: 0, thieves: 0, spawned: 0, hp0: Math.round(G.P.hp), craneHits: 0, enemiesPeak: 0, fuelFromPump: 0, nitroSec: 0 };
    const steal = new Map(), seen = new Set(); let lastD = G.driftScrap, cans = new Set();
    let frames = 0;
    while (G.state !== 'shop' && G.state !== 'over' && frames < 30 * 400) {
      const fuelB = G.fuel, cansB = new Set(G.cans);
      const craneHitB = G.crane && G.crane.hit ? G.crane.hit.has(G.P) : false;
      const hpB = G.P.hp, eb = G.ebul.slice(), invB = G.P.inv;
      BOT.run(1, mode); frames++;
      if (god && G.state === 'play') { if (G.P.hp < hpB - .01) { rec.dmgTaken = (rec.dmgTaken || 0) + hpB - G.P.hp } }
      if (G.P.hp < hpB - .01) { const P = G.P, dmg = hpB - P.hp; let src = 'other';
        if (eb.some(b => !G.ebul.includes(b) && Math.hypot(b.x - P.x, b.y - P.y) < P.r + 40)) src = 'bullet';
        else { const e = G.enemies.find(e => Math.hypot(e.x - P.x, e.y - P.y) < P.r + e.r + 8); if (e) src = 'ram:' + e.type + (e.charge > 0 ? '*' : ''); else if (G.crane.hit && G.crane.hit.has(P)) src = 'crane'; else src = 'ram:(killed)' }
        rec.dmg = rec.dmg || {}; rec.dmg[src] = +((rec.dmg[src] || 0) + dmg).toFixed(1); }
      if (G.crane && G.crane.hit && G.crane.hit.has(G.P) && !craneHitB) rec.craneHits++;
      if (god) { G.P.hp = G.S.maxhp; if (G.state === 'dead') G.state = 'play' }
      for (const e of G.enemies) { if (!seen.has(e)) { seen.add(e); rec.spawned++; if (e.type === 'thief') rec.thieves++ } if (e.type === 'thief') steal.set(e, Math.max(steal.get(e) || 0, (e.stolen || 0) + (e.siph || 0))) }
      for (const c of cansB) if (c.got) rec.recovered += c.l;
      if (G.P.boost) rec.nitroSec += 1 / 30;
      rec.enemiesPeak = Math.max(rec.enemiesPeak, G.enemies.length);
      if (G.driftScrap !== lastD) { rec.stunt += G.driftScrap - lastD; lastD = G.driftScrap }
    }
    rec.lapSec = +(G.time - rec.t0 - 3 - 2.8).toFixed(1); // minus countdown and the out-of-fuel sign
    rec.stolen = +[...steal.values()].reduce((a, b) => a + b, 0).toFixed(1); rec.recovered = +rec.recovered.toFixed(1);
    rec.pumpGot = G.pump ? +G.pump.got.toFixed(1) : 0;
    rec.income = G.scrap - rec.scrap0; rec.wrecks = G.wrecks - rec.wreck0; rec.hpEnd = Math.round(G.P.hp); rec.maxhp = G.S.maxhp;
    rec.died = G.state === 'over';
    rec.offerPrices = G.offer.map(it => it.id + ':' + m.price(it));
    rec.bought = G.state === 'shop' && shop ? BOT.shop() : [];
    rec.scrapLeft = G.scrap; rec.nitroSec = +rec.nitroSec.toFixed(1);
    delete rec.t0; delete rec.scrap0; delete rec.wreck0;
    out.laps.push(rec);
    if (G.state !== 'shop') break;
    m.nextWave(); G.state = 'pause';
  }
  out.build = Object.entries(G.build).map(([k, v]) => k + ':' + v.id + v.lvl).join(' ');
  out.score = G.score;
  return out;
}
"""

async def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4econ')
        await g.ev(BOTJS)
        res = []
        for mode in (sys.argv[2].split(',') if len(sys.argv) > 2 else ['kite']):
            for car in [0, 1, 2]:
                for k in range(runs):
                    r = await g.ev(RUN, {'car': car, 'laps': 10, 'mode': mode.split('+')[0], 'shop': True, 'god': mode.endswith('+god')})
                    res.append(r)
                    print(mode, car, 'laps', len(r['laps']), 'score', r['score'], r['build'])
                    for l in r['laps']:
                        print('  ', json.dumps({k: l.get(k) for k in ['lap', 'lapSec', 'income', 'wrecks', 'stunt', 'pump', 'pumpGot', 'stolen', 'recovered', 'thieves', 'spawned', 'hp0', 'hpEnd', 'maxhp', 'died', 'craneHits', 'nitroSec', 'dmg', 'dmgTaken', 'bought']}))
        json.dump({'runs': res, 'errs': g.errs}, open('results_v4_econ_' + '_'.join(sys.argv[2:] or ['kite']) + '.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
