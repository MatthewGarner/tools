/* Bets, Tree and Paths entries for run.mjs's PLAN. Same shape: [id, tools, modes, fn(env, tool)].
   Ids are prefixed by tool where the scenario is tool-specific. */
import * as S from './scenarios.mjs';
import * as D from './disclosures.mjs';
import * as C from './scenarios-btp.mjs';
import * as B from './scenarios-bets.mjs';
import * as T from './scenarios-tree.mjs';
import * as P from './scenarios-paths.mjs';
import {KNOWN} from './checks.mjs';

const BTP = ['bets', 'tree', 'paths'], CARDS = ['bets', 'tree'];
const TM = ['normal', 'cpu4x'], N = ['normal'];
const both = async (fn, ...a) => { for(const k of ['desktop', 'phone']) await fn(...a.slice(0, 2), k, ...a.slice(2)); };

export const PLAN = [
  ['btp-load', BTP, TM, async (e, t) => { for(const k of ['desktop', 'phone']) await S.load(e, t, k); await S.load(e, t, 'desktop', {source: C.LARGE[t](), label: 'large'}); }],
  ['btp-views', ['bets', 'paths'], TM, async (e, t) => { for(const k of ['desktop', 'phone']) await C.views(e, t, k); await C.views(e, t, 'desktop', {source: C.LARGE[t](), label: 'large'}); }],
  ['btp-rail', BTP, TM, async (e, t) => C.rail(e, t)],
  ['btp-type', BTP, TM, async (e, t) => { await S.keyRender(e, t, 'desktop'); await S.keyRender(e, t, 'desktop', {source: C.LARGE[t](), label: 'large'}); }],
  ['btp-stall', BTP, TM, async (e, t) => { await C.stall(e, t, 'desktop', {label: 'example'}); await C.stall(e, t, 'desktop', {source: C.LARGE[t](), label: 'large'}); }],
  ['btp-menu', CARDS, TM, async (e, t) => both(C.menus, e, t)],
  ['btp-eip', CARDS, TM, async (e, t) => both(C.rename, e, t)],
  ['btp-invalid', CARDS, N, async (e, t) => C.invalid(e, t, 'desktop', t === 'bets' ? {row: /^Edit odds/, value: '150%'} : {row: /^Edit value/, value: 'lots'})],
  ['btp-add', CARDS, N, async (e, t) => { for(const k of ['desktop', 'phone']) await C.addRemove(e, t, k, t === 'bets' ? {addSel: '#preview [data-edit="addbet"]'} : {addRow: /Add option|Add outcome/}); }],
  ['btp-undo', BTP, N, async (e, t) => both(C.undo, e, t)],
  ['btp-shell', BTP, TM, async (e, t) => { await C.shell(e, t, 'desktop'); if(e.mode === 'normal') await C.shell(e, t, 'phone'); }],
  ['btp-theme', BTP, TM, async (e, t) => { await S.theme(e, t, 'desktop'); if(e.mode === 'normal'){ await S.theme(e, t, 'phone'); await S.theme(e, t, 'desktop', true); } }],
  ['btp-reduced', BTP, N, async (e, t) => C.reduced(e, t)],
  ['btp-keyboard', BTP, N, async (e, t) => C.keyboard(e, t)],
  ['btp-hover', BTP, N, async (e, t) => S.hover(e, t)],
  ['btp-touch', BTP, N, async (e, t) => C.touch(e, t)],
  ['btp-scroll', BTP, TM, async (e, t) => { await S.scroll(e, t, 'desktop', C.LARGE[t]()); if(e.mode === 'normal') await S.scroll(e, t, 'phone', C.LARGE[t]()); }],
  ['btp-disclosures', BTP, N, async (e, t) => { for(const k of ['desktop', 'phone']) await D.disclosures(e, t, k); }],
  ['btp-zoom', BTP, N, async (e, t) => { for(const k of ['desktop', 'phone']) await S.zoom(e, t, k); }],
  ['bets-values', ['bets'], TM, async e => { for(const k of ['desktop', 'phone']) await B.values(e, k); await B.values(e, 'desktop', {source: B.large(), label: 'large'}); }],
  ['bets-snapshot', ['bets'], TM, async e => { await B.snapshot(e, 'desktop'); if(e.mode === 'normal') await B.snapshot(e, 'phone'); }],
  ['bets-quadrant', ['bets'], N, async e => B.quadrantGlide(e)],
  ['bets-narrow', ['bets'], N, async e => B.narrow(e)],
  ['tree-slider', ['tree'], TM, async e => { for(const k of ['desktop', 'phone']) await T.slider(e, k); await T.slider(e, 'desktop', {source: T.large(), label: 'large'}); }],
  ['tree-sliderkeys', ['tree'], TM, async e => { await T.sliderKeys(e); await T.sliderKeys(e, {source: T.large(), label: 'large'}); }],
  ['tree-reading', ['tree'], N, async e => T.reading(e)],
  ['tree-nearbottom', ['tree'], N, async e => { await T.sliderNearBottom(e); await T.sliderNearBottom(e, {source: T.large(), label: 'large'}); }],
  ['tree-hit', ['tree'], N, async e => T.hitTargets(e)],
  ['paths-select', ['paths'], TM, async e => { for(const k of ['desktop', 'phone']) await P.select(e, k); await P.select(e, 'desktop', {source: P.large(), label: 'large'}); }],
  ['paths-sheet', ['paths'], N, async e => P.sheet(e)],
  ['paths-inspector', ['paths'], TM, async e => { for(const k of ['desktop', 'phone']) await P.inspectorEdit(e, k); }],
  ['paths-groups', ['paths'], N, async e => { for(const k of ['desktop', 'phone']) await P.groups(e, k); }],
  ['paths-handoff', ['paths'], N, async e => { for(const k of ['desktop', 'phone']) await P.handoff(e, k); }],
  ['paths-editsource', ['paths'], N, async e => P.editSource(e)],
];
export const WEBKIT = ['btp-load', 'btp-views', 'btp-rail', 'btp-type', 'btp-stall', 'btp-menu', 'btp-eip', 'btp-theme', 'bets-values', 'tree-slider', 'paths-select'];

/* Defects confirmed by this audit (2026-11-13, Bets/Tree/Paths; findings FB-/FT-/FP- in the evidence folder) that are still open.
   A fix turns its known FAIL into a PASS and removes the tag; 'id@tool' tags that check on that tool only. Each group says why it
   is left. A tag names a check, never a condition, so a new failure of any other check is a plain FAIL. */
export const KNOWN_BTP = [
  /* the simulation's own cost (Bets 40,000 runs, Tree 60,000 runs on a large document): a later stage, not feel code */
  "load.large.longtask@bets", "load.large.longtask@tree", "values.example.longtask@bets", "values.large.applied@bets", "values.large.longtask@bets",
  "slider.large.drag.events@tree", "slider.large.release@tree", "slider.large.release.longtask@tree", "sliderkeys.large.longtask@tree",
  "stall.large.longtask@tree", "compare.edit@bets", "values.large.enter@bets", "slider.large.drag.frames@tree",
  /* the render waits for a 120ms pause in typing by design (the debounce); recorded, not a defect to fix here */
  "stall.example.live@bets", "stall.example.live@paths", "stall.example.live@tree", "stall.large.live@bets", "stall.large.live@paths", "stall.large.live@tree",
  /* a decision for Matt: the touch Undo button is shown on a desktop too (earlier audit F44) */
  "undo.desktop@bets", "undo.desktop@paths", "undo.desktop@tree",
  /* a decision for Matt: a decimal keyboard has no '-' or '%', which odds and ranges need */
  "values.example.inputmode@bets", "values.large.inputmode@bets",
  /* a discrete swap/commit paints one frame plus the render itself (profiled: 3ms of script, ~20ms of style, SVG parse, ghost clone and paint) */
  "values.example.applied@bets", "view.example.swap@bets", "view.large.swap@bets", "view.example.swap@paths", "view.large.swap@paths",
  /* the Plans projection on the large plan: ~160ms of world enumeration in paths/evaluate.js + plans.js (profiled; uncached) */
  "view.large.longtask@paths", "view.large.paint@paths",
  /* native raster of the large SVG while it scrolls: no script, style or layout work (profiled; not isolated further) */
  "scroll.frames.vs.control@paths",
];
for(const k of KNOWN_BTP) KNOWN.add(k);
