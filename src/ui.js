// DOM side: loading screen, language picker, menus, garage, game over, HUD, floating numbers.
import { G, price, lvlOf, nameOf, descOf, buy, reroll, toggleLock, nextWave, fmt, fmtL, repair, repairCost } from './game.js';
import { CARS, PART, SLOTS, TAGC, PACKS } from './data.js';
import { LANGS, t, L, lang, setLang } from './i18n.js';
import { A } from './assets.js';

const $ = id => document.getElementById(id);
const set = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OVS = ['menu', 'shop', 'over', 'pause'];
const tr = v => Array.isArray(v) ? t(v[0], v[1]) : v; // banner parts are [key, vars]

export function show(id) {
  for (const o of OVS) $(o).classList.toggle('hide', o !== id);
  $('hud').classList.toggle('hide', !(id === null || id === 'pause'));
}

/* ---------- loading screen ---------- */
let tipI = 0, tipTimer = null;
export function loading(p) { $('loadBar').style.width = Math.round(p * 100) + '%'; set($('loadPct'), Math.round(p * 100) + '%') }
export function loadingText() {
  set($('loadMsg'), t('loading'));
  set($('loadTip'), L().tips[tipI % L().tips.length]);
  clearInterval(tipTimer); tipTimer = setInterval(() => { tipI++; set($('loadTip'), L().tips[tipI % L().tips.length]) }, 3200);
}
export function hideLoading() { clearInterval(tipTimer); const el = $('loading'); el.classList.add('done'); setTimeout(() => el.remove(), 600) }

/* ---------- static text, icons, language ---------- */
export function applyStatic() {
  document.title = t('title');
  for (const [id, key] of [['gface', 'fuel-gauge'], ['needle', 'fuel-needle']]) { const src = A.ui[key]; if (src) { $(id).classList.add('art'); $(id).style.setProperty('--art', `url(${src})`) } }
  if (A.ui['fuel-gauge'] && A.ui['fuel-needle']) $('gface').parentElement.classList.add('art');
  if (A.ui.pump) pbadge.src = A.ui.pump;
  for (const el of document.querySelectorAll('[data-i18n]')) set(el, t(el.dataset.i18n));
  for (const el of document.querySelectorAll('[data-ui]')) {
    const src = A.ui[el.dataset.ui];
    if (src && !el.querySelector('img.uico')) el.insertAdjacentHTML('afterbegin', `<img class="uico" src="${src}" alt="">`);
  }
}
function renderLangs() {
  $('langs').innerHTML = `<span class="lbl">${esc(t('lang'))}</span>` + LANGS.map(l =>
    `<button class="lang${l.id === lang() ? ' on' : ''}" data-lang="${l.id}" aria-pressed="${l.id === lang()}">${l.name}</button>`).join('');
}

/* ---------- menu ---------- */
let best = null, portraits = [];
const loadBest = () => { try { best = JSON.parse(localStorage.getItem('scrapyard-best')) } catch (e) { best = null } };
const partName = id => { const d = PART[id]; return d.w ? L().w[d.w][0] : L().parts[id][0] };
export function buildMenu(p) {
  if (p) portraits = p;
  loadBest();
  const logo = A.logos[lang()] || A.logos.en;
  $('title').innerHTML = logo ? `<img src="${logo}" alt="${esc(t('title'))}">` : esc(t('title'));
  if (A.menuBg) $('menu').style.backgroundImage = `linear-gradient(rgba(24,26,30,.2),rgba(24,26,30,.45) 45%,rgba(24,26,30,.82)),url(${A.menuBg.src})`;
  set($('bestLine'), best ? t('best', { lap: best.wave, score: fmt(best.score) }) : t('pick'));
  const C = L().cars;
  $('cars').innerHTML = CARS.map((c, i) => `
    <button class="car" data-i="${i}">
      <img src="${A.cars[c.id] || portraits[i]}" alt="">
      <b>${esc(C[c.id][0])}</b>
      <span class="d">${esc(C[c.id][1])}</span>
      ${L().stat.map((l, k) => `<span class="bar"><span>${esc(l)}</span><i style="--w:${c.bars[k]}%"></i></span>`).join('')}
      <span class="d">${esc(t('startsWith', { w: Object.values(c.build).map(b => partName(b[0])).join(', ') }))}</span>
    </button>`).join('');
  $('packs').innerHTML = `<div class="lbl">${esc(t('packsTitle'))}</div><div class="grid2">` + PACKS.map(pk => {
    const [name, desc, cars] = L().packs[pk.id];
    const bg = A.packs[pk.id] ? `background-image:linear-gradient(90deg,rgba(24,26,30,.9),rgba(24,26,30,.35)),url(${A.packs[pk.id]})` : `background-image:linear-gradient(120deg,${pk.colors[0]},${pk.colors[1]})`;
    return `<div class="pack" style="${bg}" aria-disabled="true"><span class="soon">${esc(t('soon'))}</span><b>${esc(name)}</b><span class="d">${esc(desc)}</span>
      <span class="chips">${cars.map((c, k) => { const src = A.cars[pk.cars[k]]; return `<span class="pc">${src ? `<img src="${src}" alt="">` : ''}${esc(c)}</span>` }).join('')}</span></div>`;
  }).join('') + '</div>';
  renderLangs(); applyStatic();
}

/* ---------- garage ---------- */
const icon = (id, cls = 'ico') => {
  const d = PART[id], src = A.icons[id];
  return `<span class="${cls}" style="--c:${TAGC[d.tag]}">${src ? `<img src="${src}" alt="">` : `<span>${esc(partName(id)[0])}</span>`}</span>`;
};
const lockSvg = on => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 ${on ? '8 0v3' : '7.5-1.5'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

// Blueprint: top-down car outline (front up) with a numbered marker on each slot,
// and a list underneath so part names are never cut off, in any language.
const BP = { front: [180, 58], hood: [180, 118], roof: [180, 218], sides: [118, 218], trunk: [180, 318], rear: [180, 382] };
function renderBlueprint() {
  const marks = SLOTS.map((s, i) => { const [x, y] = BP[s]; return `<g class="mk${G.build[s] ? ' on' : ''}" data-slot="${s}"><circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y + 5}">${i + 1}</text></g>` }).join('')
    + `<g class="mk${G.build.sides ? ' on' : ''}" data-slot="sides"><circle cx="242" cy="218" r="13"/><text x="242" y="223">6</text></g>`;
  const svg = `<svg viewBox="80 40 200 360" aria-hidden="true">
    <g class="car-o"><rect x="113" y="100" width="14" height="48" rx="4"/><rect x="233" y="100" width="14" height="48" rx="4"/>
    <rect x="113" y="290" width="14" height="48" rx="4"/><rect x="233" y="290" width="14" height="48" rx="4"/>
    <rect x="125" y="68" width="110" height="304" rx="30"/><rect x="138" y="165" width="84" height="108" rx="12"/>
    <line x1="140" y1="160" x2="220" y2="160"/><line x1="140" y1="280" x2="220" y2="280"/>
    <rect x="132" y="60" width="96" height="8" rx="3"/><rect x="132" y="372" width="96" height="8" rx="3"/></g>${marks}</svg>`;
  const rows = SLOTS.map((s, i) => {
    const b = G.build[s];
    return `<li class="bprow${b ? ' on' : ''}" data-slot="${s}"><span class="num">${i + 1}</span>
      <span class="sl"><span class="sn">${esc(L().slots[s])}</span><span class="pn${b ? '' : ' empty'}">${b ? esc(partName(b.id)) : esc(t('empty'))}</span></span>
      ${b ? `${icon(b.id, 'ico xs')}<span class="lv">Lv ${b.lvl}/${PART[b.id].max}</span>` : ''}</li>`;
  }).join('');
  $('blueprint').innerHTML = `<div class="bpwrap">${svg}</div><ol class="bplist">${rows}</ol>`;
}
export function renderShop() {
  set($('shopTitle'), t('garage', { n: G.wave }));
  set($('shopScrap'), t('scrapAmt', { n: fmt(G.scrap) }));
  $('cards').innerHTML = G.offer.map((it, i) => {
    const d = PART[it.id], p = price(it), col = TAGC[d.tag], poor = p > G.scrap, l = lvlOf(it), cur = G.build[d.slot];
    const note = it.sold ? t('fitted') : l ? (l >= d.max ? t('maxed') : t('upTo', { n: l + 1 })) : cur ? t('replaces', { x: partName(cur.id) }) : '';
    return `<div class="card${it.sold ? ' sold' : ''}${it.locked ? ' locked' : ''}${poor && !it.sold ? ' poor' : ''}${cur && !l && !it.sold ? ' swap' : ''}" data-i="${i}" data-slot="${d.slot}" role="button" tabindex="${it.sold ? -1 : 0}" aria-disabled="${!!it.sold || poor}">
      ${icon(it.id)}
      <span class="cbody"><span class="tag"><b style="color:${col}">${esc(L().tags[d.tag])}</b> · ${esc(L().slots[d.slot])}</span>
      <b class="nm">${esc(nameOf(it))}</b><span class="d">${esc(descOf(it))}</span>${note ? `<span class="note">${esc(note)}</span>` : ''}</span>
      <span class="cside"><span class="price">${it.sold ? '✓' : esc(t('price', { p }))}</span>
      ${it.sold ? '' : `<button class="lockbtn" data-lock="${i}" aria-pressed="${!!it.locked}" title="${esc(it.locked ? t('locked') : t('lock'))}">${lockSvg(it.locked)}<span>${esc(it.locked ? t('locked') : t('lock'))}</span></button>`}</span></div>`;
  }).join('');
  set($('reroll'), t('reroll', { c: G.rerollCost })); $('reroll').disabled = G.scrap < G.rerollCost;
  set($('repair'), t('repair', { c: repairCost() })); $('repair').disabled = G.scrap < repairCost() || G.P.hp >= G.S.maxhp;
  set($('lockHint'), t('lockHint'));
  renderBlueprint();
  const { S, P } = G, st = L().st;
  const rows = [[st[0], `${Math.ceil(P.hp)} / ${S.maxhp}`], [st[1], `${Math.round(S.top * .36)} ${t('kmh').toLowerCase()}`], [st[2], S.grip.toFixed(1)],
    [st[3], Math.round(Math.min(.7, S.armor) * 100) + '%'], [st[4], (S.ram * S.mass).toFixed(2) + '×'], [st[5], S.ramGuard.toFixed(2) + '×'],
    [st[6], S.dmg.toFixed(2) + '×'], [st[7], S.rate.toFixed(2) + '×'], [st[8], S.regen.toFixed(1) + ' /s'], [st[9], fmt(S.magnet)]];
  $('build').innerHTML = `<h3>${esc(L().cars[P.car.id][0])}</h3>${rows.map(([a, b]) => `<div class="stat"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}`;
}
export function openShop() {
  if (A.garageBg) $('shop').style.backgroundImage = `linear-gradient(rgba(24,26,30,.75),rgba(24,26,30,.9)),url(${A.garageBg.src})`;
  renderShop(); show('shop');
}

export function showOver() {
  loadBest();
  const nb = !best || G.score > best.score;
  if (nb) try { localStorage.setItem('scrapyard-best', JSON.stringify({ wave: G.wave, score: G.score })) } catch (e) { }
  set($('wreckedTxt'), t('wrecked'));
  $('overStats').innerHTML = `${esc(t('reached', { lap: G.wave, car: L().cars[G.P.car.id][0] }))}<br>${esc(t('overLine', { w: fmt(G.wrecks), d: fmt(G.bestDrift), s: fmt(G.score) }))}${nb ? `<br><b class="pb">${esc(t('newBest'))}</b>` : ''}`;
  show('over');
}

export function wire(onStart, onMenu, onLang) {
  $('cars').addEventListener('click', ev => { const b = ev.target.closest('.car'); if (b) onStart(+b.dataset.i) });
  $('langs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-lang]'); if (!b) return;
    setLang(b.dataset.lang); buildMenu(); onLang();
  });
  const act = (ev, card) => {
    const lk = ev.target.closest('.lockbtn');
    if (lk) { toggleLock(+lk.dataset.lock); renderShop(); return }
    if (card && buy(+card.dataset.i)) renderShop();
  };
  $('cards').addEventListener('click', ev => act(ev, ev.target.closest('.card')));
  $('cards').addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('card')) { ev.preventDefault(); act(ev, ev.target) }
  });
  // hovering a part lights up the slot it goes into
  const hl = s => { for (const el of document.querySelectorAll('#blueprint [data-slot]')) el.classList.toggle('hl', el.dataset.slot === s) };
  $('cards').addEventListener('pointerover', ev => { const c = ev.target.closest('.card'); hl(c && c.dataset.slot) });
  $('cards').addEventListener('focusin', ev => { const c = ev.target.closest('.card'); hl(c && c.dataset.slot) });
  $('cards').addEventListener('pointerleave', () => hl(null));
  $('reroll').onclick = () => { reroll(); renderShop() };
  $('repair').onclick = () => { repair(); renderShop() };
  $('go').onclick = () => nextWave();
  $('again').onclick = onMenu;
  $('resume').onclick = () => { G.state = 'play'; show(null) };
}

/* ---------- HUD ---------- */
let bannerId = null;
export function hud() {
  const { P, S, drift } = G; if (!P) return;
  $('hpBar').style.width = (P.hp / S.maxhp * 100) + '%';
  $('hpBar').classList.toggle('low', P.hp / S.maxhp < .3);
  set($('hpTxt'), `${Math.ceil(P.hp)} / ${S.maxhp}`);
  $('nitroBar').style.width = (P.nitro * 100) + '%';
  $('nitroBar').classList.toggle('on', P.boost);
  $('heatBar').style.width = (drift.heat * 100) + '%';
  set($('heatTxt'), drift.heat > .05 ? t('heatPct', { p: Math.round(drift.heat * 80) }) : t('heat'));
  set($('waveLbl'), t('lap', { n: G.wave }));
  // fuel gauge: needle from E (-90°) to F (+90°)
  const f = Math.max(0, G.fuel) / G.tank;
  $('needle').style.setProperty('--rot', `${(A.ui['fuel-needle'] ? -84 : -90) + f * (A.ui['fuel-needle'] ? 168 : 180)}deg`);
  set($('fuelTxt'), G.fuel >= 10 ? String(Math.ceil(G.fuel)) : fmtL(Math.max(0, G.fuel)));
  $('fuelPnl').classList.toggle('low', G.fuel < 10 && !G.filling);
  $('fuelPnl').classList.toggle('filling', !!G.filling);
  set($('scrapTxt'), fmt(G.scrap)); set($('wreckTxt'), t('wrecks', { n: fmt(G.wrecks) }));
  set($('spdTxt'), String(Math.round(P.sp * .36)));
  set($('angTxt'), P.air ? `↑ ${P.airT.toFixed(1)}s` : `${P.slipDeg}°`);
  set($('driftNum'), fmt(drift.pts)); set($('driftMul'), `×${drift.mult.toFixed(1)}`);
  $('driftPnl').classList.toggle('hot', drift.on && drift.pts > 5);
  const elite = G.enemies.find(e => e.elite);
  $('bossPnl').classList.toggle('hide', !elite);
  if (elite) { $('bossBar').style.width = (elite.hp / elite.max * 100) + '%'; set($('eliteName'), L().elites[elite.type][0]) }
  if (G.banner && G.banner.id !== bannerId) {
    bannerId = G.banner.id; const b = $('banner');
    b.querySelector('b').textContent = tr(G.banner.s); b.querySelector('span').textContent = tr(G.banner.sub);
    const art = G.banner.elite && A.elites[G.banner.elite]; $('bannerArt').hidden = !art; if (art) $('bannerArt').src = art;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }
}

/* floating numbers and off-screen spawn arrows, projected from the 3D world */
const fx = $('fx'), pool = [], arrows = [];
for (let i = 0; i < 40; i++) { const d = document.createElement('div'); fx.appendChild(d); pool.push(d) }
for (let i = 0; i < 14; i++) { const d = document.createElement('i'); d.className = 'edge'; fx.appendChild(d); arrows.push(d) }
const pbadge = document.createElement('img'); pbadge.className = 'pbadge'; pbadge.alt = ''; fx.appendChild(pbadge);
export function texts(project) {
  let i = 0, k = 0; pbadge.style.display = 'none';
  if (project) {
    for (const tx of G.texts) {
      if (i >= pool.length) break;
      const p = project(tx.x, tx.y, 40 + (1 - tx.life / tx.max) * 30); if (!p.ok) continue;
      const d = pool[i++];
      d.style.display = 'block';
      d.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
      d.style.opacity = Math.min(1, tx.life / tx.max * 2);
      d.style.fontSize = tx.size + 'px'; d.style.color = tx.col;
      set(d, tx.s);
    }
    // a red arrow at the screen edge for every spawn marker you can't see, a yellow one for an elite
    const W = fx.clientWidth, H = fx.clientHeight, m = 26, cx = W / 2, cy = H / 2;
    const targets = G.pend.map(s => [s.x, s.y, s.elite]);
    for (const e of G.enemies) if (e.elite) targets.push([e.x, e.y, true]);
    if (G.pump) targets.unshift([G.pump.x, G.pump.y, 'pump']);
    for (const [x, y, el] of targets) {
      if (k >= arrows.length) break;
      const p = project(x, y, 0); if (p.x > m && p.x < W - m && p.y > m && p.y < H - m) continue;
      const dx = p.x - cx, dy = p.y - cy, sc = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
      const a = arrows[k++]; a.style.display = 'block'; a.classList.toggle('el', el === true); a.classList.toggle('pu', el === 'pump');
      a.style.transform = `translate(${cx + dx * sc}px,${cy + dy * sc}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
      if (el === 'pump' && pbadge.src) { const len = Math.hypot(dx, dy) || 1; pbadge.style.display = 'block'; pbadge.style.transform = `translate(${cx + dx * sc - dx / len * 34}px,${cy + dy * sc - dy / len * 34}px) translate(-50%,-50%)` }
    }
  }
  for (; i < pool.length; i++) pool[i].style.display = 'none';
  for (; k < arrows.length; k++) arrows[k].style.display = 'none';
}

/* touch controls: on-screen buttons that press the same keys as the keyboard */
export function touch(pause) {
  const box = $('touch'); if (!box) return;
  for (const b of box.querySelectorAll('[data-key]')) {
    const down = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); G.keys[b.dataset.key] = true; b.classList.add('on') };
    const up = () => { G.keys[b.dataset.key] = false; b.classList.remove('on') };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  }
  $('tPause').addEventListener('click', pause);
}
