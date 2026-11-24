# Collision / edge / exploit probes, run as pure in-page simulation (no waiting on rendering).
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

PROBES = r"""
() => {
  const m = M, G = m.G, AW = m.AW, AH = m.AH, EDGE = m.EDGE, out = {};
  const reset = (car = 0) => { m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9; G.fuel = 1e9; G.P.hp = G.S.maxhp = 1e6; };
  const finite = () => [G.P.x, G.P.y, G.P.vx, G.P.vy, G.P.z].every(Number.isFinite);

  /* 1. corners and walls: drive full nitro into each corner at several angles */
  {
    const r = { runs: 0, nan: 0, escaped: 0, stuck: 0, maxPen: 0, samples: [] };
    for (const car of [0, 1, 2]) for (const [cx, cy] of [[0, 0], [AW, 0], [0, AH], [AW, AH]]) for (const off of [-.5, -.25, 0, .25, .5]) {
      reset(car); const P = G.P; G.obs = []; G.ramps = [];
      P.x = AW / 2; P.y = AH / 2; P.a = Math.atan2(cy - P.y, cx - P.x) + off; P.nitro = 1;
      let minSp = 1e9, lastXY = [], jitter = 0, prev = null;
      step(240, 1 / 30, ['KeyW', 'ShiftLeft']); // ~8 s of game time at full throttle into the corner
      // then hold W + steer for 6 s: are we able to leave the corner?
      const before = [P.x, P.y];
      step(180, 1 / 30, ['KeyW', 'KeyD'], i => { if (P.x < EDGE || P.x > AW - EDGE || P.y < EDGE || P.y > AH - EDGE) r.escaped++; r.maxPen = Math.max(r.maxPen, EDGE + P.r - Math.min(P.x, AW - P.x, P.y, AH - P.y)); });
      const moved = Math.hypot(P.x - before[0], P.y - before[1]);
      if (moved < 40) r.stuck++;
      if (!finite()) r.nan++;
      r.runs++;
      if (r.samples.length < 4) r.samples.push({ car, cx, cy, off, moved: Math.round(moved), end: [Math.round(P.x), Math.round(P.y)] });
    }
    out.corners = r;
  }

  /* 2. obstacle tunnelling: fire the player at a tyre stack at high speed (knockback + nitro) */
  {
    const r = { tries: 0, passedThrough: 0, maxPenetration: 0, speeds: [] };
    for (const sp of [300, 600, 900, 1400, 2000, 3000]) for (const kind of ['tire', 'hay']) {
      reset(0); const P = G.P; G.ramps = []; G.obs = [{ x: 1000, y: 680, r: 26, k: kind }];
      P.x = 1000 - 200; P.y = 680; P.a = 0; P.vx = sp; P.vy = 0;
      let through = false, pen = 0;
      step(60, 1 / 30, [], () => { const d = Math.hypot(P.x - 1000, P.y - 680); pen = Math.max(pen, 26 + P.r - d); if (P.x > 1000 + 26 + P.r && Math.abs(P.y - 680) < 20) through = true });
      r.tries++; if (through) r.passedThrough++; r.speeds.push({ sp, kind, through, pen: Math.round(pen * 10) / 10 });
    }
    out.tunnel = r;
  }

  /* 3. enemy tunnelling through walls under mine knockback / ramming */
  {
    reset(2); const P = G.P; const r = { maxEnemyOutside: 0, nan: 0 };
    G.ramps = []; G.obs = [];
    for (let k = 0; k < 40; k++) { m.G.wave = 15; }
    for (let k = 0; k < 200; k++) {
      G.enemies = []; G.pend = [];
      // a rust car right next to the wall, player rams it at full boost
      const e = Object.assign({ type: 'rust', x: EDGE + 25, y: 300 + k * 4, a: 0, vx: -800, vy: 0, max: 50, hp: 1e6, flash: 0, cd: 9, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D.ENEMY(5).rust, { hp: 1e6 });
      G.enemies.push(e);
      P.x = EDGE + 90; P.y = e.y; P.a = Math.PI; P.vx = -600; P.vy = 0;
      step(20, 1 / 30, ['KeyW', 'ShiftLeft'], () => { r.maxEnemyOutside = Math.max(r.maxEnemyOutside, EDGE + e.r - e.x); if (!Number.isFinite(e.x)) r.nan++ });
    }
    out.enemyWall = r;
  }

  /* 4. ramps: launch speeds -> air time, scrap and landing distance; jumps toward a wall */
  {
    const r = [];
    for (const [label, car, build, boost] of [['hatch base', 0, {}, false], ['hatch nitro', 0, {}, true], ['hatch v8 L3 + nitro L3 + boost', 0, { hood: { id: 'v8', lvl: 3 }, trunk: { id: 'nitro', lvl: 3 } }, true], ['hearse base', 2, {}, false]]) {
      reset(car); Object.assign(G.build, build); m.recompute(); G.P.hp = G.S.maxhp = 1e6; G.obs = [];
      const R = G.ramps[0], P = G.P; G.ramps = [R];
      P.x = R.x - R.c * 260; P.y = R.y - R.s * 260; P.a = R.d; P.vx = P.vy = 0; P.nitro = 1;
      const s0 = G.scrap, sc0 = G.score; let airT = 0, maxZ = 0, launched = null, landed = null;
      step(400, 1 / 30, boost ? ['KeyW', 'ShiftLeft'] : ['KeyW'], i => { maxZ = Math.max(maxZ, P.z); if (P.air && !launched) launched = [P.x, P.y]; if (launched && !P.air && !landed) { landed = [P.x, P.y]; return false } P.nitro = 1 });
      r.push({ label, maxZ: Math.round(maxZ), scrap: G.scrap - s0, score: G.score - sc0, dist: landed && launched ? Math.round(Math.hypot(landed[0] - launched[0], landed[1] - launched[1])) : null });
    }
    out.ramps = r;
  }

  /* 5. stuck inside a ramp: car pushed onto the ramp side below the surface */
  {
    const r = { player: [], enemy: [] };
    for (const [u, v] of [[100, 0], [130, 0], [60, 30], [140, -35]]) {
      reset(0); const R = G.ramps[0], P = G.P; G.obs = [];
      const at = (uu, vv) => [R.x + R.c * uu - R.s * vv, R.y + R.s * uu + R.c * vv];
      [P.x, P.y] = at(u, v); P.z = 0; P.a = R.d + Math.PI / 2 * .3; P.vx = P.vy = 0; // facing mostly up the ramp
      let frames = 0, inside = 0;
      const ins = () => { const dx = P.x - R.x, dy = P.y - R.y, uu = dx * R.c + dy * R.s, vv = -dx * R.s + dy * R.c; return uu >= 0 && uu <= R.L && Math.abs(vv) <= R.W / 2 && P.z + 8 < R.H * uu / R.L };
      step(150, 1 / 30, ['KeyW'], () => { frames++; if (ins()) inside++ });
      r.player.push({ u, v, framesStuckBelowSurface: inside, of: frames, endZ: Math.round(P.z) });
    }
    // enemy pushed under a ramp: does the AI ever get out?
    for (const [u, v] of [[100, 0], [75, 10]]) {
      reset(0); const R = G.ramps[0], P = G.P; G.obs = [];
      const at = (uu, vv) => [R.x + R.c * uu - R.s * vv, R.y + R.s * uu + R.c * vv];
      const [ex, ey] = at(u, v);
      const e = Object.assign({ type: 'rust', x: ex, y: ey, a: R.d, vx: 0, vy: 0, max: 50, flash: 0, cd: 9, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D.ENEMY(3).rust);
      G.enemies = [e];
      // player sits beyond the lip so the AI wants to drive up through the ramp body
      [P.x, P.y] = at(R.L + 150, 0); P.vx = P.vy = 0;
      let inside = 0;
      const ins = () => { const dx = e.x - R.x, dy = e.y - R.y, uu = dx * R.c + dy * R.s, vv = -dx * R.s + dy * R.c; return uu >= 0 && uu <= R.L && Math.abs(vv) <= R.W / 2 && e.z + 8 < R.H * uu / R.L };
      step(300, 1 / 30, [], () => { P.x = at(R.L + 150, 0)[0]; P.y = at(R.L + 150, 0)[1]; P.vx = P.vy = 0; if (ins()) inside++ });
      r.enemy.push({ u, v, framesBelowSurface: inside, of: 300, end: [Math.round(e.x - ex), Math.round(e.y - ey)] });
    }
    out.rampInside = r;
  }

  /* 6. crush-bounce loop: drop onto a tough car and count bounces + rewards */
  {
    const r = [];
    for (const [type, wave] of [['brute', 6], ['harvester', 5], ['monster', 10]]) {
      reset(1); G.wave = wave; const P = G.P; G.obs = []; G.ramps = [];
      const D0 = D.ENEMY(wave)[type];
      const e = Object.assign({ type, x: 1000, y: 680, a: 0, vx: 0, vy: 0, max: D0.hp, flash: 0, cd: 99, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D0, { cd: 99 });
      G.enemies = [e];
      P.x = 1000; P.y = 680; P.z = 40; P.air = true; P.vz = 0; P.airT = 0; P.vx = P.vy = 0;
      const s0 = G.scrap, sc0 = G.score, hp0 = e.hp; let bounces = 0, wasAir = true, t = 0;
      step(600, 1 / 30, [], () => { t += 1 / 30; if (P.air && P.vz === 140) bounces++; if (e.dead) return false });
      r.push({ type, wave, gameSeconds: Math.round(t * 10) / 10, killed: !!e.dead, hpStart: Math.round(hp0), hpEnd: Math.round(Math.max(0, e.hp)), bounces, scrapFromAir: G.scrap - s0, score: G.score - sc0, playerHpLost: Math.round(1e6 - P.hp) });
    }
    out.crush = r;
  }

  /* 7. mine trigger vs drawn ring; flame / tesla ranges for reference */
  {
    reset(2);
    const W = G.W; out.mine = { triggerRadius: 'e.r + 26 (rust: 43)', blastRadius: 90 + W.mines * 14, ringDrawnAt: 90 + W.mines * 14 };
  }

  /* 8. airborne collisions: player in the air over enemies, enemy airborne vs player */
  {
    reset(0); const P = G.P; G.obs = []; G.ramps = [];
    const e = Object.assign({ type: 'rust', x: 1000, y: 680, a: 0, vx: 0, vy: 0, max: 50, flash: 0, cd: 9, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D.ENEMY(3).rust, { hp: 1e6 });
    G.enemies = [e]; P.x = 1000; P.y = 680; P.z = 13; P.air = true; P.vz = 0; P.vx = P.vy = 0; P.inv = 0;
    const hp0 = P.hp; step(1, 1 / 30, []);
    out.airborne = { note: 'player at z=13 directly above a car (|dz|<=14 counts as touching)', playerDamaged: hp0 - P.hp > 0, pushedApart: Math.round(Math.hypot(P.x - e.x, P.y - e.y)) };
  }
  G.state = 'pause';
  return out;
}
"""


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'physics')
        await g.start(0)
        res = await g.ev(PROBES)
        print(json.dumps(res, indent=1))
        json.dump(res, open('results_physics.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
