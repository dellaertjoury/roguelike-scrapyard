# Art prompts for Scrapyard Derby

The 3D world (cars, tyres, crowd, trees, effects) is built from low-poly shapes in code, so you don't need models to play.
The art below is **optional**. Drop each file at the exact path listed and the game picks it up on the next page load. Anything missing falls back to the built-in look.

| File | Size | Used for |
|---|---|---|
| `assets/logo.png` | 1600×600, transparent | Title on the main menu |
| `assets/menu-bg.jpg` | 1920×1080 | Main menu backdrop |
| `assets/ground-dirt.jpg` | 1024×1024, seamless | Arena floor texture |
| `assets/cars/hatch.png`, `muscle.png`, `hearse.png` | 960×520 | Car select cards |
| `assets/icons/<id>.png` (21 files) | 256×256 | Garage upgrade cards |
| `assets/og.jpg` | 1200×630 | Link preview when you share the GitHub Pages URL |
| `assets/favicon.png` | 64×64 | Browser tab icon |

## 1. Style lock (paste at the start of every prompt)

Keeping one shared style block is what makes images from separate generations look like one game.

> **Low-poly 3D render, flat-shaded faceted geometry, clean simple shapes, toy-like proportions, soft sunny afternoon light with gentle shadows, saturated but warm colours, rust orange #E8553A, hazard yellow #FFC23D, mud brown #A47F57, grass green #8CC063, charcoal #2A2C30, no outlines, no photorealism, no text, no watermark.**

Tips
- Use one model and one seed for a whole batch where your tool allows it (Midjourney `--seed`, `--sref` with your first good image; SDXL/Flux: fixed seed + same LoRA).
- Midjourney: add `--style raw --v 7` (or your current version) and the aspect ratio shown per asset.
- For transparent PNGs: generate on a plain flat background, then remove it (Photoshop "Remove background", remove.bg, or `rembg`).
- Icons look best generated as one sticker sheet (see 5b) and cropped, so they share lighting.

## 2. Logo — `assets/logo.png`

> [style lock] Game logo wordmark reading "SCRAPYARD DERBY", chunky rounded bold letters built like bent sheet metal, rust orange letters with cream highlights and a dark charcoal outline-shadow, a small low-poly tyre and a wrench crossed behind the words, a few flying bolts, centred on a plain flat light-grey background, wide banner composition. `--ar 8:3`

Text is the part generators get wrong most. If the lettering is off, generate only the emblem (tyre + wrench) and set the words yourself in a chunky font such as Rubik ExtraBold.

## 3. Menu backdrop — `assets/menu-bg.jpg`

> [style lock] Wide establishing shot of a dirt demolition-derby arena from a high three-quarter angle, oval of stacked black tyres with some red and white painted ones, a dozen battered low-poly derby cars mid-drift kicking up beige dust, one rust-orange hero car in front sliding sideways, small grandstands with a colourful blocky crowd, piles of crushed cars in the corners, floodlight towers, rolling low-poly green hills and faceted trees around it, lots of empty dirt in the centre for menu text. `--ar 16:9`

The menu darkens this image, so a busy picture still works behind the text.

## 4. Arena floor — `assets/ground-dirt.jpg`

> Seamless tileable texture, top-down view of packed dry dirt for a racing arena, warm mud brown #A47F57 with lighter dusty patches and scattered small pebbles, faint tyre tread imprints, painterly stylised game texture, even flat lighting, no shadows, no objects, no perspective. `--tile --ar 1:1`

Leave the style lock off this one: a flat texture should have no lighting. Check it tiles seamlessly (Photoshop Offset filter or any tiling preview).
The game adds its own patches, skid marks and scorch marks on top.

## 5. Car portraits — `assets/cars/*.png`

Same camera for all three: three-quarter front view from slightly above, car centred on a small round dirt pad, plain soft green gradient background.

**`hatch.png`**
> [style lock] A small battered low-poly hatchback derby car, hazard-yellow paint with rust patches, number 7 roundel on the hood, black roof-mounted machine gun turret, chunky black tyres, dented bumpers, three-quarter front view from slightly above on a round dirt pad, plain soft green gradient background. `--ar 24:13`

**`muscle.png`**
> [style lock] A long-hood low-poly 1970s muscle car built for demolition derby, rust-orange paint, number 23 roundel on the hood, black roof-mounted machine gun turret, wide rear tyres, scuffed chrome bumpers, three-quarter front view from slightly above on a round dirt pad, plain soft green gradient background. `--ar 24:13`

**`hearse.png`**
> [style lock] A heavy armoured low-poly hearse converted for demolition derby, slate-grey paint with welded steel plates, number 66 roundel on the hood, a mine dispenser box on the rear, reinforced bull-bar bumper, three-quarter front view from slightly above on a round dirt pad, plain soft green gradient background. `--ar 24:13`

## 6. Upgrade icons — `assets/icons/<id>.png`

### 6a. Single-icon template
> [style lock] Game item icon of **{SUBJECT}**, single low-poly object centred, slight three-quarter view, bold readable silhouette, soft drop shadow, plain flat charcoal #2A2C30 background, square. `--ar 1:1`

The cards show icons on a dark rounded tile, so a charcoal background works without removing it.

| File | {SUBJECT} |
|---|---|
| `mg.png` | a roof-mounted twin-barrel machine gun turret with an ammo belt |
| `mines.png` | a round proximity land mine with a blinking red light |
| `tesla.png` | a tesla coil with a crackling blue electric arc |
| `flame.png` | a flamethrower nozzle shooting an orange flame |
| `saw.png` | a spinning circular buzz saw blade with motion sparks |
| `v8.png` | a chrome V8 engine block with an air intake on top |
| `slicks.png` | a racing slick tyre with a yellow sidewall stripe |
| `cage.png` | a welded steel roll cage frame |
| `plate.png` | a riveted steel armour plate with dents |
| `bumper.png` | a heavy steel ram bumper bull bar |
| `ballast.png` | a cracked concrete block with a chain |
| `spikes.png` | a spiked chrome hubcap |
| `tuner.png` | a handbrake lever with a glowing orange knob |
| `exhaust.png` | a car exhaust pipe blasting blue-orange afterburner flame |
| `nitro.png` | a blue nitrous oxide tank with a valve |
| `rounds.png` | three glowing orange-hot bullets |
| `ecu.png` | a green circuit board chip with a glowing overclock symbol |
| `magnet.png` | a red horseshoe magnet pulling nuts and bolts |
| `tape.png` | a roll of silver duct tape |
| `kit.png` | a red toolbox with a wrench sticking out |
| `dice.png` | a pair of fuzzy pink dice hanging from a string |

### 6b. Sticker-sheet version (more consistent)
> [style lock] Sticker sheet of 9 game item icons in a 3×3 grid, each a single low-poly object centred in its own cell with even spacing: {list 9 subjects from the table}, plain flat charcoal #2A2C30 background, matching lighting on every icon. `--ar 1:1`

Run it three times (9 + 9 + 3 subjects), then crop each cell to 256×256.

## 7. Share image — `assets/og.jpg`

> [style lock] Action shot of a rust-orange low-poly demolition derby car drifting sideways through a dirt arena, roof machine gun firing yellow tracers, a grey enemy car exploding into faceted orange fire and cubes of debris, tyre walls and a colourful blocky crowd behind, empty space on the left third for a title. `--ar 40:21`

## 8. Favicon — `assets/favicon.png`

> [style lock] App icon of a single low-poly black tyre with a red painted stripe and a small flame, centred, plain rust-orange background, square. `--ar 1:1`
Scale it down to 64×64.

## Later: 3D models

If you want to swap the code-built cars for real models, text-to-3D tools (Meshy, Tripo, Rodin) take the car prompts from section 5 with "low-poly game asset, under 3k triangles, single mesh, flat colours, no texture baking" added. Export `.glb` and ask Claude to wire up a GLTF loader with the code-built cars as the fallback.
