# v4 performance: update() cost with 45+ enemies, crane swing, cones, pump; render draw calls / triangles;
# renderer.info.memory across laps / runs (leaks); array caps.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
BOTJS = open(os.path.join(os.path.dirname(__file__), 'v4_bot.js')).read()

HEAVY = r"""
() => {
  const m = M, G = m.G, out = {};
  const T = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t0) / n };
  m.start(2); G.state = 'pause';
  Object.assign(G.build, { roof: { id: 'tesla', lvl: 4 }, hood: { id: 'flame', lvl: 4 }, rear: { id: 'exhaust', lvl: 3 }, sides: { id: 'saw', lvl: 4 }, trunk: { id: 'scrapbin', lvl: 3 } }); m.recompute();
  G.wave = 11; m.nextWave(); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.P.x = 1000; G.P.y = 700; G.S.maxhp = G.P.hp = 1e9;
  G.pump = { x: 600, y: 500, res: 30, got: 0, empty: false, id: 1 };
  const types = ['rust', 'spit', 'thief'];
  G.pend = []; for (let i = 0; i < 48; i++) G.pend.push({ x: 150 + (i % 12) * 150, y: 150 + Math.floor(i / 12) * 300, t: 0, max: 1, type: types[i % 3] });
  step(1, 1/30, []); for (const e of G.enemies) e.hp = e.max = 1e9;
  G.crane.t = .001; G.spawnT = 1e9;
  let maxParts = 0, maxTexts = 0, maxEbul = 0, maxFires = 0, maxBul = 0;
  const samples = [];
  for (let k = 0; k < 10; k++) samples.push(T(30, () => { G.fuel = 30; if (G.crane.st === 'idle') G.crane.t = .001; step(1, 1/30, ['KeyW', 'KeyD', 'Space']); maxParts = Math.max(maxParts, G.parts.length); maxTexts = Math.max(maxTexts, G.texts.length); maxEbul = Math.max(maxEbul, G.ebul.length); maxFires = Math.max(maxFires, G.fires.length); maxBul = Math.max(maxBul, G.bullets.length) }));
  out.update_ms = { mean: +(samples.reduce((a, b) => a + b) / samples.length).toFixed(3), max: +Math.max(...samples).toFixed(3), enemies: G.enemies.length };
  out.caps = { maxParts, maxTexts, maxEbul, maxFires, maxBul };
  const R = SC.renderer; R.info.autoReset = true;
  SC.render(1/30); out.render = { calls: R.info.render.calls, triangles: R.info.render.triangles, geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length };
  out.render_ms = +T(10, () => SC.render(1/30)).toFixed(2);
  out.crane = G.crane.st;
  // drift-mark canvas cost: fadeMarks + groundDirty upload
  out.ground_ms = +T(10, () => { G.groundDirty = true; SC.render(.3) }).toFixed(2);
  return out;
}
"""

LAPS = r"""
async (laps) => {
  const m = M, G = m.G, R = SC.renderer, ui = await import('/src/ui.js'), out = [];
  m.start(0); G.state = 'pause';
  for (let L = 0; L < laps; L++) {
    let maxCalls = 0, f = 0;
    while (G.state !== 'shop' && f < 30 * 120) { G.P.hp = G.S.maxhp; BOT.run(1, 'kite'); f++; if (f % 6 === 0) { SC.render(1/5); ui.hud(); ui.texts(SC.project); maxCalls = Math.max(maxCalls, R.info.render.calls) } }
    BOT.shop(); SC.render(1/30);
    out.push({ lap: G.wave, geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length, maxCalls, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, parts: G.parts.length });
    m.nextWave(); G.state = 'pause';
  }
  // back to the menu and a fresh run with another car
  G.state = 'menu'; G.enemies = []; G.P = null; m.makeGround(); m.makeObs(); SC.attract(1/30);
  m.start(2); G.state = 'pause'; step(120, 1/30, ['KeyW']); SC.render(1/30);
  out.push({ lap: 'newRun', geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length });
  return out;
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4perf')
        await g.ev(BOTJS)
        await g.start(2)
        h = await g.ev(HEAVY); print('HEAVY', json.dumps(h))
        await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(400); await g.ev("M.G.state='pause'")
        await g.shot('v4_perf_heavy.png')
        laps = await g.ev(LAPS, 8)
        for l in laps: print('LAP', json.dumps(l))
        json.dump({'heavy': h, 'laps': laps, 'errs': g.errs}, open('results_v4_perf.json', 'w'), indent=1)
        print('ERRS', g.errs)
        await b.close()
asyncio.run(main())
