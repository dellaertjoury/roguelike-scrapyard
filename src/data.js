// Static game data: cars, upgrades, weapons, enemy palette. Text lives in i18n.js.
// Speeds are in world units per second. The HUD shows them as km/h × 0.6 (190 → 114 km/h) so the speedo reads like a race car.

export const CARS = [
  {
    id: 'hatch', color: '#f2c230', num: 7, len: 44, wid: 24,
    shape: { cabL: .5, cabX: -.08, cabH: .42 },
    st: { maxhp: 70, top: 210, accel: 290, grip: 6.2, turn: 3.4, mass: .8, ram: .8 },
    build: { turret: ['mg', 1] }, bars: [90, 88, 30, 30]
  },
  {
    id: 'muscle', color: '#e8553a', num: 23, len: 50, wid: 26,
    shape: { cabL: .36, cabX: -.14, cabH: .34 },
    st: { maxhp: 100, top: 190, accel: 255, grip: 4.8, turn: 2.9, mass: 1.2, ram: 1, driftGain: 1.35 },
    build: { turret: ['mg', 1] }, bars: [75, 60, 55, 55]
  },
  {
    id: 'hearse', color: '#56606e', num: 66, len: 60, wid: 28,
    shape: { cabL: .62, cabX: -.12, cabH: .44 },
    st: { maxhp: 150, top: 160, accel: 205, grip: 4.3, turn: 2.6, mass: 2, ram: 1.6, armor: .04 },
    build: { turret: ['mg', 1], rear: ['mines', 1], front: ['bullbar', 1] }, bars: [45, 45, 90, 95]
  }
];

export const BASE = { tank: 30, pumpChance: .45,
  maxhp: 100, top: 190, accel: 255, grip: 4.8, turn: 3.0, mass: 1, ram: 1, armor: 0, dmg: 1, rate: 1,
  magnet: 110, regen: 0, driftGain: 1, exhaust: 0, spikes: 0, nitroPow: 1, nitroFill: 1, luck: 0, ramGuard: 1
};

// Weapon numbers per level; names and descriptions come from i18n.js.
export const WSTAT = {
  mg: l => [6 + l * 3],
  mines: l => [30 + l * 20, (4.6 - l * .5).toFixed(1)],
  tesla: l => [10 + l * 7, l + 1],
  flame: l => [4 + l * 2],
  saw: l => [14 + l * 6]
};

// Garage parts. Every part fits one fixed slot on the car; a slot holds one part.
// Buying the same part again levels it up (max), buying another part for that slot replaces it.
// Weapons (w) give the weapon level; other parts apply f(S, level) to the stats.
export const SLOTS = ['roof', 'hood', 'front', 'rear', 'trunk', 'sides'];
// the roof MG sits on its own fixed turret mount, so roof parts never cost you the gun
export const ALL_SLOTS = ['turret', ...SLOTS];
export const PARTS = [
  { id: 'mg', slot: 'turret', w: 'mg', tag: 'Weapon', cost: 18, max: 4 },
  { id: 'tesla', slot: 'roof', w: 'tesla', tag: 'Weapon', cost: 26, max: 4 },
  { id: 'magnet', slot: 'rear', tag: 'Utility', cost: 10, max: 3, f: (S, l) => { S.magnet += 55 * l } },
  { id: 'cage', slot: 'roof', tag: 'Armour', cost: 14, max: 3, f: (S, l) => { S.maxhp += 25 * l; S.armor += .04 * l } },
  { id: 'v8', slot: 'hood', tag: 'Engine', cost: 16, max: 3, f: (S, l) => { S.top *= 1 + .1 * l; S.accel *= 1 + .13 * l } },
  { id: 'flame', slot: 'hood', w: 'flame', tag: 'Weapon', cost: 24, max: 4 },
  { id: 'rounds', slot: 'hood', tag: 'Weapon mod', cost: 18, max: 3, f: (S, l) => { S.dmg *= 1 + .15 * l } },
  { id: 'cooler', slot: 'hood', tag: 'Weapon mod', cost: 18, max: 3, f: (S, l) => { S.rate *= 1 + .12 * l } },
  { id: 'plow', slot: 'front', tag: 'Ram', cost: 14, max: 3, f: (S, l) => { S.ram *= 1 + .35 * l; S.ramGuard *= Math.pow(.8, l) } },
  { id: 'spikes', slot: 'front', tag: 'Ram', cost: 16, max: 3, f: (S, l) => { S.spikes = l } },
  { id: 'bullbar', slot: 'front', tag: 'Armour', cost: 12, max: 3, f: (S, l) => { S.armor += .06 * l; S.mass *= 1 + .12 * l } },
  { id: 'mines', slot: 'rear', w: 'mines', tag: 'Weapon', cost: 22, max: 4 },
  { id: 'exhaust', slot: 'rear', tag: 'Drift', cost: 22, max: 3, f: (S, l) => { S.exhaust = l } },
  { id: 'spoiler', slot: 'rear', tag: 'Handling', cost: 12, max: 3, f: (S, l) => { S.grip *= 1 + .1 * l; S.turn *= 1 + .05 * l } },
  { id: 'nitro', slot: 'trunk', tag: 'Engine', cost: 14, max: 3, f: (S, l) => { S.nitroPow *= 1 + .1 * l; S.nitroFill *= 1 + .4 * l } },
  { id: 'ballast', slot: 'trunk', tag: 'Ram', cost: 10, max: 3, f: (S, l) => { S.mass *= 1 + .3 * l; S.accel *= 1 - .05 * l; S.maxhp += 10 * l } },
  { id: 'radar', slot: 'roof', tag: 'Utility', cost: 12, max: 3, f: (S, l) => { S.pumpChance = Math.min(1, S.pumpChance + .2 * l) } }, // +20% chance per lap that a pump shows up
  { id: 'tank', slot: 'trunk', tag: 'Utility', cost: 14, max: 3, f: (S, l) => { S.tank += 10 * l } }, // +10 L (= +10 s per lap) per level
  { id: 'toolbox', slot: 'trunk', tag: 'Repair', cost: 12, max: 3, f: (S, l) => { S.regen += .8 * l } },
  { id: 'scrapbin', slot: 'trunk', tag: 'Utility', cost: 12, max: 3, f: (S, l) => { S.luck += .2 * l } },
  { id: 'saw', slot: 'sides', w: 'saw', tag: 'Weapon', cost: 24, max: 4 },
  { id: 'plate', slot: 'sides', tag: 'Armour', cost: 16, max: 3, f: (S, l) => { S.armor += .08 * l } },
  { id: 'skirts', slot: 'sides', tag: 'Drift', cost: 14, max: 3, f: (S, l) => { S.driftGain *= 1 + .3 * l } },
  { id: 'slicks', slot: 'sides', tag: 'Handling', cost: 12, max: 3, f: (S, l) => { S.grip *= 1 + .15 * l; S.turn *= 1 + .08 * l } }
];
export const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));

// Expansion packs shown as "coming soon" on the main menu.
export const ELITES = ['harvester', 'monster', 'tow'];

export const PACKS = [
  { id: 'britland', cars: ['mini', 'taxi'], colors: ['#c8102e', '#012169'] },
  { id: 'f1', cars: ['f1', 'safety'], colors: ['#e10600', '#15151e'], flip: true } // flip: mirror the car art so every pack car faces right
];

// tag colours: weapons red, armour blue, ram yellow; the rest green (handling, utility, repair) or purple (engine, drift)
export const TAGC = {
  Weapon: '#ff4d4d', 'Weapon mod': '#ff7f7f', Armour: '#4da3ff', Ram: '#ffd23d',
  Engine: '#b57cff', Drift: '#d98cff', Handling: '#5fd88a', Utility: '#8fe06a', Repair: '#3fd6a8'
};

export const ECOL = ['#7c9a5e', '#a8452f', '#4f7a92', '#b49a5a', '#7a62a0', '#8a8a82', '#b8662e', '#3f7a5f', '#c2b8a0', '#5a6fb0'];

// Enemy archetypes scale with lap number n.
export const ENEMY = n => ({
  rust:  { r: 17, len: 42, wid: 22, hp: 22 + n * 9, spd: 95 + n * 3, dmg: 8 + n * .8, mass: .9, turn: 2.4, sc: 1 },
  spit:  { r: 17, len: 40, wid: 22, hp: 27 + n * 8, spd: 90 + n * 2, dmg: 6 + n * .6, mass: .8, turn: 2.6, sc: 2 },
  // fuel thief: fast, weak, steals fuel on contact, then flees; drops it back as a jerrycan when wrecked
  thief: { r: 16, len: 40, wid: 22, hp: 32 + n * 10, spd: 180 + n * 5, dmg: 3, mass: .7, turn: 3, sc: 2, col: '#5fbf4a' },
  brute: { r: 28, len: 62, wid: 32, hp: 110 + n * 27, spd: 70 + n * 2, dmg: 18 + n * 1.5, mass: 2.6, turn: 1.6, sc: 4 },
  // elites: one every 5 laps, in this order, each with its own special move
  harvester: { r: 46, len: 112, wid: 56, hp: 850 * (n / 5) + n * 80, spd: 80, dmg: 30 + n, mass: 8, turn: 1.3, sc: 40, elite: true, col: '#e0b040' },
  monster:   { r: 36, len: 72, wid: 48, hp: 730 * (n / 5) + n * 72, spd: 88, dmg: 26 + n, mass: 6, turn: 1.7, sc: 40, elite: true, col: '#7a3ab0' },
  tow:       { r: 36, len: 88, wid: 38, hp: 680 * (n / 5) + n * 65, spd: 96, dmg: 22 + n, mass: 5, turn: 1.6, sc: 40, elite: true, col: '#e8a020' }
});
