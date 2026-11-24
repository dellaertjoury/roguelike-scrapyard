# Flow and state: pause/blur, back to the pits + new run (state leaks), garage buy/replace/level and
# stat recompute, dying in the air / at lap end, focus after "Next lap", geometry growth per action,
# and where the "color undefined" warning comes from.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

GEO = "SC.renderer.info.memory.geometries"


async def main():
    out = {}
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'flow')
        pg = g.page
        # stack for the THREE colour warning (wrap console.warn before starting)
        await g.ev("""(() => { const w = console.warn; window.WARN = []; console.warn = (...a) => { if (String(a[0]).includes('color')) WARN.push(new Error().stack.split('\\n').slice(2, 7).join(' | ')); w(...a) } })()""")
        await g.start(0)
        await g.ev("M.G.state='play'")
        await pg.wait_for_timeout(1500)
        # spawn one of each enemy type + elites so every car kind gets built at least once
        await g.ev("""(() => { const G = M.G; for (const [t, w] of [['spit', 3], ['brute', 5], ['harvester', 5], ['monster', 10], ['tow', 15]]) { G.pend.push({ x: 300 + Math.random() * 1400, y: 300, t: .01, max: 1, type: t, elite: false }) } })()""")
        await pg.wait_for_timeout(1500)
        out['colorWarnStacks'] = await g.ev("WARN")

        # ---- pause / resume / blur
        await g.ev("M.G.state='play'")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        t0 = await g.ev("M.G.time"); await pg.wait_for_timeout(1200); t1 = await g.ev("M.G.time")
        out['pause'] = {'state': await g.ev("M.G.state"), 'overlayVisible': await pg.is_visible('#pause'), 'timeAdvancedWhilePaused': round(t1 - t0, 4)}
        await pg.screenshot(path='shots/flow_pause.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        out['pause']['afterResume'] = await g.ev("M.G.state")
        await pg.keyboard.down('KeyW')
        await g.ev("window.dispatchEvent(new Event('blur'))"); await pg.wait_for_timeout(200)
        out['blur'] = {'state': await g.ev("M.G.state"), 'keysCleared': await g.ev("!Object.values(M.G.keys).some(Boolean)")}
        await pg.keyboard.up('KeyW')
        await pg.click('#resume'); await pg.wait_for_timeout(200)

        # ---- garage: buy / level / replace / recompute
        await g.ev("(() => { const G = M.G; G.P.hp = G.S.maxhp; G.scrap = 5000; G.fuel = .01 })()")
        await pg.wait_for_selector('#shop:not(.hide)', timeout=30000)
        rec = await g.ev(r"""(() => {
          const G = M.G, m = M, res = [];
          const force = id => { G.offer = [{ id }]; return m.buy(0) };
          const snap = (label) => res.push({ label, build: Object.entries(G.build).map(([k, v]) => k + ':' + v.id + v.lvl).join(' '), maxhp: G.S.maxhp, hp: Math.round(G.P.hp), armor: +G.S.armor.toFixed(2), mass: +G.S.mass.toFixed(2), top: Math.round(G.S.top), W: JSON.stringify(G.W) });
          snap('start');
          force('cage'); force('cage'); force('cage'); snap('cage x3');
          const r4 = force('cage'); res.push({ label: 'cage 4th buy allowed?', ok: r4 });
          force('magnet'); snap('magnet replaces cage (maxhp should drop by 75)');
          force('ballast'); force('ballast'); snap('ballast x2');
          force('bullbar'); snap('bullbar replaces hatch front?');
          force('tesla'); snap('tesla replaces magnet');
          force('mg'); snap('mg back (Lv1)');
          // independent recompute check
          const S = Object.assign({}, D.BASE, G.car.st); for (const s of D.SLOTS) { const b = G.build[s]; if (b && !D.PART[b.id].w) D.PART[b.id].f(S, b.lvl) }
          const diff = Object.keys(S).filter(k => Math.abs(S[k] - G.S[k]) > 1e-9);
          res.push({ label: 'independent recompute diff', diff });
          return res;
        })()""")
        out['garage'] = rec
        await pg.wait_for_timeout(300)
        # lock a card, then die next lap, go back to pits, new run: check leaks
        await g.ev("(() => { const G = M.G; G.offer = [{ id: 'saw' }, { id: 'plate' }, { id: 'v8' }]; })()")
        await g.ev("import('/src/ui.js').then(u => u.renderShop())")
        await pg.click('#cards .card:nth-child(2) .lockbtn')
        await pg.click('#go'); await pg.wait_for_timeout(300)
        # focus after Next lap: does Enter / Space re-trigger it?
        w0 = await g.ev("M.G.wave")
        out['focusAfterGo'] = await g.ev("document.activeElement && (document.activeElement.id || document.activeElement.tagName)")
        await pg.keyboard.press('Enter'); await pg.keyboard.press('Space'); await pg.wait_for_timeout(200)
        out['waveAfterEnterSpace'] = [w0, await g.ev("M.G.wave")]

        # ---- die in the air while texts are floating
        await g.ev("(() => { const G = M.G, P = G.P; P.z = 15; P.air = true; P.vz = 0; P.inv = 0; P.hp = 1; for (let i = 0; i < 12; i++) M.txt(P.x + i * 20, P.y, 'TEXT' + i, '#fff', 20, 3); G.ebul.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 1, dmg: 5 }); })()")
        # (bullet only hits when P.z < 20) -> force a hit by ramming instead
        await g.ev("M.step(1)") if False else None
        await pg.wait_for_timeout(1500)
        out['dieInAir'] = {'state': await g.ev("M.G.state"), 'P.z': await g.ev("M.G.P.z")}
        await g.ev("(() => { const G = M.G; if (G.state === 'play') { G.P.inv = 0; G.P.hp = .1; G.P.z = 0; G.P.air = false; G.ebul.push({ x: G.P.x, y: G.P.y, vx: 0, vy: 0, life: 1, dmg: 50 }) } })()")
        await pg.wait_for_selector('#over:not(.hide)', timeout=30000)
        out['overTextsAlive'] = await g.ev("M.G.texts.length")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path='shots/flow_gameover_texts.png')
        await pg.click('#again'); await pg.wait_for_timeout(1200)
        out['menuFloatingTextsVisible'] = await g.ev("[...document.querySelectorAll('#fx div')].filter(d => d.style.display === 'block').map(d => d.textContent)")
        await pg.screenshot(path='shots/flow_menu_after_death.png')
        out['menuState'] = await g.ev("({ state: M.G.state, offer: M.G.offer.map(o => o.id + (o.locked ? '*' : '')), scrap: M.G.scrap, best: localStorage.getItem('scrapyard-best'), bestLine: document.getElementById('bestLine').textContent })")
        await pg.click('.car[data-i="1"]'); await pg.wait_for_timeout(400)
        out['newRun'] = await g.ev("({ wave: M.G.wave, scrap: M.G.scrap, offer: M.G.offer.length, build: Object.entries(M.G.build).map(([k, v]) => k + ':' + v.id + v.lvl).join(' '), hp: M.G.P.hp, maxhp: M.G.S.maxhp, texts: M.G.texts.length, mines: M.G.mines.length, drift: JSON.stringify(M.G.drift) })")

        # ---- dying exactly as the lap ends
        res = await g.ev(r"""(() => {
          const G = M.G, P = G.P; G.state = 'play'; G.fuel = .01; P.inv = 0; P.hp = .1;
          G.ebul.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 1, dmg: 50 });
          step(1, 1 / 30, [], null, true); const s1 = G.state;
          for (let i = 0; i < 80; i++) step(1, 1 / 30, [], null, true);
          return { afterFrame: s1, later: G.state, hp: P.hp };
        })()""")
        out['dieAtLapEnd'] = res
        await pg.wait_for_timeout(300)

        # ---- geometry growth per action
        geo = {}
        await g.ev("document.getElementById('go') && M.G.state === 'shop' && document.getElementById('go').click()")
        await pg.wait_for_timeout(500)
        a = await g.ev(GEO)
        await g.ev("(() => { const G = M.G; G.offer = [{ id: 'saw' }]; G.scrap = 999; M.buy(0) })()"); await pg.wait_for_timeout(400)
        geo['oneSawPurchase'] = (await g.ev(GEO)) - a
        a = await g.ev(GEO)
        await g.ev("(() => { const G = M.G; G.offer = [{ id: 'saw' }]; G.scrap = 999; M.buy(0) })()"); await pg.wait_for_timeout(400)
        geo['sawLevelUp'] = (await g.ev(GEO)) - a
        a = await g.ev(GEO)
        await g.ev("M.G.state='over'")
        await g.ev("document.getElementById('again').click()"); await pg.wait_for_timeout(600)
        geo['backToMenu'] = (await g.ev(GEO)) - a
        a = await g.ev(GEO)
        await pg.click('.car[data-i="1"]'); await pg.wait_for_timeout(600)
        geo['newRunSameCar'] = (await g.ev(GEO)) - a
        a = await g.ev(GEO)
        await g.ev("M.G.state='over'"); await g.ev("document.getElementById('again').click()"); await pg.wait_for_timeout(400)
        await pg.click('.car[data-i="2"]'); await pg.wait_for_timeout(600)
        geo['menuThenOtherCar'] = (await g.ev(GEO)) - a
        out['geometryDelta'] = geo
        out['errors'] = g.errs
        print(json.dumps(out, indent=1))
        json.dump(out, open('results_flow.json', 'w'), indent=1)
        await b.close()

asyncio.run(main())
