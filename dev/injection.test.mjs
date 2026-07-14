/* Adversarial labels through every parser → renderer: output must stay
   well-formed XML with nothing unescaped. esc() slips become failures here,
   not shared-URL exploits (the CSP is the second wall). */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const EVIL = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "' onmouseover='alert(1)",
  ']]><x>&amp;',
  'a & b < c > d "quoted"',
  'rtl ‮gnp.exe',
];
const label = i => EVIL[i % EVIL.length] + ' item ' + i;
const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', accent2: '#c05621', bg: '#f7f8f6', err: '#b3403a', track: '#edf0ee',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
    statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'}, accentInk: '#0A6C94'},
  measure: t => t.length * 7, today: 20640,
};
const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
function assertClean(out, who){
  assert.ok(!/<script/i.test(out.replace(/&lt;script/gi, '')), who + ': raw <script> leaked');
  for(const tag of out.match(/<[^!/][^>]*>/g) || [])
    assert.match(tag, TAG, who + ': malformed tag ' + tag.slice(0, 120));
}

test('roadmap renderer escapes hostile titles/items/lanes', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {render} = await import('../roadmap/render.js');
  const doc = 'title: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i)).join('\n');
  assertClean(render(parse(doc), {...ctx, edit: true}), 'roadmap');
  assertClean(render(parse(doc), {...ctx, edit: true, width: 360}), 'roadmap-narrow');
});

test('roadmap SPANS escape hostile titles in the range label, the run line and the "also running" list', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {render} = await import('../roadmap/render.js');
  const doc = 'title: ' + EVIL[0] + '\ndate: 2026-07-06\nhorizons: quarterly from Q3 2026 x4\n' +
    'Q3 2026\n' + EVIL.map((e, i) => e.replace(/:/g, ';') + ' x' + (i % 3 + 1)).join('\n');
  assertClean(render(parse(doc), ctx), 'roadmap-spans');
  assertClean(render(parse(doc), {...ctx, width: 360}), 'roadmap-spans-narrow');
  /* wide + edit:true + a time axis is the ONLY combination that emits the span-edge
     handle rects, and no golden renders it — so it is scanned here, or nowhere */
  assertClean(render(parse(doc), {...ctx, edit: true}), 'roadmap-spans-edit');
});

test('roadmap DECK (board style) escapes hostile titles/notes/lanes + diff dropped/badge strings, in both card and flipped-to-list layouts', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderDeck} = await import('../roadmap/render-deck.js');
  /* headline: is user text that lands in the frame's standfirst — the one string
     on a deck the author writes freehand, so it gets the hostile treatment too */
  const doc = 'title: ' + EVIL[0] + '\ndate: 2026-07-06\nheadline: ' + EVIL[1] + '\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) + ' -- ' + EVIL[(i + 1) % EVIL.length]).join('\n');
  const m = parse(doc);
  const diff = {
    any: true, since: EVIL[2],
    badge: it => it.srcLine % 2 === 0 ? {kind: 'new', label: EVIL[3]} : {kind: 'moved', label: EVIL[4]},
    dropped: [EVIL[5], EVIL[1]],
  };
  assertClean(renderDeck(m, {...ctx, diff}), 'roadmap-deck-board');

  /* the same hostile strings again, but repeated enough times in one column to
     force the list-mode flip — a distinct rendering path with its own escaping
     (clip1'd sub-lines, struck dropped rows) that the card-mode pass above
     never reaches. */
  const flipDoc = 'title: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    Array.from({length: 20}, (_, i) => EVIL[i % EVIL.length].replace(/:/g, ';') + ' lane: item ' + i +
      ' -- ' + EVIL[(i + 2) % EVIL.length]).join('\n');
  assertClean(renderDeck(parse(flipDoc), {...ctx, diff}), 'roadmap-deck-board-list');
});

test('roadmap DECK (register style) escapes hostile titles/notes/lanes + status washes + the NEW capsule, "was X" italic cell and struck DROPPED rows', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderDeck} = await import('../roadmap/render-deck.js');
  const doc = 'style: register\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) +
      (i % 2 === 0 ? ' [risk]' : ' [blocked]') + ' -- ' + EVIL[(i + 1) % EVIL.length]).join('\n');
  const m = parse(doc);
  const diff = {
    any: true, since: EVIL[2],
    badge: it => it.srcLine % 3 === 0 ? {kind: 'new', label: EVIL[3]} :
                 it.srcLine % 3 === 1 ? {kind: 'moved', label: EVIL[4]} : null,
    dropped: [EVIL[5], EVIL[1]],
  };
  assertClean(renderDeck(m, {...ctx, diff}), 'roadmap-deck-register');

  /* enough dropped names to force the dropped section's own cap (capFit) —
     a distinct rendering path (the clipped struck title + DROPPED capsule
     placement loop) the small-dropped-list pass above never reaches. */
  const manyDropped = {...diff, dropped: Array.from({length: 15}, (_, i) => EVIL[i % EVIL.length] + ' dropped ' + i)};
  assertClean(renderDeck(m, {...ctx, diff: manyDropped}), 'roadmap-deck-register-dropped-cap');
});

test('roadmap DECK (focus style) escapes hostile titles/notes/lanes in the hero cards AND the ranked rail', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderDeck} = await import('../roadmap/render-deck.js');
  const doc = 'style: focus\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) + ' -- ' + EVIL[(i + 1) % EVIL.length] +
      (i % 2 === 0 ? ' [risk]' : ' [blocked]')).join('\n') +
    '\nNEXT\n' + EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: rail ' + label(i)).join('\n');
  assertClean(renderDeck(parse(doc), ctx), 'roadmap-deck-focus');
});

test('roadmap DECK (grid style) escapes hostile titles/notes/lanes via the embedded chart (render.js\'s own escaping — called, never modified)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderDeck} = await import('../roadmap/render-deck.js');
  const doc = 'style: grid\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) + ' -- ' + EVIL[(i + 1) % EVIL.length]).join('\n');
  assertClean(renderDeck(parse(doc), ctx), 'roadmap-deck-grid');
});

test('why renderers escape hostile labels in both projections', async () => {
  const {parse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderOst} = await import('../why/render-ost.js');
  const {renderMap} = await import('../why/render-map.js');
  const doc = 'outcome: ' + EVIL[1] + '\n  ' + EVIL[2] + '\n    ' + EVIL[3] + ' [testing]\n      ? ' + EVIL[4];
  const m = parse(doc), pr = project(m);
  assertClean(renderOst(m, pr, {...ctx, edit: true}), 'why-ost');
  assertClean(renderOst(m, pr, {...ctx, edit: true, width: 360}), 'why-ost-narrow');
  assertClean(renderMap(m, pr, ctx), 'why-map');
  assertClean(renderMap(m, pr, {...ctx, width: 360}), 'why-map-narrow');
});

test('tree renderer escapes hostile option labels', async () => {
  const {parse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render} = await import('../tree/render.js');
  const doc = 'decision: ' + EVIL[0] + '\n' +
    '  ' + EVIL[1] + '\n    100\n  ' + EVIL[4] + '\n    50 .. 90';
  const m = parse(doc);
  assertClean(render(m, evaluate(m), {...ctx, edit: true}), 'tree');
});

test('map renderer + readout escape hostile labels, fields, zone names', async () => {
  const {parse} = await import('../map/parse.js');
  const {resolve} = await import('../map/zones.js');
  const {readout} = await import('../map/readout.js');
  const {render} = await import('../map/render.js');
  const doc = 'title: ' + EVIL[0] + '\nx: ' + EVIL[4] + '\ny: safe\nzone band; x + y > 120\n' +
    EVIL.map((e, i) => e.replace(/[@:]/g, ' ') + ' ' + i + ' @ ' + (i * 15 + 5) + ',' + (i * 12 + 8) +
      ' :: note: ' + EVIL[(i + 1) % EVIL.length].replace(/:/g, ' ')).join('\n');
  const m = parse(doc), r = resolve(m);
  assertClean(render(m, r, readout(m, r), {...ctx, edit: true}), 'map');
});

test('gauge overlay + FORM HTML escape hostile question text and names', async () => {
  const {parse} = await import('../gauge/parse.js');
  const {sessionStats} = await import('../gauge/engine.js');
  const {renderOverlay} = await import('../gauge/render-overlay.js');
  const {renderForm} = await import('../gauge/render-form.js');
  const doc = 'title: ' + EVIL[0] + '\nnames: on\n' +
    EVIL.map(e => e.replace(/:/g, ' ') + ' :: prob').join('\n');
  const m = parse(doc);
  const responses = [{values: m.questions.map(() => 50), name: EVIL[1].slice(0, 39)}];
  assertClean(renderOverlay(m, sessionStats(m, responses), ctx), 'gauge-overlay');
  const html = renderForm(m, {editable: true});
  assert.ok(!/<script/i.test(html.replace(/&lt;script/gi, '')), 'gauge-form: raw <script> leaked');
  assert.ok(!/onerror=/i.test(html.replace(/onerror&#?[=x]/gi, '').replace(/&quot;/g, '')) ||
    !/<img[^>]*onerror/i.test(html), 'gauge-form: live onerror attribute');
  /* chips: hostile OPTION labels through the reveal panel + the allocation form */
  const cm = parse('Pick :: chips ' + EVIL[1] + ' | ' + EVIL[3]);
  const cresp = [{values: [[60, 40]], name: 'x'}, {values: [[40, 60]], name: 'y'}];
  assertClean(renderOverlay(cm, sessionStats(cm, cresp), ctx), 'gauge-overlay-chips');
  const chtml = renderForm(cm, {editable: true});
  assert.ok(!/<img/i.test(chtml.replace(/&lt;img/gi, '')), 'gauge-form-chips: raw <img in option label');
});

test('timeline renderer escapes hostile lanes, labels and notes', async () => {
  const {parse} = await import('../timeline/parse.js');
  const {render} = await import('../timeline/render.js');
  const doc = 'title: ' + EVIL[0] + '\n' +
    EVIL.map((e, i) => e.replace(/[:\[\]]/g, ' ') + ': item ' + i + ' 2026-0' + (i % 8 + 1) +
      ' .. 2026-1' + (i % 2) + ' // ' + EVIL[(i + 2) % EVIL.length]).join('\n');
  assertClean(render(parse(doc), ctx, null, {edit: true}), 'timeline');
});

test('bets board renderer escapes hostile bet names, kill text, title, lane', async () => {
  const {parse} = await import('../bets/parse.js');
  const {simulate} = await import('../bets/engine.js');
  const {renderBoard} = await import('../bets/render.js');
  const {renderQuadrant} = await import('../bets/render-quadrant.js');
  const {betsDiff, betsDiffView} = await import('../bets/diff.js');
  const m = parse('title: T\nunit: £k\nG\n  A bet: stake 10, odds 20-40%, payoff 30-60\n    kill: watch this by 2026-01-01');
  const b = m.groups[0].bets[0];
  m.title = EVIL[0]; m.groups[0].name = EVIL[1]; b.name = EVIL[2]; b.kill.text = EVIL[3];
  const sim = simulate(m);
  assertClean(renderBoard(m, sim, ctx), 'bets');
  assertClean(renderBoard(m, sim, {...ctx, width: 390}), 'bets-narrow');
  assertClean(renderQuadrant(m, sim, ctx), 'bets-quadrant');
  assertClean(renderQuadrant(m, sim, {...ctx, width: 390}), 'bets-quadrant-narrow');

  /* compare path: a hostile SNAPSHOT model diffed against the hostile CURRENT
     model above — one bet shares the (evil) name so it shows up MOVED, one
     snapshot-only bet (a different evil name) is KILLED, and the snapshot
     label itself (in the headline) is evil too. Exercises the NEW/KILLED
     markers, the "was …" caption, and the ghost portfolio band. */
  const old = parse('title: T\nunit: £k\nG\n  A bet: stake 10, odds 60-80%, payoff 30-60\n  Gone bet: stake 5, odds 10-20%, payoff 20-30');
  old.groups[0].bets[0].name = EVIL[2];   // same key as current "A bet" -> odds differ -> MOVED
  old.groups[0].bets[1].name = EVIL[4];   // absent from current -> KILLED
  old.groups[0].name = EVIL[1];
  const prevSim = simulate(old);
  const view = betsDiffView(betsDiff(old, m), EVIL[5]);
  const compareCtx = {...ctx, compare: {...view, prevSim}};
  assertClean(renderBoard(m, sim, compareCtx), 'bets-compare');
  assertClean(renderBoard(m, sim, {...compareCtx, width: 390}), 'bets-compare-narrow');
});

test('risk renderer + markdown escape hostile titles and structure labels', async () => {
  const {parse} = await import('../energy/risk/parse.js');
  const {simulate} = await import('../energy/risk/engine.js');
  const {render} = await import('../energy/risk/render.js');
  const doc = 'title: ' + EVIL[0] + '\nmerchant: 60..180\n' +
    EVIL.map((e, i) => 'floor: ' + (65 + i) + ' share 60% "' + e.replace(/"/g, '') + ' item ' + i + '"').join('\n');
  const m = parse(doc);
  assertClean(render(m, simulate(m), ctx, {edit: true}), 'risk');
});

test('cycles renderer escapes a hostile title', async () => {
  const {parse} = await import('../energy/cycles/parse.js');
  const {simulate} = await import('../energy/cycles/engine.js');
  const {render} = await import('../energy/cycles/render.js');
  const doc = 'title: ' + EVIL[0] + '\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 20\ndrift: 0\nrte: 88%\nfade: 0.01 %/cycle\ncalendar: 1.5 %/yr\ncycles: 6000 over 15yr';
  const m = parse(doc);
  assertClean(render(m, simulate(m, {seed: 1, n: 500}), ctx, {edit: true}), 'cycles');
});

test('frequency renderer stays clean (no parser — result is numeric, guards future changes)', async () => {
  const {simulate} = await import('../energy/frequency/engine.js');
  const {renderTrace} = await import('../energy/frequency/render.js');
  const p = {trip: 1.8, eSync: 90, load: 30, dcMw: 1, battMW: 1, eGfm: 15};
  const result = simulate(p);
  assertClean(renderTrace(result, {trip: 1.8, eSync: 90}, ctx), 'frequency');
});

test('merit-order renderer stays clean (hostile catalogue labels/family reach data-plant + captions)', async () => {
  const {renderStack, MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const {buildStack} = await import('../energy/merit-order/stack.js');
  const {DEFAULT_PARAMS} = await import('../energy/merit-order/scenarios.js');
  const evilCat = EVIL.map((e, i) => ({key: 'k' + i, label: e + ' ' + i, family: e, installed: 5, bid: {kind: 'fixed', cost: 10 + i}}));
  // exercise the Phase-2 branches too: a hostile gas-CCS + hydrogen block (thermal-hued, textured)
  evilCat.push({key: 'ccs', label: EVIL[0] + ' ccs', family: 'ccs', installed: 5, bid: {kind: 'ccs'}, thermalHue: true});
  evilCat.push({key: 'h2', label: EVIL[1] + ' h2', family: 'hydrogen', installed: 5, bid: {kind: 'fixed', cost: 200}, thermalHue: true});
  const state = {generators: buildStack(DEFAULT_PARAMS, evilCat), demand: 12};
  assertClean(renderStack(state, {...ctx, palette: MERIT_PALETTE.light}), 'merit-order');
});

test('intraday renderer stays clean (hostile catalogue labels reach changeovers + verdict)', async () => {
  const {runDay, DAY_DEFAULTS} = await import('../energy/intraday/day.js');
  const {renderDay} = await import('../energy/intraday/render-day.js');
  const {MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const hostileCat = [
    {key: 'a', label: EVIL[0], family: 'other', installed: 30, bid: {kind: 'fixed', cost: 5}},
    {key: 'b', label: '<img src=x onerror=alert(1)>', family: 'thermal', installed: 40, bid: {kind: 'fixed', cost: 90}},
  ];
  const p = {...DAY_DEFAULTS, fleetGW: 4};
  const svg = renderDay(runDay(p, hostileCat), p,
    {width: 900, height: 420, palette: MERIT_PALETTE.light,
     colors: {ink: '#000000', muted: '#666666', accent: '#C05621', grid: '#eeeeee', card: '#ffffff'}},
    {forExport: true});
  assertClean(svg, 'intraday');
});

test('wardley renderer escapes hostile component/anchor names, incl. in compare', async () => {
  const {parse} = await import('../wardley/parse.js');
  const {layoutMap} = await import('../wardley/layout.js');
  const {renderMap} = await import('../wardley/render.js');
  const arrowless = s => s.replace(/-/g, ';');          // '->' would split as an edge
  const doc = 'title: ' + EVIL[0] + '\nanchor: ' + arrowless(EVIL[1]) + '\n' +
    EVIL.map((e, i) => arrowless(label(i)) + ' @ 0.' + (i + 2)).join('\n') + '\n' +
    arrowless(EVIL[1]) + ' -> ' + arrowless(label(0));
  const m = parse(doc);
  const wctx = {...ctx, palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8']};
  assertClean(renderMap(m, layoutMap(m), wctx, {edit: true}), 'wardley');
  const prev = parse('anchor: ' + arrowless(EVIL[1]) + '\n' + arrowless(label(0)) + ' @ 0.9\n' +
    arrowless(label(5)) + ' @ 0.5');
  assertClean(renderMap(m, layoutMap(m), wctx, {compare: {prev, label: EVIL[4]}, edit: true}), 'wardley-compare');
});

test('fermi driver-tree renderer escapes hostile var names + sensitivity labels (fermi has no title: field — var names are the tokenizer-restricted [A-Za-z0-9_] surface today; construct the model directly here so the renderer\'s own escaping is proven regardless)', async () => {
  const {renderDriverTree} = await import('../fermi/render-driver.js');
  const name = EVIL[0].replace(/[^A-Za-z0-9_]/g, '_') + '_' + 0; // realistic identifier shape
  const ast = {t: 'var', name};
  const ranges = {[name]: [1, 2]};
  const sens = [{name, share: 0.9, label: EVIL[1]}];
  const model = {ast, ranges, sens, p10: 1, p50: 1.5, p90: 2, fullRatio: 2, scenLabel: EVIL[2]};
  assertClean(renderDriverTree(model, ctx), 'fermi-driver');
});

test('fermi cashflow renderer stays clean (verdict text is numeric-only today — no free-text field exists; entry guards the surface if one is ever added)', async () => {
  const {renderCashflow} = await import('../fermi/render-cashflow.js');
  const band = [{p10: -1000, p50: -200, p90: 600}, {p10: -800, p50: 100, p90: 1400},
    {p10: -200, p50: 900, p90: 2600}, {p10: 400, p50: 1800, p90: 4200}, {p10: 1200, p50: 3200, p90: 6000}];
  const r = {framing: 'invest', grain: 'year', horizon: 4,
    npv: {p10: -500, p50: 1200, p90: 4800, pPos: 0.7},
    irr: {p50: 0.18, undefinedShare: 0.05},
    period: {p50: 2, p10: 1, p90: 3, neverShare: 0.1, kind: 'payback'}, band};
  assertClean(renderCashflow(r, {}, ctx), 'fermi-cashflow');
});

test('flow readout + triage renderers escape hostile lever labels (labels are hardcoded engine vocabulary today; hostile-ified here so future free text can\'t slip through)', async () => {
  const {simulate, wipSweep, kneeWip, leverTriage} = await import('../flow/engine.js');
  const {renderReadout, renderTriage} = await import('../flow/render.js');
  const params = {demandPerWeek: 5, itemDays: 4, team: 3, wipLimit: 6, cov: 'high'};
  const result = simulate(params, {trace: true});
  const sweep = wipSweep(params);
  const knee = kneeWip(sweep);
  const triage = leverTriage(params, {initialBacklog: 40, knee});
  triage.levers = triage.levers.map((l, i) => ({...l, label: EVIL[i % EVIL.length] + ' — ' + l.label}));
  assertClean(renderReadout(result, sweep, knee, params, ctx), 'flow-readout');
  assertClean(renderTriage(triage, params, 40, ctx), 'flow-triage');
});

test('alarm renderers stay well-formed under extreme numeric params (no user strings here — the surface is degenerate params, not labels)', async () => {
  const {renderDistributions, renderBox} = await import('../alarm/render.js');
  for(const p of [{baseRate: 0.001, dprime: 0, t: -3}, {baseRate: 0.5, dprime: 4, t: 6},
    {baseRate: 0.02, dprime: 2, t: 1.2}])
    assertClean(renderDistributions(p, ctx.colors, {w: 900, h: 220}), 'alarm-dist');
  assertClean(renderBox({tp: 10, fp: 990, tn: 0, fn: 0}, ctx.colors), 'alarm-box');
});

test('duel renderers escape hostile item labels + framing question (HTML surface, no SVG)', async () => {
  const {renderDuel, renderOrder, renderLoops} = await import('../duel/render.js');
  const state = {q: EVIL[0], items: EVIL.slice(0, 4),
    duels: [{a:0,b:1,w:0}, {a:1,b:2,w:1}, {a:2,b:0,w:2}]};   // a 3-cycle so renderLoops fires
  assertClean(renderDuel(state, [0, 1]), 'duel-card');
  assertClean(renderOrder(state), 'duel-order');
  assertClean(renderLoops(state), 'duel-loops');
});

test('premortem wizard + register + board renderers escape hostile risk text (HTML surface)', async () => {
  const {renderPhase} = await import('../premortem/render-wizard.js');
  const {renderRegister} = await import('../premortem/render-register.js');
  const {renderBoard} = await import('../premortem/render-board.js');
  const {newEntry, exposure} = await import('../premortem/register.js');
  const e = {...newEntry(EVIL[1]), tag: 'tiger', cluster: EVIL[3], p: [10, 30], impact: [5, 20],
    actions: [{text: EVIL[0], owner: EVIL[2], done: false, votes: 1}]};
  // hostile board items, one of each kind, one mid-promote (inline form)
  const board = ['fact', 'assumption', 'belief'].map(kind => ({...newEntry(EVIL[0]), kind, p: [40, 70]}));
  const doc = {title: EVIL[0], question: EVIL[1], unit: EVIL[3], people: 4, entries: [e, ...board]};
  for(const phase of ['FRAME', 'COLLECT', 'CLUSTER', 'SCORE', 'ACTIONS', 'VOTE'])
    assertClean(renderPhase({...doc, phase}), 'premortem-' + phase);
  assertClean(renderRegister(doc, exposure(doc.entries), new Date()), 'premortem-register');
  assertClean(renderBoard(doc, new Date()), 'premortem-board');
  assertClean(renderBoard(doc, new Date(), board[1].id), 'premortem-board-promoting');
});

test('poster composer escapes hostile verdict/name/metric strings', async () => {
  const {posterSvg} = await import('../assets/poster.js');
  const chart = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#fff"/></svg>';
  const out = posterSvg({chart, verdict: EVIL[0], name: EVIL[1], date: '2026-07-13',
    metrics: [EVIL[2], EVIL[3], EVIL[4]], accent: '#0a6c94',
    colors: {...ctx.colors, grid: 'rgba(70,110,140,.10)'}, measure: ctx.measure});
  assertClean(out, 'poster');
});
