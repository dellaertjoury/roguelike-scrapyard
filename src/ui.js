// DOM side: menus, garage shop, game over, HUD panels, floating damage numbers.
import { G, start, nextWave, price, lvlOf, nameOf, descOf, buy, reroll, fmt } from './game.js';
import { CARS, WNAME, TAGC } from './data.js';
import { A } from './assets.js';

const $ = id => document.getElementById(id);
const set = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v } };
const OVS = ['menu', 'shop', 'over', 'pause'];

export function show(id) {
  for (const o of OVS) $(o).classList.toggle('hide', o !== id);
  $('hud').classList.toggle('hide', !(id === null || id === 'pause'));
}

let best = null;
const loadBest = () => { try { best = JSON.parse(localStorage.getItem('scrapyard-best')) } catch (e) { best = null } };

export function buildMenu(portraits) {
  loadBest();
  if (A.logo) $('title').innerHTML = `<img src="${A.logo.src}" alt="Scrapyard Derby">`;
  if (A.menuBg) $('menu').style.backgroundImage = `linear-gradient(rgba(24,26,30,.2),rgba(24,26,30,.45) 45%,rgba(24,26,30,.82)),url(${A.menuBg.src})`;
  $('bestLine').textContent = best
    ? `Your best: wave ${best.wave}, ${fmt(best.score)} points.`
    : 'Pick a junker. Survive the wave, spend scrap in the garage, go again.';
  $('cars').innerHTML = CARS.map((c, i) => `
    <button class="car" data-i="${i}">
      <img src="${A.cars[c.id] || portraits[i]}" alt="">
      <b>${c.name}</b>
      <span class="d">${c.desc}</span>
      ${['Speed', 'Grip', 'Armour', 'Ram'].map((l, k) => `<span class="bar"><span>${l}</span><i style="--w:${c.bars[k]}%"></i></span>`).join('')}
      <span class="d">Starts with ${Object.keys(c.w).map(k => WNAME[k]).join(', ')}</span>
    </button>`).join('');
}

export function renderShop() {
  set($('shopTitle'), `Garage · wave ${G.wave} survived`);
  set($('shopScrap'), `${fmt(G.scrap)} scrap`);
  $('cards').innerHTML = G.offer.map((it, i) => {
    const l = lvlOf(it), p = price(it), col = TAGC[it.tag];
    const lvl = it.w ? (l ? ` · Lv ${l} → ${l + 1}` : ' · New') : (l ? ` · owned ${l}` : '');
    const ico = A.icons[it.id] ? `<img src="${A.icons[it.id]}" alt="">` : `<span>${nameOf(it)[0]}</span>`;
    return `<button class="card${it.sold ? ' sold' : ''}" data-i="${i}" ${it.sold || p > G.scrap ? 'disabled' : ''}>
      <span class="ico" style="--c:${col}">${ico}</span>
      <span class="cbody"><span class="tag" style="color:${col}">${it.tag}${lvl}</span>
      <b>${nameOf(it)}</b><span class="d">${descOf(it)}</span>
      <span class="price">${it.sold ? 'Fitted' : p + ' scrap'}</span></span></button>`;
  }).join('');
  $('reroll').textContent = `Reroll · ${G.rerollCost}`; $('reroll').disabled = G.scrap < G.rerollCost;
  const { S, P, W } = G;
  const ws = Object.keys(W).filter(k => W[k]).map(k => `<div class="stat"><span>${WNAME[k]}</span><span>Lv ${W[k]}</span></div>`).join('');
  const st = [['Hull', `${Math.ceil(P.hp)} / ${S.maxhp}`], ['Top speed', `${Math.round(S.top * .36)} km/h`], ['Grip', S.grip.toFixed(1)], ['Armour', Math.round(Math.min(.7, S.armor) * 100) + '%'], ['Ram power', (S.ram * S.mass).toFixed(2) + '×'], ['Damage', S.dmg.toFixed(2) + '×'], ['Fire rate', S.rate.toFixed(2) + '×'], ['Regen', S.regen.toFixed(1) + ' /s'], ['Magnet', fmt(S.magnet)]];
  $('build').innerHTML = `<h3>${P.car.name}</h3>${ws}<div class="gap"></div>${st.map(([a, b]) => `<div class="stat"><span>${a}</span><span>${b}</span></div>`).join('')}`;
}
export function openShop() { renderShop(); show('shop') }

export function showOver() {
  loadBest();
  const nb = !best || G.score > best.score;
  if (nb) try { localStorage.setItem('scrapyard-best', JSON.stringify({ wave: G.wave, score: G.score })) } catch (e) { }
  $('overStats').innerHTML = `Reached wave ${G.wave} in the ${G.P.car.name}<br>${fmt(G.wrecks)} wrecks · best drift ${fmt(G.bestDrift)} · score ${fmt(G.score)}${nb ? '<br><b class="pb">New personal best</b>' : ''}`;
  show('over');
}

export function wire(onStart, onMenu) {
  $('cars').addEventListener('click', ev => { const b = ev.target.closest('.car'); if (b) onStart(+b.dataset.i) });
  $('cards').addEventListener('click', ev => { const b = ev.target.closest('.card'); if (b && !b.disabled && buy(+b.dataset.i)) renderShop() });
  $('reroll').onclick = () => { reroll(); renderShop() };
  $('go').onclick = () => nextWave();
  $('again').onclick = onMenu;
  $('resume').onclick = () => { G.state = 'play'; show(null) };
}

/* ---------- HUD ---------- */
const dashes = $('dashes');
dashes.innerHTML = '<i></i>'.repeat(10);
let bannerId = null;
export function hud() {
  const { P, S, drift } = G; if (!P) return;
  $('hpBar').style.width = (P.hp / S.maxhp * 100) + '%';
  $('hpBar').classList.toggle('low', P.hp / S.maxhp < .3);
  set($('hpTxt'), `${Math.ceil(P.hp)} / ${S.maxhp}`);
  $('nitroBar').style.width = (P.nitro * 100) + '%';
  $('nitroBar').classList.toggle('on', P.boost);
  $('heatBar').style.width = (drift.heat * 100) + '%';
  set($('heatTxt'), drift.heat > .05 ? `Heat · fire rate +${Math.round(drift.heat * 80)}%` : 'Heat');
  set($('waveLbl'), `Wave ${G.wave}`);
  const t = Math.max(0, G.waveT);
  set($('timer'), `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
  $('timer').classList.toggle('warn', t < 6);
  const filled = Math.round((1 - t / G.waveLen) * 10);
  [...dashes.children].forEach((d, i) => d.classList.toggle('on', i < filled));
  set($('scrapTxt'), fmt(G.scrap)); set($('wreckTxt'), `${fmt(G.wrecks)} wrecks`);
  set($('spdTxt'), String(Math.round(P.sp * .36)));
  set($('angTxt'), `${P.slipDeg}°`);
  set($('driftNum'), fmt(drift.pts)); set($('driftMul'), `×${drift.mult.toFixed(1)}`);
  $('driftPill').classList.toggle('on', drift.on && drift.pts > 5);
  const boss = G.enemies.find(e => e.type === 'boss');
  $('bossPnl').classList.toggle('hide', !boss);
  if (boss) $('bossBar').style.width = (boss.hp / boss.max * 100) + '%';
  if (G.banner && G.banner.id !== bannerId) {
    bannerId = G.banner.id; const b = $('banner');
    b.querySelector('b').textContent = G.banner.s; b.querySelector('span').textContent = G.banner.sub;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }
}

/* floating numbers, projected from the 3D world */
const fx = $('fx'), pool = [];
for (let i = 0; i < 40; i++) { const d = document.createElement('div'); fx.appendChild(d); pool.push(d) }
export function texts(project) {
  let i = 0;
  for (const t of G.texts) {
    if (i >= pool.length) break;
    const p = project(t.x, t.y, 40 + (1 - t.life / t.max) * 30); if (!p.ok) continue;
    const d = pool[i++];
    d.style.display = 'block';
    d.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
    d.style.opacity = Math.min(1, t.life / t.max * 2);
    d.style.fontSize = t.size + 'px'; d.style.color = t.col;
    set(d, t.s);
  }
  for (; i < pool.length; i++) pool[i].style.display = 'none';
}
