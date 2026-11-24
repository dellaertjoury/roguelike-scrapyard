// v4 in-page bot + metrics helpers. Installed as window.BOT by the v4_* scripts.
(() => {
  const m = M, G = m.G;
  const ang = (a, b) => m.angDiff(a, b);
  const BOT = {};
  // drive toward (tx, ty): returns key list
  BOT.steerTo = (tx, ty, opt = {}) => {
    const P = G.P, want = Math.atan2(ty - P.y, tx - P.x), d = ang(want, P.a), keys = [];
    if (d > .08) keys.push('KeyD'); else if (d < -.08) keys.push('KeyA');
    const dist = Math.hypot(tx - P.x, ty - P.y);
    if (Math.abs(d) < 1.6 || P.sp < 60) keys.push('KeyW'); else keys.push('KeyS');
    if (opt.hb && Math.abs(d) > 1.0 && P.sp > 120) keys.push('Space');
    if (opt.nitro && Math.abs(d) < .3 && P.nitro > .3 && dist > 250) keys.push('ShiftLeft');
    return keys;
  };
  // avoid obstacles a little: if an obstacle is right ahead, aim to the side
  BOT.avoid = (tx, ty) => {
    const P = G.P, fx = Math.cos(P.a), fy = Math.sin(P.a);
    for (const o of G.obs) {
      const dx = o.x - P.x, dy = o.y - P.y, ahead = dx * fx + dy * fy, side = -dx * fy + dy * fx;
      if (ahead > 0 && ahead < 160 && Math.abs(side) < o.r + P.r + 10) { const s = side > 0 ? -1 : 1; return [P.x + fx * 120 - fy * s * 120, P.y + fy * 120 + fx * s * 120] }
    }
    // keep off walls
    const lo = 120; let x = tx, y = ty;
    x = Math.max(lo, Math.min(m.AW - lo, x)); y = Math.max(lo, Math.min(m.AH - lo, y));
    return [x, y];
  };
  BOT.craneEscape = () => { // during warning: move radially away from the arc if inside the band
    const C = G.crane, P = G.P; if (!C || (C.st !== 'warn' && C.st !== 'swing')) return null;
    const dx = P.x - m.CRANE.x, dy = P.y - m.CRANE.y, d = Math.hypot(dx, dy);
    if (Math.abs(d - C.R) > m.CRANE.ball + P.r + 60) return null;
    const s = d > C.R ? 1 : -1, tx = P.x + dx / d * s * 300, ty = P.y + dy / d * s * 300;
    return [tx, ty];
  };
  BOT.plan = (mode) => {
    const P = G.P; let t = null, opt = { hb: true };
    const esc = BOT.craneEscape(); if (esc) return BOT.steerTo(...BOT.avoid(...esc), { nitro: true });
    if (mode !== 'nopump' && G.pump && !G.pump.empty && G.fuel < G.tank - 3) t = [G.pump.x, G.pump.y];
    else if (mode !== 'nopump' && !G.pump && G.pumpNext && G.fuel < G.tank - 6) t = [G.pumpNext.x, G.pumpNext.y];
    // grab a jerrycan
    if (!t && G.cans.length) { const c = G.cans[0]; if (Math.hypot(c.x - P.x, c.y - P.y) < 500) t = [c.x, c.y] }
    // kill thieves first (they hold fuel), then nearest
    if (!t) {
      let best = null, bd = 1e9;
      for (const e of G.enemies) { const d = Math.hypot(e.x - P.x, e.y - P.y) * (e.type === 'thief' ? .4 : 1); if (d < bd) { bd = d; best = e } }
      if (best && mode !== 'passive' && mode !== 'kite') { t = [best.x + best.vx * .3, best.y + best.vy * .3]; opt.nitro = best.type === 'thief' || best.hose }
    }
    if (!t && mode === 'kite') {
      BOT.k = BOT.k || 0; const wa = BOT.k * Math.PI / 4, wx = m.AW / 2 + Math.cos(wa) * 720, wy = m.AH / 2 + Math.sin(wa) * 440;
      if (Math.hypot(wx - P.x, wy - P.y) < 170) BOT.k = (BOT.k + 1) % 8;
      t = [wx, wy];
      // swerve around cars right ahead
      const fx = Math.cos(P.a), fy = Math.sin(P.a);
      for (const e of G.enemies) { const dx = e.x - P.x, dy = e.y - P.y, ah = dx * fx + dy * fy, sd = -dx * fy + dy * fx; if (ah > 0 && ah < 170 && Math.abs(sd) < 50) { const s2 = sd > 0 ? -1 : 1; t = [P.x + fx * 150 - fy * s2 * 140, P.y + fy * 150 + fx * s2 * 140]; break } }
      return BOT.steerTo(...BOT.avoid(...t), { hb: false });
    }
    if (!t) { BOT.wp = BOT.wp && Math.hypot(BOT.wp[0] - P.x, BOT.wp[1] - P.y) > 120 ? BOT.wp : [200 + Math.random() * (m.AW - 400), 200 + Math.random() * (m.AH - 400)]; t = BOT.wp }
    return BOT.steerTo(...BOT.avoid(...t), opt);
  };
  // run n frames with the bot driving
  BOT.run = (n, mode, each) => {
    for (let i = 0; i < n; i++) {
      if (G.state === 'pause') G.state = 'play';
      if (G.state !== 'play') { m.update(1 / 30); if (each && each(i) === false) break; continue }
      G.keys = {}; if (G.startT <= 0 && !G.P.intro) for (const k of BOT.plan(mode)) G.keys[k] = true;
      m.update(1 / 30);
      if (each && each(i) === false) break;
    }
    if (G.state === 'play') G.state = 'pause';
  };
  // garage AI: buy the cheapest useful things, weapons first
  BOT.shop = (pref) => {
    const order = pref || ['mg', 'tank', 'cage', 'v8', 'rounds', 'cooler', 'magnet', 'radar', 'plate', 'saw', 'tesla', 'plow', 'toolbox', 'scrapbin', 'spoiler', 'slicks', 'nitro', 'bullbar', 'spikes', 'flame', 'mines', 'exhaust', 'skirts', 'ballast'];
    let bought = [], guard = 0;
    while (guard++ < 20) {
      const cands = G.offer.map((it, i) => ({ it, i })).filter(({ it }) => !it.sold && m.price(it) <= G.scrap).sort((a, b) => order.indexOf(a.it.id) - order.indexOf(b.it.id));
      if (!cands.length) { if (G.P.hp < G.S.maxhp * .5 && m.repair()) { bought.push('repair'); continue } break }
      const { it, i } = cands[0]; const p = m.price(it); if (m.buy(i)) bought.push(it.id + ':' + p);
    }
    return bought;
  };
  window.BOT = BOT;
})();
