# Art prompts: Ottokeirkhof

Every prompt is complete: copy the `STYLE` block in front of the subject line (or paste the whole block where it is
written out). Put each file at the path in its header. The game picks it up automatically and falls back to its
built-in look when a file is missing.

Tips
- Generate with a fixed seed, or use the logo / menu art as a style reference (Midjourney `--sref`), so everything matches.
- **Transparent**: generate on the plain background named in the prompt and remove it afterwards (Photoshop, remove.bg, `rembg`).
- Skins must be **orthographic** (no perspective) with the **nose pointing right**, exactly like `assets/skins/muscle-*.png`.

```text
STYLE =
Low-poly 3D game art, flat-shaded faceted geometry, clean simple shapes, toy-like proportions, soft warm light with
gentle shadows, warm saturated colours (rust orange #E8553A, hazard yellow #FFC23D, mud brown #A47F57, grass green
#8CC063, charcoal #2A2C30), worn paint, rust patches, dents and rivets, no outlines, no photorealism, no watermark,
no text, no logos, no brand badges.
```

## Status

| Already in the game | Still missing (prompts below) |
|---|---|
| Logo, loading/menu art, arena dirt, pack banners, garage backdrop | `garage-bg-back.jpg` (other side of the garage; until then the backdrop is mirrored) |
| Menu renders of all 7 cars (`cars/`, cut out automatically) | Icons `radar`, `tank`, and a proper `mg2` (it is a copy of `mg` now) |
| Skins for Zwerfotto, Roestbak, Lijkotto | Skins for the 4 enemy types, 3 bosses and 4 pack cars |
| 22 part icons, HUD icons, fuel gauge + needle, pump icon, jerrycan | Gauge-cluster faces (`cluster-speedo`, `cluster-nitro`) |
| Hay bales, pump pad decal, fire trail | Pit entry art (`pit/gate.png`, `pit/driveway.jpg`) |
| Reference portraits of every enemy (`elites/`) | Showcase renders of the enemy cars (for a future "wanted" board) |

Built in 3D in code, no art needed: the gas pump (healthy, burning and wrecked), pallets, radio tower, tyre piles,
cones, ramps, the crane and the garage turntable.

---

## 1. Garage

```text
=== assets/garage-bg.jpg · 2560×1440 · garage backdrop (darkened by the game) ===
STYLE + Interior of a cluttered scrapyard workshop at night, seen from inside towards the back wall. Corrugated metal
walls with rust streaks, a pegboard full of wrenches and hammers, stacked black, red and white tyres, oil drums with
hazard stripes, a welding cart with a small orange spark glow, a rolling toolbox, an engine block hanging on a hoist
chain, a half-stripped rusty car on a lift at the left. A rolled-up garage door on the right shows the dusky junkyard
and floodlights outside. Warm hanging work lamps make pools of yellow light, the rest is in cool blue-grey shadow.
The centre is a darker, calm stretch of oil-stained concrete floor with faded yellow hazard lines, because a 3D car
turntable and interface panels sit on top. No people, no cars in the foreground, wide 16:9.
```

```text
=== assets/garage-bg-back.jpg · 2560×1440 (16:9) · the OTHER side of the same garage (back view of the car) ===
STYLE + The same cluttered scrapyard workshop at night as garage-bg.jpg, but seen from the opposite end: the camera
has turned around 180 degrees and looks at the wall that was behind the viewer. Same eye-level camera height, same
warm hanging work lamps and blue-grey shadows, same oil-stained concrete floor with faded yellow hazard bay lines
running towards the viewer, so the two images feel like one room. On this side: the big rolled-up garage door is now
at the LEFT edge, showing the dusky junkyard and floodlights outside; the yellow hydraulic car lift with its
hazard-striped posts is at the RIGHT edge. The back wall has a dirty office window with a dim desk lamp behind it, a
workbench with a vice and a grinder, a rack of scrap bumpers and doors, a tall shelf with jerrycans and spray cans, a
parts washer, a calendar-free notice board with blank papers, coiled air hoses and an old arcade-style vending machine.
The centre of the floor is open and calm (a car stands there in the game). No people, no cars in the foreground,
no text, no logos, wide 16:9.
```

## 2. Part icons (garage cards and slot chips)

All icons: **512×512, transparent**, one object, three-quarter view from slightly above, centred with a little margin,
on a plain flat light-grey background (removed afterwards). Same lighting for the whole set. The first three are
missing; the rest are already in the game, listed so you can regenerate the full set in one consistent style.

```text
=== assets/icons/radar.png · MISSING ===
STYLE + Game item icon: a small rusty radar dish antenna on a stubby mast with a riveted base plate, a hazard-yellow
rim on the dish and a tiny blinking green light, a jerrycan symbol painted on the base

=== assets/icons/tank.png · MISSING ===
STYLE + Game item icon: a dented spare fuel tank (long red steel jerry tank) strapped down with two worn leather
belts on a riveted bracket, brass filler cap, a yellow "+10 L" style dash pattern painted on the side (no readable text)

=== assets/icons/mg2.png · MISSING (now a copy of mg) ===
STYLE + Game item icon: a compact second machine-gun turret for a car boot: short twin barrels, a low round armoured
base with bolts, an ammo box with a hazard-yellow stripe on the back, a little rusty, smaller and lower than a roof turret

=== assets/icons/mg.png ===
STYLE + Game item icon: a roof-mounted machine-gun turret with a rotating base, long barrel, ammo box with yellow stripe
=== assets/icons/tesla.png ===
STYLE + Game item icon: a tesla coil on a car roof: copper coils on a dark base, a glowing pale-blue crystal on top
=== assets/icons/flame.png ===
STYLE + Game item icon: twin flamethrower nozzles on a bracket with a red fuel bottle, small orange flame tips
=== assets/icons/mines.png ===
STYLE + Game item icon: a rear mine dropper box with three round black mines with red lights
=== assets/icons/saw.png ===
STYLE + Game item icon: a big circular saw blade on a side arm, steel teeth, hazard-striped guard
=== assets/icons/v8.png ===
STYLE + Game item icon: a V8 engine with a chrome supercharger blower poking out of a car hood
=== assets/icons/rounds.png ===
STYLE + Game item icon: an open wooden crate of brass bullets with a stencilled star
=== assets/icons/cooler.png ===
STYLE + Game item icon: a finned gun cooler block with blue coolant hoses
=== assets/icons/plow.png ===
STYLE + Game item icon: a heavy front ram plough, angled steel blade with hazard stripes
=== assets/icons/bullbar.png ===
STYLE + Game item icon: a chunky tubular bull bar with bolts and dents
=== assets/icons/spikes.png ===
STYLE + Game item icon: a front grille covered in welded steel spikes
=== assets/icons/cage.png ===
STYLE + Game item icon: a welded roll cage of rusty steel tubes with a yellow X brace
=== assets/icons/plate.png ===
STYLE + Game item icon: a riveted steel door armour plate with scratches
=== assets/icons/skirts.png ===
STYLE + Game item icon: low side skirts with glowing orange edge strips
=== assets/icons/slicks.png ===
STYLE + Game item icon: one fat racing slick tyre on a black rim
=== assets/icons/spoiler.png ===
STYLE + Game item icon: a bolted-on rear spoiler, bent a little, hazard-yellow end plates
=== assets/icons/exhaust.png ===
STYLE + Game item icon: side exhaust pipes shooting short orange flames
=== assets/icons/nitro.png ===
STYLE + Game item icon: two blue nitro bottles with red valves and a pressure gauge
=== assets/icons/magnet.png ===
STYLE + Game item icon: a red horseshoe crane magnet hanging from a chain, with a few bolts stuck to it
=== assets/icons/ballast.png ===
STYLE + Game item icon: a grey concrete block with a rebar loop strapped down with chains
=== assets/icons/toolbox.png ===
STYLE + Game item icon: an open red toolbox with wrenches and a roll of duct tape
=== assets/icons/scrapbin.png ===
STYLE + Game item icon: a small rusty bin overflowing with bolts, nuts and gears
```

## 3. Car skins (painted 3D cars in the game)

A skin is two images that are wrapped on the in-game car: a **top view** (roof) and a **side view** (both flanks).
Rules for every skin:
- **Orthographic**, nose pointing **right**, car fills the whole frame edge to edge, **transparent background**.
- **Top** 1024 × (1024 × width ÷ length), e.g. 1024×512. Straight down, **no turret or roof weapons** (the game adds those).
- **Side** 1024 × about 330. Straight side profile with **empty wheel arches (no wheels)**; the game draws the wheels.
- Use the same car in both, same paint, same number.

When a pair is in `assets/skins/`, add its id to `SKINS` in `src/assets.js`.

```text
=== assets/skins/rust-top.png + rust-side.png · enemy: rammer ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A rusty olive-green (#7F8F3A) 1980s compact sedan rebuilt as a rammer: a heavy steel ram bar bolted across
the nose, mismatched primer-grey door, cracked windows, number 13 in a cream circle, mud splashes on the lower half.
[TOP: seen straight from above, no roof weapons] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/spit-top.png + spit-side.png · enemy: gunner ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A teal (#3F8A8F) boxy station wagon turned into a gunner car: welded mesh over the side windows, a mounting
plate on the roof, ammo boxes strapped to the luggage rack, purple paint splashes, number 07 in a cream circle.
[TOP: seen straight from above, no roof weapons] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/thief-top.png + thief-side.png · enemy: fuel thief ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A lime-green (#5FBF4A) small hot hatch with racing stripes, a red siphon hose coiled on the roof, two
stolen jerrycans strapped to the back, a cartoon fuel-drop sticker with a mask, number 66.
[TOP: seen straight from above] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/brute-top.png + brute-side.png · enemy: brute ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A mustard-yellow (#E0A92A) huge old pickup truck with armour plates welded over the doors, a cage over the
windows, a massive front bumper, chains in the bed, hazard stripes on the tailgate, number 99.
[TOP: seen straight from above] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/harvester-top.png + harvester-side.png · boss: De Pikdorser ===
STYLE + Orthographic game vehicle skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A golden-yellow (#E0B040) rusty combine harvester, enormous, with a wide rotating header in front, saw
blades bolted to the reel, straw stuck everywhere, a cab with cracked glass, hazard stripes on the corners.
[TOP: seen straight from above] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/monster-top.png + monster-side.png · boss: Den Dikken Bompa ===
STYLE + Orthographic game vehicle skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A purple (#7A3AB0) monster truck body lifted high on a chassis, flame decals, a roll cage, a skull-shaped
radiator grille, oversized empty wheel arches, number 1 in a cream star.
[TOP: seen straight from above] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/tow-top.png + tow-side.png · boss: De Takelwagen ===
STYLE + Orthographic game vehicle skin texture, nose pointing right, no perspective, fills the frame, transparent
background. An orange (#E8A020) heavy tow truck with an amber light bar on the cab, a winch and boom on the back with
a big steel hook, chains, hazard chevrons on the rear, dents and rust.
[TOP: seen straight from above] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/mini-top.png + mini-side.png · pack car: Mini Cooper (Britland) ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A red classic Mini derby car with a faded Union Jack roof, a roof rack with four yellow spotlights, mesh
over the rear windows, number 11 in a cream circle. Same car as assets/cars/mini.png.
[TOP: seen straight from above, no roof weapons] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/taxi-top.png + taxi-side.png · pack car: London taxi (Britland) ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A black London cab derby car with a yellow TAXI light box, a checkered stripe, a big chrome grille with a
bull bar, mesh windows, number 32. Same car as assets/cars/taxi.png.
[TOP: seen straight from above, no roof weapons] / [SIDE: straight side profile, empty wheel arches, no wheels]

=== assets/skins/f1-top.png + f1-side.png · pack car: Formula 1 (Da rappe wè) ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A battered red open-wheel formula car with a long nose, front and rear wings with hazard stripes, a halo
over the cockpit, number 1. Wheels outside the body are NOT drawn. Same car as assets/cars/f1.png.
[TOP: seen straight from above, no roof weapons] / [SIDE: straight side profile, no wheels]

=== assets/skins/safety-top.png + safety-side.png · pack car: Safety Car (Da rappe wè) ===
STYLE + Orthographic game car skin texture, nose pointing right, no perspective, fills the frame, transparent
background. A silver sports saloon safety car with an orange light bar, yellow-black hazard stripes, a roll cage, a
spoiler, number 0. Same car as assets/cars/safety.png.
[TOP: seen straight from above, no roof weapons] / [SIDE: straight side profile, empty wheel arches, no wheels]
```

## 4. Car showcase renders

Same framing as the menu cars (`assets/cars/*.png`): **960×520**, three-quarter front view from slightly above, the car
on a round patch of dirt with a few grass tufts, on a plain flat green background (the game cuts it out). Save them in
`assets/cars/` (enemies are not shown in a menu yet; they're for a future "wanted" board).

```text
=== assets/cars/rust.png ===
STYLE + Game vehicle showcase render, three-quarter front view from slightly above, centred on a round patch of dirt
with a few grass tufts, plain flat green background. The olive-green rammer sedan from rust-top/side: steel ram bar,
primer-grey door, number 13.
=== assets/cars/spit.png ===
STYLE + (same framing) The teal gunner station wagon: twin roof machine gun, window mesh, ammo boxes, number 07.
=== assets/cars/thief.png ===
STYLE + (same framing) The lime-green fuel thief hot hatch with a coiled red siphon hose and stolen jerrycans, number 66.
=== assets/cars/brute.png ===
STYLE + (same framing) The mustard armoured pickup brute with a massive bumper and chains, number 99.
```

## 5. HUD and pit entry

```text
=== assets/ui/cluster-speedo.png · 1024×1024 · transparent · then add 'cluster-speedo' to UI_ICONS ===
STYLE + Game HUD gauge face, front view, a round chrome-rimmed speedometer from an old rally car: black face, cream
numerals 0 to 240 in steps of 20, a red zone from 200 up, a small empty rectangular window low in the centre (for the
lap number), scratched glass, four bolts on the bezel. No needle (the game draws it).

=== assets/ui/cluster-nitro.png · 512×512 · transparent · then add 'cluster-nitro' to UI_ICONS ===
STYLE + Game HUD gauge face, front view, a small round nitro pressure gauge: black face, blue arc from empty to full,
the letters NOS small at the bottom, chrome bezel with two bolts, scratched glass. No needle.

=== assets/pit/gate.png · 1024×512 · transparent · then add 'gate' to PIT_ART ===
STYLE + Seen straight from above: a scrapyard entrance gate made of two rusty sliding chain-link panels with
hazard-striped steel posts and a warning light on each post, fills the frame, plain background removed.

=== assets/pit/driveway.jpg · 512×2048 · tiling vertically · then add 'driveway' to PIT_ART ===
STYLE + Seen straight from above: a muddy dirt driveway with deep tyre ruts, puddles, gravel, oil stains, the edges
lined with half-buried tyres, seamless top to bottom.
```
