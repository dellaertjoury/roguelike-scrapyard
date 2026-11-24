# Readability matrix: 5 languages x 4 viewports x (menu, HUD with elite banner, garage, game over).
# Saves screenshots and runs automatic layout checks (text clipped / overflowing / off-screen, HUD panel overlaps).
# usage: python3 readability.py [lang ...]
import asyncio, json, sys
from playwright.async_api import async_playwright
from harness import open_game

LANGS = sys.argv[1:] or ['en', 'fr', 'de', 'es', 'vls']
SIZES = [(1366, 800), (1920, 1080), (768, 1024), (390, 844)]

CHECK = r"""
(scope) => {
  const vw = innerWidth, vh = innerHeight, out = { clipped: [], overflow: [], offscreenX: [], clamped: [], overlaps: [] };
  const root = document.querySelector(scope); if (!root) return out;
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false } return true };
  const name = el => (el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ' "' + el.textContent.trim().slice(0, 40) + '"';
  for (const el of root.querySelectorAll('*')) {
    if (!el.textContent.trim() || el.children.length > 2) continue;
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) out.offscreenX.push(name(el));
    const cs = getComputedStyle(el);
    if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) out.overflow.push(name(el) + ` ${el.scrollWidth}>${el.clientWidth}`);
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) out.clamped.push(name(el));
    for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
      const as = getComputedStyle(a); if (as.overflow === 'visible' || a === root) continue;
      const ar = a.getBoundingClientRect();
      if (r.right > ar.right + 1 || r.bottom > ar.bottom + 1 && as.overflowY !== 'auto') { out.clipped.push(name(el) + ' in ' + name(a).slice(0, 30)); }
      break;
    }
  }
  if (scope === '#hud') {
    const ps = [...document.querySelectorAll('#hud > .pnl, #banner')].filter(p => vis(p) && (p.id !== 'banner' || +getComputedStyle(p).opacity > .05));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i].getBoundingClientRect(), b = ps[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) out.overlaps.push(`${ps[i].id || ps[i].className} x ${ps[j].id || ps[j].className} (${Math.round(ox)}x${Math.round(oy)})`);
    }
    // how much of the screen the HUD covers
    let area = 0; for (const p of document.querySelectorAll('#hud > .pnl')) { if (!vis(p)) continue; const r = p.getBoundingClientRect(); area += r.width * r.height }
    out.hudCoverPct = Math.round(area / (vw * vh) * 100);
  }
  for (const k of ['clipped', 'overflow', 'offscreenX', 'clamped']) out[k] = [...new Set(out[k])];
  return out;
}
"""

SETUP_SHOP = r"""
(() => {
  const G = M.G, L = I18N.L(), D_ = D;
  const nm = p => p.w ? L.w[p.w][0] : L.parts[p.id][0];
  const longest = D_.PARTS.slice().sort((a, b) => nm(b).length - nm(a).length);
  G.build = {};
  for (const s of D_.SLOTS) { const p = longest.find(p => p.slot === s); G.build[s] = { id: p.id, lvl: Math.min(2, p.max) } }
  M.recompute();
  const offer = D_.PARTS.filter(p => G.build[p.slot].id !== p.id).sort((a, b) => (nm(b) + (L.parts[b.id] ? L.parts[b.id][1] : '')).length - (nm(a) + (L.parts[a.id] ? L.parts[a.id][1] : '')).length).slice(0, 4).map(p => ({ id: p.id }));
  offer.push({ id: G.build.sides.id }); offer[1].locked = true;
  G.offer = offer; G.scrap = 60; G.P.hp = G.S.maxhp * .4;
  return import('/src/ui.js').then(u => u.renderShop());
})()
"""


async def main():
    report = {}
    async with async_playwright() as pw:
        for lang in LANGS:
            b, g = await open_game(pw, 'read_' + lang, lang=lang)
            pg = g.page
            rep = report[lang] = {}
            for (w, h) in SIZES:
                await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(500)
                await pg.screenshot(path=f'shots/read_{lang}_{w}x{h}_menu.png')
                rep[f'{w}x{h}_menu'] = await g.ev(CHECK, '#menu')
            await pg.set_viewport_size({'width': 1366, 'height': 800})
            await g.start(1)
            # HUD: lap 10 elite banner, hot drift, big numbers
            for (w, h) in SIZES:
                await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(300)
                await g.ev("""(() => { const G = M.G; G.enemies = []; G.pend = []; G.wave = 9; G.state = 'play'; M.nextWave(); G.pend.forEach(s => s.t = .01); step(2, 1/30, []);
                  G.scrap = 12345; G.wrecks = 1234; G.P.hp = 23; Object.assign(G.drift, { on: true, pts: 123456, mult: 5, heat: .9 }); G.P.sp = 300; G.P.slipDeg = 38; G.state = 'pause'; })()""")
                await pg.wait_for_timeout(450)
                await pg.screenshot(path=f'shots/read_{lang}_{w}x{h}_hud_banner.png')
                rep[f'{w}x{h}_hud'] = await g.ev(CHECK, '#hud')
            await pg.set_viewport_size({'width': 1366, 'height': 800})
            await g.ev("(() => { const G = M.G; G.P.hp = G.S.maxhp; G.waveT = .02; G.state = 'play' })()")
            await pg.wait_for_selector('#shop:not(.hide)', timeout=30000)
            await g.ev(SETUP_SHOP)
            for (w, h) in SIZES:
                await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(400)
                await pg.screenshot(path=f'shots/read_{lang}_{w}x{h}_garage.png')
                await pg.screenshot(path=f'shots/read_{lang}_{w}x{h}_garage_full.png', full_page=True) if w < 800 else None
                rep[f'{w}x{h}_garage'] = await g.ev(CHECK, '#shop')
                rep[f'{w}x{h}_garage']['nextLapButtonBottom'] = await g.ev("(() => { const r = document.getElementById('go').getBoundingClientRect(); return [Math.round(r.bottom), innerHeight] })()")
            await pg.set_viewport_size({'width': 1366, 'height': 800})
            await pg.click('#go'); await pg.wait_for_timeout(300)
            await g.ev("(() => { const G = M.G; G.score = 1234567; G.wrecks = 4321; G.bestDrift = 98765; G.P.inv = 0; G.P.hp = .1; G.ebul.push({ x: G.P.x, y: G.P.y, vx: 0, vy: 0, life: 1, dmg: 99 }); G.state = 'play' })()")
            await pg.wait_for_selector('#over:not(.hide)', timeout=30000)
            for (w, h) in SIZES:
                await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(300)
                await pg.screenshot(path=f'shots/read_{lang}_{w}x{h}_over.png')
                rep[f'{w}x{h}_over'] = await g.ev(CHECK, '#over')
            rep['errors'] = g.errs
            print(lang, json.dumps({k: {kk: vv for kk, vv in v.items() if vv} for k, v in rep.items() if isinstance(v, dict)}, ensure_ascii=False)[:4000])
            await b.close()
    old = {}
    try: old = json.load(open('results_readability.json'))
    except Exception: pass
    old.update(report)
    json.dump(old, open('results_readability.json', 'w'), indent=1, ensure_ascii=False)

asyncio.run(main())
