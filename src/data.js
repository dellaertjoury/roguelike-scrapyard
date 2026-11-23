// Static game data: cars, upgrades, weapons, enemy palette.
// Speeds are in world units per second (10 units ≈ 1 metre, so 300 ≈ 108 km/h).

export const CARS = [
  {
    id: 'hatch', name: 'Stray Hatch', color: '#f2c230', num: 7, len: 44, wid: 24,
    shape: { cabL: .5, cabX: -.08, cabH: .42 },
    desc: 'Light and twitchy, grips like glue. Folds if you look at it wrong.',
    st: { maxhp: 70, top: 335, accel: 430, grip: 6.2, turn: 3.4, mass: .8, ram: .8 },
    w: { mg: 1 }, bars: [90, 88, 30, 30]
  },
  {
    id: 'muscle', name: 'Rust Muscle', color: '#e8553a', num: 23, len: 50, wid: 26,
    shape: { cabL: .36, cabX: -.14, cabH: .34 },
    desc: 'V8 brawler that loves going sideways. Heat builds faster in a slide.',
    st: { maxhp: 100, top: 305, accel: 380, grip: 4.8, turn: 3.0, mass: 1.2, ram: 1, driftGain: 1.35 },
    w: { mg: 1 }, bars: [75, 60, 55, 55]
  },
  {
    id: 'hearse', name: 'Iron Hearse', color: '#56606e', num: 66, len: 60, wid: 28,
    shape: { cabL: .62, cabX: -.12, cabH: .44 },
    desc: 'Slow, heavy, armoured. Rams for a living and lays mines behind it.',
    st: { maxhp: 150, top: 255, accel: 300, grip: 4.3, turn: 2.6, mass: 2, ram: 1.6, armor: .1 },
    w: { mines: 1 }, bars: [45, 45, 90, 95]
  }
];

export const BASE = {
  maxhp: 100, top: 305, accel: 380, grip: 4.8, turn: 3.0, mass: 1, ram: 1, armor: 0, dmg: 1, rate: 1,
  magnet: 110, regen: 0, driftGain: 1, exhaust: 0, spikes: 0, nitroPow: 1, nitroFill: 1, luck: 0
};

export const WNAME = { mg: 'Roof MG', mines: 'Mine Layer', tesla: 'Tesla Coil', flame: 'Flamethrower', saw: 'Buzz Saws' };

export const WD = {
  mg: l => `Auto-fires at the nearest car. ${l >= 3 ? 'Twin barrels. ' : ''}${6 + l * 3} dmg per round`,
  mines: l => `Drops a proximity mine behind you every ${(2.4 - l * .3).toFixed(1)}s. ${30 + l * 20} blast dmg`,
  tesla: l => `Zaps a target and arcs to ${l + 1} more. ${10 + l * 7} dmg`,
  flame: l => `Torches everything in a forward cone. ${4 + l * 2} dmg per tick`,
  saw: l => `${l} saw blade${l > 1 ? 's' : ''} orbit the car. ${12 + l * 5} dmg per hit`
};

// f(G) applies the upgrade. Weapons (w) level up instead.
export const ITEMS = [
  { id: 'mg', w: 'mg', tag: 'Weapon', cost: 18 },
  { id: 'mines', w: 'mines', tag: 'Weapon', cost: 22 },
  { id: 'tesla', w: 'tesla', tag: 'Weapon', cost: 26 },
  { id: 'flame', w: 'flame', tag: 'Weapon', cost: 24 },
  { id: 'saw', w: 'saw', tag: 'Weapon', cost: 24 },
  { id: 'v8', name: 'V8 Swap', tag: 'Engine', cost: 16, d: '+12% top speed, +15% acceleration', f: G => { G.S.top *= 1.12; G.S.accel *= 1.15 } },
  { id: 'slicks', name: 'Racing Slicks', tag: 'Handling', cost: 12, d: '+15% grip, +8% steering', f: G => { G.S.grip *= 1.15; G.S.turn *= 1.08 } },
  { id: 'cage', name: 'Roll Cage', tag: 'Armour', cost: 14, d: '+25 max HP and repair 25 now', f: G => { G.S.maxhp += 25; G.P.hp += 25 } },
  { id: 'plate', name: 'Steel Plating', tag: 'Armour', cost: 18, max: 6, d: 'Take 8% less damage from everything', f: G => { G.S.armor += .08 } },
  { id: 'bumper', name: 'Ram Bumper', tag: 'Ram', cost: 14, d: '+35% ram damage', f: G => { G.S.ram *= 1.35 } },
  { id: 'ballast', name: 'Concrete Ballast', tag: 'Ram', cost: 10, d: '+40% mass: hit harder, get shoved less. 6% slower off the line', f: G => { G.S.mass *= 1.4; G.S.accel *= .94 } },
  { id: 'spikes', name: 'Spiked Hubcaps', tag: 'Ram', cost: 16, max: 4, d: 'Anything touching you takes 12 damage per tick', f: G => { G.S.spikes++ } },
  { id: 'tuner', name: 'Drift Tuner', tag: 'Drift', cost: 14, d: 'Drift combo and weapon heat build 30% faster', f: G => { G.S.driftGain *= 1.3 } },
  { id: 'exhaust', name: 'Afterburner Exhaust', tag: 'Drift', cost: 24, max: 3, d: 'Drifting leaves a trail of burning fuel', f: G => { G.S.exhaust++ } },
  { id: 'nitro', name: 'Nitro Tank', tag: 'Engine', cost: 14, max: 4, d: 'Nitro refills 40% faster and pushes 10% harder', f: G => { G.S.nitroPow *= 1.1; G.S.nitroFill *= 1.4 } },
  { id: 'rounds', name: 'Hot Rounds', tag: 'Weapon mod', cost: 20, d: '+15% damage for every weapon', f: G => { G.S.dmg *= 1.15 } },
  { id: 'ecu', name: 'Overclocked ECU', tag: 'Weapon mod', cost: 20, d: '+12% fire rate for every weapon', f: G => { G.S.rate *= 1.12 } },
  { id: 'magnet', name: 'Junkyard Magnet', tag: 'Utility', cost: 9, d: '+45 scrap pickup range', f: G => { G.S.magnet += 45 } },
  { id: 'tape', name: 'Duct Tape', tag: 'Repair', cost: 12, d: 'Regenerate 0.8 HP per second', f: G => { G.S.regen += .8 } },
  { id: 'kit', name: 'Field Repair', tag: 'Repair', cost: 7, d: 'Repair 50% of max HP right now', f: G => { G.P.hp = Math.min(G.S.maxhp, G.P.hp + G.S.maxhp * .5) } },
  { id: 'dice', name: 'Fuzzy Dice', tag: 'Utility', cost: 12, max: 4, d: '+20% chance that wrecks drop extra scrap', f: G => { G.S.luck += .2 } }
];

export const TAGC = {
  Weapon: '#ff7a52', 'Weapon mod': '#ffa261', Engine: '#ffc23d', Handling: '#8fd0ea',
  Armour: '#c9ccd2', Ram: '#ff6b5a', Drift: '#ffb347', Utility: '#a8d88a', Repair: '#7fdcaa'
};

export const ECOL = ['#7c9a5e', '#a8452f', '#4f7a92', '#b49a5a', '#7a62a0', '#8a8a82', '#b8662e', '#3f7a5f', '#c2b8a0', '#5a6fb0'];

// Enemy archetypes scale with wave number n.
export const ENEMY = n => ({
  rust:  { r: 17, len: 42, wid: 22, hp: 16 + n * 7, spd: 150 + n * 4, dmg: 8 + n * .8, mass: .9, turn: 2.4, sc: 1 },
  spit:  { r: 17, len: 40, wid: 22, hp: 20 + n * 6, spd: 140 + n * 2.5, dmg: 6 + n * .6, mass: .8, turn: 2.6, sc: 2 },
  brute: { r: 25, len: 62, wid: 32, hp: 80 + n * 20, spd: 110 + n * 2.5, dmg: 18 + n * 1.5, mass: 2.6, turn: 1.6, sc: 4 },
  boss:  { r: 46, len: 112, wid: 56, hp: 650 * (n / 5) + n * 60, spd: 125, dmg: 30 + n, mass: 8, turn: 1.3, sc: 40 }
});
