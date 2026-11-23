// Optional art. Every file here is optional: if it is missing the game
// falls back to procedural art. See ART_PROMPTS.md for what to generate.
import { CARS, ITEMS } from './data.js';

export const A = { dirt: null, logo: null, menuBg: null, cars: {}, icons: {} };

const img = src => new Promise(res => {
  const i = new Image();
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

export async function loadAssets() {
  const jobs = [
    img('assets/ground-dirt.jpg').then(i => A.dirt = i),
    img('assets/logo.png').then(i => A.logo = i),
    img('assets/menu-bg.jpg').then(i => A.menuBg = i),
    ...CARS.map(c => img(`assets/cars/${c.id}.png`).then(i => { if (i) A.cars[c.id] = i.src })),
    ...ITEMS.map(it => img(`assets/icons/${it.id}.png`).then(i => { if (i) A.icons[it.id] = i.src }))
  ];
  // never let slow art block the game for more than a few seconds
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 4000))]);
}
