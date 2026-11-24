# Follow-up probes: corner escape, crush-bounce loop, and a long "natural" sim that counts
# stuck states (cars below a ramp surface, overlapping cars, cars inside obstacles).
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

PROBES = r"""
() => {
  const m = M, G = m.G, AW = m.AW, AH = m.AH, EDGE = m.EDGE, out = {};
  const reset = (car = 0) => { m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9; G.waveT = 1e9; G.P.hp = G.S.maxhp = 1e6; };
  const mk = (type, wave, x, y, extra = {}) => { const D0 = D.ENEMY(wave)[type]; return Object.assign({ type, x, y, a: 0, vx: 0, vy: 0, max: D0.hp, flash: 0, cd: 2, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D0, extra) };

  /* corner: ram into a corner with nitro for 4 s, then try to leave: reverse 1 s + steer, then forward 3 s */
  {
    const r = { runs: 0, escaped: 0, worst: 1e9, bouncesPerSec: [], shakeMax: 0 };
    for (const car of [0, 1, 2]) for (const [cx, cy] of [[0, 0], [AW, 0], [0, AH], [AW, AH]]) for (const off of [-.3, 0, .3]) {
      reset(car); const P = G.P; G.obs = []; G.ramps = [];
      P.x = cx ? AW - 300 : 300; P.y = cy ? AH - 300 : 300; P.a = Math.atan2(cy - P.y, cx - P.x) + off; P.nitro = 1;
      let stuns = 0, prevStun = 0, smax = 0;
      step(120, 1 / 30, ['KeyW', 'ShiftLeft'], () => { if (P.stun > prevStun + .01) stuns++; prevStun = P.stun; smax = Math.max(smax, G.shake); P.nitro = 1 });
      r.bouncesPerSec.push(+(stuns / 4).toFixed(2)); r.shakeMax = Math.max(r.shakeMax, smax);
      step(30, 1 / 30, ['KeyS', 'KeyD']); step(90, 1 / 30, ['KeyW']);
      const dc = Math.hypot(P.x - cx, P.y - cy); r.worst = Math.min(r.worst, dc); if (dc > 250) r.escaped++; r.runs++;
    }
    out.corner = r;
  }

  /* crush-bounce loop against a parked (spd 0) car: how many bounces, how much reward */
  {
    const r = [];
    for (const [type, wave, car] of [['brute', 6, 1], ['harvester', 5, 1], ['harvester', 5, 2], ['monster', 10, 2]]) {
      reset(car); G.wave = wave; const P = G.P; G.obs = []; G.ramps = []; G.W.mg = 0; G.W.mines = 0;
      const e = mk(type, wave, 1000, 680, { spd: 0, cd: 1e9 }); G.enemies = [e];
      P.x = 1000; P.y = 680; P.z = 60; P.air = true; P.vz = 0; P.airT = 0; P.vx = P.vy = 0;
      const s0 = G.scrap, sc0 = G.score, hp0 = e.hp; let bounces = 0, t = 0;
      step(900, 1 / 30, [], () => { t += 1 / 30; if (P.air && P.vz === 140) bounces++; if (e.dead || (!P.air && t > 2)) return false });
      r.push({ type, wave, car, bounces, gameSeconds: +t.toFixed(1), killed: !!e.dead, hpStart: Math.round(hp0), hpEnd: Math.round(Math.max(0, e.hp)), scrapFromAirtime: G.scrap - s0, score: G.score - sc0 });
    }
    // and against a chasing car: player only steers, no weapons
    for (const [type, wave] of [['brute', 6], ['rust', 3], ['harvester', 5], ['monster', 10], ['tow', 15]]) {
      reset(1); G.wave = wave; const P = G.P; G.obs = []; G.ramps = []; G.W.mg = 0;
      const e = mk(type, wave, 1000, 680, { cd: 1e9 }); G.enemies = [e];
      P.x = 1000; P.y = 680; P.z = 60; P.air = true; P.vz = 0; P.vx = P.vy = 0;
      let bounces = 0, t = 0; const s0 = G.scrap;
      step(600, 1 / 30, [], () => { t += 1 / 30; if (P.air && P.vz === 140) bounces++; if (e.dead || (!P.air && t > 2)) return false });
      r.push({ type, wave, chasing: true, bounces, killed: !!e.dead, scrapFromAirtime: G.scrap - s0 });
    }
    out.crush = r;
  }

  /* long natural sim: laps 6-12, invulnerable bot weaving around; count stuck states */
  {
    const r = { gameSeconds: 0, enemyFramesBelowRamp: 0, enemiesEverBelowRamp: new Set(), longestBelowRamp: 0, playerFramesBelowRamp: 0,
      overlapPairsFrames: 0, deepOverlap: 0, inObstacle: 0, nan: 0, maxEnemies: 0, outside: 0, laps: 0 };
    const below = (o, R) => { const dx = o.x - R.x, dy = o.y - R.y, u = dx * R.c + dy * R.s, v = -dx * R.s + dy * R.c; return u >= 0 && u <= R.L && Math.abs(v) <= R.W / 2 && o.z + 8 < R.H * u / R.L };
    m.start(1); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e6; G.wave = 5; m.nextWave(); G.state = 'pause';
    const P = G.P; const runs = new Map();
    let k = 0;
    for (let lap = 0; lap < 6; lap++) {
      const keys = [['KeyW'], ['KeyW', 'KeyD'], ['KeyW', 'KeyA', 'Space'], ['KeyW', 'ShiftLeft'], ['KeyS', 'KeyA'], ['KeyW', 'KeyD', 'Space']];
      for (let seg = 0; seg < 60; seg++) {
        step(30, 1 / 30, keys[(seg * 7 + lap) % keys.length], () => {
          r.gameSeconds += 1 / 30; P.nitro = 1; P.hp = 1e6;
          r.maxEnemies = Math.max(r.maxEnemies, G.enemies.length);
          if (G.ramps.some(R => below(P, R))) r.playerFramesBelowRamp++;
          for (const e of G.enemies) if (G.ramps.some(R => below(e, R))) { r.enemyFramesBelowRamp++; r.enemiesEverBelowRamp.add(e); runs.set(e, (runs.get(e) || 0) + 1); r.longestBelowRamp = Math.max(r.longestBelowRamp, runs.get(e)); if (!r.example && runs.get(e) > 90) r.example = { type: e.type, x: Math.round(e.x), y: Math.round(e.y), z: e.z, frames: runs.get(e) } } else runs.delete(e);
          const E = G.enemies;
          for (let i = 0; i < E.length; i++) {
            const a = E[i]; if (![a.x, a.y].every(Number.isFinite)) r.nan++;
            if (a.x < EDGE || a.x > AW - EDGE || a.y < EDGE || a.y > AH - EDGE) r.outside++;
            for (const o of G.obs) if (a.z < 26 && Math.hypot(a.x - o.x, a.y - o.y) < o.r + a.r - 4) r.inObstacle++;
            for (let j = i + 1; j < E.length; j++) { const b = E[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (Math.abs(a.z - b.z) < 14 && d < (a.r + b.r) * .7) r.deepOverlap++ }
          }
        });
        if (G.state !== 'pause' && G.state !== 'play') break;
      }
      // finish the lap
      G.waveT = .01; step(2, 1 / 30, []); for (let i = 0; i < 60 && G.state !== 'shop'; i++) step(1, 1 / 30, []);
      r.laps++; m.nextWave(); G.state = 'pause'; G.P.hp = 1e6;
    }
    r.enemiesEverBelowRamp = r.enemiesEverBelowRamp.size;
    out.natural = r;
  }
  G.state = 'pause';
  return out;
}
"""


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'physics2')
        await g.start(0)
        res = await g.ev(PROBES)
        print(json.dumps(res, indent=1))
        json.dump(res, open('results_physics2.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
