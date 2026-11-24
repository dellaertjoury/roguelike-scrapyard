// Entry point: loading screen, optional art, language, input and the frame loop.
import { G, start, update, makeGround, makeObs, setDirt } from './game.js';
import { CARS } from './data.js';
import { detectLang, setLang } from './i18n.js';
import * as UI from './ui.js';
import { A, loadAssets } from './assets.js';

setLang(detectLang());
UI.loadingText();
UI.loading(.08); // the 3D engine has arrived by the time this runs

const t0 = performance.now();
await loadAssets(p => UI.loading(.1 + p * .7));
if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
const SC = await import('./scene.js');
UI.loading(.9);
setDirt(A.dirt); SC.initFx();
makeGround(); makeObs();
const portraits = SC.portraits(CARS);
UI.buildMenu(portraits);
UI.loading(1);
UI.wire(
  i => { SC.hideDemo(); start(i) },
  () => { G.state = 'menu'; G.enemies = []; G.texts = []; G.P = null; makeGround(); makeObs(); UI.buildMenu(); UI.show('menu') },
  () => { makeGround() } // repaint the arena title in the new language
);
G.on.play = () => UI.show(null);
G.on.shop = UI.openShop;
G.on.over = UI.showOver;
UI.show('menu');
// keep the loading screen up for at least a moment so it never just flickers
setTimeout(UI.hideLoading, Math.max(0, 1400 - (performance.now() - t0)));

/* input */
const GAMEKEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
const pause = () => { if (G.state === 'play') { G.state = 'pause'; UI.show('pause') } };
addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (G.state === 'play' && GAMEKEYS.includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state === 'play') pause();
    else if (G.state === 'pause') { G.state = 'play'; UI.show(null) }
  }
});
addEventListener('keyup', e => { G.keys[e.code] = false });
UI.touch(pause);
addEventListener('blur', () => { for (const k in G.keys) G.keys[k] = false; pause() });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause() });

/* loop */
let last = performance.now();
function frame(now) {
  // real elapsed time, run in steps of at most 1/30 s: slow devices stay at normal speed instead of slow motion
  const raw = Math.min(.1, (now - last) / 1000); last = now;
  try {
    const live = ['play', 'clear', 'dead'].includes(G.state);
    if (G.state === 'menu') SC.attract(raw);
    else {
      if (live) { let rem = raw; while (rem > 1e-4) { const s = Math.min(rem, 1 / 30); update(s); rem -= s } }
      else update(0);
      SC.render(raw);
      UI.hud();
    }
    UI.texts(live ? SC.project : null);
  } catch (err) { console.error(err) }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
