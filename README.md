# Ottokeirkhof

The game is in West-Vlaams only.

A low-poly drift-and-wreck survival roguelike that runs in the browser.
Pick a junker, survive timed waves of derby cars, and spend scrap in the garage between waves.
Drifting heats your weapons (up to +80% fire rate), ramming at speed wrecks cars, and every fifth wave brings a boss.

## What's in it

- **Fuel is the lap clock**: a 30 L tank burns 1 L/s (2 L/s on nitro), so a lap lasts 30 s unless you refuel; the Reservetank part adds 10 L per level (up to 60 L). A gas pump opens somewhere on the map: drive onto its pad and it pours its 30 L (= +30 s) straight in at 6 L/s; a ring on the pad and a tag above it show what is left. A pump only shows up in about 45% of laps (once at most); the Nafteradar roof part adds 20% per level.
- **Laps** end when the tank runs dry. Every fifth lap brings an elite with its own special move: the Harvester shoots chained saw blades, Big Wheel leaps and slams, the Wrecker hooks you and reels you in (nitro breaks free).
- **Garage blueprint**: six fixed slots on your car (roof, hood, front bumper, rear bumper, trunk, sides). Each slot holds one part, which you can level up or swap out. Every part is visible on the car. Five parts are for sale each visit, and you can lock the ones you want to keep.
- **Fuel thieves** (green, from lap 2) hook a hose onto your car when they get close and drain 3 L/s, up to 6 L each; the screen edges pulse red while it happens. Break away or wreck them: a wrecked thief drops a jerrycan with your fuel, which evaporates after 3 s.
- **Pit entry**: every lap starts in the garage below the arena; during the 3-2-1 countdown the car rolls up the driveway and the gate shuts behind it. Nothing spawns before GO.
- **Wrecking ball**: from lap 2 a tower crane in the top-left corner sweeps a wrecking ball across the arena every 22-34 s, after a 3 s road-sign warning and a red arc on the ground. It wrecks most cars it touches.
- **Three enemy kinds** for now: rammers (ram bar, line up and charge), gunners (roof turret, red slugs) and fuel thieves. Their speed is set just under your car's top speed.
- **Smarter enemies** drive like cars: they lead their target, slide through hard turns (with smoke and skid marks), steer around tyre piles and walls, back out with a three-point turn when stuck, and some line up on a ramp to jump after you.
- **Traffic cones** in slalom rows: knock them flying, they bounce off tyre piles and walls, and they're back in place next lap.
- **Ramps** to jump over the pack. Land on a car to crush it.
- **Ramming** hurts both cars, depending on impact speed and weight.
- **Languages**: English, Français, Deutsch, Español and West-Vlams.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Drive |
| Space | Handbrake. Hold it through a turn to drift |
| Shift | Nitro. It never refills on its own: only real drifts trickle a little back |
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
src/ui.js         loading screen, menus, garage blueprint, HUD, floating numbers
src/data.js       cars, garage parts and slots, weapons, enemy and elite stats (tune numbers here)
src/i18n.js       all text in every language
src/assets.js     optional art loader
assets/           optional art (see ART_PROMPTS.md)
```

## Tuning

Car speed, grip and handling live in `CARS` in `src/data.js`. Speeds are in world units per second, where 10 units ≈ 1 m, so `top: 190` ≈ 68 km/h.
Enemy speed and health scale per wave in `ENEMY`.

## Art

Every image is optional. `ART_PROMPTS.md` lists each file path, its size, and a prompt you can give an image generator.
