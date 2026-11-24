# Elite special moves and their edge cases (simulation checks + a few screenshots).
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

SETUP = r"""(() => {
window.mkE = (type, wave, x, y, extra = {}) => { const D0 = D.ENEMY(wave)[type]; return Object.assign({ type, x, y, a: 0, vx: 0, vy: 0, max: D0.hp, flash: 0, cd: 0, charge: 0, hitcd: 0, sawcd: 0, burncd: 0, z: 0, vz: 0, air: false, airT: 0, pitch: 0, col: '#888', num: 1 }, D0, extra) };
window.resetE = (car = 1) => { const m = M, G = m.G; m.start(car); G.state = 'pause'; G.pend = []; G.enemies = []; G.spawnT = 1e9; G.waveT = 1e9; G.W.mg = 0; G.W.mines = 0; G.P.hp = G.S.maxhp = 1e6; };
})()"""

PROBES = r"""
() => {
  const m = M, G = m.G, AW = m.AW, AH = m.AH, EDGE = m.EDGE, out = {};

  /* harvester: blades vs a tyre stack between it and the player */
  {
    resetE(); G.wave = 5; G.ramps = []; const P = G.P;
    G.obs = [{ x: 1000, y: 680, r: 40, k: 'tire' }];
    const e = mkE('harvester', 5, 820, 680, { a: 0 }); G.enemies = [e];
    P.x = 1130; P.y = 680; P.a = 0; P.inv = 0;
    let bladeInObs = 0, hits = 0, hp = P.hp, maxD = 0;
    step(150, 1 / 30, [], () => { P.x = 1130; P.y = 680; P.vx = P.vy = 0; for (const b of m.harvesterBlades(e)) { if (Math.hypot(b.x - 1000, b.y - 680) < 40) bladeInObs++ } if (P.hp < hp) { hits++; hp = P.hp } maxD = Math.max(maxD, e.saw ? e.saw.d : 0) });
    out.harvesterThroughTyres = { framesBladeInsideTyreStack: bladeInObs, playerHitsThroughStack: hits, bladeReach: maxD };
    // blade hits a jumping player at z 19 but not z 21
    for (const z of [19, 21]) {
      resetE(); G.wave = 5; G.ramps = []; G.obs = [];
      const e2 = mkE('harvester', 5, 800, 680, { a: 0, saw: { st: 'hold', t: 5, d: 300 } }); G.enemies = [e2];
      const b = m.harvesterBlades(e2)[0]; P2 = G.P; P2.x = b.x; P2.y = b.y; P2.z = z; P2.air = true; P2.vz = 0; P2.inv = 0;
      const hp0 = P2.hp; step(1, 1 / 30, []); out['harvesterHitsAirborneAtZ' + z] = P2.hp < hp0;
    }
    // harvester killed mid-move: renders ok? (state only)
    resetE(); G.wave = 5; const e3 = mkE('harvester', 5, 800, 680, { a: 0, saw: { st: 'out', t: 0, d: 150 } }); G.enemies = [e3]; e3.hp = 1;
    G.W.mg = 4; G.P.x = 900; G.P.y = 680; step(30, 1 / 30, []);
    out.harvesterKilledMidMove = { alive: G.enemies.includes(e3), scrapsDropped: G.scraps.length };
  }

  /* monster: slam aimed at a player in a corner / beside a wall / on top of a tyre stack / on a ramp */
  {
    const r = [];
    for (const [label, px, py] of [['corner', EDGE + 20, EDGE + 20], ['wall', AW / 2, AH - EDGE - 20], ['far corner', AW - EDGE - 20, AH - EDGE - 20]]) {
      resetE(2); G.wave = 10; G.obs = []; G.ramps = []; const P = G.P;
      P.x = px; P.y = py; P.vx = P.vy = 0; P.inv = 0;
      const e = mkE('monster', 10, px + (px < AW / 2 ? 300 : -300), py + (py < AH / 2 ? 200 : -200), { cd: 0 }); G.enemies = [e];
      let launched = null, landed = null, minX = 1e9, maxPen = 0, hp0 = P.hp, nan = false, pMaxV = 0;
      step(150, 1 / 30, [], () => { if (e.air && !launched) launched = { tx: Math.round(e.slam.x), ty: Math.round(e.slam.y) }; if (launched && !e.air && !landed) landed = { x: Math.round(e.x), y: Math.round(e.y) }; maxPen = Math.max(maxPen, EDGE + e.r - Math.min(e.x, AW - e.x, e.y, AH - e.y)); pMaxV = Math.max(pMaxV, Math.hypot(P.vx, P.vy)); if (![e.x, e.y, P.x, P.y].every(Number.isFinite)) nan = true });
      r.push({ label, launched, landed, monsterPenetrationIntoWall: +maxPen.toFixed(1), playerDamage: Math.round(hp0 - P.hp), playerMaxSpeed: Math.round(pMaxV), playerEnd: [Math.round(P.x), Math.round(P.y)], nan });
    }
    // slam target on a tyre stack: where does the monster end up?
    resetE(2); G.wave = 10; G.ramps = []; const P = G.P; G.obs = [{ x: 1000, y: 680, r: 42, k: 'hay' }];
    P.x = 1000; P.y = 680 + 42 + P.r; P.vx = P.vy = 0;
    const e = mkE('monster', 10, 700, 680, { cd: 0 }); G.enemies = [e];
    // aim exactly at the bale centre
    step(1, 1 / 30, [], () => { if (e.air) { e.slam.x = 1000; e.slam.y = 680; e.vx = (1000 - e.x) / 1.15; e.vy = (680 - e.y) / 1.15 } });
    let minD = 1e9; step(60, 1 / 30, [], () => { if (!e.air) minD = Math.min(minD, Math.hypot(e.x - 1000, e.y - 680)) });
    r.push({ label: 'slam onto hay bale', monsterDistFromBaleCentreAfter: Math.round(minD), needed: 42 + e.r });
    // killed mid-air
    resetE(2); G.wave = 10; G.obs = []; G.ramps = []; const e2 = mkE('monster', 10, 700, 680, { cd: 0 }); G.enemies = [e2]; G.P.x = 1000; G.P.y = 680;
    step(5, 1 / 30, []); const wasAir = e2.air; e2.hp = 1; G.W.mg = 4; G.S.dmg = 100; step(20, 1 / 30, []);
    r.push({ label: 'killed mid-air', wasAir, removed: !G.enemies.includes(e2) });
    out.monster = r;
  }

  /* tow: hook through obstacles, hooked then airborne, nitro empty, tow killed while hooked */
  {
    const r = {};
    resetE(); G.wave = 15; G.ramps = []; let P = G.P;
    G.obs = [{ x: 1000, y: 680, r: 42, k: 'tire' }];
    let e = mkE('tow', 15, 780, 680, { a: 0 }); G.enemies = [e];
    P.x = 1200; P.y = 680; P.inv = 0; let hooked = false;
    step(90, 1 / 30, [], () => { P.x = 1200; P.y = 680; P.vx = P.vy = 0; if (e.hook && e.hook.st === 'hooked') hooked = true });
    r.hookThroughTyreStack = hooked;
    // hooked, no nitro: how far are you dragged and how much damage in the hook window
    resetE(); G.wave = 15; G.ramps = []; G.obs = []; P = G.P; e = mkE('tow', 15, 700, 680, { a: 0 }); G.enemies = [e];
    P.x = 1000; P.y = 680; P.nitro = 0; P.inv = 0; const hp0 = P.hp;
    let hookedAt = null, freeAt = null, t = 0;
    step(240, 1 / 30, ['KeyW', 'KeyD'], () => { t += 1 / 30; const s = e.hook && e.hook.st; if (s === 'hooked' && hookedAt === null) hookedAt = t; if (hookedAt !== null && s !== 'hooked' && freeAt === null) freeAt = t; P.nitro = 0 });
    r.noNitro = { hookedAt: hookedAt && +hookedAt.toFixed(2), freedAfter: freeAt && +(freeAt - hookedAt).toFixed(2), damage: Math.round(hp0 - P.hp) };
    // hooked and then launched off a ramp: does the pull keep acting in the air?
    resetE(); G.wave = 15; G.obs = []; P = G.P; e = mkE('tow', 15, 700, 680, { a: 0, hook: { st: 'hooked', x: 1000, y: 680, t: 1.8 } }); G.enemies = [e];
    P.x = 1000; P.y = 680; P.z = 40; P.air = true; P.vz = 100; P.vx = 0; P.vy = 0;
    step(10, 1 / 30, []); r.pullWhileAirborne = { vxAfter10Frames: Math.round(P.vx), stillHooked: e.hook.st === 'hooked' };
    // tow killed while hooked
    resetE(); G.wave = 15; G.obs = []; G.ramps = []; P = G.P; e = mkE('tow', 15, 700, 680, { a: 0, hook: { st: 'hooked', x: 1000, y: 680, t: 1.8 } }); G.enemies = [e];
    P.x = 1000; P.y = 680; e.hp = 0.5; G.W.mg = 4; step(30, 1 / 30, []);
    r.killedWhileHooked = { removed: !G.enemies.includes(e), playerSpeed: Math.round(Math.hypot(P.vx, P.vy)) };
    out.tow = r;
  }

  /* elite rotation and HP by lap */
  out.eliteByLap = [5, 10, 15, 20, 25, 30].map(w => { const t = D.ELITES[(w / 5 - 1) % 3]; return { lap: w, type: t, hp: Math.round(D.ENEMY(w)[t].hp) } });
  G.state = 'pause';
  return out;
}
"""


async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'elites')
        await g.start(1)
        await g.ev(SETUP)
        res = await g.ev(PROBES)
        print(json.dumps(res, indent=1))
        # screenshots: harvester comb vs player hitbox (touching), blades through a tyre stack, tow hook
        await g.ev("""(() => { resetE(1); const G = M.G, P = G.P; G.wave = 5; G.obs = [{ x: 1000, y: 680, r: 40, k: 'tire' }]; G.ramps = [];
          const e = mkE('harvester', 5, 800, 680, { a: 0, spd: 0, saw: { st: 'hold', t: 99, d: 300 } }); G.enemies = [e];
          P.x = 1250; P.y = 600; P.a = Math.PI; G.cam.x = 1000; G.cam.y = 660; G.state = 'pause'; })()""")
        await g.page.wait_for_timeout(900)
        await g.shot('elite_harvester_blades_through_tyres.png')
        await g.ev("""(() => { resetE(1); const G = M.G, P = G.P; G.wave = 5; G.obs = []; G.ramps = [];
          const e = mkE('harvester', 5, 900, 680, { a: 0, spd: 0, cd: 99 }); G.enemies = [e];
          P.x = 900 + e.r + P.r + 1; P.y = 680; P.a = Math.PI; G.cam.x = 950; G.cam.y = 660; G.state = 'pause'; })()""")
        await g.page.wait_for_timeout(900)
        await g.shot('elite_harvester_comb_overlaps_player_before_contact.png')
        json.dump(res, open('results_elites.json', 'w'), indent=1)
        print('errors', g.errs)
        await b.close()

asyncio.run(main())
