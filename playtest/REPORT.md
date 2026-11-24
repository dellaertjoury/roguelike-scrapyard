# Scrapyard Derby: playtest report

Run date: 2026-11-24, on commit `c4ddd2a`. Headless Chrome with SwiftShader WebGL and three.js 0.170 served locally. Every number comes from the scripts in this folder. Most scripts run the real `update()` inside the page at a fixed 1/30 s step, so "game seconds" below are simulated time, not wall-clock time.

## Summary

Overall health is decent:
- 0 page errors and 0 console errors in 15 browser runs.
- No NaN positions, no car left the arena, and no tunnelling at realistic speeds.
- All 3000 generated levels were valid.
- Stats recompute correctly, pause and blur work, and the simulation cost is tiny.

The real problems are a physics trap, a dominant farming strategy, a slow GPU memory leak, and small-screen layout.

Top 5 to fix first:
1. H1: cars stuck inside ramps.
2. H2: whole-lap W+D drift combo.
3. M1: geometry leak.
4. M2: lap-end payout for enemies you never killed.
5. M4 and M5: narrow-screen HUD and garage layout.

## Findings by severity

### High

**H1. Cars get permanently stuck inside ramps.**
- What happens: `game.js:301` handles the ramp's back and sides by moving the car back to where it was last frame. Position fixes made after that ignore ramps: enemy separation (`game.js:534`) and the player/enemy overlap push (`game.js:545`). A car pushed into a ramp at ground level is moved "back" to a spot that is also inside the ramp, every frame, forever.
- Evidence:
  - Player placed at 4 spots inside a ramp, holding W: 150 of 150 frames still inside.
  - Enemy placed inside: 300 of 300 frames, moved 0 units.
  - Natural play, 360 game seconds: 25 enemies got stuck. The longest stayed 1117 frames and the player was stuck 68 frames.
  - Screenshot: `shots/enemy_stuck_inside_ramp.png`. Scripts: `physics.py`, `physics2.py`, `visuals.py`.
- Suggested fix: treat the ramp as a box and push the car out through its nearest face, or lift the car onto the ramp surface.

**H2. Holding W+D for a whole lap is one huge drift combo.**
- What happens: the drift is held 99% of the lap at x5. Points grow without limit (`game.js:475-476`) and every 160 points pays 1 scrap, with no cap (`game.js:192`).
- Evidence (`econ.py`, `econ2.py`):

  | Setup | Scrap | Points |
  |---|---|---|
  | Empty arena, one lap | 122–138 | about 20,000 |
  | Real lap 1, hatch | 148 | |
  | Real lap 2, hatch | 155 | |
  | Real lap 1, muscle | 159 | |
  | Real lap 2, muscle | 164 | |

  The bots took 0 hits on laps 1–2, against normal income of 20–25 scrap.
- Suggested fix: cap scrap per combo, make the multiplier decay when you just turn in circles, or pay drift scrap on a diminishing scale.

### Medium

**M1. GPU geometry leak.**
- What happens: removed models are never disposed: `scene.js:409` (part models), `scene.js:170` (obstacles and ramps), `scene.js:491` (player car).
- Evidence:
  - Geometry count over 6 runs: 910 → 1141 → 1358 → 1635 → 1886 → 2056 → 2314.
  - Per action: +9 per purchase, +9 per level-up, +17 back to the pits, +27 per new run, +64 per car swap.
  - Textures and shader programs stay flat. Scripts: `perf.py`, `flow.py`.
- Suggested fix: dispose removed groups' geometry and per-part materials, or cache part models.

**M2. Lap end pays scrap for enemies you never killed.**
- What happens: `endWave` calls `kill(e, false)` (`game.js:178`), which adds scrap directly (`game.js:175`).
- Evidence:

  | Laps | Passive bot (parked, no weapons) | Aggressive bot |
  |---|---|---|
  | 1–5 | 20, 25, 36, 65, 144 | 20, 24, 36, 107, 154 |
  | 10 | 227 | 848 |

  At lap 5 an untouched harvester plus 4 rust cars paid 44 scrap.
- Suggested fix: pay nothing for unkilled enemies, or at least not for the elite.

**M3. Crush-bounce chains on slow elites.**
- What happens: landing on a car bounces you back up (`game.js:337`), and every bounce pays airtime (`game.js:325-327`).
- Evidence (`physics2.py`):

  | Target | Bounces | Time | Extra scrap | Points |
  |---|---|---|---|---|
  | Parked harvester, lap 5 (950 HP) | 8 | 4.7 s | 15 | 3000 |
  | Monster, lap 10 | 7 | 4.1 s | 13 | |

  Chasing cars gave 0 bounces.
- Suggested fix: a crush cooldown per enemy, and no airtime pay for crush bounces.

**M4. HUD panels overlap on narrow screens** (`index.html:51`, `index.html:169`).
- 390x844: overlaps of 97x75 px and 46–67x75 px. The hull number is hidden and the heat label is clipped in fr, de, es and vls.
- 768x1024: overlap of 21x80 px.
- The HUD covers 24% of the screen at 390 px vs 6% at 1920 px.
- There are no touch controls (from reading `main.js`), so phones can open the game but not play it.

**M5. Garage blueprint chips cut off names; the garage overflows at 1366x800** (`index.html:147`, `index.html:152`).
- Chip names overflow in all 5 languages (for example 117 px of text in a 75 px box), and the chips stick out of the blueprint panel (379 > 357 px).
- "Next lap" is below the fold at 1366x800 (bottom at 829–848 px).

### Low

- **L1.** Harvester blades and the tow hook go through obstacles (`game.js:354-356`, `game.js:370-372`): 2 hits on a player behind a tyre stack.
- **L2.** The harvester comb reaches about 89 units ahead but its hitbox radius is 46. Brute and tow stick out about 12 units, the hatch about 5.5.
- **L3.** 54% of spawn markers appear off-screen, with no indicator (`game.js:139`).
- **L4.** Enemies can appear on top of a fast player: 1 in 126 spawns (`game.js:144` vs `game.js:498`).
- **L5.** Parking in a corner takes 1170 damage, the centre 2166, circling 1833.
- **L6.** The menu demo car reads `ECOL[10]`, which doesn't exist (`scene.js:600`). This is the only recurring warning.
- **L7.** From reading code: the `dt` cap means slow motion below 30 fps (`main.js:52`), and `collideStatic` does nothing when two centres coincide exactly (`d > 0`).

### Polish

- Floating texts freeze in pause, shop and game over, and aren't cleared on "Back to the pits".
- The lap banner sits just above the car.
- Wall bounces are bouncy but never trap you: 32 of 36 corner runs got clear within 4 s.

## Performance

Simulation (`perf.py`):

| Load | `update()` per frame |
|---|---|
| Lap 1 | 0.079 ms |
| Lap 15, 60 enemies, all weapons maxed | 0.48 ms (max 0.78) |

Caps hold: particles peaked at 335 of 900 and texts at 41.

Rendering:

| Measure | Value |
|---|---|
| Draw calls, normal lap | about 115 |
| Draw calls, heavy lap-15 scene | 957 (94k triangles) |
| SwiftShader render time | about 10 ms (not meaningful) |

Each enemy car is about 20 meshes, drawn twice because of shadows. Each obstacle tyre is its own mesh (`scene.js:176`).

From reading code: while drifting, the ground texture is re-uploaded up to 10 times a second (`scene.js:460`).

Enemy car models are reused properly; the only leak is M1.

## Score and economy

Part prices rise 14% per lap and 50% per part level.

| Lap | Average level-1 price |
|---|---|
| 1 | 16 |
| 5 | 25 |
| 10 | 37 |
| 15 | 48 |

Scrap per lap:

| Laps | Aggressive bot | Passive bot |
|---|---|---|
| 1–5 | 20, 24, 36, 107, 154 | 20, 25, 36, 65, 144 |
| 6–10 | 175, 296, 401, 609, 848 | 120, 135, 98, 218, 227 |
| 11–15 | 868, 888, 945, 1055, 1096 | 239, 175, 248, 330, 339 |

A fully maxed build costs 742 base scrap, about 1200–1450 at lap 5–8 prices. The aggressive bot reaches that by lap 8–9; the passive bot around lap 13.

Verdict: sane through lap 3, broken from lap 5 on. Items H2, M2 and M3 make it worse.

Ramp jumps pay 4 to 9 scrap and 340 to 730 points. The 9-scrap jump flies 424 units high. About 40 scrap per lap from ramp loops is an estimate.

Suggested fixes: steeper price scaling after lap 5, more ways to spend scrap, and fixing H2, M2 and M3.

## Readability

90 screenshots in `shots/read_*` cover 5 languages x 4 sizes x 4 screens, checked automatically by `readability.py`.
- Menu and game-over screens are clean everywhere.
- The HUD is clean at 1366 and 1920 px wide.
- Problems: M4 and M5.
- The arena reads well: obstacles, ramps and spawn markers are clear, though cars are small at 1366x800 (about 40–50 px).

## Tested and fine

- **Generation, 3000 seeds:** always 2 ramps and 12 obstacles, no overlaps, nothing blocking a jump. The ramp lip is at least 189 units from a wall and the landing point at least 126.
- **Spawns, 12,480 samples:** none inside obstacles, ramps or walls, and no failed spawn attempts.
- **Collisions:** no tunnelling even at 3000 units/s, and nothing pushed through a wall in 200 full-nitro rams. Obstacle and wall visuals match their hitboxes, and the player's side-saw blades are drawn exactly at their hitboxes.
- **Airborne:** hits only register below the set heights (blades and bullets below 20, monster shockwave below 12).
- **Elites:** monster slams stay inside the arena, kills during a move are clean, and killing the tow releases the hook. The elite order and HP by lap are as designed.
- **Flow:** pause, resume and blur work. Pressing Enter or Space after "Next lap" doesn't skip a lap. Dying in the air and dying at lap end are both handled. A new run resets everything that should reset, and the best score is saved.
- **Garage:** buying, levelling, replacing and the max-level refusal all work. An independent stat recompute matched exactly, and locked cards persist.
- **Console:** 0 errors. Warnings: L6, plus one expected ReadPixels stall per page load from the car portraits.

## Scripts

| Script | What it covers |
|---|---|
| `harness.py` | Shared launcher, error log, in-page sim stepper |
| `gen_spawn.py` | Level generation and spawn sampling |
| `physics.py`, `physics2.py` | Corners, tunnelling, ramps, stuck states, crush loop |
| `econ.py`, `econ2.py` | Drift farming, scrap per lap, prices, camping, lap-end payout |
| `elites.py` | Elite special moves and edge cases |
| `flow.py` | Pause, blur, garage, back to the pits, geometry growth per action |
| `perf.py` | Timing, caps, draw calls, memory across runs |
| `readability.py` | Screenshot matrix and layout checks |
| `visuals.py` | Screenshots of the stuck enemy and hitbox clips |
| `keys_spawnclose.py` | Real keyboard driving and spawns near a moving player |
| `warnstack.py` | Source of the colour warning |

The full set of 100 screenshots isn't committed (94 MB). Rerun `readability.py` and `visuals.py` to regenerate them; the 8 key screenshots are kept in `shots/`.

---

# Re-test (v2): fixes from this report

Re-run on commit `6e419db` with the same scripts plus `corner_ab.py`, `perf_ab.py`, `ramploop.py`, `v2_checks.py`, `cars_ab.py`, `arrows_hud.py`, `touch.py` and `gamespeed.py`. The previous version was served side by side for before/after numbers; old results are in `results_v1/`.

| Finding | Status | Before → after |
|---|---|---|
| H1 cars stuck in ramps | Fixed | 25 stuck enemies in 360 game s (longest 1117 frames) → 0; hand-placed stuck 150/150 and 300/300 frames → 0 |
| H2 W+D drift farming | Fixed | 148–164 scrap per lap → 27–33 (drift plus kills); about 20,000 points per lap → 3,300–4,500 |
| M1 geometry leak | Fixed | 910 → 2314 geometries over 6 runs → flat at 393–403; draw calls 114–120 → 41–52 (normal), 957 → 225 (heavy lap 15) |
| M2 pay for unkilled enemies | Fixed | 44 scrap at lap 5 → 0 |
| M3 crush chains | Fixed | 8 bounces and a kill on a parked Harvester → 1 bounce, no kill |
| M4 narrow-screen HUD | Partly → fixed in `daaab01` | overlaps gone at 768 px; at 390 px the boss panel covered the timer (N1) |
| M5 garage layout | Fixed | cut-off names 3–6 per language → 0; "Next lap" bottom 829–848 px → 756 px |
| L1 blades and hook through obstacles | Fixed | 2 hits behind a tyre stack → 0 |
| L2 Harvester comb | Fixed | caused double ram hits (N5), fixed in `daaab01` |
| L3 off-screen spawns | Fixed | arrows shown; some sat under HUD panels (N6), fixed in `daaab01` |
| L4 spawn on top of player | Fixed | closest spawn 36 → 211 units |
| L5 corner camping | Not changed | design choice |
| L6 colour warning | Fixed | gone |
| L7 slow motion | Partly → improved in `daaab01` | game speed at 6 fps 0.20 → 0.58 of real time; step cap raised to 0.25 s |

New issues found in the re-test, all fixed in `daaab01`:
- N1: boss panel over the timer on phones.
- N2: lap banner over the boss bar.
- N3: blueprint marker "5" used twice.
- N4: pause button overlapping the ▶ steer button.
- N5: Harvester rams counted twice.
- N6: edge arrows under HUD panels.
- N7: ramp jumps uncapped, so air-time scrap now shares the per-lap stunt cap with drifting.
- Polish: a hit didn't reset the combo timer, and the garage buttons wrapped on phones.

Economy after v2:

| Lap | Avg level-1 price | Passive scrap | Aggressive scrap |
|---|---|---|---|
| 1 | 16 | 18 | 20 |
| 5 | 28 | 98 | 177 |
| 10 | 57 | 211 | 879 |
| 15 | 115 | 203 | 1155 |

A passive player never maxes a build; an aggressive one fills it around lap 10. Still open: whether late laps need more ways to spend scrap.
