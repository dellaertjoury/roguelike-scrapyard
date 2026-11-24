# Performance: simulation cost of update() under load, render cost and draw calls,
# array caps, and renderer.info.memory across many runs / purchases to look for leaks.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

SIM = r"""
() => {
  const m = M, G = m.G, out = {};
  const T = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t0) / n };
  m.start(1); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e9;
  Object.assign(G.build, { roof: { id: 'tesla', lvl: 4 }, hood: { id: 'flame', lvl: 4 }, rear: { id: 'exhaust', lvl: 3 }, sides: { id: 'saw', lvl: 4 }, trunk: { id: 'scrapbin', lvl: 3 } }); m.recompute(); G.P.hp = G.S.maxhp = 1e9;
  G.W.mg = 4; G.W.mines = 4; // force every weapon on at once
  // baseline: lap 1
  out.lap1_ms = +T(300, () => step(1, 1 / 30, ['KeyW', 'KeyD'])).toFixed(3);
  // heavy: lap 15 with 60 enemies, particles saturated
  G.wave = 14; m.nextWave(); G.state = 'pause';
  const types = ['rust', 'spit', 'brute'];
  G.enemies = []; G.pend = [];
  for (let i = 0; i < 60; i++) { const D0 = D.ENEMY(15)[types[i % 3]]; G.enemies.push(Object.assign({ type: types[i % 3], x: 200 + (i % 10) * 160, y: 200 + Math.floor(i / 10) * 160, a: 0, vx: 0, vy: 0, max: D0.hp, flash: 0, cd: 2, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D0, { hp: 1e9 })) }
  let maxParts = 0, maxTexts = 0, maxFires = 0, maxScraps = 0, maxBul = 0, maxEbul = 0, maxMines = 0;
  const samples = [];
  for (let k = 0; k < 10; k++) samples.push(T(30, () => step(1, 1 / 30, ['KeyW', 'KeyD'], () => { maxParts = Math.max(maxParts, G.parts.length); maxTexts = Math.max(maxTexts, G.texts.length); maxFires = Math.max(maxFires, G.fires.length); maxBul = Math.max(maxBul, G.bullets.length); maxEbul = Math.max(maxEbul, G.ebul.length); maxMines = Math.max(maxMines, G.mines.length) })));
  out.heavy60_ms = { mean: +(samples.reduce((a, b) => a + b) / samples.length).toFixed(3), max: +Math.max(...samples).toFixed(3) };
  out.caps = { maxParts, maxTexts, maxFires, maxBul, maxEbul, maxMines, enemies: G.enemies.length };
  // isolate the particle cap cost: puff into a full array
  G.parts = []; for (let i = 0; i < 950; i++) m.puff(500, 500, 1, { c: 0xffffff });
  out.puff100_into_full_ms = +T(50, () => m.puff(500, 500, 100, { c: 0xffffff })).toFixed(3);
  // scrap flood: kill 60 lap-15 brutes with max luck
  G.S.luck = .6; G.enemies.forEach(e => { e.hp = 1; e.sc = 4 });
  step(2, 1 / 30, []);
  out.scrapsOnGroundAfterMassKill = G.scraps.length; out.scrapRenderCap = 400;
  G.state = 'pause';
  return out;
}
"""

RENDER = r"""
async () => {
  const m = M, G = m.G, R = SC.renderer, out = {};
  const T = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t0) / n };
  R.info.autoReset = true;
  SC.render(1 / 30); out.callsPerFrame = R.info.render.calls; out.triangles = R.info.render.triangles;
  out.render_ms_clean = +T(10, () => { G.groundDirty = false; SC.render(1 / 30) }).toFixed(2);
  out.render_ms_groundDirty = +T(10, () => { G.groundDirty = true; SC.render(0.2) }).toFixed(2);
  out.memory = { ...R.info.memory }; out.programs = R.info.programs.length;
  return out;
}
"""

MEM = "() => ({ geometries: SC.renderer.info.memory.geometries, textures: SC.renderer.info.memory.textures, programs: SC.renderer.info.programs.length, calls: SC.renderer.info.render.calls, sceneChildren: 0 })"


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'perf')
        await g.start(1)
        sim = await g.ev(SIM)
        print('SIM', json.dumps(sim, indent=1))
        await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(1500)
        rnd = await g.ev(RENDER)
        print('RENDER', json.dumps(rnd, indent=1))
        await g.shot('perf_heavy_lap15.png')
        # leak check: several full runs, buying parts, back to menu, swapping cars
        track = []
        for run in range(6):
            car = run % 3
            await g.ev("M.G.state='over'"); await g.page.wait_for_timeout(100)
            await g.ev("document.getElementById('again').click()"); await g.page.wait_for_timeout(400)
            await g.page.click(f'.car[data-i="{car}"]'); await g.page.wait_for_timeout(500)
            for lap in range(3):
                await g.ev("(() => { const G = M.G; G.scrap = 9999; G.P.hp = G.S.maxhp; G.waveT = .02; G.state = 'play' })()")
                await g.page.wait_for_selector('#shop:not(.hide)', timeout=30000)
                for i in range(3):  # buy three cards (part models get rebuilt)
                    await g.ev(f"(() => {{ if (M.buy({i})) {{}} }})()")
                await g.ev("document.getElementById('go').click()")
                await g.page.wait_for_timeout(700)
            mem = await g.ev(MEM)
            mem['run'] = run; mem['car'] = car
            track.append(mem); print('MEM', mem)
        json.dump({'sim': sim, 'render': rnd, 'mem': track}, open('results_perf.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
