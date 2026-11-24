# Finds where the "THREE.Material: parameter 'color' has value of undefined" warning comes from.
import asyncio
from playwright.async_api import async_playwright
import harness
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=harness.ARGS)
        pg = await b.new_page(viewport={'width': 1366, 'height': 800})
        await pg.route('**/three.module.js', lambda r: r.fulfill(path=harness.THREE, content_type='application/javascript'))
        await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        await pg.add_init_script("""window.WARN=[];const w=console.warn;console.warn=(...a)=>{if(String(a[0]).includes('color'))WARN.push(new Error().stack.split('\\n').slice(2,9).join('\\n'));w(...a)}""")
        await pg.goto(harness.URL); await pg.wait_for_selector('#loading', state='detached', timeout=60000)
        print('\n---\n'.join(await pg.evaluate('WARN')))
        await b.close()
asyncio.run(main())
