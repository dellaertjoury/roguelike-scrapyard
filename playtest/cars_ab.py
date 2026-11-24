# Close-up of every car type + the player's full build, same setup on either version (GAME_URL, TAG), plus edge-arrow count.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
import v2_checks as V
async def main():
    tag = os.environ.get('TAG', 'v2_')
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'cars_ab_' + tag)
        await g.start(1); await g.ev(V.SETUP)
        await g.ev("""(() => { resetE(0); const G = M.G, P = G.P;
          Object.assign(G.build, { roof: { id: 'cage', lvl: 3 }, hood: { id: 'v8', lvl: 3 }, front: { id: 'spikes', lvl: 3 }, rear: { id: 'exhaust', lvl: 3 }, trunk: { id: 'nitro', lvl: 3 }, sides: { id: 'slicks', lvl: 3 } }); M.recompute();
          G.W = { mg: 0, mines: 0, tesla: 0, flame: 0, saw: 0 };
          P.x = 1000; P.y = 740; P.a = 0; P.vx = P.vy = 0; G.cam.x = 1000; G.cam.y = 680;
          const types = [['rust', 3], ['spit', 3], ['brute', 5], ['harvester', 5], ['monster', 10], ['tow', 15]];
          G.enemies = types.map(([t, w], i) => Object.assign(mkE(t, w, 700 + i * 110, 560, { a: -Math.PI / 2, spd: 0, cd: 1e9 }), { col: t === 'harvester' || t === 'monster' || t === 'tow' ? D.ENEMY(5)[t].col : D.ECOL[i * 2], spd: 0, hp: 1e9 }));
          G.state = 'play'; })()""")
        await g.page.wait_for_timeout(1500)
        await g.ev("M.G.state='pause'"); await g.page.wait_for_timeout(300)
        await V.clip_at(g, f'{tag}cars_closeup.png', 1000, 640, 0, 820, 340)
        # edge arrows while playing
        await g.ev("""(() => { const G = M.G; G.enemies = []; G.P.x = 1000; G.P.y = 680; G.cam.x = 1000; G.cam.y = 680; G.pend = [];
          for (const [x, y, el] of [[150, 150, false], [1850, 1200, false], [1000, 100, false], [100, 680, true], [1050, 700, false]]) G.pend.push({ x, y, t: 99, max: 99, type: el ? 'monster' : 'rust', elite: el });
          G.state = 'play'; })()""")
        await g.page.wait_for_timeout(700)
        arrows = await g.ev("""(() => { const vis = [...document.querySelectorAll('#fx .edge')].filter(a => a.style.display === 'block'); return { shown: vis.length, elite: vis.filter(a => a.classList.contains('el')).length } })()""")
        await g.shot(f'{tag}edge_arrows.png')
        print(tag, 'arrows', arrows, g.errs)
        await b.close()
asyncio.run(main())
