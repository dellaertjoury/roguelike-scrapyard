// Optional art. Every file here is optional: if it is missing the game
// falls back to procedural art. See ART_PROMPTS.md for what to generate.
import { CARS, PARTS, PACKS, ELITES } from './data.js';
import { LANGS } from './i18n.js';

export const A = { fx: {}, elites: {}, dirt: null, menuBg: null, garageBg: null, logos: {}, cars: {}, icons: {}, ui: {}, packs: {} };
export const UI_ICONS = ['hull', 'nitro', 'heat', 'scrap', 'lap', 'drift', 'speed', 'boss', 'lock', 'repair', 'reroll'];

const img = src => new Promise(res => {
  const i = new Image();
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

export async function loadAssets(onProgress = () => { }) {
  let done = 0;
  const jobs = [
    img('assets/ground-dirt.jpg').then(i => A.dirt = i),
    img('assets/menu-bg.jpg').then(i => A.menuBg = i),
    img('assets/garage-bg.jpg').then(i => A.garageBg = i),
    img('assets/fx/fire-trail.png').then(i => { if (i) A.fx.fire = i }),
    ...ELITES.map(k => img(`assets/elites/${k}.png`).then(i => { if (i) A.elites[k] = i.src })),
    ...PACKS.map(p => img(`assets/packs/${p.id}.jpg`).then(i => { if (i) A.packs[p.id] = i.src })),
    img('assets/logo.png').then(i => { if (i) A.logos.en = i.src }),
    ...LANGS.filter(l => l.id !== 'en').map(l => img(`assets/logo-${l.id}.png`).then(i => { if (i) A.logos[l.id] = i.src })),
    ...CARS.map(c => img(`assets/cars/${c.id}.png`).then(i => { if (i) A.cars[c.id] = i.src })),
    ...PARTS.map(it => img(`assets/icons/${it.id}.png`).then(i => { if (i) A.icons[it.id] = i.src })),
    ...UI_ICONS.map(k => img(`assets/ui/${k}.png`).then(i => { if (i) A.ui[k] = i.src }))
  ].map(p => p.then(() => onProgress(++done / jobs.length)));
  // never let slow art block the game for more than a few seconds
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 5000))]);
}
