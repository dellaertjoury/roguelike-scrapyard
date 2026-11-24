# v3 performance: update() cost with thieves, jerrycans and a pump on top of the v2 heavy scene, and a long
# real-loop session (bot driving in the rAF loop, laps shortened, shop buys, three runs) sampling renderer.info
# and JS heap to look for counts that only grow.
import asyncio, json, os, time
from playwright.async_api import async_playwright
from harness import open_game

LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()

SIM = r"""
() => {
  const m = M, G = m.G, out = {};
  const T = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t0) / n };
  reset3(1, { keepLevel: true, weapons: true }); G.P.hp = G.S.maxhp = 1e9;
  out.lap1_ms = +T(300, () => step(1, 1 / 30, ['KeyW', 'KeyD'], () => { G.fuel = 50 })).toFixed(3);
  Object.assign(G.build, { roof: { id: 'tesla', lvl: 4 }, hood: { id: 'flame', lvl: 4 }, rear: { id: 'exhaust', lvl: 3 }, sides: { id: 'saw', lvl: 4 }, trunk: { id: 'scrapbin', lvl: 3 } }); m.recompute(); G.P.hp = G.S.maxhp = 1e9;
  G.W.mg = 4; G.W.mines = 4; G.wave = 15; G.pump = { x: 1300, y: 500, res: 1e9, acc: 0, id: 1 }; G.pumpT = 1e9;
  const types = ['rust', 'spit', 'brute', 'thief'];
  G.enemies = []; G.pend = [];
  for (let i = 0; i < 60; i++) G.enemies.push(mkE(types[i % 4], 15, 200 + (i % 10) * 160, 200 + Math.floor(i / 10) * 160, { hp: 1e9, max: 1e9, cd: 2 }));
  G.cans = Array.from({ length: 40 }, (_, i) => ({ x: 150 + i * 40, y: 1250, l: 6, t: 0 }));
  const s = []; let maxParts = 0, maxFires = 0, maxTexts = 0;
  for (let k = 0; k < 10; k++) s.push(T(30, () => step(1, 1 / 30, ['KeyW', 'KeyD'], () => { G.fuel = 50; maxParts = Math.max(maxParts, G.parts.length); maxFires = Math.max(maxFires, G.fires.length); maxTexts = Math.max(maxTexts, G.texts.length) })));
  out.heavy60_thieves_cans_ms = { mean: +(s.reduce((a, b) => a + b) / s.length).toFixed(3), max: +Math.max(...s).toFixed(3) };
  out.caps = { maxParts, maxFires, maxTexts, cansLeft: G.cans.length };
  G.state = 'pause';
  return out;
}
"""

RENDER = r"""
() => { const R = SC.renderer; const T = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t0) / n };
  SC.render(1 / 30); const calls = R.info.render.calls, tris = R.info.render.triangles;
  return { calls, triangles: tris, render_ms: +T(8, () => SC.render(1 / 30)).toFixed(1), memory: { ...R.info.memory }, programs: R.info.programs.length } }
"""

BOT = r"""
(() => { const G = M.G; clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    if (G.state === 'play') { G.keys = {}; for (const k of (G.pump && Math.random() < .5 ? goStop(G.pump.x + 30, G.pump.y, 24) : ramKeys())) G.keys[k] = true; G.P.hp = G.S.maxhp; if (G.fuel > 25 && !G._cut) { G.fuel = 25; G._cut = 1 } }
    if (G.state === 'shop') { G._cut = 0; G.scrap += 200; shopBot(); M.nextWave() }
  }, 40); return true })()
"""

SAMPLE = "() => ({ t: Math.round(performance.now() / 1000), wave: M.G.wave, state: M.G.state, enemies: M.G.enemies.length, parts: M.G.parts.length, texts: M.G.texts.length, cans: M.G.cans.length, fires: M.G.fires.length, geometries: SC.renderer.info.memory.geometries, textures: SC.renderer.info.memory.textures, programs: SC.renderer.info.programs.length, calls: SC.renderer.info.render.calls, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) : null, domNodes: document.getElementsByTagName('*').length })"


async def main():
    out = {'samples': []}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v3_perf')
        await g.start(1); await g.ev(LIB)
        out['sim'] = await g.ev(SIM); print('SIM', json.dumps(out['sim']), flush=True)
        await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(1500)
        out['renderHeavy'] = await g.ev(RENDER); print('RENDER', json.dumps(out['renderHeavy']), flush=True)
        await g.page.screenshot(path='shots/v3_perf_heavy.png')
        for run in range(3):
            await g.ev("(() => { clearInterval(window.__bot); M.G.state = 'over'; document.getElementById('again').click() })()"); await g.page.wait_for_timeout(500)
            await g.page.click(f'.car[data-i="{run % 3}"]'); await g.page.wait_for_timeout(500)
            await g.ev(BOT)
            t0 = time.time()
            while time.time() - t0 < 150:
                await g.page.wait_for_timeout(10000)
                s = await g.ev(SAMPLE); s['run'] = run; out['samples'].append(s); print(s, flush=True)
        await g.ev("clearInterval(window.__bot)")
        out['errors'] = g.errs
        json.dump(out, open('results_v3_perf.json', 'w'), indent=1)
        await b.close()

asyncio.run(main())
