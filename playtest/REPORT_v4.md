# Ottokeirkhof v4 playtest (commit 6c209f2)

Tested on a pinned copy of 6c209f2 (`git archive` → /home/claude/okh_6c209f2), because HEAD moved during the run
(slower enemies, crane 45 dmg, purple shots, Klasse 2/3, new layout). Nothing in src/ or index.html was edited.
Re-run: `PORT=8765 playtest/v4_run.sh <script>`; scripts `playtest/v4_*.py`, in-page bot `v4_bot.js`,
results `results_v4_*.json`.

## Headline
Stable: 0 page/console errors, no NaN, no leaks, nothing ever left the arena. Pit entry, pump rules and the crane
warning all behave as specified.

## Findings
### High
- **H1 Real top speed is 33–36% above S.top** (game.js ~748): throttle is added before the soft cap, so cruise
  settles at (accel + 3·top)/3.12. Hatch 210 → 286 u/s (speedo 171 km/h, stats plate 126 km/u). Enemy SPEED_K and
  ram damage are tuned against the wrong number; head-on ram kills cost the hatch ~25 HP, and ramming bots died on
  lap 1. Fix: accelerate only below top, keep the soft pull-down for overspeed, retune.
- **H2 Line after GO not kept clear**: hand-over at (590,1147) heading -0.27 rad; exclusion is only a circle at the
  gate. 31% of throttle-held runs hit a pile/bale/barrier 0.7–1.4 s after GO. Fix: capsule exclusion along the
  hand-over heading, or end the intro pointing at the centre.
- **H3 Pause → garage = free lap skip + 20% heal**, also skips elite laps. Fix: no heal on quit, don't advance the
  lap / block during countdown and elite laps.

### Medium
- **M1 Thieves cut laps 6–10 by about a third**: unlimited re-hooks, instant hand-off between thieves. 17–22 L stolen
  per lap at laps 6–10. Fix: one theft per thief, global cooldown, or a per-lap cap.
- **M2 Kraanmagneet does nothing for income**: endWave/quitLap bank all scrap left on the ground.
- **M3 Crane warning sign covers the car** for the 2 s you need to dodge (380×440 at 1366×800).
- **M4 Crane can't reach 42% of the arena** (bottom-right is always safe); crane kills pay full scrap.
- **M5 Landing on a spawn marker can hit you 2–4 times** (mean 40 dmg parked); overlapping markers double-hit.
- **M6 Garage tooltips off-screen on phones; rear chip name truncated.**
- **M7 Phone HUD (390×844)**: hull number cut, boss bar overlaps plates, countdown overlaps the gauges.

### Low
L1 grip spike on the hand-over frame (slideT set after physics) · L2 a lethal hit on the frame the tank empties
sends you to the garage alive · L3 cars poke ≤6 u into the wall band · L4 free drift heat/nitro during the intro ·
L5 G.filling not reset per lap · L6 pausing in the countdown shows the GO sign · L7 ground texture re-uploads ~2×/s
(fadeMarks) · L8 no icons for radar/tank · L9 a few cones inside obstacles, spawnSpot ignores the pump post ·
L10 stale fuel comment.

## Economy (laps 1–10, invulnerable kiting bot, 6 runs)
| Lap | Lap s | Scrap | Wrecks | Pump laps | Stolen L | Parts bought | Median price |
|---|---|---|---|---|---|---|---|
| 1 | 40 | 11.7 | 11 | 2/6 | 0 | 0.3 | 13 |
| 3 | 46 | 25.7 | 17 | 4/6 | 5.5 | 1.2 | 19 |
| 5 | 38 | 76.8 | 38 | 4/6 | 26.3 | 2.3 | 27.5 |
| 7 | 29 | 63 | 45 | 3/6 | 24.4 | 1.5 | 28 |
| 10 | 20 | 59.7 | 38 | 2/6 | 25.3 | 1.2 | 42 |

Pump laps earn 2.4–2.9× more scrap, so Nafteradar is the strongest economy buy. Spread per car is large: over 10
laps the hatch earned 110–198, the muscle 360–479, the hearse 754–1049.

## Performance
update() 2.3 ms avg / 3.1 ms max with 48 cars and every weapon; 465–505 draw calls (~8 per car) in that scene,
112–286 on normal laps. Geometries flat at 338 across spawn/kill cycles; heap 22–25 MB over 8 laps.
