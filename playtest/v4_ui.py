# v4 readability: HUD, banners, countdown, crane sign, garage + blueprint chips/tooltips, pause/settings, game over
# at 1366x800, 1920x1080, 768x1024 (touch), 390x844 (touch). Screenshots + automatic overlap / clipping checks.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game

SIZES = [(1366, 800, False), (1920, 1080, False), (768, 1024, True), (390, 844, True)]

RECTS = r"""
(sel) => {
  const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; let p = el; while (p) { const c = getComputedStyle(p); if (c.display === 'none' || +c.opacity === 0 || p.classList.contains('hide')) return false; p = p.parentElement } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
  const out = {}, W = innerWidth, H = innerHeight;
  for (const s of sel) { const el = document.querySelector(s); if (!vis(el)) continue; const r = el.getBoundingClientRect(); out[s] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), off: r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1 } }
  const ov = []; const ks = Object.keys(out);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = out[ks[i]], b = out[ks[j]]; const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ix > 2 && iy > 2) ov.push([ks[i], ks[j], ix, iy]) }
  // text overflow inside HUD / garage
  const clip = []; for (const el of document.querySelectorAll('#hud *, #shop *, #pause *, #settings *, #over *')) { if (!vis(el) || !el.childElementCount && !el.textContent.trim()) continue; const cs = getComputedStyle(el); if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clip.push((el.id ? '#' + el.id : el.className || el.tagName) + ': "' + el.textContent.trim().slice(0, 40) + '" ' + el.scrollWidth + '>' + el.clientWidth) }
  return { W, H, rects: out, overlaps: ov, clipped: clip.slice(0, 20) };
}
"""
HUDSEL = ['#hullPlate', '#scrapPlate', '#cluster', '#driftMtr', '#bossPnl', '#banner', '#count', '#craneSign', '#touch', '#tPause']

async def scen(g, js):
    await g.ev(js)

async def run_size(pw, vw, vh, touch, res):
    tag = f'{vw}x{vh}'
    b, g = await open_game(pw, 'v4ui_' + tag, vw=vw, vh=vh, touch=touch)
    await g.ev("(async () => { window.UI = await import('/src/ui.js') })()")
    r = {}
    await g.shot(f'v4_menu_{tag}.png')
    # 1. lap 1: countdown + banner
    await g.page.click('.car[data-i="0"]'); await g.page.wait_for_timeout(500)
    await g.shot(f'v4_lapstart_{tag}.png'); r['lapstart'] = await g.ev(RECTS, HUDSEL)
    # 2. banners: thief intro (lap 2), spit intro (lap 3), elite (lap 5), out of fuel
    for lap, name in [(2, 'thief'), (3, 'spit'), (5, 'elite')]:
        await g.ev(f"(() => {{ const m = M, G = m.G; G.state = 'pause'; G.wave = {lap - 1}; m.nextWave(); G.state = 'pause'; step(100, 1/30, ['KeyW']); G.state = 'pause'; G.banner = {{ ...G.banner, id: Math.random() }} }})()")
        await g.page.wait_for_timeout(900)
        await g.shot(f'v4_banner_{name}_{tag}.png'); r['banner_' + name] = await g.ev(RECTS, HUDSEL + ['#banner b', '#banner span'])
    # 3. busy HUD on the elite lap: drift on, siphon, crane sign, pump nearby
    await g.ev("""(() => { const m = M, G = m.G; G.state = 'pause'; G.P.x = 900; G.P.y = 700; G.pump = { x: 1100, y: 620, res: 18, got: 12, empty: false, id: 3 }; G.filling = true;
      G.crane.st = 'warn'; G.crane.t = 2.8; G.crane.from = 0; G.crane.to = 1; G.crane.R = 1200; G.drift.on = true; G.drift.pts = 12345; G.drift.mult = 3.4; G.drift.time = 3; G.drift.heat = .8; G.siphon = true; G.scrap = 12345; G.wrecks = 321; G.fuel = 7.5; G.P.nitro = .5; G.P.sp = 260; G.P.slipDeg = 34; })()""")
    await g.page.wait_for_timeout(600)
    await g.ev("M.G.state = 'play'; M.G.crane.st='warn'; M.G.crane.t=2.8; M.G.siphon = true"); await g.page.wait_for_timeout(60); await g.ev("M.G.state='pause'; M.G.siphon = true; M.G.crane.st='warn'; M.G.crane.t=2.8")
    await g.page.wait_for_timeout(500)
    await g.shot(f'v4_hud_busy_{tag}.png'); r['hud_busy'] = await g.ev(RECTS, HUDSEL)
    # 4. pause + settings
    await g.ev("UI.show('pause')"); await g.page.wait_for_timeout(300); await g.shot(f'v4_pause_{tag}.png'); r['pause'] = await g.ev(RECTS, ['#pause .box', '#pause'])
    await g.page.click('#pSettings'); await g.page.wait_for_timeout(300); await g.shot(f'v4_settings_{tag}.png'); r['settings'] = await g.ev(RECTS, ['#settings'])
    await g.page.click('#optBack'); await g.ev("UI.show(null)")
    # 5. garage with a full build of long names
    await g.ev("""(() => { const m = M, G = m.G; G.state = 'play'; G.wave = 9; Object.assign(G.build, { turret: { id: 'mg', lvl: 4 }, roof: { id: 'radar', lvl: 3 }, hood: { id: 'cooler', lvl: 2 }, front: { id: 'spikes', lvl: 3 }, rear: { id: 'exhaust', lvl: 3 }, trunk: { id: 'toolbox', lvl: 2 }, sides: { id: 'skirts', lvl: 3 } }); m.recompute(); G.scrap = 1234; G.fuel = 0; step(120, 1/30, []); })()""")
    await g.page.wait_for_timeout(500)
    await g.shot(f'v4_garage_{tag}.png')
    r['garage'] = await g.ev(RECTS, ['#cards', '#blueprint', '#build', '.gfoot', '#reroll', '#repair', '#go'])
    chips = await g.ev("""(() => { const bp = document.getElementById('blueprint').getBoundingClientRect(); const cs = [...document.querySelectorAll('#blueprint .chip')].map(c => { const r = c.getBoundingClientRect(); const st = c.closest('.bpstage').getBoundingClientRect(); return { slot: c.dataset.slot, x: r.left|0, y: r.top|0, w: r.width|0, h: r.height|0, outStage: r.left < st.left - 1 || r.right > st.right + 1 || r.top < st.top - 1 || r.bottom > st.bottom + 1, outVP: r.left < 0 || r.right > innerWidth, pnClip: (() => { const pn = c.querySelector('.pn'); return pn.scrollWidth > pn.clientWidth + 1 })() } });
      const ov = []; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i], b = cs[j]; const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ix > 1 && iy > 1) ov.push([a.slot, b.slot, ix, iy]) }
      return { chips: cs, overlaps: ov } })()""")
    r['chips'] = chips
    # tooltips: hover every filled chip
    tips = []
    for slot in ['turret', 'roof', 'hood', 'sides', 'front', 'rear', 'trunk']:
        el = g.page.locator(f'#blueprint .chip[data-slot="{slot}"]')
        try:
            await el.scroll_into_view_if_needed(); await el.hover(); await g.page.wait_for_timeout(250)
        except Exception as ex:
            tips.append({'slot': slot, 'err': str(ex)[:80]}); continue
        t = await g.ev(f"""(() => {{ const c = document.querySelector('#blueprint .chip[data-slot="{slot}"]'), tp = c.querySelector('.tip'); if (!tp) return null; const r = tp.getBoundingClientRect(), cs = getComputedStyle(tp);
          // is the tip clipped by an ancestor with overflow hidden/auto?
          let p = tp.parentElement, clipBy = null; while (p && p !== document.body) {{ const s = getComputedStyle(p); if (s.overflow !== 'visible' || s.overflowX !== 'visible') {{ const pr = p.getBoundingClientRect(); if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) {{ clipBy = (p.id || p.className) ; break }} }} p = p.parentElement }}
          return {{ slot: '{slot}', vis: cs.visibility !== 'hidden' && +cs.opacity > 0 && cs.display !== 'none', x: r.left|0, y: r.top|0, w: r.width|0, h: r.height|0, outVP: r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight, clipBy }} }})()""")
        tips.append(t)
        if slot in ('rear', 'turret', 'front'):
            await g.shot(f'v4_tip_{slot}_{tag}.png')
    r['tips'] = tips
    # 6. game over
    await g.ev("(() => { const m = M, G = m.G; m.nextWave(); G.state = 'pause'; G.startT = 0; G.P.intro = false; G.P.hp = 1; G.P.inv = 0; G.pend = [{ x: G.P.x, y: G.P.y, t: 0, max: 1, type: 'rust' }]; step(80, 1/30, []); })()")
    await g.page.wait_for_timeout(600); await g.shot(f'v4_over_{tag}.png'); r['over'] = await g.ev(RECTS, ['#over'])
    r['errs'] = g.errs
    res[tag] = r
    await b.close()

async def main():
    res = {}
    async with async_playwright() as pw:
        for vw, vh, touch in SIZES:
            await run_size(pw, vw, vh, touch, res)
            rr = res[f'{vw}x{vh}']
            print(f'== {vw}x{vh}')
            for k, v in rr.items():
                if isinstance(v, dict) and ('overlaps' in v or 'clipped' in v):
                    print(' ', k, 'OV', v.get('overlaps'), 'CLIP', v.get('clipped'), 'OFF', [s for s, q in v.get('rects', {}).items() if q.get('off')])
            print('  chips', json.dumps(rr['chips']['overlaps']), [c for c in rr['chips']['chips'] if c['outStage'] or c['outVP'] or c['pnClip']])
            print('  tips', json.dumps(rr['tips']))
            print('  banner rects', {k: rr[k]['rects'].get('#banner') for k in rr if k.startswith('banner')}, 'W', rr['lapstart']['W'])
    json.dump(res, open('results_v4_ui.json', 'w'), indent=1)
if __name__ == "__main__":
    asyncio.run(main())
