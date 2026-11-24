# update() timing only, for an A/B between versions (GAME_URL). Run alone (no other browser) for clean numbers.
import asyncio, json, os, re
from playwright.async_api import async_playwright
from harness import open_game
SIM = re.search(r'SIM = r"""(.*?)"""', open('perf.py').read(), re.S).group(1)
async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'perf_ab')
        await g.start(1)
        rs = [await g.ev(SIM) for _ in range(3)]
        print(os.environ.get('GAME_URL', 'v2'), [r['heavy60_ms'] for r in rs], [r['lap1_ms'] for r in rs])
        await b.close()
asyncio.run(main())
