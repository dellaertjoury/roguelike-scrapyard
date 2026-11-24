# v4 busy HUD while the sim is live: elite boss bar, crane warning sign + arc, thief hose vignette, pump tag,
# drift meter, spawn markers / edge arrows; at the 4 sizes. Also the countdown sign during the pit entry.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game
from v4_ui import RECTS, HUDSEL

SET = r"""
(() => { const m = M, G = m.G; G.state = 'pause'; G.wave = 4; m.nextWave(); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.openers = 0; G.eliteDue = null;
  G.P.x = 900; G.P.y = 700; G.P.a = -.3; G.P.vx = 200; G.P.vy = -60; G.S.maxhp = 100; G.P.hp = 64; G.spawnT = 1e9; G.pumpT = 1e9;
  G.pend = [{ x: 1180, y: 860, t: 0, max: 1, type: 'harvester' }, { x: 960, y: 760, t: 0, max: 1, type: 'thief' }, { x: 1900, y: 300, t: 5, max: 5, type: 'rust', elite: false }, { x: 100, y: 1250, t: 5, max: 5, type: 'rust' }];
  G.pump = { x: 700, y: 560, res: 18, got: 12, empty: false, id: 3 };
  step(1, 1/30, []); for (const e of G.enemies) { if (e.type === 'thief') { e.hose = true; e.siph = 1; e.hoseT = 0 } e.hp = e.max * .6; e.spd = 0 }
  G.crane.st = 'warn'; G.crane.t = 2.9; G.crane.from = 0; G.crane.to = 1; G.crane.R = 1150;
  Object.assign(G.drift, { on: true, pts: 4321, mult: 3.4, time: 3, heat: .8 }); G.scrap = 1234; G.wrecks = 56; G.fuel = 7.5; G.P.nitro = .5;
  G.banner = { s: ['lap', { n: 5 }], elite: 'harvester', sub: ['eliteSub', { name: 'De Pikdorser', hint: 'pas ip vo zijn vliegende zoagen' }], id: Math.random() };
  G.state = 'play'; })()
"""

async def main():
    res = {}
    async with async_playwright() as pw:
        for vw, vh, touch in [(1366, 800, False), (1920, 1080, False), (768, 1024, True), (390, 844, True)]:
            tag = f'{vw}x{vh}'
            b, g = await open_game(pw, 'v4ui2_' + tag, vw=vw, vh=vh, touch=touch)
            await g.start(0)
            # countdown sign while the car rolls in
            await g.ev("M.G.state='play'"); await g.page.wait_for_timeout(150); await g.ev("M.G.state='pause'")
            await g.shot(f'v4_count_{tag}.png'); res[tag + '_count'] = await g.ev(RECTS, HUDSEL)
            await g.ev(SET); await g.page.wait_for_timeout(700)
            await g.shot(f'v4_hud_live_{tag}.png')
            r = await g.ev(RECTS, HUDSEL + ['#vign', '.ptag', 'i.edge'])
            r['state'] = await g.ev("({ crane: M.G.crane.st, ct: M.G.crane.t, sign: document.getElementById('craneSign').classList.contains('on'), vign: document.getElementById('vign').classList.contains('on'), boss: !document.getElementById('bossPnl').classList.contains('hide'), hp: M.G.P.hp })")
            await g.ev("M.G.state='pause'")
            res[tag] = r
            print(tag, json.dumps(r['overlaps']), r['clipped'], r['state'])
            await b.close()
    json.dump(res, open('results_v4_ui2.json', 'w'), indent=1)
asyncio.run(main())
