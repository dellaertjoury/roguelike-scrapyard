# Scrapyard Derby

A low-poly drift-and-wreck survival roguelike that runs in the browser.
Pick a junker, survive timed waves of derby cars, and spend scrap in the garage between waves.
Drifting heats your weapons (up to +80% fire rate), ramming at speed wrecks cars, and every fifth wave brings a boss.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Drive |
| Space | Handbrake. Hold it through a turn to drift |
| Shift | Nitro. Drifting refills it |
| P / Esc | Pause |

## Run it locally

It's plain HTML and ES modules with no build step. Browsers block modules opened from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

three.js loads from the jsDelivr CDN through the import map in `index.html`.

## Publish on GitHub Pages

1. Push this folder to the `main` branch of the repo.
2. On GitHub go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then **Save**.
4. After a minute the game is live at `https://<your-user>.github.io/roguelike-scrapyard/`.

`.nojekyll` is included so GitHub serves the files as they are.

## Project layout

```
index.html        page shell, HUD markup, styles, import map
src/main.js       boot, input, frame loop
src/game.js       simulation: driving, drift, enemies, weapons, waves, shop
src/scene.js      three.js low-poly renderer
src/ui.js         menus, garage, HUD, floating numbers
src/data.js       cars, upgrades, weapons, enemy stats (tune numbers here)
src/assets.js     optional art loader
assets/           optional art (see ART_PROMPTS.md)
```

## Tuning

Car speed, grip and handling live in `CARS` in `src/data.js`. Speeds are in world units per second, where 10 units ≈ 1 m, so `top: 190` ≈ 68 km/h.
Enemy speed and health scale per wave in `ENEMY`.

## Art

Every image is optional. `ART_PROMPTS.md` lists each file path, its size, and a prompt you can give an image generator.
