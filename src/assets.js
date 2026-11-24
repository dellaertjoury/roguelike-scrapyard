// Optional art. Every file here is optional: if it is missing the game
// falls back to procedural art. See ART_PROMPTS.md for what to generate.
import { CARS, PARTS, PACKS } from './data.js';

export const A = { fx: {}, elites: {}, dirt: null, menuBg: null, garageBg: null, logos: {}, cars: {}, icons: {}, ui: {}, packs: {}, obs: {}, skins: {} };
// Car skins that exist in assets/skins/ (add an id here when its <id>-top.png and <id>-side.png arrive).
// Possible ids: hatch, muscle, hearse, rust, spit, brute, thief, harvester, monster, tow.
export const SKINS = [];
export const UI_ICONS = ['hull', 'nitro', 'heat', 'scrap', 'lap', 'drift', 'boss', 'fuel-gauge', 'fuel-needle', 'pump', 'jerrycan', 'cluster-speedo', 'cluster-nitro'];

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
    img('assets/obstacles/hay-side.jpg').then(i => { if (i) A.obs.side = i }),
    img('assets/obstacles/hay-top.png').then(i => { if (i) A.obs.top = i }),
    img('assets/fx/pump-pad.png').then(i => { if (i) A.fx.pad = i }),
    // painted car skins: both halves must exist for a skin to be used
    ...SKINS.map(k => Promise.all([img(`assets/skins/${k}-top.png`), img(`assets/skins/${k}-side.png`)]).then(([a, b]) => { if (a && b) A.skins[k] = { top: a, side: b } })),
    // assets/elites/*.png are reference portraits for the 3D enemy models, not loaded in game
    ...PACKS.map(p => img(`assets/packs/${p.id}.jpg`).then(i => { if (i) A.packs[p.id] = i.src })),
    img('assets/logo-vls.png').then(i => { if (i) A.logos.vls = i.src }),
    ...[...CARS.map(c => c.id), ...PACKS.flatMap(p => p.cars)].map(id => img(`assets/cars/${id}.png`).then(i => { if (i) A.cars[id] = i.src })),
    ...PARTS.map(it => img(`assets/icons/${it.id}.png`).then(i => { if (i) A.icons[it.id] = i.src })),
    ...UI_ICONS.map(k => img(`assets/ui/${k}.png`).then(i => { if (i) A.ui[k] = i.src }))
  ].map(p => p.then(() => onProgress(++done / jobs.length)));
  // never let slow art block the game for more than a few seconds
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 5000))]);
}
