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

  ['r-load', ['rank'], T, both(K.load)],
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

/* Confirmed defects (findings FF-/FR- in the local evidence folder feel-audit/fermi-rank/findings.json). 'id' tags every
   location; 'id@text' tags the locations whose where-string contains the text (phone, cpu4x, webkit…). */
export const FR_KNOWN = [
  'f.load.example.cls', // layout shift on load: the result panel is inserted after first paint (intermittent on desktop)
  'f.load.long.cls', // same, with a 13-input link
  'f.load.example.kicker', // kicker painted by script after first paint
  'f.load.long.kicker',
  'f.load.long.longtask', // one ~200ms (767ms at 4x) task computing a 13-input additive model on load
  'f.type.short.keyrender', // 180ms typing debounce + compute: a keystroke lands ~200-215ms later
  'f.type.short.longtask',
  'f.type.short.jump', // the "Updating estimate" status line inserts above the result while typing
  'f.type.long.keyrender',
  'f.type.long.longtask',
  'f.type.long.jump',
  'f.type.phone.visible', // the result is ~1300px below the formula on a phone
  'f.view.transition', // hard cut between distribution and driver tree
  'f.view.tree.focus@webkit', // WebKit: a clicked button is not focused and nothing re-focuses it
  'f.view.dist.focus@webkit',
  'f.replay.focus@webkit',
  'f.mode.cf.focus@webkit',
  'f.mode.est.focus@webkit',
  'f.replay.jump', // the pour verdict line grows the page by 6-26px
  'f.replay.reduced', // reduced motion: the pour overlay still sits for ~4s
  'f.goal.ghosts.visible', // the confession's ghost ranges and Adopt render inside the closed authoring panel
  'f.adopt.cls', // Adopt rebuilds the rows: focus to body and a scroll jump
  'f.adopt.focus',
  'f.adopt.undo.cls',
  'f.compare.on.focus', // renderTabs rebuilds the tab buttons: focus to body
  'f.compare.switch.focus',
  'f.compare.off.focus',
  'f.mode.cf.longtask',
  'f.cf.remove.longtask',
  'f.cf.remove.focus', // the removed row's button goes with it: focus to body
  'f.cf.grain.longtask',
  'f.cf.example.paint', // Geared build: ~100ms synchronous simulation in the click
  'f.cf.example.feedback',
  'f.cf.example.longtask',
  'f.cf.debt.longtask',
  'f.cf.debt.tap',
  'f.copy.png.ack', // PNG download gives no on-page acknowledgement
  'f.menu.escape', // the Method disclosure ignores Escape and outside presses
  'f.menu.outside',
  'f.menu.tap',
  'f.file.startown', // Fermi's File has no New / Examples
  'f.example.cls@phone',
  'f.example.long.cls@phone',
  'f.controls.hover',
  'f.controls.focus', // .vcopy has outline:none on focus-visible
  'f.controls.timing', // controls ease at .15s / 0s, not --dur-fast
  'f.controls.pressed',
  'f.controls.tokens',
  'f.controls.tap.cf',
  'f.controls.font.cf',
  'r.load.cls', // result rows inserted after first paint
  'r.load.kicker',
  'r.score.keyrender', // 200ms debounce + render
  'r.score.reorder', // a score edit replaces the rows: no FLIP
  'r.score.commit', // leaving the field re-simulates and re-renders unchanged results
  'r.score.phone.visible',
  'r.name.criterion.phone', // criteria cannot be renamed, nor weights typed, on a phone
  'r.slider.frames@rank/desktop',
  'r.slider.release@phone', // the verdict lines above the phone strip re-flow on release: strip moves ~21px
  'r.slider.tokens', // the shared FLIP is 240ms, not a token
  'r.add.motion',
  'r.remove.cls@phone', // focus to Undo removal scrolls the phone page ~1140px
  'r.undo.cls@phone',
  'r.paste.import.cls',
  'r.paste.import.focus',
  'r.paste.escape',
  'r.wobble.w.keyrender',
  'r.wobble.s.keyrender',
  'r.orders.keyrender',
  'r.capacity.keyrender',
  'r.controls.focus',
  'r.controls.timing',
  'r.controls.tokens',
  'r.controls.tap',
];
