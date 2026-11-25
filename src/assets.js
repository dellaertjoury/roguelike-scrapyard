// Optional art. Every file here is optional: if it is missing the game
// falls back to procedural art. See ART_PROMPTS.md for what to generate.
import { CARS, PARTS, PACKS } from './data.js';

export const A = { fx: {}, elites: {}, dirt: null, menuBg: null, garageBg: null, logos: {}, cars: {}, icons: {}, ui: {}, packs: {}, obs: {}, skins: {}, pit: {} };
// Car skins that exist in assets/skins/ (add an id here when its <id>-top.png and <id>-side.png arrive).
// Possible ids: hatch, muscle, hearse, rust, spit, brute, thief, harvester, monster, tow.
export const SKINS = ['hatch', 'muscle', 'hearse'];
// Pit entry art that exists in assets/pit/ (add 'gate' / 'driveway' when gate.png / driveway.jpg arrive).
export const PIT_ART = [];
export const UI_ICONS = ['hull', 'nitro', 'heat', 'scrap', 'lap', 'drift', 'boss', 'fuel-gauge', 'fuel-needle', 'pump', 'jerrycan'];
// art with a slot in the game but no file yet; move an id into UI_ICONS when assets/ui/<id>.png arrives:
// 'cluster-speedo', 'cluster-nitro', 'sign-crane'

const img = src => new Promise(res => {
  const i = new Image();
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

export async function loadAssets(onProgress = () => { }) {
  let done = 0;
  const jobs = [
    img('assets/ground-dirt.jpg').then(i => A.dirt = i),
    img('assets/loading-bg.jpg').then(i => A.menuBg = i), // the menu uses the loading screen's art
    img('assets/garage-bg.jpg').then(i => A.garageBg = i),
    img('assets/fx/fire-trail.png').then(i => { if (i) A.fx.fire = i }),
    img('assets/obstacles/hay-side.jpg').then(i => { if (i) A.obs.side = i }),
    img('assets/obstacles/hay-top.png').then(i => { if (i) A.obs.top = i }),
    img('assets/fx/pump-pad.png').then(i => { if (i) A.fx.pad = i }),
    // painted car skins: both halves must exist for a skin to be used
    ...PIT_ART.map(k => img(`assets/pit/${k}.${k === 'gate' ? 'png' : 'jpg'}`).then(i => { if (i) A.pit[k] = i })),
    // optional extra views (other flank, nose, tail): with all three the car is painted on every face, wheels included
    ...SKINS.map(k => Promise.all(['top', 'side', 'sideL', 'front', 'back'].map(v => img(`assets/skins/${k}-${v}.png`))).then(([a, b, c, d, e]) => { if (a && b) A.skins[k] = { top: a, side: b, sideL: c, front: d, back: e } })),
    // assets/elites/*.png are reference portraits for the 3D enemy models, not loaded in game
    ...PACKS.map(p => img(`assets/packs/${p.id}.jpg`).then(i => { if (i) A.packs[p.id] = i.src })),
    img('assets/logo-vls.png').then(i => { if (i) A.logos.vls = i.src }),
    ...[...CARS.map(c => c.id), ...PACKS.flatMap(p => p.cars)].map(id => img(`assets/cars-cut/${id}.png`).then(i => { if (i) A.cars[id] = i.src })),
    ...PARTS.map(it => img(`assets/icons/${it.id}.png`).then(i => { if (i) A.icons[it.id] = i.src })),
    ...UI_ICONS.map(k => img(`assets/ui/${k}.png`).then(i => { if (i) A.ui[k] = i.src }))
  ].map(p => p.then(() => onProgress(++done / jobs.length)));
  // never let slow art block the game for more than a few seconds
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 5000))]);
}
