# v3 regression checks: N7 air-time vs the stunt cap, combo reset on hit, enemy wall penetration in natural play,
# NaN sweep with thieves/pumps, language switch formatting, pause/blur with the fuel clock, garage footer on phones.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game

LIB = open(os.path.join(os.path.dirname(__file__), 'v3_lib.js')).read()

SIM = r"""
() => {
  const m = M, G = m.G, out = {};
  // N7: a ramp jump pays air-time scrap only while the shared drift+air cap has room
  const jump = (driftScrap) => {
    reset3(1, { keepLevel: true }); G.obs = []; const R = G.ramps[0], P = G.P; G.pumpT = 1e9;
    G.driftScrap = driftScrap; P.x = R.x - R.c * 260; P.y = R.y - R.s * 260; P.a = R.d; P.vx = R.c * 150; P.vy = R.s * 150;
    const s0 = G.scrap; let air = 0; step(240, 1 / 30, ['KeyW', 'ShiftLeft'], () => { P.nitro = 1; if (P.air) air = Math.max(air, P.airT); if (air && !P.air) return false });
    return { capLeft: Math.max(0, 6 + 2 * G.wave - driftScrap), airT: +air.toFixed(2), scrap: G.scrap - s0, driftScrapAfter: G.driftScrap };
  };
  out.N7 = { capEmpty: jump(0), capAlmostFull: jump(7), capFull: jump(8) };
  // combo timer reset on hit: drift 5 s, take a hit, then keep drifting: does the 8 s combo limit restart?
  reset3(1); G.pumpT = 1e9; G.P.hp = G.S.maxhp = 100; step(150, 1 / 30, ['KeyW', 'KeyD']);
  const before = { time: +(G.drift.time || 0).toFixed(2), pts: Math.round(G.drift.pts) };
  G.P.inv = 0; G.ebul.push({ x: G.P.x, y: G.P.y, vx: 0, vy: 0, life: 1, dmg: 5 }); step(1, 1 / 30, ['KeyW', 'KeyD']);
  out.comboResetOnHit = { before, after: { time: +(G.drift.time || 0).toFixed(2), pts: Math.round(G.drift.pts), mult: G.drift.mult } };
  // natural laps 3-10 with thieves, pumps and the ram bot: enemy wall penetration, NaN, cars outside the arena
  reset3(1, { keepLevel: true }); G.wave = 2; m.nextWave(); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e9;
  const r = { frames: 0, nan: 0, enemyCentreBeyondWallLine: 0, maxEnemyPen: 0, enemyOutsideArena: 0, playerPen: 0, inObstacleDeep: 0, onPumpPost: 0, deepOverlap: 0 };
  for (let lap = 3; lap <= 10; lap++) {
    runLap3(i => G.pump && i % 900 < 300 ? goStop(G.pump.x + 30, G.pump.y, 24) : ramKeys(), () => {
      r.frames++; G.P.hp = 1e9;
      const all = [G.P, ...G.enemies];
      for (const a of all) {
        if (![a.x, a.y, a.vx, a.vy, a.z].every(Number.isFinite)) r.nan++;
        const pen = m.EDGE + a.r - Math.min(a.x, m.AW - a.x, a.y, m.AH - a.y);
        if (a !== G.P) { r.maxEnemyPen = Math.max(r.maxEnemyPen, pen); if (pen > a.r) r.enemyCentreBeyondWallLine++; if (a.x < 0 || a.y < 0 || a.x > m.AW || a.y > m.AH) r.enemyOutsideArena++ }
        else r.playerPen = Math.max(r.playerPen, pen);
        if (a.z < 26) for (const o of G.obs) if (Math.hypot(a.x - o.x, a.y - o.y) < o.r + a.r * .5) r.inObstacleDeep++;
        if (G.pump && a.z < 26 && Math.hypot(a.x - G.pump.x, a.y - G.pump.y) < 13 + a.r * .5) r.onPumpPost++;
      }
    }, 9000);
    m.nextWave(); G.state = 'pause';
  }
  r.maxEnemyPen = +r.maxEnemyPen.toFixed(1); r.playerPen = +r.playerPen.toFixed(1);
  out.natural = r;
  G.state = 'pause';
  return out;
}
"""


async def main():
    out = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v3_regress')
        await g.start(1); await g.ev(LIB)
        out['sim'] = await g.ev(SIM)
        print(json.dumps(out['sim']), flush=True)
        pg = g.page
        # pause/blur with the fuel clock: fuel must not move while paused
        await g.ev("(() => { const G = M.G; reset3(1, { keepLevel: true }); G.state = 'play'; })()")
        await pg.wait_for_timeout(800)
        await pg.keyboard.press('KeyP'); f0 = await g.ev("M.G.fuel"); await pg.wait_for_timeout(2000); f1 = await g.ev("M.G.fuel")
        out['pauseFuel'] = {'state': await g.ev("M.G.state"), 'fuelDeltaIn2sPause': round(f1 - f0, 3)}
        await pg.keyboard.press('KeyP'); await pg.wait_for_timeout(1000)
        await g.ev("window.dispatchEvent(new Event('blur'))"); f0 = await g.ev("M.G.fuel"); await pg.wait_for_timeout(1500); f1 = await g.ev("M.G.fuel")
        out['blurFuel'] = {'state': await g.ev("M.G.state"), 'fuelDeltaIn1_5s': round(f1 - f0, 3)}
        # a long rAF stall (tab frozen 3 s): how much fuel does one frame burn? (cap .25 s)
        await g.ev("(() => { M.G.state = 'play' })()"); await pg.wait_for_timeout(300)
        f0 = await g.ev("(() => { const f = M.G.fuel; const t = performance.now(); while (performance.now() - t < 3000); return f })()")
        await pg.wait_for_timeout(60); f1 = await g.ev("M.G.fuel")
        out['stallFuel'] = {'fuelBurnAcross3sStall': round(f0 - f1, 3)}
        await g.ev("M.G.state='pause'")
        # language switch on the menu after a run: fuel decimals and the HUD label per language
        res = {}
        for lang in ['en', 'fr', 'de', 'es', 'vls']:
            await g.ev("(() => { M.G.state = 'over'; document.getElementById('again').click() })()"); await pg.wait_for_timeout(300)
            await pg.click(f'#langs [data-lang="{lang}"]'); await pg.wait_for_timeout(300)
            await pg.click('.car[data-i="0"]'); await pg.wait_for_timeout(300)
            await g.ev("(() => { const G = M.G; G.fuel = 7.46; G.state = 'pause'; })()"); await pg.wait_for_timeout(300)
            res[lang] = await g.ev("({ fuel: document.getElementById('fuelTxt').textContent, label: document.querySelector('.fuelnum').textContent.trim(), lap: document.getElementById('waveLbl').textContent, title: document.title, logo: (document.querySelector('#title img') || {}).src || null })")
        out['langs'] = res
        print(json.dumps(res, ensure_ascii=False))
        # garage footer at 390 and 768 wide: buttons visible, on one row?
        foot = {}
        for (w, h) in [(390, 844), (768, 1024), (1366, 800)]:
            await pg.set_viewport_size({'width': w, 'height': h})
            await g.ev("(() => { const G = M.G; G.P.hp = G.S.maxhp * .5; G.scrap = 9999; G.fuel = .01; G.state = 'play' })()")
            await pg.wait_for_selector('#shop:not(.hide)', timeout=30000); await pg.wait_for_timeout(300)
            foot[f'{w}x{h}'] = await g.ev("""(() => { const b = ['go', 'reroll', 'repair'].map(id => document.getElementById(id).getBoundingClientRect());
              return { rows: new Set(b.map(r => Math.round(r.top))).size, allInView: b.every(r => r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0), bottoms: b.map(r => Math.round(r.bottom)), vh: innerHeight,
                wrapped: ['go', 'reroll', 'repair'].filter(id => { const e = document.getElementById(id); return e.getBoundingClientRect().height > 60 }) } })()""")
            await pg.screenshot(path=f'shots/v3_garage_footer_{w}x{h}.png')
            await pg.click('#go'); await pg.wait_for_timeout(300)
        out['garageFooter'] = foot
        out['errors'] = g.errs
        print(json.dumps({k: out[k] for k in out if k not in ('sim', 'langs')}, ensure_ascii=False))
        json.dump(out, open('results_v3_regress.json', 'w'), indent=1, ensure_ascii=False)
        await b.close()

asyncio.run(main())
