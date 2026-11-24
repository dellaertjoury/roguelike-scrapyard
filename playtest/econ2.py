# Economy follow-ups: banked drift combos, drift farming under attack, ramp-loop bot,
# scrap paid out for enemies (and elites) left alive when the lap timer ends.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

PROBES = r"""
() => {
  const m = M, G = m.G, out = {};
  const reset = (car = 0) => { m.start(car); G.state = 'pause'; };
  const runLap = (keysF, each) => { let i = 0; while ((G.state === 'play' || G.state === 'pause') && i < 2000) { step(1, 1 / 30, keysF(i), each ? () => each(i) : null, true); i++ } for (let k = 0; k < 60 && G.state !== 'shop'; k++) step(1, 1 / 30, []); return i };

  /* 1. hold W+D for a whole empty lap, let the lap end bank the combo */
  {
    const r = [];
    for (const car of [0, 1, 2]) {
      reset(car); G.pend = []; G.enemies = []; G.spawnT = 1e9; G.obs = []; G.ramps = []; G.P.x = 1000; G.P.y = 680;
      const s0 = G.scrap; runLap(() => ['KeyW', 'KeyD']);
      r.push({ car: D.CARS[car].id, state: G.state, scrapFromOneCombo: G.scrap - s0, score: G.score, bestDrift: G.bestDrift });
    }
    out.emptyLapCombo = r;
  }

  /* 2. same, with the real lap 1-3 enemies, normal HP, starting weapons; the run continues across laps */
  {
    const r = [];
    for (const car of [0, 1, 2]) {
      reset(car); const row = { car: D.CARS[car].id, laps: [] };
      for (let lap = 1; lap <= 3 && G.state !== 'over' && G.state !== 'dead'; lap++) {
        const s0 = G.scrap, sc0 = G.score, bd0 = G.bestDrift; let hits = 0, hp = G.P.hp;
        runLap(() => ['KeyW', 'KeyD'], () => { if (G.P.hp < hp - .01) hits++; hp = G.P.hp });
        row.laps.push({ lap, end: G.state, scrap: G.scrap - s0, score: G.score - sc0, bestDrift: G.bestDrift, hitsTaken: hits, hp: Math.round(G.P.hp) });
        if (G.state === 'shop') { m.nextWave(); G.state = 'pause' }
      }
      r.push(row);
    }
    out.driftUnderAttack = r;
  }

  /* 3. ramp-loop bot: drive to a run-up point behind ramp 0, line up, jump, repeat (empty arena) */
  {
    const r = [];
    for (const car of [0, 1]) {
      reset(car); G.pend = []; G.enemies = []; G.spawnT = 1e9; G.obs = [];
      const R = G.ramps[0], P = G.P; G.ramps = [R];
      const A = [R.x - R.c * 230, R.y - R.s * 230], B = [R.x + R.c * (R.L + 400), R.y + R.s * (R.L + 400)];
      let phase = 0, jumps = 0, wasAir = false; const s0 = G.scrap;
      const steerTo = (tx, ty) => { const d = m.angDiff(Math.atan2(ty - P.y, tx - P.x), P.a); return d > .08 ? ['KeyD'] : d < -.08 ? ['KeyA'] : [] };
      runLap(() => {
        if (phase === 0) { if (Math.hypot(P.x - A[0], P.y - A[1]) < 60) phase = 1; return ['KeyW', ...steerTo(A[0], A[1])] }
        if (phase === 1) { if (P.air) phase = 2; const k = steerTo(R.x + R.c * R.L, R.y + R.s * R.L); return Math.abs(m.angDiff(R.d, P.a)) < .3 ? ['KeyW', ...k] : ['KeyW', ...k] }
        if (phase === 2) { if (!P.air) { jumps++; phase = 0 } return [] }
      }, () => { G.P.hp = G.S.maxhp; });
      r.push({ car: D.CARS[car].id, jumps, scrapFromJumps: G.scrap - s0, score: G.score });
    }
    out.rampLoop = r;
  }

  /* 4. scrap for enemies left alive at the lap end (code: endWave -> kill(e, false) adds scrap) */
  {
    const r = {};
    reset(1); G.wave = 4; m.nextWave(); G.state = 'pause';
    G.pend.forEach(s => s.t = .01); step(3, 1 / 30, []);
    const alive = G.enemies.map(e => e.type + ':' + e.sc);
    const s0 = G.scrap; G.waveT = .01; step(2, 1 / 30, [], null, true); for (let k = 0; k < 60 && G.state !== 'shop'; k++) step(1, 1 / 30, []);
    r.lap5 = { aliveAtEnd: alive, scrapPaidWithoutKilling: G.scrap - s0, wrecksCounted: G.wrecks };
    out.untouchedPayout = r;
  }
  G.state = 'pause';
  return out;
}
"""


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'econ2')
        await g.start(0)
        res = await g.ev(PROBES)
        print(json.dumps(res, indent=1))
        json.dump(res, open('results_econ2.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
