# Shared helpers for the Scrapyard Derby playtest scripts.
# Usage: from harness import open_game  (run scripts from the playtest/ folder)
import asyncio, json, os, time
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
THREE = '/home/claude/vend/node_modules/three/build/three.module.js'
URL = os.environ.get('GAME_URL', 'http://localhost:8765/index.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ERRLOG = os.path.join(HERE, 'console_errors.jsonl')
os.makedirs(SHOTS, exist_ok=True)

# In-page helpers, installed once per page as window.T
INSTALL = r"""
(async () => {
  const m = await import('/src/game.js');
  const d = await import('/src/data.js');
  const sc = await import('/src/scene.js');
  const i18n = await import('/src/i18n.js');
  window.M = m; window.D = d; window.SC = sc; window.I18N = i18n;
  // run the simulation synchronously; G.state is restored to 'pause' afterwards so the
  // real rAF loop does not advance the sim between our calls (unless keep=true)
  window.step = (n, dt = 1 / 30, keys = null, each = null, keep = false) => {
    const G = m.G;
    if (keys) { G.keys = {}; for (const k of keys) G.keys[k] = true }
    for (let i = 0; i < n; i++) {
      if (G.state === 'pause') G.state = 'play';
      m.update(dt);
      if (each && each(i) === false) break;
    }
    if (!keep && G.state === 'play') G.state = 'pause';
    return G.state;
  };
  return true;
})()
"""


class Game:
    def __init__(self, page, tag, errs):
        self.page, self.tag, self.errs = page, tag, errs

    async def ev(self, js, arg=None):
        return await self.page.evaluate(js, arg) if arg is not None else await self.page.evaluate(js)

    async def shot(self, name):
        p = os.path.join(SHOTS, name)
        await self.page.screenshot(path=p)
        return p

    async def start(self, car=0):
        await self.page.click(f'.car[data-i="{car}"]')
        await self.page.wait_for_timeout(300)
        await self.ev("M.G.state='pause'")


async def open_game(pw, tag, lang='en', vw=1366, vh=800, slow3=0, touch=False):
    b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = await b.new_page(viewport={'width': vw, 'height': vh}, has_touch=touch, is_mobile=touch)
    errs = []

    def log(kind, text):
        if kind == 'console' and ('404' in text or 'ERR_FAILED' in text or 'Failed to load resource' in text):
            return
        errs.append(text)
        with open(ERRLOG, 'a') as f:
            f.write(json.dumps({'run': tag, 'kind': kind, 'text': text[:600], 't': time.time()}) + '\n')
    pg.on('pageerror', lambda e: log('pageerror', str(e)))
    pg.on('console', lambda m: log('console', m.text) if m.type in ('error',) else None)
    pg.on('console', lambda m: log('warning', m.text) if m.type == 'warning' else None)
    await pg.route('**/three.module.js', lambda r: r.fulfill(path=THREE, content_type='application/javascript'))
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await pg.add_init_script(f"localStorage.setItem('scrapyard-lang','{lang}')")
    # attach a short stack to THREE colour warnings so their source shows up in the log
    await pg.add_init_script("{const w=console.warn;console.warn=(...a)=>{if(String(a[0]).includes('color'))a.push(new Error().stack.split('\\n').slice(2,6).join(' | '));w(...a)}}")
    pre = os.environ.get('SHOT_PREFIX', '')
    if pre:
        orig = pg.screenshot
        async def shot(*a, **k):
            if 'path' in k:
                d, b = os.path.split(k['path']); k['path'] = os.path.join(d, pre + b)
            return await orig(*a, **k)
        pg.screenshot = shot
    await pg.goto(URL)
    await pg.wait_for_selector('#loading', state='detached', timeout=60000)
    await pg.evaluate(INSTALL)
    return b, Game(pg, tag, errs)
