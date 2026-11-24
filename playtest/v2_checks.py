# Checks specific to the v2 fixes: harvester two-circle ramming, natural blade stop at a stack,
# nose-contact visuals, car/part visuals after batching, edge arrows, blueprint markers,
# enemies pinned against ramp faces.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game

SETUP = r"""(() => {
window.mkE = (type, wave, x, y, extra = {}) => { const D0 = D.ENEMY(wave)[type]; return Object.assign({ type, x, y, a: 0, vx: 0, vy: 0, max: D0.hp, flash: 0, cd: 0, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D0, extra) };
window.resetE = (car = 1) => { const m = M, G = m.G; m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9; G.waveT = 1e9; G.W.mg = 0; G.W.mines = 0; G.P.hp = G.S.maxhp = 1e6; G.obs = []; G.ramps = []; };
})()"""

RAM = r"""
() => {
  const m = M, G = m.G, out = {};
  // player rams the harvester head-on at 200 u/s from three offsets: hp lost by the harvester and player bounce speed
  for (const [label, dx] of [['main circle only (side hit)', null], ['nose zone (both circles overlap)', 60], ['nose tip', 110]]) {
    resetE(1); G.wave = 5; const P = G.P;
    const e = mkE('harvester', 5, 1000, 680, { a: 0, spd: 0, cd: 1e9, hp: 1e6, max: 1e6 }); G.enemies = [e];
    if (dx === null) { P.x = 1000; P.y = 680 + 46 + P.r - 1; P.vx = 0; P.vy = -200; P.a = -Math.PI / 2 }
    else { P.x = 1000 + dx + (dx === 60 ? 0 : 0); P.y = 680; P.vx = -200; P.vy = 0; P.a = Math.PI }
    P.inv = 0; const hp0 = e.hp, t0 = G.texts.length;
    step(1, 1 / 30, []);
    out[label] = { harvesterHpLost: +(hp0 - e.hp).toFixed(1), damageTexts: G.texts.length - t0, playerSpeedAfter: Math.round(Math.hypot(P.vx, P.vy)) };
  }
  // nose circle vs the tyre wall: harvester driving at the wall, how far does the nose circle end up past the wall line?
  resetE(1); G.wave = 5; const e = mkE('harvester', 5, 300, 680, { a: Math.PI, cd: 1e9 }); G.enemies = [e]; G.P.x = 1700; G.P.y = 680;
  G.P.x = 40 + 19; G.P.y = 680; // player pinned at the wall in front of it
  let maxNosePast = -1e9, pHits = 0, hp = G.P.hp;
  step(150, 1 / 30, [], () => { const nx = e.x + Math.cos(e.a) * e.len * .62; maxNosePast = Math.max(maxNosePast, m.EDGE - (nx - 30)); if (G.P.hp < hp) { pHits++; hp = G.P.hp } G.P.inv = 0 });
  out.harvesterNoseIntoWall = { nosePastWallLine: Math.round(maxNosePast), playerX: Math.round(G.P.x), playerHits: pHits };
  G.state = 'pause'; return out;
}
"""

PINNED = r"""
() => {
  // natural sim laps 6-11: enemies pressed against a ramp face (within 6 units, speed < 15) for more than 2 s
  const m = M, G = m.G; m.start(1); G.state = 'pause'; G.P.hp = G.S.maxhp = 1e9; G.wave = 5; m.nextWave(); G.state = 'pause';
  const near = (o, R) => { const dx = o.x - R.x, dy = o.y - R.y, u = dx * R.c + dy * R.s, v = -dx * R.s + dy * R.c;
    const du = Math.max(-u, 0, u - R.L), dv = Math.max(Math.abs(v) - R.W / 2, 0); return Math.hypot(du, dv) < o.r + 6 };
  const runs = new Map(); let pinnedLong = 0, longest = 0, total = 0, playerPinned = 0; const seen = new Set();
  const keys = [['KeyW'], ['KeyW', 'KeyD'], ['KeyW', 'KeyA', 'Space'], ['KeyW', 'ShiftLeft'], ['KeyS', 'KeyA'], ['KeyW', 'KeyD', 'Space']];
  for (let seg = 0; seg < 360; seg++) {
    step(30, 1 / 30, keys[(seg * 7) % keys.length], () => {
      G.P.hp = 1e9; G.P.nitro = 1; if (G.waveT < 3) { G.waveT = 60; G.wave = Math.min(11, G.wave + 1) }
      for (const e of G.enemies) {
        const pinned = !e.air && Math.hypot(e.vx, e.vy) < 15 && G.ramps.some(R => near(e, R));
        if (pinned) { total++; const n = (runs.get(e) || 0) + 1; runs.set(e, n); longest = Math.max(longest, n); if (n === 60 && !seen.has(e)) { seen.add(e); pinnedLong++ } } else runs.delete(e);
      }
    });
  }
  G.state = 'pause';
  return { gameSeconds: 360, enemyFramesPinnedOnRampFace: total, enemiesPinnedOver2s: pinnedLong, longestFrames: longest };
}
"""


async def clip_at(g, name, x, y, z=0, w=360, h=240):
    p = await g.ev(f"SC.project({x},{y},{z})")
    await g.page.screenshot(path=f'shots/{name}', clip={'x': max(0, p['x'] - w / 2), 'y': max(0, p['y'] - h / 2), 'width': w, 'height': h})


async def main():
    out = {}
    tag = os.environ.get('TAG', 'v2_')
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v2checks')
        await g.start(1)
        await g.ev(SETUP)
        out['ram'] = await g.ev(RAM)
        print('RAM', json.dumps(out['ram']))
        out['pinned'] = await g.ev(PINNED)
        print('PINNED', out['pinned'])

        # natural blade stop at a stack (no forced saw state)
        await g.ev("""(() => { resetE(1); const G = M.G, P = G.P; G.wave = 5; G.obs = [{ x: 1000, y: 680, r: 40, k: 'tire' }];
          const e = mkE('harvester', 5, 800, 680, { a: 0, cd: 0, spd: 0 }); G.enemies = [e]; window.H = e;
          P.x = 1200; P.y = 680; P.vx = P.vy = 0; G.cam.x = 1000; G.cam.y = 660;
          step(30, 1/30, [], () => { P.x = 1200; P.y = 680; P.vx = P.vy = 0 }); })()""")
        out['bladeStop'] = await g.ev("({ st: H.saw.st, d: Math.round(H.saw.d) })")
        await g.page.wait_for_timeout(700)
        await g.shot(f'{tag}harvester_blade_stops_at_tyres.png')
        # player at nose-circle contact
        await g.ev("""(() => { resetE(1); const G = M.G, P = G.P; G.wave = 5;
          const e = mkE('harvester', 5, 900, 680, { a: 0, spd: 0, cd: 1e9 }); G.enemies = [e];
          P.x = 900 + e.len * .62 + 30 + P.r + 1; P.y = 680; P.a = Math.PI; P.vx = P.vy = 0; G.cam.x = 950; G.cam.y = 660; })()""")
        await g.page.wait_for_timeout(700)
        await clip_at(g, f'{tag}harvester_nose_contact.png', 960, 680, 0, 420, 260)

        # cars and parts after batching: player with a full build + slicks, all enemy types parked in a row
        await g.ev("""(() => { resetE(0); const G = M.G, P = G.P;
          Object.assign(G.build, { roof: { id: 'tesla', lvl: 4 }, hood: { id: 'v8', lvl: 3 }, front: { id: 'spikes', lvl: 3 }, rear: { id: 'exhaust', lvl: 3 }, trunk: { id: 'nitro', lvl: 3 }, sides: { id: 'slicks', lvl: 3 } }); M.recompute();
          P.x = 1000; P.y = 680; P.a = 0; P.vx = P.vy = 0; G.cam.x = 1000; G.cam.y = 680;
          const types = [['rust', 3], ['spit', 3], ['brute', 5], ['harvester', 5], ['monster', 10], ['tow', 15]];
          G.enemies = types.map(([t, w], i) => Object.assign(mkE(t, w, 760 + i * 95, 560, { a: -Math.PI / 2, spd: 0, cd: 1e9 }), { col: D.ECOL[i * 2], spd: 0 }));
          G.enemies.forEach(e => { if (e.elite) e.col = D.ENEMY(5)[e.type].col });
          G.state = 'play'; })()""")
        await g.page.wait_for_timeout(1500)
        await g.ev("M.G.state='pause'")
        await clip_at(g, f'{tag}cars_after_batching.png', 1000, 620, 0, 760, 330)
        # drive the player so the wheels spin; read wheel rotation before/after
        out['wheels'] = await g.ev("""(() => { const G = M.G, P = G.P; P.vx = 200; P.fwd = 200; P.sp = 200; return true })()""")
        await g.ev("M.G.state='play'"); await g.page.keyboard.down('KeyW'); await g.page.wait_for_timeout(900)
        await clip_at(g, f'{tag}player_full_build_driving.png', await g.ev("M.G.P.x"), await g.ev("M.G.P.y"), 0, 260, 180)
        await g.page.keyboard.up('KeyW'); await g.ev("M.G.state='pause'")

        # edge arrows: queue spawns all around, count arrows shown vs markers off screen
        await g.ev("""(() => { const G = M.G; G.enemies = []; G.P.x = 1000; G.P.y = 680; G.cam.x = 1000; G.cam.y = 680; G.pend = [];
          for (const [x, y, el] of [[150, 150, false], [1850, 1200, false], [1000, 100, false], [100, 680, true], [1050, 700, false]]) G.pend.push({ x, y, t: 99, max: 99, type: el ? 'monster' : 'rust', elite: el });
          G.state = 'play'; })()""")
        await g.page.wait_for_timeout(600)
        await g.ev("M.G.state='pause'")
        await g.page.wait_for_timeout(300)
        out['edgeArrows'] = await g.ev("""(() => { const vis = [...document.querySelectorAll('#fx .edge')].filter(a => a.style.display === 'block'); return { shown: vis.length, elite: vis.filter(a => a.classList.contains('el')).length } })()""")
        # pause hides them? (project null outside play)
        await g.shot(f'{tag}edge_arrows.png')

        # blueprint markers
        await g.ev("(() => { const G = M.G; G.pend = []; G.scrap = 999; G.waveT = .02; G.state = 'play' })()")
        await g.page.wait_for_selector('#shop:not(.hide)', timeout=30000)
        out['blueprintMarkers'] = await g.ev("""(() => { const SL = D.SLOTS; return { slotsOrder: SL, markers: [...document.querySelectorAll('#blueprint .mk')].map(m => m.dataset.slot + '=' + m.textContent.trim()), rows: [...document.querySelectorAll('#blueprint .bprow')].map(r => r.dataset.slot + '=' + r.querySelector('.num').textContent) } })()""")
        await g.page.hover('#cards .card:nth-child(1)')
        await g.shot(f'{tag}garage_blueprint_1366.png')
        out['errors'] = g.errs
        print(json.dumps(out, indent=1))
        json.dump(out, open(f'results_{tag}checks.json', 'w'), indent=1)
        await b.close()

asyncio.run(main())
