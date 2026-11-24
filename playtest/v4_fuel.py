# v4 fuel: pump chance (+radar), one pump per lap, 4 s pre-marker, 6 L/s flow, hysteresis, dry pump stays,
# reserve tank, thief siphon rates and hose cap, pump spot placement.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
BOTJS = open(os.path.join(os.path.dirname(__file__), 'v4_bot.js')).read()

CHANCE = r"""
() => {
  const m = M, G = m.G, out = {};
  m.start(0); G.state = 'pause';
  for (const lvl of [0, 1, 2, 3]) {
    if (lvl) G.build.roof = { id: 'radar', lvl }; else delete G.build.roof; m.recompute();
    let k = 0; const N = 4000; for (let i = 0; i < N; i++) { m.nextWave(); if (isFinite(G.pumpT)) k++ }
    out['radar' + lvl] = { pumpChance: G.S.pumpChance, observed: +(k / N).toFixed(3) };
  }
  delete G.build.roof;
  for (const lvl of [0, 1, 2, 3]) { if (lvl) G.build.trunk = { id: 'tank', lvl }; else delete G.build.trunk; m.recompute(); m.nextWave(); out['tank' + lvl] = { tank: G.tank, fuelAtStart: G.fuel } }
  G.state = 'pause'; return out;
}
"""

FLOW = r"""
() => {
  const m = M, G = m.G, out = { events: [] };
  m.start(0); G.state = 'pause'; delete G.build.trunk; m.recompute();
  // force a pump lap
  let tries = 0; do { m.nextWave(); tries++ } while (!isFinite(G.pumpT) && tries < 50); G.state = 'pause';
  G.startT = 0; G.P.intro = false; G.P.x = 1000; G.P.y = 300; G.P.vx = G.P.vy = 0; G.S.maxhp = G.P.hp = 1e9; G.crane.t = 1e9; G.spawnT = 1e9; G.openers = 0;
  out.pumpT0 = G.pumpT;
  let tNext = null, tOpen = null, nextSpot = null, opens = 0, lastId = null, fillLog = [], prevFuel = G.fuel, fillingFlips = 0, prevFill = false;
  for (let f = 0; f < 30 * 70; f++) {
    G.keys = {};
    if (G.pump && !G.pump.empty) { // sit on the pad (park 40 units off the post)
      const tx = G.pump.x + 60, ty = G.pump.y; const d = Math.hypot(tx - G.P.x, ty - G.P.y);
      if (d > 30) for (const k of BOT.steerTo(tx, ty)) G.keys[k] = true; else { G.P.vx *= .5; G.P.vy *= .5 }
    }
    G.state = 'play'; m.update(1 / 30); if (G.state !== 'play') { out.endedAt = +G.time.toFixed(1); out.endState = G.state; break } G.state = 'pause';
    if (G.pumpNext && tNext == null) { tNext = G.time; nextSpot = { ...G.pumpNext }; out.pumpTAtMarker = +G.pumpT.toFixed(2) }
    if (G.pump && G.pump.id !== lastId) { opens++; lastId = G.pump.id; tOpen = G.time; out.sameSpot = nextSpot && Math.hypot(nextSpot.x - G.pump.x, nextSpot.y - G.pump.y) < 1; out.distAtOpen = Math.hypot(G.P.x - G.pump.x, G.P.y - G.pump.y) | 0 }
    if (G.filling !== prevFill) { fillingFlips++; prevFill = G.filling }
    if (G.filling) fillLog.push(G.fuel - prevFuel);
    prevFuel = G.fuel;
    if (G.pump && G.pump.empty && out.emptyAt == null) { out.emptyAt = +G.time.toFixed(2); out.gotTotal = +G.pump.got.toFixed(2) }
    if (f % 150 === 0) out.events.push({ t: +G.time.toFixed(1), fuel: +G.fuel.toFixed(2), res: G.pump ? +G.pump.res.toFixed(1) : null, filling: G.filling, empty: G.pump ? G.pump.empty : null });
  }
  out.markerLead = tOpen != null && tNext != null ? +(tOpen - tNext).toFixed(2) : null;
  out.opens = opens; out.fillingFlips = fillingFlips;
  out.netFillPerSec = fillLog.length ? +(fillLog.reduce((a, b) => a + b, 0) / fillLog.length * 30).toFixed(2) : null;
  out.pumpStillThere = !!G.pump; out.pumpEmpty = G.pump && G.pump.empty;
  return out;
}
"""

SPOTS = r"""
(n) => {
  const m = M, G = m.G, { AW, AH, GATE } = m, out = { n, nulls: 0, inLane: 0, nearObs: 0, inPit: 0, nearPlayer: 0, onRampBody: 0, minGate: 1e9 };
  m.start(0); G.state = 'pause';
  for (let i = 0; i < n; i++) {
    if (i % 50 === 0) m.makeObs();
    G.startT = 0; G.P.intro = false; G.P.x = 200 + Math.random() * (AW - 400); G.P.y = 200 + Math.random() * (AH - 400);
    G.pump = null; G.pumpNext = null; G.pumpT = m.PUMP_WARN - .01; G.enemies = []; G.pend = []; G.spawnT = 1e9; G.fuel = 30;
    G.state = 'play'; m.update(1 / 30); G.state = 'pause';
    const s = G.pumpNext; if (!s) { out.nulls++; continue }
    if (G.ramps.some(r => m.inLane(r, s.x, s.y, m.PUMP_R))) out.inLane++;
    if (G.ramps.some(r => { const dx = s.x - r.x, dy = s.y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c; return u > -m.PUMP_R && u < r.L + m.PUMP_R && Math.abs(v) < r.W / 2 + m.PUMP_R })) out.onRampBody++;
    if (G.obs.some(o => Math.hypot(o.x - s.x, o.y - s.y) < o.r + m.PUMP_R)) out.nearObs++;
    const dg = Math.hypot(s.x - GATE.x, s.y - (AH - 210)); out.minGate = Math.min(out.minGate, dg); if (dg < m.PUMP_R + 60) out.inPit++;
    if (Math.hypot(s.x - G.P.x, s.y - G.P.y) < 380) out.nearPlayer++;
  }
  return out;
}
"""

THIEF = r"""
() => {
  const m = M, G = m.G, out = {};
  m.start(0); G.state = 'pause'; G.wave = 5; m.nextWave(); G.state = 'pause';
  G.startT = 0; G.P.intro = false; G.P.x = 1000; G.P.y = 680; G.P.vx = G.P.vy = 0; G.S.maxhp = G.P.hp = 1e9; G.crane.t = 1e9; G.spawnT = 1e9; G.pumpT = 1e9; G.pend = []; G.openers = 0;
  // five thieves parked around a stationary player
  const D = D_ => 0;
  for (let i = 0; i < 5; i++) { G.pend.push({ x: 1000 + Math.cos(i * 1.25) * 110, y: 680 + Math.sin(i * 1.25) * 110, t: 0, max: 1, type: 'thief' }) }
  // shove the player out of any marker: markers are at 110, player r ~19, so nothing lands on us
  const fuel0 = G.fuel; let maxHoses = 0, t = 0, log = [];
  for (let f = 0; f < 30 * 12; f++) {
    G.keys = {}; G.state = 'play'; m.update(1 / 30); if (G.state !== 'play') { out.endedAt = +G.time.toFixed(2); break } G.state = 'pause'; t += 1 / 30;
    const h = G.enemies.filter(e => e.hose).length; maxHoses = Math.max(maxHoses, h);
    if (f % 15 === 0) log.push({ t: +t.toFixed(1), fuel: +G.fuel.toFixed(2), hoses: h, fleeing: G.enemies.filter(e => e.flee > 0).length, stolen: +G.enemies.reduce((s, e) => s + (e.stolen || 0) + (e.siph || 0), 0).toFixed(1) });
  }
  out.maxHoses = maxHoses; out.log = log; out.fuelLeft = +G.fuel.toFixed(2); out.state = G.state;
  // kill all thieves: cans dropped?
  const cans0 = G.cans.length; for (const e of G.enemies) e.hp = 1; G.bullets = []; for (const e of G.enemies) { G.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .1, dmg: 99 }) }
  if (G.state === 'pause') { G.state = 'play'; m.update(1 / 30); G.state = 'pause' }
  out.cansDropped = G.cans.length - cans0; out.canLitres = G.cans.map(c => +c.l.toFixed(1));
  return out;
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4fuel')
        await g.ev(BOTJS)
        res = {}
        res['chance'] = await g.ev(CHANCE); print('CHANCE', json.dumps(res['chance']))
        res['flow'] = await g.ev(FLOW); print('FLOW', json.dumps(res['flow']))
        res['spots'] = await g.ev(SPOTS, 3000); print('SPOTS', json.dumps(res['spots']))
        res['thief'] = await g.ev(THIEF); print('THIEF', json.dumps(res['thief']))
        res['errs'] = g.errs
        json.dump(res, open('results_v4_fuel.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
