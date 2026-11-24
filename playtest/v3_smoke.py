# v3: art loading smoke test: every HTTP failure on load, which art slots are filled.
import asyncio, json
from playwright.async_api import async_playwright
from harness import open_game
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v3_smoke')
        await g.page.wait_for_timeout(1500)
        a = await g.ev("import('/src/assets.js').then(m => ({ ui: Object.keys(m.A.ui), missingUi: m.UI_ICONS.filter(k => !m.A.ui[k]), icons: Object.keys(m.A.icons).length, cars: Object.keys(m.A.cars), elites: Object.keys(m.A.elites), packs: Object.keys(m.A.packs), logos: Object.keys(m.A.logos), fx: Object.keys(m.A.fx), dirt: !!m.A.dirt, menuBg: !!m.A.menuBg, garageBg: !!m.A.garageBg }))")
        out = {'assets': a, 'http': g.http, 'errors': g.errs}
        print(json.dumps(out, indent=1))
        json.dump(out, open('results_v3_smoke.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())
