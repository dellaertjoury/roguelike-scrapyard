# v4 crane: hit rate standing still vs escaping, hits per swing, airborne hits, enemy kills give scrap,
# arc coverage of the arena, sign timing (#craneSign only first 2 s).
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
BOTJS = open(os.path.join(os.path.dirname(__file__), 'v4_bot.js')).read()

CR = r"""
({ n, mode }) => {
  const m = M, G = m.G, { AW, AH, EDGE, CRANE } = m;
  m.start(1); G.state = 'pause'; G.wave = 2; m.nextWave(); G.state = 'pause';
  const out = { n, mode, hit: 0, multi: 0, inBand: 0, hitInBand: 0, fails: [], hitAir: 0, maxDmgPerSwing: 0, airTests: 0 };
  for (let i = 0; i < n; i++) {
    m.nextWave(); G.wave = 2; G.state = 'pause'; G.startT = 0; G.P.intro = false; G.enemies = []; G.pend = []; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0;
    const P = G.P; P.x = 80 + Math.random() * (AW - 160); P.y = 80 + Math.random() * (AH - 160); P.a = Math.random() * 6.28; P.vx = P.vy = 0; P.hp = G.S.maxhp = 1e6; P.inv = 0; P.z = 0; P.air = false;
    if (mode === 'cruise') { P.vx = Math.cos(P.a) * 200; P.vy = Math.sin(P.a) * 200 }
    G.crane.t = 0.001; let hits = 0, hp0 = P.hp, band = false, swings = 0, startPos = [P.x | 0, P.y | 0];
    for (let f = 0; f < 30 * 6.5; f++) {
      G.keys = {}; G.fuel = 30;
      if (mode === 'escape') { const e = BOT.craneEscape(); if (e) for (const k of BOT.steerTo(e[0], e[1], { nitro: true })) G.keys[k] = true }
      if (mode === 'cruise') { G.keys.KeyW = true; G.keys.KeyD = true }
      const hpb = P.hp, hitSize = G.crane.hit ? G.crane.hit.size : 0;
      G.state = 'play'; m.update(1 / 30); G.state = 'pause';
      if (G.crane.st === 'warn' && f < 3) { const d = Math.hypot(P.x - CRANE.x, P.y - CRANE.y); const a = Math.atan2(P.y - CRANE.y, P.x - CRANE.x); band = Math.abs(d - G.crane.R) < CRANE.ball + P.r && a > CRANE.ends[0] - .05 && a < CRANE.ends[1] + .05 }
      if (G.crane.hit && G.crane.hit.has(P) && !(hitSize && G.crane.hit.has(P) && f > 0 && hpb === P.hp)) {}
      if (P.hp < hpb) hits++;
      if (G.crane.st === 'idle' && f > 5) break;
    }
    if (band) out.inBand++;
    if (hits) { out.hit++; if (band) out.hitInBand++; if (mode === 'escape' && out.fails.length < 8) out.fails.push({ start: startPos, R: G.crane.R | 0, end: [P.x | 0, P.y | 0] }) }
    if (hits > 1) out.multi++;
  }
  return out;
}
"""

AIR = r"""
() => {
  const m = M, G = m.G, { CRANE } = m, out = {};
  // player in the air, right on the ball path: does the ball still hit?
  m.start(1); G.state = 'pause'; G.wave = 2; m.nextWave(); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.enemies = []; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0;
  const P = G.P; P.hp = G.S.maxhp = 1e6;
  let maxZ = 0;
  // highest possible jump: nitro off each ramp
  for (const r of G.ramps) {
    P.x = r.x - r.c * 300; P.y = r.y - r.s * 300; P.a = r.d; P.vx = r.c * 400; P.vy = r.s * 400; P.z = 0; P.air = false; P.nitro = 1;
    for (let f = 0; f < 90; f++) { G.keys = { KeyW: true, ShiftLeft: true }; G.fuel = 30; G.state = 'play'; m.update(1 / 30); G.state = 'pause'; maxZ = Math.max(maxZ, P.z) }
  }
  out.maxJumpZ = +maxZ.toFixed(1);
  // place an airborne player on the arc at z 40
  G.crane.t = .001; G.state = 'play'; m.update(1 / 30); G.state = 'pause';
  const a = (CRANE.ends[0] + CRANE.ends[1]) / 2; P.x = CRANE.x + Math.cos(a) * G.crane.R; P.y = CRANE.y + Math.sin(a) * G.crane.R;
  let hit = 0;
  for (let f = 0; f < 30 * 6; f++) { P.x = CRANE.x + Math.cos(a) * G.crane.R; P.y = CRANE.y + Math.sin(a) * G.crane.R; P.air = true; P.z = 40; P.vz = 0; P.vx = P.vy = 0; const h = P.hp; G.state = 'play'; m.update(1 / 30); G.state = 'pause'; if (P.hp < h) hit++; if (G.crane.st === 'idle') break }
  out.hitAtZ40 = hit;
  // enemies on the path: killed by the ball, do they pay scrap?
  m.nextWave(); G.wave = 4; G.state = 'pause'; G.startT = 0; G.P.intro = false; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0; P.x = 1900; P.y = 1300;
  G.crane.t = .001; G.state = 'play'; m.update(1 / 30); G.state = 'pause';
  G.pend = []; for (let k = 0; k < 6; k++) { const aa = CRANE.ends[0] + (CRANE.ends[1] - CRANE.ends[0]) * (k + .5) / 6; G.pend.push({ x: CRANE.x + Math.cos(aa) * G.crane.R, y: CRANE.y + Math.sin(aa) * G.crane.R, t: 0, max: 1, type: 'rust' }) }
  const w0 = G.wrecks, sc0 = G.scraps.length;
  for (let f = 0; f < 30 * 6; f++) { G.fuel = 30; for (const e of G.enemies) { e.vx = e.vy = 0; e.spd = 0 } G.state = 'play'; m.update(1 / 30); G.state = 'pause'; if (G.crane.st === 'idle') break }
  out.craneWrecks = G.wrecks - w0; out.scrapDropped = G.scraps.length - sc0 + 0;
  return out;
}
"""

SIGN = r"""
async () => {
  const m = M, G = m.G, ui = await import('/src/ui.js');
  m.start(1); G.state = 'pause'; G.wave = 2; m.nextWave(); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0;
  G.crane.t = .001; const log = [];
  for (let f = 0; f < 30 * 6; f++) { G.fuel = 30; G.P.hp = G.S.maxhp; G.state = 'play'; m.update(1 / 30); ui.hud(); log.push([+(G.time).toFixed(2), G.crane.st, document.getElementById('craneSign').classList.contains('on')]); G.state = 'pause'; if (G.crane.st === 'idle' && f > 5) break }
  const on = log.filter(l => l[2]); return { signOnFrames: on.length, signOnSec: +(on.length / 30).toFixed(2), warnFrames: log.filter(l => l[1] === 'warn').length, swingFrames: log.filter(l => l[1] === 'swing').length };
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4crane')
        await g.ev(BOTJS)
        res = {}
        for mode in ['still', 'escape', 'cruise']:
            res[mode] = await g.ev(CR, {'n': 300, 'mode': mode}); print(mode, json.dumps(res[mode]))
        res['air'] = await g.ev(AIR); print('AIR', json.dumps(res['air']))
        res['sign'] = await g.ev(SIGN); print('SIGN', json.dumps(res['sign']))
        # screenshot mid-warning and mid-swing
        await g.ev("(() => { const m = M, G = m.G; m.start(1); G.state='pause'; G.wave = 2; m.nextWave(); G.state='pause'; G.startT = 0; G.P.intro = false; G.P.x = 900; G.P.y = 700; G.P.a = 0; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0; G.crane.t = .001; step(30, 1/30, []); })()")
        await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(250); await g.ev("M.G.state='pause'")
        await g.shot('v4_crane_warning.png')
        await g.ev("step(80, 1/30, [])"); await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(200); await g.ev("M.G.state='pause'")
        await g.shot('v4_crane_swing.png')
        res['errs'] = g.errs
        json.dump(res, open('results_v4_crane.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
