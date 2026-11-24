# Scrapyard Derby: playtest v3 (commit 09fc4d9)

32 browser runs: 0 page errors, 0 console errors, no NaN positions, no leaks. The fuel rules work as written: each pump gives exactly 20 L, the clock can't be frozen, and nitro burns 2 L/s.

## Checking the v2 fixes
- N2–N7, combo reset, garage footer on phones, game speed at low fps: all fixed.
- **N1 is back (now H1):** the painted gauge made the fuel panel taller, so `#bossPnl` now covers the fuel number at every screen size.

## New findings
- **H1:** the boss panel covers the fuel readout on elite laps (`index.html:76`, `:199`).
- **M1:** pumps have no limit per lap, so laps stretch to 160–200 s. The pump-camper bot earns 2.1× the scrap on laps 1–3 and 58% more over 15 laps.
- **M2:** fuel thieves have no limit. Five thieves can take 30 L in one frame, and being robbed works as a lap skip.
- **M3:** on phones (390 px) the scrap panel covers the "LAP n" label, the French hull text is cut off, and the heat label is cut off in every language.
- **L1:** 4 unexpected 404s: `ui/speed`, `lock`, `repair` and `reroll.png` (`assets.js:7`).
- **L2:** pumps can open on a ramp's run-up or landing strip (about 4% of pumps).
- **L3:** jerrycans high up on a ramp can't be picked up.
- **L4:** edge arrows and the pump badge are drawn over HUD panels at 1366 px.
- **L5:** the 18 px meter icons are clipped by 12 px bars, and white text on the yellow and blue bars is hard to read.
- **L6:** nothing tells you when a pump opens: the `pumpOpen` string exists but is never shown.
- **L7:** each jerrycan costs its own draw call.
- **L8:** small physics leftovers: an enemy pinned on a ramp for 65 frames, and brief overlaps with the pump post. All clear by themselves.

## Economy (scrap per run, laps 1–15)
| Bot | Passive | Aggressive | Drift | Ramp | Shop | Pump camper |
|---|---|---|---|---|---|---|
| Total scrap | 1049 | 8336 | 1087 | 552 | 2405 | 3799 |
| Scrap per minute | 119 | 556 | 117 | 67 | 256 | 261 |

## Performance
- `update()` takes a mean of 0.73 ms in the heavy scene (max 1.57 ms).
- Draw calls: 22–108 on normal laps, 160 in the heavy scene, 486 in the worst case. Each car costs about 7.
- No leaks over an 8-minute session.
