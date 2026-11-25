// DOM side: loading screen, language picker, menus, garage, game over, HUD, floating numbers.
import { G, CRANE, START_T, OPTS, saveOpts, quitLap, PUMP_RESERVE, price, lvlOf, targetLvl, tierOf, nameOf, descOf, buy, reroll, toggleLock, nextWave, fmt, fmtL, repair, repairCost } from './game.js';
import { CARS, PART, SLOTS, ALL_SLOTS, TAGC, PACKS, WSTAT } from './data.js';
import { garageView, garageSet, garageFrame, garageBack } from './scene.js';
import { t, L } from './i18n.js';
import { A } from './assets.js';

const $ = id => document.getElementById(id);
const set = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OVS = ['menu', 'shop', 'over', 'pause', 'settings'];
const tr = v => Array.isArray(v) ? t(v[0], v[1]) : v; // banner parts are [key, vars]

export function show(id) {
  for (const o of OVS) $(o).classList.toggle('hide', o !== id);
  $('hud').classList.toggle('hide', !(id === null || id === 'pause' || (id === 'settings' && G.state === 'pause')));
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
  buildCluster();
  if (A.ui.pump) pbadge.src = A.ui.pump;
  { const [a, b, c] = L().craneSign; set($('csTop'), a); set($('csBig'), b); set($('csSub'), c); if (A.ui['sign-crane']) { $('craneSign').classList.add('art'); $('craneSign').style.setProperty('--art', `url(${A.ui['sign-crane']})`) } }
  for (const el of document.querySelectorAll('[data-i18n]')) set(el, t(el.dataset.i18n));
  for (const el of document.querySelectorAll('[data-ico]')) { const src = A.ui[el.dataset.ico]; if (src && !el.firstChild) el.innerHTML = `<img src="${src}" alt="">` }
  for (const el of document.querySelectorAll('[data-ui]')) {
    const src = A.ui[el.dataset.ui];
    if (src && !el.querySelector('img.uico')) el.insertAdjacentHTML('afterbegin', `<img class="uico" src="${src}" alt="">`);
  }
}
/* ---------- menu ---------- */
let best = null, portraits = [];
const loadBest = () => { try { best = JSON.parse(localStorage.getItem('scrapyard-best')) } catch (e) { best = null } };
const partName = id => { const d = PART[id]; return d.w ? L().w[d.w][0] : L().parts[id][0] };
export function buildMenu(p) {
  if (p) portraits = p;
  loadBest();
  const logo = A.logos.vls;
  $('title').innerHTML = logo ? `<img src="${logo}" alt="${esc(t('title'))}">` : esc(t('title'));
  if (A.menuBg) $('menu').style.backgroundImage = `linear-gradient(rgba(20,21,25,.58),rgba(20,21,25,.72) 45%,rgba(20,21,25,.9)),url(${A.menuBg.src})`;
  set($('bestLine'), best ? t('best', { lap: best.wave, score: fmt(best.score) }) : t('pick'));
  const C = L().cars;
  $('cars').innerHTML = CARS.map((c, i) => `
    <button class="car" data-i="${i}">
      <span class="bay"><span class="no"><small>BOX</small>0${i + 1}</span><img src="${A.cars[c.id] || portraits[i]}" alt=""></span>
      <b>${esc(C[c.id][0])}</b>
      <span class="d desc">${esc(C[c.id][1])}</span>
      ${L().stat.map((l, k) => `<span class="bar"><span>${esc(l)}</span><i style="--w:${c.bars[k]}%"></i></span>`).join('')}
      <span class="d">${esc(t('startsWith', { w: Object.values(c.build).map(b => partName(b[0])).join(', ') }))}</span>
    </button>`).join('');
  $('packs').innerHTML = `<div class="lbl">${esc(t('packsTitle'))}</div><div class="grid2">` + PACKS.map(pk => {
    const [name, desc, cars] = L().packs[pk.id];
    const bg = A.packs[pk.id] ? `background-image:linear-gradient(90deg,rgba(24,26,30,.9),rgba(24,26,30,.35)),url(${A.packs[pk.id]})` : `background-image:linear-gradient(120deg,${pk.colors[0]},${pk.colors[1]})`;
    return `<div class="pack" style="${bg}" aria-disabled="true"><span class="soon">${esc(t('soon'))}</span><b>${esc(name)}</b><span class="d">${esc(desc)}</span>
      <span class="chips">${cars.map((c, k) => { const src = A.cars[pk.cars[k]]; return `<span class="pc">${src ? `<img src="${src}" alt=""${pk.flip ? ' style="transform:scaleX(-1)"' : ''}>` : ''}${esc(c)}</span>` }).join('')}</span></div>`;
  }).join('') + '</div>';
  applyStatic();
}

/* ---------- garage ---------- */
const icon = (id, cls = 'ico') => {
  const d = PART[id], src = A.icons[id];
  return `<span class="${cls}" style="--c:${TAGC[d.tag]}">${src ? `<img src="${src}" alt="">` : `<span>${esc(partName(id)[0])}</span>`}</span>`;
};
const lockSvg = on => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 ${on ? '8 0v3' : '7.5-1.5'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

// Blueprint: top-down car outline (front up) with a numbered marker on each slot,
// and a list underneath so part names are never cut off, in any language.
/* ---------- blueprint: a top view (bumpers, boot) and a side view (turret, roof, hood, skirts) ----------
   Each slot has a marker on the drawing, a leader line and a label chip next to it; installed parts can be
   hovered (or focused) for a card with what they do at their current level. */
const VW = 600;
// Drawn like an old pencil/ink study on parchment: sepia lines traced twice (a sketchy ghost line), hatching on the
// lower panels and tyres, faint construction lines and compass arcs, and scribbled notes in the empty corners.
// Front of the car on the LEFT, the back with its bolted-on spoiler on the RIGHT, in both views. Still scrappy:
// crooked door, riveted patch, dent, bent bumpers, one wheel cover that doesn't sit right.
// slots in drawing coordinates: [marker x, marker y, label x, label y, label side]
const BPV = {
  side: { h: 250, slots: { turret: [300, 46, 190, 22, 'r'], roof: [350, 56, 305, 22, 'c'], turret2: [446, 98, 600, 22, 'r'], hood: [168, 110, 130, 228, 'c'], sides: [300, 146, 370, 228, 'c'] } },
  top: { h: 240, slots: { front: [140, 120, 120, 22, 'c'], rear: [462, 120, 480, 22, 'c'], trunk: [420, 120, 300, 222, 'c'] } }
};
const YEAR = { hatch: 1987, muscle: 1972, hearse: 1979 };
// tiny deterministic random so the sketch doesn't change on every re-render
const srand = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// scribbled 'handwriting': rows of small irregular loops
function notes(x, y, w, rows, seed) {
  const r = srand(seed); let d = '';
  for (let k = 0; k < rows; k++) {
    const yy = y + k * 9, len = w * (.55 + r() * .45); let xx = x;
    d += `M${xx.toFixed(1)} ${yy}`;
    while (xx < x + len) { const s = 2 + r() * 3; xx += s; d += ` q${(s / 2).toFixed(1)} ${(-(1.5 + r() * 3)).toFixed(1)} ${s.toFixed(1)} 0`; if (r() < .12) { xx += 4; d += ` m4 0` } }
  }
  return `<path class="nt" d="${d}"/>`;
}
const DEFS = id => `<defs><pattern id="h${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="5"/></pattern>
  <pattern id="x${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="5"/><line x1="0" y1="0" x2="5" y2="0"/></pattern></defs>`;
const sketch = s => `<g class="car-o">${s}</g><g class="car-o ghost" transform="translate(1.3 .8) rotate(.25 300 120)">${s}</g>`;
const wheel = (x, y, r, off = 0) => `<circle class="tyre" cx="${x}" cy="${y}" r="${r}"/><circle cx="${x + off}" cy="${y}" r="${r * .62}"/><circle cx="${x + off}" cy="${y}" r="${r * .16}"/>` +
  [0, 72, 144, 216, 288].map(a => { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); return `<line class="sp" x1="${(x + off + c * r * .18).toFixed(1)}" y1="${(y + s * r * .18).toFixed(1)}" x2="${(x + off + c * r * .58).toFixed(1)}" y2="${(y + s * r * .58).toFixed(1)}"/>` }).join('');
const BP_DRAW = {
  side: id => DEFS(id) + `<g class="cons"><line x1="20" y1="178" x2="580" y2="178"/><line x1="190" y1="20" x2="190" y2="240"/><line x1="410" y1="20" x2="410" y2="240"/>
    <circle cx="190" cy="152" r="62"/><path d="M300 30 A150 150 0 0 1 450 180"/><line x1="112" y1="200" x2="500" y2="200"/><path d="M112 196 L112 204 M500 196 L500 204"/></g>` +
    notes(470, 186, 112, 6, 7 + id.length) + notes(24, 66, 80, 4, 31) +
    sketch(`<path d="M118 150 L116 128 Q118 116 134 113 L214 106 L262 60 Q266 56 274 56 L366 56 Q374 56 378 62 L420 102 L470 106 Q482 108 482 122 L482 150 L436 150 A26 26 0 0 0 384 150 L216 150 A26 26 0 0 0 164 150 Z"/>
    <path class="hatch" d="M134 130 L470 126 L480 148 L436 148 A26 26 0 0 0 384 148 L216 148 A26 26 0 0 0 164 148 L120 148 Z"/>
    <path d="M272 64 L316 64 L316 100 L232 102 Z"/><path d="M324 64 L362 64 Q368 64 372 70 L398 100 L324 100 Z"/><path class="hatch" d="M276 68 L312 68 L312 96 L246 98 Z"/>
    <path d="M226 104 L232 147 M320 102 L323 148" transform="rotate(-2.5 275 125)"/><path d="M396 102 L398 147"/><path d="M296 116 l12 0 M376 116 l12 -1"/>
    <path d="M134 118 L470 113"/><path d="M150 146 L452 145"/><path d="M238 100 l-8 -6 l-4 6 z"/>
    <rect x="120" y="117" width="12" height="8" rx="2"/><rect x="472" y="111" width="8" height="10" rx="1"/>
    <path d="M118 128 L106 131 L106 147 L120 146"/><path d="M482 136 L500 141 L499 148 L482 146"/><path d="M462 154 L478 154 L478 158 L462 158 Z"/>
    ${wheel(190, 152, 26)}${wheel(410, 152, 26, 2.5)}
    <path class="dent" d="M444 112 l6 7 l-6 4 l7 6"/><rect class="patch" x="344" y="114" width="28" height="18" transform="rotate(-6 358 123)"/>
    <circle class="rivet" cx="348" cy="118" r="1.6"/><circle class="rivet" cx="367" cy="116" r="1.6"/><circle class="rivet" cx="350" cy="129" r="1.6"/><circle class="rivet" cx="369" cy="127" r="1.6"/>
    <path class="spoiler" d="M428 80 L490 84 L488 94 L426 90 Z"/><path d="M448 90 L446 104 M472 92 L471 106"/>`),
  top: id => DEFS(id) + `<g class="cons"><line x1="20" y1="120" x2="580" y2="120"/><line x1="200" y1="30" x2="200" y2="210"/><line x1="400" y1="30" x2="400" y2="210"/><circle cx="300" cy="120" r="104"/></g>` +
    notes(24, 168, 120, 6, 53) + notes(478, 168, 100, 5, 89) +
    sketch(`<rect class="tyre" x="178" y="50" width="44" height="13" rx="4"/><rect class="tyre" x="378" y="50" width="44" height="13" rx="4"/><rect class="tyre" x="178" y="177" width="44" height="13" rx="4" transform="rotate(-4 200 183)"/><rect class="tyre" x="378" y="177" width="44" height="13" rx="4"/>
    <path d="M178 62 L428 60 Q456 62 458 92 L458 148 Q456 178 428 180 L178 178 Q146 176 144 146 L144 94 Q146 64 178 62 Z"/>
    <path d="M250 70 L276 76 L276 164 L250 170 Q244 120 250 70 Z"/><path class="hatch" d="M254 76 L272 80 L272 160 L254 164 Q249 120 254 76 Z"/>
    <path d="M282 74 L366 74 Q372 74 372 80 L372 160 Q372 166 366 166 L282 166 Q276 166 276 160 L276 80 Q276 74 282 74 Z"/>
    <path d="M372 78 L392 84 L392 156 L372 162"/><path d="M160 92 L246 88 M160 148 L246 152"/><path d="M168 74 L168 166" />
    <path d="M300 62 L302 178" transform="rotate(1.5 300 120)"/><path d="M340 62 L340 178"/><path d="M256 60 l-6 -8 l8 -1 z M256 180 l-6 8 l8 1 z"/>
    <path d="M144 100 L134 98 L134 142 L144 140"/><path d="M458 98 L468 100 L467 140 L458 143"/>
    <path class="dent" d="M196 80 l7 5 l-4 6 l8 4"/><rect class="patch" x="404" y="134" width="24" height="18" transform="rotate(7 416 143)"/>
    <circle class="rivet" cx="408" cy="138" r="1.6"/><circle class="rivet" cx="424" cy="141" r="1.6"/><circle class="rivet" cx="406" cy="149" r="1.6"/><circle class="rivet" cx="422" cy="152" r="1.6"/>
    <rect class="spoiler" x="476" y="64" width="14" height="112" rx="2" transform="rotate(-3 483 120)"/><path d="M468 86 L476 86 M468 154 L476 154"/>`)
};
const partDescAt = (id, l) => { const d = PART[id]; return d.w ? L().w[d.w][1](l, ...WSTAT[d.w](l)) : L().parts[id][1] };
function bpView(view) {
  const V = BPV[view], marks = [], chips = [];
  for (const [slot, [mx, my, cx, cy, al]] of Object.entries(V.slots)) {
    const b = G.build[slot], on = b ? ' on' : '';
    marks.push(`<line class="ld${on}" x1="${mx}" y1="${my}" x2="${cx}" y2="${cy}"/><g class="mk${on}" data-slot="${slot}"><circle cx="${mx}" cy="${my}" r="9"/></g>`);
    const tip = b ? `<span class="tip"><b>${esc(partName(b.id))} · Lv ${b.lvl}/${PART[b.id].max}</b><span>${esc(partDescAt(b.id, b.lvl))}</span><i style="color:${TAGC[PART[b.id].tag]}">${esc(L().tags[PART[b.id].tag])}</i></span>` : '';
    chips.push(`<div class="chip ${al}${on}${view === 'side' && cy < 60 ? ' up' : ''}" data-slot="${slot}" style="left:${cx / VW * 100}%;top:${cy / V.h * 100}%" tabindex="${b ? 0 : -1}">
      ${b ? icon(b.id, 'ico xs') : '<span class="ico xs empty"></span>'}<span class="sl"><span class="sn">${esc(L().slots[slot])}</span><span class="pn${b ? '' : ' empty'}">${b ? esc(partName(b.id)) : esc(t('empty'))}</span></span>${b ? `<span class="lv">Lv ${b.lvl}</span>` : ''}${tip}</div>`);
  }
  return `<div class="bpview ${view}"><div class="vlbl">${esc(L().bpViews[view])}</div><div class="bpstage" style="aspect-ratio:${VW}/${V.h}"><svg viewBox="0 0 ${VW} ${V.h}" aria-hidden="true">${BP_DRAW[view](view)}${marks.join('')}</svg>${chips.join('')}</div></div>`;
}
// The garage shows your car as a live 3D model on a turntable (scene.js garageView) instead of the old drawings:
// every fitted part is on it, a slot grid underneath lists what's where (hover for details), and hovering a part
// for sale previews it fitted on the car with its slot outlined.
let gHover = null, gLoop = false, gBack = false;
const BACK_SLOTS = ['rear', 'trunk', 'turret2'], FRONT_SLOTS = ['front', 'hood'];
function slotChip(slot) {
  const b = G.build[slot], on = b ? ' on' : '';
  const tip = b ? `<span class="tip"><b>${esc(partName(b.id))} · Lv ${b.lvl}/${PART[b.id].max}</b><span>${esc(partDescAt(b.id, b.lvl))}</span><i style="color:${TAGC[PART[b.id].tag]}">${esc(L().tags[PART[b.id].tag])}</i></span>` : '';
  return `<div class="chip${on}" data-slot="${slot}" tabindex="${b ? 0 : -1}">${b ? icon(b.id, 'ico xs') : '<span class="ico xs empty"></span>'}<span class="sl"><span class="sn">${esc(L().slots[slot])}</span><span class="pn${b ? '' : ' empty'}">${b ? esc(partName(b.id)) : esc(t('empty'))}</span></span>${b ? `<span class="lv">Lv ${b.lvl}</span>` : ''}${tip}</div>`;
}
function renderBlueprint() {
  const id = G.P.car.id;
  if (!$('bpCanvas')) {
    $('blueprint').innerHTML = `<div class="bptitle" id="bpTitle"></div><div class="slotgrid" id="slotGrid"></div><div class="bp3d"><canvas id="bpCanvas" aria-label="3D"></canvas><button class="btn alt viewbtn" id="bpView" type="button"></button><div class="bpprev" id="bpPrev"></div></div>`;
    $('slotGrid').addEventListener('pointerover', ev => { const c = ev.target.closest('.chip'); gHover = c && G.build[c.dataset.slot] ? { slot: c.dataset.slot } : null });
    $('slotGrid').addEventListener('pointerleave', () => { gHover = null });
    $('bpView').onclick = () => { gBack = !gBack };
  }
  set($('bpTitle'), `${L().cars[id][0]} (${YEAR[id] || 1984})`); 
  $('slotGrid').innerHTML = ALL_SLOTS.map(slotChip).join('');
  garageView($('bpCanvas'));
  if (!gLoop) { gLoop = true; let last = performance.now(); const tick = now => {
    if ($('shop').classList.contains('hide')) { gLoop = false; return }
    const build = { ...G.build }; let hl = gHover && gHover.slot, prev = '';
    if (gHover && gHover.item) { const it = gHover.item, d = PART[it.id]; build[d.slot] = { id: it.id, lvl: targetLvl(it) }; hl = d.slot; prev = t('previewing', { x: nameOf(it), n: targetLvl(it) }) }
    set($('bpPrev'), prev);
    // look from the back for parts on the back of the car, from the front for front parts, else where you chose
    const back = hl && BACK_SLOTS.includes(hl) ? true : hl && FRONT_SLOTS.includes(hl) ? false : gBack;
    garageBack(back); set($('bpView'), back ? t('viewFront') : t('viewBack')); $('gbg').classList.toggle('back', back); // the backdrop swoops to the other side of the garage too
    garageSet(build, hl); garageFrame(Math.min(.05, (now - last) / 1000)); last = now; requestAnimationFrame(tick) };
    requestAnimationFrame(tick) }
}
export function renderShop() {
  set($('shopTitle'), t(G.retry ? 'garageRetry' : 'garage', { n: G.wave }));
  set($('shopScrap'), t('scrapAmt', { n: fmt(G.scrap) }));
  $('cards').innerHTML = G.offer.map((it, i) => {
    const d = PART[it.id], p = price(it), col = TAGC[d.tag], poor = p > G.scrap, l = lvlOf(it), cur = G.build[d.slot];
    const tl = targetLvl(it), tr2 = !it.sold && tierOf(it) > 1 ? tl : 1; // badge = the level the find fits at
    const note = it.sold ? t('fitted') : l ? (l >= d.max ? t('maxed') : t('upTo', { n: tl })) : cur ? t('replaces', { x: partName(cur.id) }) + (tl > 1 ? ' · ' + t('upTo', { n: tl }) : '') : tl > 1 ? t('upTo', { n: tl }) : '';
    return `<div class="card${tr2 > 1 ? ' t' + tr2 : ''}${it.sold ? ' sold' : ''}${it.locked ? ' locked' : ''}${poor && !it.sold ? ' poor' : ''}${cur && !l && !it.sold ? ' swap' : ''}" data-i="${i}" data-slot="${d.slot}" role="button" tabindex="${it.sold ? -1 : 0}" aria-disabled="${!!it.sold || poor}">
      ${icon(it.id)}
      <span class="cbody"><span class="tag"><b style="color:${col}">${esc(L().tags[d.tag])}</b> · ${esc(L().slots[d.slot])}</span>
      <b class="nm">${esc(nameOf(it))}${tr2 > 1 ? `<span class="tierb">${esc(t('tier', { n: tr2 }))}</span>` : ''}</b><span class="d">${esc(descOf(it))}</span>${note ? `<span class="note">${esc(note)}</span>` : ''}</span>
      <span class="cside"><span class="price">${it.sold ? '✓' : esc(t('price', { p }))}</span>
      ${it.sold ? '' : `<button class="lockbtn" data-lock="${i}" aria-pressed="${!!it.locked}" title="${esc(it.locked ? t('locked') : t('lock'))}">${lockSvg(it.locked)}<span>${esc(it.locked ? t('locked') : t('lock'))}</span></button>`}</span></div>`;
  }).join('');
  set($('reroll'), t('reroll', { c: G.rerollCost })); $('reroll').disabled = G.scrap < G.rerollCost;
  set($('repair'), t('repair', { c: repairCost() })); $('repair').disabled = G.scrap < repairCost() || G.P.hp >= G.S.maxhp;
  set($('lockHint'), t('lockHint'));
  renderBlueprint();
  const { S, P } = G, st = L().st;
  const rows = [[st[0], `${Math.ceil(P.hp)} / ${S.maxhp}`], [st[1], `${Math.round(S.top * KMH)} ${t('kmh').toLowerCase()}`], [st[2], S.grip.toFixed(1)],
    [st[3], Math.round(Math.min(.7, S.armor) * 100) + '%'], [st[4], (S.ram * S.mass).toFixed(2) + '×'], [st[5], S.ramGuard.toFixed(2) + '×'],
    [st[6], S.dmg.toFixed(2) + '×'], [st[7], S.rate.toFixed(2) + '×'], [st[8], S.regen.toFixed(1) + ' /s'], [st[9], fmt(S.magnet)]];
  $('build').className = 'plate static panel';
  $('build').innerHTML = `<h3>${esc(L().cars[P.car.id][0])}</h3>${rows.map(([a, b]) => `<div class="stat"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}`;
}
export function openShop() {
  // painted garage art if there is one, else the arena art, dimmed so the cards stay readable
  const bg = A.garageBg || A.menuBg;
  // the garage art stays visible (lighter in the middle, darker at the edges and under the button bar)
  // two backdrop layers: this side of the garage and the other side (its own art, or this one mirrored until it exists)
  if (bg) {
    $('gbgF').style.backgroundImage = `url(${bg.src})`;
    $('gbgB').style.backgroundImage = `url(${(A.garageBgBack || bg).src})`; $('gbgB').style.setProperty('--flip', A.garageBgBack ? 1 : -1);
    $('gbg').classList.toggle('dim', !A.garageBg);
  }
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
  // hovering a card for sale: outline its slot chip and preview the part fitted on the 3D car
  const hl = c => { const s = c && c.dataset.slot, it = c && G.offer[+c.dataset.i]; for (const el of document.querySelectorAll('#blueprint [data-slot]')) el.classList.toggle('hl', el.dataset.slot === s); gHover = it && !it.sold ? { item: it } : null };
  $('cards').addEventListener('pointerover', ev => hl(ev.target.closest('.card')));
  $('cards').addEventListener('focusin', ev => hl(ev.target.closest('.card')));
  $('cards').addEventListener('pointerleave', () => hl(null));
  $('reroll').onclick = () => { reroll(); renderShop() };
  $('repair').onclick = () => { repair(); renderShop() };
  $('go').onclick = () => nextWave();
  $('again').onclick = onMenu;
  $('resume').onclick = () => { G.state = 'play'; show(null) };
  // pause menu: settings, end the lap and go to the garage, or cancel the run and go back to the main menu
  let optFrom = 'menu';
  // from the main menu the settings screen sits on the same darkened menu backdrop; from pause it overlays the game
  const openOpts = from => { optFrom = from; $('settings').style.backgroundImage = from === 'menu' ? $('menu').style.backgroundImage : ''; $('settings').classList.toggle('menubg', from === 'menu'); renderOpts(); show('settings') };
  $('pSettings').onclick = () => openOpts('pause');
  $('mSettings').onclick = () => openOpts('menu');
  $('optBack').onclick = () => show(optFrom);
  $('pGarage').onclick = () => { quitLap(); show(null) };
  $('pMenu').onclick = onMenu;
  $('optList').addEventListener('click', ev => { const b = ev.target.closest('[data-opt]'); if (!b) return; const v = JSON.parse(b.dataset.v); OPTS[b.dataset.opt] = v; saveOpts(); renderOpts() });
}


/* ---------- settings ---------- */
function renderOpts() {
  const O = L().opts, row = (key, label, choices) => `<div class="opt"><b>${esc(label)}</b><div class="seg3">${choices.map(([v, txt]) => `<button data-opt="${key}" data-v='${JSON.stringify(v)}' class="${OPTS[key] === v ? 'on' : ''}" aria-pressed="${OPTS[key] === v}">${esc(txt)}</button>`).join('')}</div></div>`;
  $('optList').innerHTML = row('zoom', O.zoom, [[1.25, O.near], [1, O.normal], [.82, O.far]]) + row('shake', O.shake, [[true, O.on], [false, O.off]]) + row('fx', O.fx, [[1, O.many], [.5, O.few]]);
}

/* ---------- gauge cluster (bottom-left) ----------
   One SVG in a 360×250 box, after a real tach/fuel/nitro cluster:
   - speedo: 270° sweep 0–240 km/h, cream ticks on a rusty steel bezel, yellow/red zone at the top end;
     the lap is shown in the gear window above the hub, the digital speed below it
   - fuel: the painted half-dial (assets/ui/fuel-gauge.png + fuel-needle.png) overlapping bottom-right,
     a procedural half-dial if that art is missing; litres underneath
   - nitro: a round pod overlapping top-left with 8 LED segments
   Optional full-face art: assets/ui/cluster-speedo.png and cluster-nitro.png (square, transparent). */
const SPD_MAX = 240, SC = { x: 150, y: 140, r: 100 }, FU = { x: 290, y: 200, w: 140 }, NO = { x: 48, y: 50, r: 38 };
const KMH = .6; // display factor: game units/s → km/h
const ang = v => -135 + Math.max(0, Math.min(1, v / SPD_MAX)) * 270;
const pol = (cx, cy, r, a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}` };
const bolts = (cx, cy, r, n, a0 = 45) => Array.from({ length: n }, (_, i) => { const [x, y] = pol(cx, cy, r, a0 + i * 360 / n); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#8d8a84" stroke="#2a2826" stroke-width="1.5"/>` }).join('');
const rust = (cx, cy, r, n, seed) => { let o = '', z = seed; const rn = () => (z = (z * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) { const [x, y] = pol(cx, cy, r * (.93 + rn() * .06), rn() * 360); o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.5 + rn() * 3).toFixed(1)}" fill="#a0522d" opacity=".55"/>` } return o };
let CL = null;
function buildCluster() {
  const el = $('cluster'); if (!el) return;
  const cx = SC.x, cy = SC.y, R = SC.r;
  let ticks = '', nums = '';
  for (let v = 0; v <= SPD_MAX; v += 10) {
    const a = ang(v), big = v % 40 === 0, [x0, y0] = pol(cx, cy, R - 12, a), [x1, y1] = pol(cx, cy, R - (big ? 26 : 19), a);
    ticks += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${v >= 200 ? '#e24a32' : '#efe3c8'}" stroke-width="${big ? 4 : 2}" stroke-linecap="round"/>`;
    if (big) { const [tx, ty] = pol(cx, cy, R - 40, a); nums += `<text x="${tx.toFixed(1)}" y="${(ty + 5).toFixed(1)}" text-anchor="middle" font-size="15" fill="#efe3c8">${v}</text>` }
  }
  const sArt = A.ui['cluster-speedo'], nArt = A.ui['cluster-nitro'], fArt = A.ui['fuel-gauge'], nd = A.ui['fuel-needle'];
  const speedo = sArt ? `<image href="${sArt}" x="${cx - R - 8}" y="${cy - R - 8}" width="${2 * R + 16}" height="${2 * R + 16}"/>` : `
    <circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="#3b3936" stroke="#1d1c1a" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${R - 2}" fill="#1c1b19" stroke="#55514b" stroke-width="3"/>
    ${rust(cx, cy, R + 3, 14, 7)}${bolts(cx, cy, R + 1, 4, 0)}
    <path d="${arc(cx, cy, R - 15, ang(170), ang(200))}" stroke="#ffc23d" stroke-width="9" fill="none"/>
    <path d="${arc(cx, cy, R - 15, ang(200), ang(SPD_MAX))}" stroke="#e24a32" stroke-width="9" fill="none"/>
    ${ticks}${nums}`;
  // lap in the gear window under the hub, digital speed below it (between the 0 and 240 labels)
  const gear = `<rect class="gearBox" x="${cx - 22}" y="${cy + 17}" width="44" height="38" rx="6" fill="#15130f" stroke="#55514b" stroke-width="2"/>
    <text class="lcd" x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="7" fill="#c3c7cf" letter-spacing=".8" id="clLapLbl"></text>
    <text class="lcd" x="${cx}" y="${cy + 49}" text-anchor="middle" font-size="22" fill="#ffc23d" id="clLap">1</text>`;
  const digits = `<text class="lcd" x="${cx}" y="${cy + 79}" text-anchor="middle" font-size="22" fill="#fff" id="clSpd">0</text>
    <text x="${cx}" y="${cy + 90}" text-anchor="middle" font-size="7.5" fill="#c3c7cf" letter-spacing="1.5">${esc(t('kmh'))}</text>
    <text class="lcd" x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="12" fill="#e8553a" id="clAng"></text>`;
  const sNeedle = `<g id="clSN" transform="rotate(-135 ${cx} ${cy})"><path class="sNeedle" d="M${cx - 3.5} ${cy + 14}L${cx - 1.2} ${cy - R + 16}L${cx + 1.2} ${cy - R + 16}L${cx + 3.5} ${cy + 14}Z" fill="#e24a32" stroke="#000" stroke-opacity=".35"/></g>
    <circle cx="${cx}" cy="${cy}" r="12" fill="#2a2826" stroke="#8d8a84" stroke-width="3"/>`;
  // fuel half-dial: hub at 50% / 87% of the painted face (600×327)
  const fw = FU.w, fh = fw * 327 / 600, fx = FU.x - fw / 2, fy = FU.y - fh * .87;
  let fuel;
  if (fArt) fuel = `<image href="${fArt}" x="${fx}" y="${fy}" width="${fw}" height="${fh}"/>`;
  else {
    const fr = fh * .78;
    fuel = `<path d="M${FU.x - fw / 2} ${FU.y + 8}A${fw / 2} ${fw / 2} 0 0 1 ${FU.x + fw / 2} ${FU.y + 8}Z" fill="#3b3936" stroke="#1d1c1a" stroke-width="3"/>
      <path d="${arc(FU.x, FU.y, fr - 6, -84, -50)}" stroke="#e24a32" stroke-width="10" fill="none"/><path d="${arc(FU.x, FU.y, fr - 6, -50, 30)}" stroke="#ffc23d" stroke-width="10" fill="none"/><path d="${arc(FU.x, FU.y, fr - 6, 30, 84)}" stroke="#7fbf4a" stroke-width="10" fill="none"/>
      <text x="${FU.x - fw / 2 + 18}" y="${FU.y + 2}" font-size="14" fill="#efe3c8">E</text><text x="${FU.x + fw / 2 - 28}" y="${FU.y + 2}" font-size="14" fill="#efe3c8">F</text>`;
  }
  const nh = fh * .56, nw = nh * 94 / 400;
  const fNeedle = nd ? `<g id="clFN" transform="rotate(-84 ${FU.x} ${FU.y})"><image href="${nd}" x="${FU.x - nw / 2}" y="${FU.y - nh * .885}" width="${nw}" height="${nh}"/></g>`
    : `<g id="clFN" transform="rotate(-84 ${FU.x} ${FU.y})"><path d="M${FU.x - 3} ${FU.y}L${FU.x} ${FU.y - nh}L${FU.x + 3} ${FU.y}Z" fill="#e24a32"/></g><circle cx="${FU.x}" cy="${FU.y}" r="7" fill="#2a2826" stroke="#8d8a84" stroke-width="2"/>`;
  const fuelTxt = `<rect x="${FU.x - 34}" y="${FU.y + 14}" width="68" height="24" rx="6" fill="#15130f" stroke="#55514b" stroke-width="2"/>
    <text class="lcd fuelL" x="${FU.x}" y="${FU.y + 32}" text-anchor="middle" font-size="16" fill="#efe3c8" id="clFuel">60 L</text>
    <path class="fuelRing" d="M${FU.x - fw / 2 - 3} ${FU.y + 8}A${fw / 2 + 3} ${fw / 2 + 3} 0 0 1 ${FU.x + fw / 2 + 3} ${FU.y + 8}" fill="none" stroke-width="4"/>`;
  // nitro pod: a small dial like the speedo, 240° sweep E → F, red at the empty end, blue scale, white needle
  const NA = v => -120 + v * 240, nr = NO.r - 6;
  let nt = '';
  for (let i = 0; i <= 8; i++) { const v = i / 8, a = NA(v), big = i % 2 === 0, [x0, y0] = pol(NO.x, NO.y, nr - 3, a), [x1, y1] = pol(NO.x, NO.y, nr - (big ? 10 : 7), a); nt += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${v < .2 ? '#e24a32' : '#efe3c8'}" stroke-width="${big ? 2.4 : 1.4}" stroke-linecap="round"/>` }
  const nitro = (nArt ? `<image href="${nArt}" x="${NO.x - NO.r - 4}" y="${NO.y - NO.r - 4}" width="${2 * NO.r + 8}" height="${2 * NO.r + 8}"/>` : `
    <circle cx="${NO.x}" cy="${NO.y}" r="${NO.r + 4}" fill="#3b3936" stroke="#1d1c1a" stroke-width="4"/>${rust(NO.x, NO.y, NO.r + 2, 6, 3)}
    <circle cx="${NO.x}" cy="${NO.y}" r="${nr}" fill="#14171a" stroke="#55514b" stroke-width="2"/>${bolts(NO.x, NO.y, NO.r, 4, 45)}
    <path d="${arc(NO.x, NO.y, nr - 6, NA(0), NA(.2))}" stroke="#e24a32" stroke-width="4" fill="none"/>
    <path d="${arc(NO.x, NO.y, nr - 6, NA(.2), NA(1))}" stroke="#2f7fa8" stroke-width="4" fill="none"/>${nt}`) + `
    <circle class="nosGlow" cx="${NO.x}" cy="${NO.y}" r="${NO.r + 6}" fill="none" stroke="#5fc8f0" stroke-width="4" style="filter:drop-shadow(0 0 6px #5fc8f0)"/>
    <text x="${NO.x}" y="${NO.y + 15}" text-anchor="middle" font-size="8.5" fill="#5fc8f0" letter-spacing="1.2">NOS</text>
    <g id="clNN" transform="rotate(-120 ${NO.x} ${NO.y})"><path d="M${NO.x - 2} ${NO.y + 5}L${NO.x - .6} ${NO.y - nr + 9}L${NO.x + .6} ${NO.y - nr + 9}L${NO.x + 2} ${NO.y + 5}Z" fill="#f4f0e8" class="nNeedle"/></g>
    <circle cx="${NO.x}" cy="${NO.y}" r="5" fill="#2a2826" stroke="#8d8a84" stroke-width="2"/>`;
  el.innerHTML = `<svg viewBox="0 0 360 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${speedo}${gear}${digits}${sNeedle}${fuel}${fNeedle}${fuelTxt}${nitro}</svg>`;
  CL = { sn: $('clSN'), fn: $('clFN'), spd: $('clSpd'), lap: $('clLap'), ang: $('clAng'), fuel: $('clFuel'), nn: $('clNN'), ns: -120, el, lastLap: 0, s: -135 };
  set($('clLapLbl'), t('lapShort'));
}
function clusterHud(P) {
  if (!CL) return;
  const kmh = Math.round(P.sp * KMH);
  CL.s += (ang(kmh) - CL.s) * .35; // a touch of needle inertia
  CL.sn.setAttribute('transform', `rotate(${CL.s.toFixed(1)} ${SC.x} ${SC.y})`);
  set(CL.spd, String(kmh));
  set(CL.lap, String(G.wave));
  if (CL.lastLap !== G.wave) { CL.lastLap = G.wave; CL.el.classList.remove('shift'); void CL.el.offsetWidth; CL.el.classList.add('shift') }
  set(CL.ang, P.air ? `↑ ${P.airT.toFixed(1)}s` : P.slipDeg > 12 ? `${P.slipDeg}°` : '');
  const f = Math.max(0, G.fuel) / G.tank;
  CL.fn.setAttribute('transform', `rotate(${(-84 + f * 168).toFixed(1)} ${FU.x} ${FU.y})`);
  set(CL.fuel, (G.fuel >= 10 ? String(Math.ceil(G.fuel)) : fmtL(Math.max(0, G.fuel))) + ' L');
  CL.el.classList.toggle('low', G.fuel < 10 && !G.filling);
  CL.el.classList.toggle('filling', !!G.filling);
  CL.el.classList.toggle('boost', !!P.boost);
  CL.ns += (-120 + P.nitro * 240 - CL.ns) * .4; CL.nn.setAttribute('transform', `rotate(${CL.ns.toFixed(1)} ${NO.x} ${NO.y})`);
}

/* ---------- HUD ---------- */
// shrink a sign title until it fits its plate, so it always sits centred instead of spilling out one side
function fitSign(el) {
  el.style.fontSize = ''; let fs = parseFloat(getComputedStyle(el).fontSize); const maxW = innerWidth * .96 - 70;
  while (el.offsetWidth > maxW && fs > 18) { fs -= 2; el.style.fontSize = fs + 'px' } // the plate grows to fit; only shrink on very narrow screens
}
let bannerId = null; const hudMem = { scrap: null, hp: null };
export function hud() {
  const { P, S, drift } = G; if (!P) return;
  $('hpBar').style.width = (P.hp / S.maxhp * 100) + '%';
  $('hpBar').classList.toggle('low', P.hp / S.maxhp < .3);
  set($('hpTxt'), `${Math.ceil(P.hp)} / ${S.maxhp}`);
  $('heatBar').style.width = (drift.heat * 100) + '%';
  set($('heatTxt'), drift.heat > .05 ? `+${Math.round(drift.heat * 80)}% ${t('fireRate')}` : '');
  clusterHud(P);
  const cs = $('craneSign'), cw = G.crane && G.crane.st === 'warn' && G.state === 'play'; // pulses through the whole 3 s warning
  cs.classList.toggle('on', !!cw);
  $('vign').classList.toggle('on', !!G.siphon && G.state === 'play');
  // countdown: a round road sign 3-2-1, then a green GO disc
  const cd = $('count'), n = G.startT > 0 && G.state === 'play' ? String(Math.ceil(G.startT)) : '';
  if (cd._n !== n) { cd._n = n; if (n || cd.textContent) { cd.textContent = n || t('go'); cd.className = n ? 'tick' : 'tick go'; void cd.offsetWidth; cd.classList.add('on') } }
  set($('scrapTxt'), fmt(G.scrap)); set($('wreckTxt'), t('wrecks', { n: fmt(G.wrecks) }));
  // scrap bump (+N) and a shake on the hull plate when you take damage
  if (hudMem.scrap != null && G.scrap > hudMem.scrap) { const b = $('scrapBump'), n = $('scrapTxt'); b.textContent = '+' + fmt(G.scrap - hudMem.scrap); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); n.classList.add('pop'); clearTimeout(hudMem.pt); hudMem.pt = setTimeout(() => n.classList.remove('pop'), 150) }
  if (hudMem.hp != null && P.hp < hudMem.hp - 1) { const h = $('hullPlate'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit') }
  hudMem.scrap = G.scrap; hudMem.hp = P.hp;
  // drift meter: tube = multiplier ×1 → ×5, thin white clock = time left in this combo (8 s max), green pulse when it banks
  const dm = $('driftMtr'), live = drift.on && drift.pts > 5;
  set($('driftNum'), fmt(drift.pts)); set($('driftMul'), `×${drift.mult.toFixed(1)}`);
  $('driftFill').style.height = (live ? (drift.mult - 1) / 4 * 100 : 0).toFixed(1) + '%';
  $('driftClock').style.height = (live ? Math.max(0, 1 - (drift.time || 0) / 8) * 100 : 0).toFixed(1) + '%';
  dm.classList.toggle('on', live);
  if (dm._was && !live && drift.pts === 0) { dm.classList.remove('bank'); void dm.offsetWidth; dm.classList.add('bank') }
  dm._was = live;
  const elite = G.enemies.find(e => e.elite);
  $('bossPnl').classList.toggle('hide', !elite);
  if (elite) { $('bossBar').style.width = (elite.hp / elite.max * 100) + '%'; set($('eliteName'), L().elites[elite.type][0]) }
  if (G.banner && G.banner.id !== bannerId) {
    bannerId = G.banner.id; const b = $('banner');
    b.querySelector('b').textContent = tr(G.banner.s); b.querySelector('span').textContent = tr(G.banner.sub);
    fitSign(b.querySelector('b'));
    const key = Array.isArray(G.banner.s) ? G.banner.s[0] : '';
    const subKey = Array.isArray(G.banner.sub) ? G.banner.sub[0] : ''; // sign style: yellow caution for elites and new enemies, green when the garage opens
    b.classList.toggle('caution', ['eliteSub', 'thiefIntro', 'spitIntro', 'bruteIntro'].includes(subKey)); b.classList.toggle('info', key === 'outOfFuel' || key === 'lapQuit');
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }
}

/* floating numbers and off-screen spawn arrows, projected from the 3D world */
const fx = $('fx'), pool = [], arrows = [];
for (let i = 0; i < 40; i++) { const d = document.createElement('div'); fx.appendChild(d); pool.push(d) }
for (let i = 0; i < 14; i++) { const d = document.createElement('i'); d.className = 'edge'; fx.appendChild(d); arrows.push(d) }
const pbadge = document.createElement('img'); pbadge.className = 'pbadge'; pbadge.alt = ''; fx.appendChild(pbadge);
// tag over the gas pump: litres left as a bar, and what you gained while filling
// health bars over damaged enemies
const hbars = Array.from({ length: 60 }, () => { const d = document.createElement('div'); d.className = 'hbar'; d.innerHTML = '<i></i>'; fx.appendChild(d); return d });
const ptag = document.createElement('div'); ptag.className = 'ptag'; ptag.innerHTML = '<b></b><i><u></u></i>'; fx.appendChild(ptag);
export function texts(project) {
  let i = 0, k = 0, h = 0; pbadge.style.display = 'none'; ptag.style.display = 'none';
  if (project) {
    for (const e of G.enemies) {
      if (h >= hbars.length) break;
      if (e.dead || e.hp >= e.max) continue;
      const p = project(e.x, e.y, (e.z || 0) + e.r + 26); if (!p.ok) continue;
      const b = hbars[h++], f = Math.max(0, e.hp / e.max);
      b.style.display = 'block'; b.style.width = (e.elite ? 70 : e.type === 'brute' ? 44 : 32) + 'px';
      b.style.transform = `translate(${p.x | 0}px,${p.y | 0}px) translate(-50%,-50%)`;
      const c = e.elite ? '#e0b040' : f > .5 ? '#7fdc6a' : f > .25 ? '#ffc23d' : '#ff4a30';
      if (b._f !== f) { b._f = f; b.firstChild.style.width = (f * 100).toFixed(1) + '%'; b.firstChild.style.background = c }
    }
    const pu = G.pump, nx = !pu && G.pumpNext;
    if (pu || nx) {
      const q = pu || nx, p = project(q.x, q.y, pu ? 110 : 30);
      if (p.ok) {
        ptag.style.display = 'block'; ptag.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
        ptag.classList.toggle('on', !!G.filling); ptag.classList.toggle('dry', !!(pu && pu.empty)); ptag.classList.toggle('soon', !!nx);
        set(ptag.firstChild, nx ? t('pumpSoon', { s: Math.max(1, Math.ceil(G.pumpT)) }) : pu.broken ? t('pumpWreck') : pu.empty ? t('pumpDry') : G.filling || pu.got > .5 ? t('pumpGot', { l: Math.round(pu.got) }) : `${Math.ceil(pu.res)} L`);
        ptag.querySelector('u').style.width = (pu ? pu.res / PUMP_RESERVE * 100 : 100) + '%';
      }
    }
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
    if (G.pump && !G.pump.empty) targets.unshift([G.pump.x, G.pump.y, 'pump']); else if (G.pumpNext) targets.unshift([G.pumpNext.x, G.pumpNext.y, 'pump']);
    for (const [x, y, el] of targets) {
      if (k >= arrows.length) break;
      const p = project(x, y, 0); if (p.x > m && p.x < W - m && p.y > m && p.y < H - m) continue;
      const dx = p.x - cx, dy = p.y - cy, sc = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
      const a = arrows[k++]; a.style.display = 'block'; a.classList.toggle('el', el === true); a.classList.toggle('pu', el === 'pump');
      a.style.transform = `translate(${cx + dx * sc}px,${cy + dy * sc}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
      if (el === 'pump' && pbadge.src) { const len = Math.hypot(dx, dy) || 1; pbadge.style.display = 'block'; pbadge.style.transform = `translate(${cx + dx * sc - dx / len * 34}px,${cy + dy * sc - dy / len * 34}px) translate(-50%,-50%)` }
    }
  }
  for (; h < hbars.length; h++) hbars[h].style.display = 'none';
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
