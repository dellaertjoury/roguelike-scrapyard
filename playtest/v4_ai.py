# v4 enemy driver metrics: heading toward player, stuck / pinned, wedged in corners or tyre piles,
# leaving the arena, overlaps, ramp-follow rate after the player jumps.
import asyncio, json, os
from playwright.async_api import async_playwright
from harness import open_game
BOTJS = open(os.path.join(os.path.dirname(__file__), 'v4_bot.js')).read()

AI = r"""
({ lap, frames, mode, seed }) => {
  const m = M, G = m.G, { AW, AH, EDGE } = m;
  m.start(1); G.state = 'pause'; G.wave = lap - 1; m.nextWave(); G.state = 'pause';
  G.startT = 0; G.P.intro = false; G.P.x = 1000; G.P.y = 900; G.P.vx = G.P.vy = 0;
  G.S.maxhp = G.P.hp = 1e9; G.crane.t = 1e9; G.pumpT = 1e9;
  const st = { frames: 0, enemyFrames: 0, towardP: 0, towardP_far: 0, farFrames: 0, outside: 0, inObs: 0, deepObs: 0, inRampBody: 0, overlapE: 0, revFrames: 0, pinTriggers: 0, stuckTriggers: 0,
    stuckEpisodes: [], cornerEpisodes: [], speedRatio: [], jumps: 0, eligible: 0, followed: 0, enemyAirborne: 0, maxCount: 0, nan: 0, examples: [] };
  const tr = new Map(); // per-enemy track
  let rampTarget = null, lastJump = -9, jumpEval = [];
  const rampMode = mode === 'ramp';
  for (let f = 0; f < frames; f++) {
    G.fuel = 30; G.P.hp = 1e9;
    G.keys = {};
    // player: wander (BOT) or ramp loop
    let keys;
    if (rampMode) {
      if (!rampTarget) { const r = G.ramps[(Math.random() * G.ramps.length) | 0]; rampTarget = { r, ph: 0 } }
      const r = rampTarget.r, ax = r.x - r.c * 260, ay = r.y - r.s * 260;
      if (rampTarget.ph === 0) { keys = BOT.steerTo(...BOT.avoid(ax, ay)); if (Math.hypot(G.P.x - ax, G.P.y - ay) < 60) rampTarget.ph = 1 }
      else { keys = BOT.steerTo(r.x + r.c * r.L, r.y + r.s * r.L); if (G.P.air || Math.hypot(G.P.x - r.x, G.P.y - r.y) > 700) { rampTarget.ph = 2 } }
      if (rampTarget.ph === 2 && !G.P.air) rampTarget = null;
    } else keys = BOT.plan('passive');
    for (const k of keys) G.keys[k] = true;
    const wasAir = G.P.air;
    G.state = 'play'; m.update(1 / 30); if (G.state !== 'play') break; G.state = 'pause';
    const P = G.P;
    if (!wasAir && P.air && G.chaseRamp && G.chaseRamp.t > G.time - .05) { // player just launched off a ramp
      st.jumps++; const r = G.chaseRamp.r;
      const el = G.enemies.filter(e => !e.elite && (e.type === 'rust' || e.type === 'brute') && e.follows && Math.hypot(e.x - (r.x - r.c * 130), e.y - (r.y - r.s * 130)) < 700);
      st.eligible += el.length; jumpEval.push({ t: G.time, r, set: new Set(el), got: new Set() });
    }
    for (const j of jumpEval) for (const e of j.set) if (e.air && !j.got.has(e) && e.rampRef === null && Math.hypot(e.x - (j.r.x + j.r.c * j.r.L), e.y - (j.r.y + j.r.s * j.r.L)) < 300) j.got.add(e);
    jumpEval = jumpEval.filter(j => { if (G.time - j.t > 4) { st.followed += j.got.size; return false } return true });
    // keep the arena busy
    if (G.enemies.length + G.pend.length < 18) G.spawnT = Math.min(G.spawnT, .05);
    st.frames++; st.maxCount = Math.max(st.maxCount, G.enemies.length);
    for (const e of G.enemies) {
      st.enemyFrames++;
      if (!isFinite(e.x) || !isFinite(e.y)) st.nan++;
      if (e.air) st.enemyAirborne++;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const mv = Math.hypot(e.vx, e.vy), va = Math.atan2(e.vy, e.vx);
      if (mv > 20 && Math.abs(m.angDiff(va, a)) < Math.PI / 4) st.towardP++;
      if (d > 300) { st.farFrames++; if (mv > 20 && Math.abs(m.angDiff(va, a)) < Math.PI / 4) st.towardP_far++ }
      if (e.x < EDGE + e.r - 1 || e.x > AW - EDGE - e.r + 1 || e.y < EDGE + e.r - 1 || e.y > AH - EDGE - e.r + 1) { st.outside++; if (st.examples.length < 8) st.examples.push({ k: 'outside', x: e.x|0, y: e.y|0, t: e.type }) }
      for (const o of G.obs) { if (e.z >= (o.h || 26)) continue; const pen = o.r + e.r - Math.hypot(e.x - o.x, e.y - o.y); if (pen > 1) st.inObs++; if (pen > 8) { st.deepObs++; if (st.examples.length < 8) st.examples.push({ k: 'deepObs', pen: +pen.toFixed(1), ok: o.k, t: e.type }) } }
      for (const r of G.ramps) { const ux = e.x - r.x, uy = e.y - r.y, u = ux * r.c + uy * r.s, v = -ux * r.s + uy * r.c; if (u > 2 && u < r.L - 2 && Math.abs(v) < r.W / 2 - 2 && r.H * u / r.L > e.z + 9) st.inRampBody++ }
      if (e.rev > 0) st.revFrames++;
      let T = tr.get(e); if (!T) { T = { hist: [], stuck: 0, corner: 0, pin0: 0, rev0: 0, type: e.type }; tr.set(e, T) }
      T.hist.push([e.x, e.y]); if (T.hist.length > 60) T.hist.shift();
      if (T.hist.length === 60) { const [x0, y0] = T.hist[0]; const moved = Math.hypot(e.x - x0, e.y - y0); if (moved < 30 && !(e.hose) && d > 120) T.stuck++; else { if (T.stuck > 30) st.stuckEpisodes.push({ frames: T.stuck + 60, t: e.type, x: e.x|0, y: e.y|0, d: d|0 }); T.stuck = 0 } }
      const nc = Math.min(e.x, AW - e.x) < 130 && Math.min(e.y, AH - e.y) < 130;
      if (nc) T.corner++; else { if (T.corner > 90) st.cornerEpisodes.push({ frames: T.corner, t: e.type }); T.corner = 0 }
      if ((e.rev || 0) > 0 && !T.wasRev) { if ((e.pinT || 0) === 0 && T.lastPin > 1.1) st.pinTriggers++; else st.stuckTriggers++ } T.wasRev = (e.rev || 0) > 0; T.lastPin = e.pinT || 0;
      if (!e.elite && e.spd) st.speedRatio.push(mv / G.P.sp);
    }
    const E = G.enemies; for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) { const a = E[i], b = E[j]; if (Math.abs(a.z - b.z) < 14 && Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * .7) st.overlapE++ }
  }
  for (const [e, T] of tr) { if (T.stuck > 30) st.stuckEpisodes.push({ frames: T.stuck + 60, t: T.type, x: e.x|0, y: e.y|0, open: true }); if (T.corner > 90) st.cornerEpisodes.push({ frames: T.corner, t: T.type, open: true }) }
  const sr = st.speedRatio.filter(isFinite); st.speedRatio = null;
  const top = { playerTopStat: G.S.top, enemySpd: [...new Set(G.enemies.map(e => e.type + ':' + Math.round(e.spd)))] };
  return { lap, mode, frames: st.frames, enemyFrames: st.enemyFrames, maxCount: st.maxCount,
    towardP_pct: +(100 * st.towardP / st.enemyFrames).toFixed(1), towardP_far_pct: +(100 * st.towardP_far / Math.max(1, st.farFrames)).toFixed(1),
    outside: st.outside, inObsFrames: st.inObs, deepObsFrames: st.deepObs, inRampBodyFrames: st.inRampBody, overlapEnemyPairs: st.overlapE, nan: st.nan,
    revPct: +(100 * st.revFrames / st.enemyFrames).toFixed(1), pinTriggers: st.pinTriggers, stuckTriggers: st.stuckTriggers,
    stuckEpisodes: st.stuckEpisodes.length, stuckLongest: st.stuckEpisodes.sort((a, b) => b.frames - a.frames).slice(0, 5),
    cornerEpisodes: st.cornerEpisodes.length, cornerLongest: st.cornerEpisodes.sort((a, b) => b.frames - a.frames).slice(0, 3),
    jumps: st.jumps, eligibleFollowers: st.eligible, followed: st.followed, enemyAirFrames: st.enemyAirborne, top, examples: st.examples,
    playerMeanSpeed: null };
}
"""

async def main():
    async with async_playwright() as pw:
        b, g = await open_game(pw, 'v4ai')
        await g.ev(BOTJS)
        out = []
        for lap, mode in [(3, 'wander'), (6, 'wander'), (9, 'wander'), (6, 'ramp'), (9, 'ramp')]:
            r = await g.ev(AI, {'lap': lap, 'frames': 2700, 'mode': mode, 'seed': 1})
            print(json.dumps(r)); out.append(r)
        await g.shot('v4_ai_end.png')
        json.dump({'runs': out, 'errs': g.errs}, open('results_v4_ai.json', 'w'), indent=1)
        print('ERRS', g.errs)
        await b.close()
asyncio.run(main())
