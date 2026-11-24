# v4 flow: Esc during the countdown, pause/resume, blur, settings persistence, pause->garage (lap skip / heal),
# pause->menu->new run state leaks, death + lap end in the same frame, dying in the air.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

async def main():
    res = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4flow')
        p = g.page
        await g.ev("(async () => { window.UI = await import('/src/ui.js') })()")
        # 1. Esc during the countdown
        await p.click('.car[data-i="1"]'); await p.wait_for_timeout(250)
        before = await g.ev("({ st: M.G.state, startT: M.G.startT, count: document.getElementById('count').textContent })")
        await p.keyboard.press('Escape'); await p.wait_for_timeout(250)
        during = await g.ev("({ st: M.G.state, startT: M.G.startT, count: document.getElementById('count').textContent, cls: document.getElementById('count').className, pauseShown: !document.getElementById('pause').classList.contains('hide') })")
        await g.shot('v4_pause_during_countdown.png')
        await p.keyboard.press('Escape'); await p.wait_for_timeout(120)
        after = await g.ev("({ st: M.G.state, startT: M.G.startT, count: document.getElementById('count').textContent })")
        res['escCountdown'] = {'before': before, 'during': during, 'after': after}; print('ESC', res['escCountdown'])
        # 2. blur pauses, keys released
        await g.ev("M.G.keys.KeyW = true; M.G.state = 'play'")
        await g.ev("window.dispatchEvent(new Event('blur'))"); await p.wait_for_timeout(100)
        res['blur'] = await g.ev("({ st: M.G.state, keyW: !!M.G.keys.KeyW, pauseShown: !document.getElementById('pause').classList.contains('hide') })"); print('BLUR', res['blur'])
        # 3. settings persist
        await p.click('#pSettings'); await p.wait_for_timeout(150)
        await p.click('[data-opt="zoom"][data-v="0.82"]'); await p.click('[data-opt="shake"][data-v="false"]'); await p.click('[data-opt="fx"][data-v="0.5"]')
        res['optsStored'] = await g.ev("localStorage.getItem('ottokeirkhof-opts')")
        await p.keyboard.press('Escape'); await p.wait_for_timeout(150)
        res['escFromSettings'] = await g.ev("({ st: M.G.state, settingsHidden: document.getElementById('settings').classList.contains('hide'), hudHidden: document.getElementById('hud').classList.contains('hide') })")
        print('OPTS', res['optsStored'], res['escFromSettings'])
        # 4. pause -> garage at the very start of a lap: lap skip + free heal?
        r = await g.ev("""(() => { const m = M, G = m.G; m.start(1); G.state = 'pause'; G.P.hp = 30; const hp0 = G.P.hp, w0 = G.wave, sc0 = G.scrap;
          m.quitLap(); step(100, 1/30, []); const st = G.state; const out = { stateAfter: st, hp0, hpAfter: G.P.hp, wave: G.wave, scrapDelta: G.scrap - sc0 };
          // repeat 5 times in a row: quit during each countdown
          for (let i = 0; i < 5; i++) { m.nextWave(); G.state = 'pause'; m.quitLap(); step(100, 1/30, []) }
          out.after5 = { wave: G.wave, hp: Math.round(G.P.hp), maxhp: G.S.maxhp, state: G.state, rerollCost: G.rerollCost };
          // skip an elite lap
          G.wave = 4; m.nextWave(); G.state = 'pause'; out.eliteDue = G.eliteDue; m.quitLap(); step(100, 1/30, []); out.eliteSkipped = G.enemies.length === 0 && G.state === 'shop'; out.waveNow = G.wave;
          return out })()""")
        res['quitLap'] = r; print('QUIT', r)
        # 5. menu -> new run: state leaks
        r = await g.ev("""(() => { const m = M, G = m.G; m.start(0); G.state = 'pause'; G.wave = 3; G.scrap = 500; G.offer = [{ id: 'tesla', locked: true }]; G.cans = [{ x: 1, y: 1, l: 3, t: 0 }]; G.chaseRamp = { r: G.ramps[0], t: G.time }; G.crane.st = 'swing'; G.filling = true; G.drift.pts = 999;
          G.build.roof = { id: 'cage', lvl: 3 }; m.recompute();
          document.getElementById('pMenu').click();
          const menuState = G.state; m.start(1); G.state = 'pause';
          return { menuState, wave: G.wave, scrap: G.scrap, offer: G.offer.length, cans: G.cans.length, crane: G.crane.st, filling: G.filling, drift: G.drift.pts, build: Object.keys(G.build), tank: G.tank, fuel: G.fuel, chaseRamp: !!G.chaseRamp, pumpNext: G.pumpNext, siphon: G.siphon, gateV: m.gateOpen() } })()""")
        res['leaks'] = r; print('LEAKS', r)
        # 6. death and lap end in the same frame (spawn lands on you with 0.01 L left)
        r = await g.ev("""(() => { const m = M, G = m.G; m.start(0); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0;
          G.P.hp = 1; G.P.inv = 0; G.fuel = .01; G.pend = [{ x: G.P.x, y: G.P.y, t: 0, max: 1, type: 'rust' }];
          G.state = 'play'; m.update(1/30); const st1 = G.state, hp1 = G.P.hp; for (let i = 0; i < 100; i++) m.update(1/30);
          return { stateSameFrame: st1, hpSameFrame: hp1, finalState: G.state, finalHp: G.P.hp } })()""")
        res['dieAndEnd'] = r; print('DIE+END', r)
        # 7. dying in the air
        r = await g.ev("""(() => { const m = M, G = m.G; m.start(0); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.spawnT = 1e9; G.pumpT = 1e9; G.openers = 0;
          const P = G.P; P.air = true; P.z = 40; P.vz = 100; P.hp = 1; P.inv = 0; G.crane.st = 'swing'; G.crane.t = 0; G.crane.from = 0; G.crane.to = 1; G.crane.R = Math.hypot(P.x - m.CRANE.x, P.y - m.CRANE.y);
          let st = []; G.state = 'play'; for (let i = 0; i < 120; i++) { m.update(1/30); st.push(G.state) }
          return { states: [...new Set(st)], z: P.z, air: P.air, finalState: G.state } })()""")
        res['dieInAir'] = r; print('AIR DEATH', r)
        res['errs'] = g.errs
        await b.close()
        # 8. settings survive a reload
        b, g = await open_game(pw, 'v4flow2')
        await g.page.evaluate("localStorage.setItem('ottokeirkhof-opts', JSON.stringify({ zoom: .82, shake: false, fx: .5 }))")
        await g.page.reload(); await g.page.wait_for_selector('#loading', state='detached', timeout=60000)
        res['optsAfterReload'] = await g.ev("import('/src/game.js').then(m => m.OPTS)"); print('RELOAD', res['optsAfterReload'])
        await b.close()
    json.dump(res, open('results_v4_flow.json', 'w'), indent=1)
asyncio.run(main())
