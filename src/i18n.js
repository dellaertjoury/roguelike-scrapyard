// All player-facing text. The game is West-Vlaams only.
// West-Vlaams words picked from regional dialect dictionaries:
//   otto (auto), barsjok (bumper), tefète (dadelijk), slunse geven (gas geven),
//   bachten (achter), omooge (omhoog), Pietje Pek (de duivel), kassé (kapot),
//   slieren (slippen), plus the typical West-Flemish h-drop (ette, arder, ooibalen).

export const LANGS = [{ id: 'vls', name: 'West-Vlams' }];

const T = {
  vls: {
    title: 'Ottokeirkhof', pick: "Kies jen brol-otto. Overleef 't toertje, steek je schroot in de garasje en doe 't nog e keer.",
    best: 'Jen beste: toertje {lap}, {score} punten. Amaai!', startsWith: 'Begint mee {w}', lang: 'Toale',
    stat: ['Rap', 'Grip', 'Pantser', 'Rammen'],
    k_drive: 'rijen', k_hb: 'andrem, ouen vo te slieren', k_nitro: "nitro, slieren vult 't were", k_pause: 'efkes stille',
    k_tip: 'Slieren maakt je geweren ette: tot +80% rapper skietn.',
    hull: 'Karkasse', nitro: 'Nitro', heat: 'Ette', heatPct: 'Ette · +{p}% rapper skietn', lap: '{n}e TOERTJE', lapShort: 'TOERTJE', go: 'VOLLE GAS!', scrap: 'Schroot',
    wrecks: '{n} kassé', drift: 'Slieren', driftPill: 'SLIEREN', kmh: 'KM/U', boss: 'De Pikdorser',
    holdOut: "Ou 't {s} seconden vul", bossIn: 'Pietje Pek komt eroan!', lapClear: 'Toertje gedoan!', garageOpen: 'De garasje es open',
    fDrift: 'Slieren {p}', fScrap: '+{s} schroot', fCombo: 'Slieren kapot', fAir: 'Vliegn {t}s', fCrush: 'Platgereen!',
    garage: 'Garasje · toertje {n} overleefd', scrapAmt: '{n} schroot', next: 'Nog e toertje!', reroll: 'Ander brol · {c}',
    lock: 'Vastzetn', locked: 'Vastgezet', isNew: 'Nieuw', lvl: 'Lv {a} → {b}', owned: '{n} keer derin', fitted: 'Derin', price: '{p} schroot',
    myParts: 'Jen stukken', noParts: 'Nog niks derin.', lockHint: 'Vastgezette stukken bluven liggen tot de volgende keer.',
    st: ['Karkasse', 'Topsnelheid', 'Grip', 'Pantser', 'Rammen', "Zeer bij 't rammen", 'Schade', 'Rap skietn', 'Were plakken', 'Magneet'],
    wrecked: 'KASSÉ!', reached: 'Toertje {lap} g\'oald mee: {car}', overLine: '{w} kassé · beste slieren {d} · score {s}',
    newBest: 'Nieuw record, amaai!', back: "Nor 't hoofdmenu", paused: 'Efkes stille', resume: 'Voort doen',
    loading: 'Den motor wordt warm gedroaid…',
    tips: ['Slieren maakt je geweren ette: tot +80% rapper skietn.', 'Banden bounsen je were weg. Ooibalen nie.',
      "Ip de schans? Heef mo slunse! Land ip ne otto en 't es 'm platgereen.", 'Rammen doet zeer, ook an jen eigen otto. De zwoarste wint.',
      "Zet e stuk vaste in de garasje en 't ligt d'r nog 't volgende toertje.", "Rij up de plaat van de pompe: tot 30 L (+30 s) recht in je tank. As je tank leeg es, es 't toertje gedoan.", "Groene pikkers zuigen je nafte leeg. Rij ze kassé en pak den bidon, dan è je 't were."],
    elites: {"harvester": ["De Pikdorser", "pas ip vo zijn vliegende zoagen"], "monster": ["Den Dikken Bompa", "blijf uit de rooie cirkel as 'ie landt"], "tow": ["De Takelwagen", "geef nitro om van zijnen aak los te komen"]},
    eliteSub: "Elite! {name}: {hint}", fHooked: "An den aak!", fFree: "Los!",
    fuel: "Nafte", tankFull: "Volle tank: {l} lieters\nTank bij an de pompe", outOfFuel: "Zonder nafte", fStolen: "-{l} L gepikt!", fFuel: "+{l} L", pumpOpen: "Pompe open", pumpEmpty: "Pompe leeg", pumpDry: "LEEG", pitSign: "GARASJE", settings: "Instellingen", toGarage: "Nor de garasje", toMenu: "Hoofdmenu", toMenuHint: "Garasje: 't toertje stopt hier, je schroot blijft. Hoofdmenu: je run es kwijt.", back2: "Kerre ke wére", lapQuit: "Toertje gestopt",
    opts: { zoom: "Camera", near: "Dichtbie", normal: "Normoal", far: "Verre", shake: "Schuddn van 't scherm", on: "Aan", off: "Uut", fx: "Stof en vonken", many: "Vele", few: "Nie te vele" }, craneWarn: "SLOOPHAMER!", craneSign: ["GEVAAR", "Sloophamer passeert iere", "Zet veurzichtig wè!"], fireRate: "rapper skietn", pumpSoon: "Pompe komt in {s} s", pumpGot: "+{l} L · +{l} s",
    thiefIntro: "Nieuw: naftepikkers pakken 6 L. Rij ze kassé en je è 't were.", spitIntro: "Nieuw: spuwers blijven op afstand en skietn rode kogels. Ontwijk ze en rij d'r up.", bruteIntro: "Nieuw: bonkers zijn traag en zwoar, mè ne stoalen balk. Rij d'r nie frontoal in.",
    tags: { Weapon: 'Geweer', 'Weapon mod': 'Geweer-tuning', Engine: 'Motor', Handling: 'Stuurwerk', Armour: 'Pantser', Ram: 'Rammen', Drift: 'Slieren', Utility: 'Allerlei', Repair: 'Plakwerk' },
    cars: { hatch: ['Zwerfotto', "Licht en zenuwachtig, plakt an de baan. Kassé as je d'r scheef nor kijkt."],
      muscle: ['Roestbak', 'V8-vechter die zot es van slieren. Wordt rapper ette in e slip.'],
      hearse: ['Lijkotto', "Traag, zwoar en gepantserd. Rammen es zijn ambacht, en ie leit mijnen bachten 'm."] },
    w: {
      mg2: ['Kofferkoepel', (l, d) => `Tweede mitraljeur ip de koffer, skiet ip e andere otto dan je dakgeweer. ${l >= 3 ? 'Dubbele loop. ' : ''}${d} schade per kogel`],
      mg: ['Dakmitraljeur', (l, d) => `Sjiet vanzelf ip d'otto die 't dichtste es. ${l >= 3 ? 'Dubbele loop. ' : ''}${d} schade per kogel`],
      mines: ['Mijnenlegger', (l, d, s) => `Leit alle ${s} seconden e mijne bachten je. ${d} schade as 't ontploft`],
      tesla: ['Teslaspoele', (l, d, n) => `Geeft ne sjok an één otto en springt deur nor ${n} andere. ${d} schade`],
      flame: ['Vlammenwerper', (l, d) => `Stekt alles vo je in brand. ${d} schade per tik`],
      saw: ['Zijzoagen', (l, d) => `Droaiende zoagen ip stoalen armen, links en rechts. Vanaf Lv 4: twee per kant. ${d} schade per kap`]
    },
    parts: {"magnet": ["Kraanmagneet", "+55 bereik om schroot ip te rapen, per level"], "cage": ["Rolkooi", "+25 max karkasse en 4% minder schade, per level"], "v8": ["V8 mee blower", "+10% rapper, +13% beter optrekken, per level"], "rounds": ["Kiste kogels", "+15% schade vo ol je geweren, per level"], "cooler": ["Geweerkoeler", "+12% rapper skietn mee ol je geweren, per level"], "plow": ["Rammploeg", "+35% rammen en 20% minder zeer an jen eigen otto, per level"], "spikes": ["Pinnekesgrille", "Ol wa je anraakt krijgt 12 schade per tik, per level"], "bullbar": ["Koeienvanger", "+6% pantser en +12% gewicht, per level"], "exhaust": ["Vuurspuwende uitlaten", "Slieren laat e brandend spoor bachten je, ieder level wermer"], "spoiler": ["Spoiler", "+10% grip, +5% beter droaien, per level"], "nitro": ["Nitrobidons", "Nitro vult 40% rapper en duwt 10% arder, per level"], "ballast": ["Blok beton", "+30% gewicht en +10 karkasse per level, 5% trager vertrekken"], "radar": ["Nafteradar", "+20% kans da der e pompe opduukt in e toertje, per level (standoard 45%)"], "tank": ["Reservetank", "+10 L nafte in je tank, dus 10 seconden langer rijen per toertje, per level"], "toolbox": ["Gereedschapskiste", "Plakt 0,8 karkasse per seconde were vaste, per level"], "scrapbin": ["Schrootbak", "+20% kans op extra schroot, per level"], "plate": ["Deurplaten", "8% minder schade, per level"], "skirts": ["Slier-schorten", "Slier-combo en ette goan 30% rapper omooge, per level"], "slicks": ["Brede slicks", "+15% grip, +8% beter droaien, per level"]},
    bpViews: { side: "Zijaanzicht", top: "Bovenaanzicht" }, slots: {"turret": "Koepel (vaste)", "turret2": "Tweede koepel", "roof": "Dak", "hood": "Motorkap", "front": "Voorbarsjok", "rear": "Achterbarsjok", "trunk": "Koffer", "sides": "Zijkanten"},
    packs: {"britland": ["Britland", "De Mini Cooper en den Engelsen taxi. Thee drinken mag.", ["Mini Cooper", "Londense taxi"]], "f1": ["Da rappe wè", "Ne Formule 1 en de Safety Car. Stief rap, stief broos.", ["Formule 1", "Safety Car"]]},
    forSale: "Te koop",
    blueprint: "Bouwplan",
    empty: "Leeg",
    replaces: "Vervangt {x}",
    upTo: "Nor Lv {n}",
    tier: "Klasse {n}",
    fits: "{s}",
    repair: "Repareren 50% · {c}",
    maxed: "Ol vul",
    soon: "Binnenkort",
    packsTitle: "Uitbreidingen"
  }
};

let cur = 'vls';
export function detectLang() { return 'vls' }
export function setLang() { cur = 'vls'; document.documentElement.lang = 'nl-BE' }
export const lang = () => cur;
export const L = () => T[cur];
export function t(key, vars) {
  let s = T[cur][key] ?? key;
  if (vars && typeof s === 'string') for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}
// numbers: Belgian decimal comma
export const num = n => Math.round(n).toLocaleString('nl-BE');
