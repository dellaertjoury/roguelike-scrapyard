# v4 leak check: same load repeated (30 cars spawn, all die, render) x12, plus 6 fresh runs; geometry/texture counts should plateau.
# Also splits the ground-texture cost (composeGround vs upload).
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

JS = r"""
() => {
  const m = M, G = m.G, R = SC.renderer, out = { cycles: [], runs: [] };
  m.start(1); G.state = 'pause'; G.wave = 6; m.nextWave(); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.S.maxhp = G.P.hp = 1e9; G.spawnT = 1e9; G.pumpT = 1e9; G.crane.t = 1e9;
  const types = ['rust', 'spit', 'thief'];
  for (let c = 0; c < 12; c++) {
    G.pend = []; for (let i = 0; i < 30; i++) G.pend.push({ x: 150 + (i % 10) * 170, y: 200 + Math.floor(i / 10) * 300, t: 0, max: 1, type: types[i % 3] });
    G.fuel = 30; step(2, 1/30, []); SC.render(1/30);
    for (const e of G.enemies) e.hp = -1; for (const e of G.enemies) e.dead = true; step(1, 1/30, []); G.parts = []; SC.render(1/30);
    out.cycles.push([R.info.memory.geometries, R.info.memory.textures]);
  }
  for (let r = 0; r < 6; r++) { m.start(r % 3); G.state = 'pause'; step(100, 1/30, ['KeyW']); SC.render(1/30); out.runs.push([R.info.memory.geometries, R.info.memory.textures]) }
  const T = (n, f) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t0) / n };
  out.compose_ms = +T(20, () => m.composeGround()).toFixed(2);
  out.render_clean_ms = +T(10, () => { G.groundDirty = false; SC.render(1/30) }).toFixed(2);
  out.render_upload_ms = +T(10, () => { G.groundDirty = true; SC.render(.3) }).toFixed(2);
  // how often does the ground re-upload during a quiet lap (no drifting)? fadeMarks marks it dirty every 0.5 s
  let ups = 0; G.groundDirty = false; for (let i = 0; i < 90; i++) { G.fuel = 30; step(1, 1/30, []); if (G.groundDirty) ups++; SC.render(1/30) }
  out.dirtyFramesIn3s = ups;
  return out;
}
"""
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4leak')
        await g.start(1)
        r = await g.ev(JS); print(json.dumps(r))
        json.dump(r, open('results_v4_leak.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
