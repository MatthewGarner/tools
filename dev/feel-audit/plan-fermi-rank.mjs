/* Fermi and Rank entries for run.mjs's PLAN ([id, tools, modes, fn(env, tool)]), the subset run
   in WebKit, and the checks the 2026-11-13 Fermi/Rank audit confirmed as defects (tagged [known]). */
import * as F from './scenarios-fermi.mjs';
import * as K from './scenarios-rank.mjs';
import {hashOpen} from './fr-lib.mjs';

const T = ['normal', 'cpu4x'], N = ['normal'];
const both = fn => async (e, t) => { for(const k of ['desktop', 'phone']) await fn(e, k); };
export const FR_PLAN = [
  ['f-load', ['fermi'], T, async e => { await both(F.load)(e); await F.load(e, 'desktop', {hash: hashOpen(F.LONG), label: 'long'}); }],
  ['f-type', ['fermi'], T, async e => { await F.typing(e, 'desktop'); await F.typing(e, 'desktop', {label: 'long', state: F.LONG}); if(e.mode === 'normal') await F.typing(e, 'phone'); }],
  ['f-view', ['fermi'], T, both(F.views)],
  ['f-replay', ['fermi'], T, async e => { await F.replay(e, 'desktop'); if(e.mode === 'normal'){ await F.replay(e, 'phone'); await F.replay(e, 'desktop', {reduced: true}); } }],
  ['f-goal', ['fermi'], T, async e => { await F.goal(e, 'desktop'); if(e.mode === 'normal') await F.goal(e, 'phone'); }],
  ['f-adopt', ['fermi'], N, both(F.adopt)],
  ['f-review', ['fermi'], N, both(F.review)],
  ['f-compare', ['fermi'], T, both(F.compare)],
  ['f-author', ['fermi'], T, both(F.author)],
  ['f-cashflow', ['fermi'], T, async e => { await F.cashflow(e, 'desktop'); if(e.mode === 'normal') await F.cashflow(e, 'phone'); }],
  ['f-copy', ['fermi'], N, both(F.copies)],
  ['f-menu', ['fermi'], N, both(F.menus)],
  ['f-shell', ['fermi'], N, both(F.shell)],
  ['f-example', ['fermi'], T, both(F.examples)],
  ['f-theme', ['fermi'], T, async e => { await F.theme(e, 'desktop'); if(e.mode === 'normal') await F.theme(e, 'phone'); }],
  ['f-reduced', ['fermi'], N, async e => F.reduced(e)],
  ['f-controls', ['fermi'], N, both(F.controlsFermi)],
  ['f-touch', ['fermi'], N, async e => F.touch(e)],

  ['r-load', ['rank'], T, async e => { await both(K.load)(e); await K.load(e, 'desktop', {hash: hashOpen(K.LONG), label: 'long'}); await K.load(e, 'phone', {hash: hashOpen(K.LONG), label: 'long'}); }],
  ['r-score', ['rank'], T, both(K.score)],
  ['r-name', ['rank'], T, both(K.names)],
  ['r-slider', ['rank'], T, async e => { await K.slider(e, 'desktop'); await K.slider(e, 'phone'); }],
  ['r-weightbox', ['rank'], T, async e => K.weightBox(e, 'desktop')],
  ['r-add', ['rank'], N, both(K.addRemove)],
  ['r-paste', ['rank'], N, both(K.paste)],
  ['r-capacity', ['rank'], T, both(K.capacity)],
  ['r-wobble', ['rank'], T, both(K.wobble)],
  ['r-orders', ['rank'], T, both(K.orders)],
  ['r-copy', ['rank'], N, both(K.copies)],
  ['r-shell', ['rank'], N, both(K.shell)],
  ['r-theme', ['rank'], T, async e => { await K.theme(e, 'desktop'); if(e.mode === 'normal') await K.theme(e, 'phone'); }],
  ['r-reduced', ['rank'], N, async e => K.reduced(e)],
  ['r-controls', ['rank'], N, both(K.controlsRank)],
];
export const FR_WEBKIT = ['f-load', 'f-type', 'f-view', 'f-replay', 'f-author', 'r-load', 'r-score', 'r-slider', 'r-add'];

/* Checks still tagged [known] after the 2026-11-13 fix pass, each with the reason it stays. The rest of the audit's
   confirmed defects were fixed, passed, and lost their tag. 'id' tags every location; 'id@text' tags the locations whose
   where-string contains the text (phone, cpu4x, webkit...). A tag is only ever for a decision to leave the defect or for a fix
   that is on another branch: never for a condition that could hide a new regression. */
const SHARED = 'shared, fixed on another branch';
export const FR_KNOWN = [
  ['f.load.long.longtask', 'FF-03 left: the 13-input additive model\'s Monte Carlo and pinned re-simulations run in the load task (about 200 ms, 760 ms at 4x); the time is the engine\'s'],
  ['f.type.short.longtask', 'FF-04 left: the simulation after the 120 ms debounce is one 55-60 ms task; the time is the engine\'s'],
  ['f.type.long.keyrender', 'FF-04 left: the long additive formula\'s simulation (about 185 ms) follows the debounce'],
  ['f.type.long.longtask', 'FF-04 left: the same simulation, one 160-185 ms task'],
  ['f.mode.cf.longtask', 'FF-28 left: the 40,000-run cashflow simulation runs in the mode switch'],
  ['f.cf.longtask', 'FF-18 left: the 40,000-run simulation after a period edit is one 50-55 ms task (borderline; the time is the engine\'s)'],
  ['f.cf.grain.longtask', 'FF-18 left: simulation cost (40,000 runs)'],
  ['f.cf.remove.longtask', 'FF-18 left: simulation cost (40,000 runs)'],
  ['f.cf.example.paint', 'FF-18 left: the Geared build example simulates 40,000 runs in the click'],
  ['f.cf.example.feedback', 'FF-18 left: as above'],
  ['f.cf.example.longtask', 'FF-18 left: as above'],
  ['f.cf.debt.longtask', 'FF-18 left: the debt sizing and its simulation'],
  ['r.slider.page@rank/phone/normal/webkit', 'WebKit phone only, intermittent (about 1 run in 3, only in a full run): a full re-render lands mid-drag and the page shifts 21px; not reproduced alone or in a 2.4 s drag, cause not found'],
  ['f.menu.escape', SHARED + ' (FF-21: the Method disclosure)'],
  ['f.menu.outside', SHARED + ' (FF-21: the Method disclosure)'],
  ['f.controls.focus', SHARED + ' (FF-26: the verdict Copy chip ring, assets/page.css)'],
  ['f.controls.timing', SHARED + ' (control timing in assets/controls.css)'],
  ['r.slider.frames@rank/desktop', 'FR-09 left: one 51-68 ms frame gap with no long task during the drag'],
  ['r.slider.tokens', SHARED + ' (FR-10: the FLIP glide in assets/motion.css)'],
  ['r.controls.tokens', SHARED + ' (FR-10: assets/motion.css literals)'],
  ['r.controls.focus', SHARED + ' (FR-16)'],
  ['r.controls.timing', SHARED + ' (FR-16: control timing in assets/controls.css)'],
];
