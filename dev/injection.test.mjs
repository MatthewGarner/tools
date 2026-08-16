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

test('proxy hunt separates hostile causal theories, readings and scoped receipts', async () => {
  const {parse} = await import('../proxy/parse.js');
  const {project} = await import('../proxy/project.js');
  const {renderHunt, renderHuntNarrow, renderHuntReceipt} = await import('../proxy/render-hunt.js');
  const safe = value => value.replace(/:/g, ';');
  const hostileVerdict = safe(EVIL.join(' '));
  const doc = 'title: ' + EVIL[0] + '\noutcome: ' + safe(EVIL[1]) + '\nproxy: ' + safe(EVIL[2]) +
    '\naction: ' + safe(EVIL[3]) + '\nmode: optimise\nintended-theory:\n  mechanism: ' + safe(EVIL[4]) +
    '\nprotects:\n  - ' + safe(EVIL[5]) + '\nfailure-theory harm:\n  mechanism: ' + safe(EVIL[0]) +
    '\n  harmed-outcome: ' + safe(EVIL[1]) + '\n  guardrail: ' + safe(EVIL[5]) +
    '\n  basis: reasoned-mechanism\n  weaken-with: ' + safe(EVIL[3]) +
    '\nreported-pattern:\n  proxy-reading: ' + safe(EVIL[2]) + '\n  outcome: ' + safe(EVIL[1]) +
    '\n  outcome-reading: ' + safe(EVIL[4]) + '\n  population: ' + safe(EVIL[5]) +
    '\n  horizon: week one\n  comparator: baseline\n  source: ' + safe(EVIL[0]) +
    '\nverdict: ' + hostileVerdict;
  const model = parse(doc);
  assert.equal(model.verdict, hostileVerdict, 'proxy: hostile verdict reached the top-level raw model');
  const hunt = project(model, 'harm');
  assert.equal(hunt.authoredVerdict?.line, hostileVerdict,
    'proxy: hostile verdict reached the separate author-stated projection');
  assertClean(renderHunt(hunt, {...ctx, width:1100, interactive:true}), 'proxy-hunt');
  assertClean(renderHuntNarrow(hunt, {...ctx, width:360, interactive:true}), 'proxy-hunt-narrow');
  assertClean(renderHuntReceipt(hunt, {...ctx, width:900}), 'proxy-hunt-receipt');
});

test('paths tree, overview, dependencies, conditions, learning agenda and possible-plan renderers escape a hostile real document', async () => {
  const {parse} = await import('../paths/parse.js');
  const {project} = await import('../paths/project.js');
  const {treeProjection} = await import('../paths/tree.js');
  const {treeLayout} = await import('../paths/layout-tree.js');
  const {renderTree, renderOutline} = await import('../paths/render-tree.js');
  const {decisionImpactProjection, overviewProjection} = await import('../paths/overview.js');
  const {renderOverview, renderOverviewNarrow} = await import('../paths/render-overview.js');
  const {renderDependencies, renderDependenciesNarrow} = await import('../paths/render-dependencies.js');
  const {renderQuestionLens, renderQuestionLensNarrow} = await import('../paths/render-question-lens.js');
  const {renderConditions, renderConditionsNarrow} = await import('../paths/render-conditions.js');
  const {learningAgendaProjection} = await import('../paths/learning-agenda.js');
  const {renderLearningAgenda, renderLearningAgendaNarrow} = await import('../paths/render-learning-agenda.js');
  const {renderLearningCloseOut} = await import('../paths/render-learning-closeout.js');
  const {projectLearningCloseOut} = await import('../paths/learning-closeout.js');
  const {renderPlans, renderPlansNarrow} = await import('../paths/render-plans.js');
  const safe = value => value.replace(/:/g, ';');
  const doc = 'title: ' + EVIL[0] + '\ndate: 2026-08-10\nverdict: ' + EVIL[5] + '\n' +
    'decision choice:\n  question: ' + EVIL[1] + '\n  signal: ' + EVIL[2] + '\n' +
    '  reading: ' + EVIL[3] + '\n  owner: ' + EVIL[4] + '\n  answer-by: 2026-08-20\n' +
    'NOW\n  ' + safe(EVIL[2]) + ': ' + EVIL[3] + ' -- ' + EVIL[4] + '\n' +
    'LATER\n  ' + safe(EVIL[5]) + ': ' + EVIL[1] + ' [if choice] -- ' + EVIL[0] + '\n' +
    '  ' + safe(EVIL[0]) + ': ' + EVIL[2] + ' [unless choice]';
  const model = parse(doc);
  assert.equal(model.decisions[0].question, EVIL[1],
    'paths: hostile question survived the real current-field parser contract');
  const projected = project(model, '2026-08-10');
  const topology = treeProjection(projected);
  const renderCtx = {...ctx, today:'2026-08-10', projection:projected};
  assertClean(renderTree(topology, treeLayout(topology, {width:900, measure:ctx.measure}), renderCtx),
    'paths-tree');
  assertClean(renderOutline(topology, {...renderCtx, width:360}), 'paths-outline');
  const overview = overviewProjection(projected);
  assertClean(renderOverview(overview, {...renderCtx, width:1100}), 'paths-overview');
  assertClean(renderOverviewNarrow(overview, {...renderCtx, width:360}), 'paths-overview-narrow');
  assertClean(renderDependencies(overview, {...renderCtx, width:1100, selectedKey:'choice'}),
    'paths-dependencies');
  assertClean(renderDependenciesNarrow(overview, {...renderCtx, width:360, selectedKey:'choice'}),
    'paths-dependencies-narrow');
  const impact = decisionImpactProjection(model, projected, 'choice');
  assertClean(renderQuestionLens(overview, {...renderCtx, width:1100, selectedKey:'choice', impact}),
    'paths-question-lens');
  assertClean(renderQuestionLensNarrow(overview, {...renderCtx, width:360, selectedKey:'choice', impact}),
    'paths-question-lens-narrow');
  assertClean(renderConditions(overview, {...renderCtx, width:1100, selectedKey:'choice'}),
    'paths-conditions');
  assertClean(renderConditionsNarrow(overview, {...renderCtx, width:360, selectedKey:'choice'}),
    'paths-conditions-narrow');
  const agenda = learningAgendaProjection(model, projected);
  assertClean(renderLearningAgenda(agenda, {...renderCtx, width:1100, selectedKey:'choice'}),
    'paths-learning-agenda');
  assertClean(renderLearningAgendaNarrow(agenda, {...renderCtx, width:360, selectedKey:'choice'}),
    'paths-learning-agenda-narrow');
  const closeOut = projectLearningCloseOut({...model.decisions[0], closeOut:{
    basisKind:'observation', carryForward:'scoped-finding', decisionUse:EVIL[0], claim:EVIL[1],
    scope:EVIL[2], reviewBy:'2026-09-01', reconsiderIf:EVIL[3], nextCheck:EVIL[4], reviews:[], retirements:[], srcLine:1,
  }}, '2026-08-10');
  assertClean(renderLearningCloseOut(model, model.decisions[0], closeOut, {...renderCtx, width:900}),
    'paths-learning-close-out');
  assertClean(renderPlans(projected, {...renderCtx, width:900}), 'paths-plans');
  assertClean(renderPlansNarrow(projected, {...renderCtx, width:360}), 'paths-plans-narrow');
});

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
  const {renderBoardDeck} = await import('../roadmap/render-board.js');
  const {paletteColors} = await import('../roadmap/render-deck.js');
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
  assertClean(renderBoardDeck(m, {...ctx, diff}, paletteColors(m, {...ctx, diff})), 'roadmap-deck-board');

  /* the same hostile strings again, but repeated enough times in one column to
     force the list-mode flip — a distinct rendering path with its own escaping
     (clip1'd sub-lines, struck dropped rows) that the card-mode pass above
     never reaches. */
  const flipDoc = 'title: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    Array.from({length: 20}, (_, i) => EVIL[i % EVIL.length].replace(/:/g, ';') + ' lane: item ' + i +
      ' -- ' + EVIL[(i + 2) % EVIL.length]).join('\n');
  const flipM = parse(flipDoc);
  assertClean(renderBoardDeck(flipM, {...ctx, diff}, paletteColors(flipM, {...ctx, diff})), 'roadmap-deck-board-list');
});

test('roadmap DECK (register style) escapes hostile titles/notes/lanes + status washes + the NEW capsule, "was X" italic cell and struck DROPPED rows', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {paletteColors} = await import('../roadmap/render-deck.js');
  const {renderRegisterDeck} = await import('../roadmap/render-register.js');
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
  assertClean(renderRegisterDeck(m, {...ctx, diff}, paletteColors(m, {...ctx, diff})), 'roadmap-deck-register');

  /* enough dropped names to force the dropped section's own cap (capFit) —
     a distinct rendering path (the clipped struck title + DROPPED capsule
     placement loop) the small-dropped-list pass above never reaches. */
  const manyDropped = {...diff, dropped: Array.from({length: 15}, (_, i) => EVIL[i % EVIL.length] + ' dropped ' + i)};
  assertClean(renderRegisterDeck(m, {...ctx, diff: manyDropped}, paletteColors(m, {...ctx, diff: manyDropped})),
    'roadmap-deck-register-dropped-cap');
});

test('roadmap REGISTER LIVE escapes hostile titles/notes/lanes/statuses, edit:true (the only place the edit markup renders)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderRegisterLive} = await import('../roadmap/render-register.js');
  const doc = 'style: register\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) +
      (i % 2 === 0 ? ' [risk]' : ' [blocked]') + ' -- ' + EVIL[(i + 1) % EVIL.length]).join('\n');
  assertClean(renderRegisterLive(parse(doc), {...ctx, edit: true}), 'register-live-edit');
});

test('roadmap REGISTER LIVE escapes a hostile horizons: line, edit:true (flows into data-col + the +add aria-label)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderRegisterLive} = await import('../roadmap/render-register.js');
  const doc = 'style: register\ndate: 2026-07-06\nhorizons: ' + EVIL[0] + ', ' + EVIL[1] + '\n' + EVIL[0] + '\nCore: item one\n' + EVIL[1] + '\n';
  assertClean(renderRegisterLive(parse(doc), {...ctx, edit: true}), 'register-live-horizons-edit');
});

test('roadmap BOARD LIVE escapes hostile titles/notes/lanes/statuses, edit:true (the only place board edit markup renders)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderBoardLive} = await import('../roadmap/render-board.js');
  const doc = 'style: board\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) +
      (i % 2 === 0 ? ' [risk]' : ' [blocked]') + ' -- ' + EVIL[(i + 1) % EVIL.length]).join('\n');
  assertClean(renderBoardLive(parse(doc), {...ctx, edit: true}), 'board-live-edit');
});

test('roadmap BOARD LIVE escapes a hostile horizons: line, edit:true (flows into data-col + the +add aria-label)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderBoardLive} = await import('../roadmap/render-board.js');
  const doc = 'style: board\ndate: 2026-07-06\nhorizons: ' + EVIL[0] + ', ' + EVIL[1] + '\n' + EVIL[0] + '\nCore: item one\n' + EVIL[1] + '\n';
  assertClean(renderBoardLive(parse(doc), {...ctx, edit: true}), 'board-live-horizons-edit');
});

test('roadmap FOCUS LIVE escapes hostile titles/notes/lanes/statuses (hero + rail), a hostile horizons: line (data-col/data-lens), and a hostile compare diff (the moved-badge path is UNIQUE to render-focus.js — it bypasses badgeCapsule\'s upper-casing so "was X" stays readable — plus dropped-line titles)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderFocusLive} = await import('../roadmap/render-focus.js');
  const doc = 'style: focus\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nhorizons: ' + EVIL[2] + ', ' + EVIL[3] + '\n' +
    EVIL[2] + '\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) + ' -- ' + EVIL[(i + 1) % EVIL.length] +
      (i % 2 === 0 ? ' [risk]' : ' [blocked]')).join('\n') +
    '\n' + EVIL[3] + '\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: rail ' + label(i)).join('\n');
  const m = parse(doc);
  const diff = {since: EVIL[0], dropped: [EVIL[4], EVIL[1]], badge: it => ({kind: 'moved', label: EVIL[1]})};
  assertClean(renderFocusLive(m, {...ctx, edit: true, diff}), 'focus-live-edit');
});

test('roadmap DECK (focus style) escapes hostile titles/notes/lanes in the hero cards AND the ranked rail', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderFocusDeck} = await import('../roadmap/render-focus.js');
  const {paletteColors} = await import('../roadmap/render-deck.js');
  const doc = 'style: focus\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) + ' -- ' + EVIL[(i + 1) % EVIL.length] +
      (i % 2 === 0 ? ' [risk]' : ' [blocked]')).join('\n') +
    '\nNEXT\n' + EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: rail ' + label(i)).join('\n');
  const m = parse(doc);
  assertClean(renderFocusDeck(m, ctx, paletteColors(m, ctx)), 'roadmap-deck-focus');
});

test('roadmap DECK (grid style) escapes hostile titles/notes/lanes via the embedded chart (render.js\'s own escaping — called, never modified)', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderDeck} = await import('../roadmap/render-deck.js');
  const doc = 'style: grid\ntitle: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i) + ' -- ' + EVIL[(i + 1) % EVIL.length]).join('\n');
  assertClean(renderDeck(parse(doc), ctx), 'roadmap-deck-grid');
});

test('roadmap exhaustive deck pages escape hostile frame and card text in the continuation composition', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {renderDeckPages} = await import('../roadmap/render-deck-pages.js');
  const doc = 'style: board\ntitle: ' + EVIL[0] + '\nheadline: ' + EVIL[1] +
    '\nhorizons: ' + EVIL[2] + ', ' + EVIL[3] + ', ' + EVIL[4] + ', ' + EVIL[5] + '\n' +
    EVIL[2] + '\n' + EVIL[0].replace(/:/g, ';') + ' lane: ' + label(0) + ' -- ' + EVIL[1] + '\n' +
    EVIL[3] + '\n' + EVIL[2].replace(/:/g, ';') + ' lane: ' + label(2) + ' [risk]\n' +
    EVIL[4] + '\n' + EVIL[3].replace(/:/g, ';') + ' lane: ' + label(3) + '\n' +
    EVIL[5] + '\n' + EVIL[4].replace(/:/g, ';') + ' lane: ' + label(4);
  renderDeckPages(parse(doc), ctx).pages.forEach((svg, i) => assertClean(svg, 'roadmap-deck-pages-' + i));
});

test('why renderers escape hostile labels in both projections', async () => {
  const {parse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderOst} = await import('../why/render-ost.js');
  const {renderMap} = await import('../why/render-map.js');
  const {renderWhyPresentation} = await import('../why/render-presentation.js');
  const doc = 'outcome: ' + EVIL[1] + '\n  ' + EVIL[2] + '\n    ' + EVIL[3] + ' [testing]\n      ? ' + EVIL[4];
  const m = parse(doc), pr = project(m);
  assertClean(renderOst(m, pr, {...ctx, edit: true}), 'why-ost');
  assertClean(renderOst(m, pr, {...ctx, edit: true, width: 360}), 'why-ost-narrow');
  assertClean(renderMap(m, pr, ctx), 'why-map');
  assertClean(renderMap(m, pr, {...ctx, width: 360}), 'why-map-narrow');
  assertClean(renderWhyPresentation(m, ctx), 'why-presentation');
});

test('tree renderer escapes hostile option labels', async () => {
  const {parse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render} = await import('../tree/render.js');
  const {treeVerdictParts} = await import('../tree/render.js');
  const {renderDensity} = await import('../tree/render-density.js');
  /* a real chance node (p=… / p=rest) with hostile labels on every node, so
     the ctx.hot mark path (B2) has real prob/value lines to address — a bare
     edit:true with no hot set would never exercise data-hot="" at all. */
  const doc = 'decision: ' + EVIL[0] + '\n' +
    '  ' + EVIL[1] + ': -150k\n' +
    '    Outcome\n' +
    '      ' + EVIL[2] + ' (p=0.3-0.45): 2M to 5M\n' +
    '      ' + EVIL[3] + ' (p=rest): 100\n' +
    '  ' + EVIL[4] + ': 50 to 90';
  const m = parse(doc);
  /* every prob/value line in the tree — the ctx.hot contract names load-bearing
     numbers this way; here we mark ALL of them so the mark path is exercised
     against every hostile label (aria-label/data-raw must stay escaped there
     too), not just a cherry-picked one. */
  const hot = new Set();
  (function collect(n){
    if(!n) return;
    if(n.p !== null && n.p !== undefined) hot.add('prob:' + n.srcLine);
    if(n.value) hot.add('value:' + n.srcLine);
    n.children.forEach(collect);
  })(m.root);
  const out = render(m, evaluate(m), {...ctx, edit: true, hot});
  assertClean(out, 'tree');
  assert.ok(out.includes('data-hot=""'),
    'tree: ctx.hot produced no data-hot="" mark — the injection coverage of the mark path would be vacuous');
  assertClean(renderDensity(m, evaluate(m), {...ctx, intent: 'presentation'}, treeVerdictParts), 'tree-density-presentation');
});

test('map renderer + readout escape hostile labels, fields, zone names', async () => {
  const {parse} = await import('../map/parse.js');
  const {resolve} = await import('../map/zones.js');
  const {readout} = await import('../map/readout.js');
  const {render} = await import('../map/render.js');
  const {renderMapPresentation} = await import('../map/render-presentation.js');
  const doc = 'title: ' + EVIL[0] + '\nx: ' + EVIL[4] + '\ny: safe\nzone band; x + y > 120\n' +
    EVIL.map((e, i) => e.replace(/[@:]/g, ' ') + ' ' + i + ' @ ' + (i * 15 + 5) + ',' + (i * 12 + 8) +
      ' :: note: ' + EVIL[(i + 1) % EVIL.length].replace(/:/g, ' ')).join('\n');
  const m = parse(doc), r = resolve(m);
  const ro = readout(m, r);
  assertClean(render(m, r, ro, {...ctx, edit: true}), 'map');
  assertClean(renderMapPresentation(m, r, ro, ctx), 'map-presentation');
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
  /* narrow (phone) relayout wraps titles/verdict/headlines — hostile text must
     survive the wrapped paths too (incl. the chips narrow branch) */
  assertClean(renderOverlay(m, sessionStats(m, responses), ctx, {width: 360}), 'gauge-overlay-narrow');
  assertClean(renderOverlay(cm, sessionStats(cm, cresp), ctx, {width: 360}), 'gauge-overlay-chips-narrow');
  const chtml = renderForm(cm, {editable: true});
  assert.ok(!/<img/i.test(chtml.replace(/&lt;img/gi, '')), 'gauge-form-chips: raw <img in option label');
});

test('timeline renderer escapes hostile lanes, labels and notes', async () => {
  const {parse} = await import('../timeline/parse.js');
  const {render} = await import('../timeline/render.js');
  const doc = 'title: ' + EVIL[0] + '\n' +
    EVIL.map((e, i) => e.replace(/[:\[\]]/g, ' ') + ': item ' + i + ' 2026-0' + (i % 8 + 1) +
      ' .. 2026-1' + (i % 2) + ' // ' + EVIL[(i + 2) % EVIL.length]).join('\n') +
    // a hostile FIXED label reaches the verdict copy — a path no other corpus row takes
    '\nGate: ' + EVIL[1].replace(/[:\[\]]/g, ' ') + ' 2027-06-01 [fixed]' +
    '\nA: Alpha 2026-09 .. 2026-11\nB: Beta 2026-10 .. 2026-12';
  assertClean(render(parse(doc), ctx, null, {edit: true}), 'timeline');
});

test('timeline NARROW renderer escapes hostile text (title/label/note + since-line + dropped)', async () => {
  const {parse} = await import('../timeline/parse.js');
  const {render} = await import('../timeline/render.js');
  const {timelineDiff, timelineDiffView} = await import('../timeline/diff.js');
  const doc = 'title: ' + EVIL[0] + '\n' +
    EVIL.map((e, i) => e.replace(/[:\[\]]/g, ' ') + ': item ' + i + ' 2026-0' + (i % 8 + 1) +
      ' .. 2026-1' + (i % 2) + ' // ' + EVIL[(i + 2) % EVIL.length]).join('\n');
  // plain narrow (edit:true — narrow still emits NO edit markup, and escapes everything)
  assertClean(render(parse(doc), {...ctx, width: 360}, null, {edit: true}), 'timeline-narrow');
  // hostile-diff narrow: an EVIL snapshot label → since-line, an EVIL dropped-item label
  const dropLine = 'Drop: ' + EVIL[3].replace(/[:\[\]\/]/g, ' ').trim() + ' 2026-05 .. 2026-07';
  const diff = timelineDiffView(timelineDiff(parse(doc + '\n' + dropLine), parse(doc)), EVIL[0]);
  assertClean(render(parse(doc), {...ctx, width: 360}, diff), 'timeline-narrow-diff');
});

test('bets board renderer escapes hostile bet names, kill text, title, lane', async () => {
  const {parse} = await import('../bets/parse.js');
  const {simulate} = await import('../bets/engine.js');
  const {renderBoard} = await import('../bets/render.js');
  const {renderQuadrant} = await import('../bets/render-quadrant.js');
  const {renderBetsPresentation} = await import('../bets/render-presentation.js');
  const {betsDiff, betsDiffView} = await import('../bets/diff.js');
  const m = parse('title: T\nunit: £k\nG\n  A bet: stake 10, odds 20-40%, payoff 30-60\n    kill: watch this by 2026-01-01');
  const b = m.groups[0].bets[0];
  m.title = EVIL[0]; m.groups[0].name = EVIL[1]; b.name = EVIL[2]; b.kill.text = EVIL[3];
  const sim = simulate(m);
  /* edit:true — the ONLY place the rename target + ＋ capsule markup renders
     (the evil group name flows into the capsule's aria-label) */
  assertClean(renderBoard(m, sim, {...ctx, edit: true}), 'bets');
  assertClean(renderBoard(m, sim, {...ctx, edit: true, width: 390}), 'bets-narrow');
  assertClean(renderQuadrant(m, sim, ctx), 'bets-quadrant');
  assertClean(renderQuadrant(m, sim, {...ctx, width: 390}), 'bets-quadrant-narrow');
  assertClean(renderBetsPresentation(m, sim, ctx), 'bets-presentation');

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
  assertClean(renderBoard(m, sim, {...compareCtx, edit: true}), 'bets-compare');
  assertClean(renderBoard(m, sim, {...compareCtx, edit: true, width: 390}), 'bets-compare-narrow');
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

test('case renderer escapes hostile titles/labels/notes/lanes', async () => {
  const {parse} = await import('../case/parse.js');
  const {render} = await import('../case/render.js');
  const doc = 'title: ' + EVIL[0] + '\nquestion: ' + EVIL[1] + '\nverdict: ' + EVIL[2] + '\n' +
    EVIL.map((e, i) => label(i) + ': ' + label(i + 1) + ' -> /fermi/#x // ' + label(i + 2)).join('\n') + '\n' +
    label(3) + ' -> https://evil.example/' + encodeURIComponent(EVIL[3]);
  const m = parse(doc);
  m.exhibits[0].planning = {kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{source:EVIL[4], known:[{key:'pricing', direction:'yes', date:'2026-08-03'}],
      assumed:[{key:'groups', direction:'no', date:'2026-08-12'}]}};
  assertClean(render(m, ctx, {edit: true, live: true}), 'case');
  assertClean(render(m, {...ctx, width: 390}), 'case-narrow');
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
    irr: {p10: 0.05, p50: 0.18, p90: 0.3, undefinedShare: 0.05},
    period: {p50: 2, p10: 1, p90: 3, neverShare: 0.1, kind: 'payback'}, band};
  assertClean(renderCashflow(r, {}, ctx), 'fermi-cashflow');
  // debt-sizing branch: card is numeric, reason is the only string surface (escaped via txt)
  const debt = {ok: true, D: 4.2e6, D_drawn: 4.0e6, tStar: 1, tenor: 12, dscrTarget: 1.3, costOfDebt: 0.065,
    sizingCase: 'central', gearingPct: 0.6, capped: false, coverShortfall: 0.48,
    unlevIrr: r.irr, levIrr: {p10: 0.02, p50: 0.15, p90: 0.35, undefinedShare: 0.02},
    eqNpv: {p10: -1e6, p50: 1.9e6, p90: 5e6, pPos: 0.7}, minDscr: {p10: 1.05, p50: 1.3, p90: 1.7}, service: []};
  assertClean(renderCashflow({...r, debt}, {}, ctx), 'fermi-cashflow-debt');
  assertClean(renderCashflow({...r, debt: {ok: false, reason: '<script>xss</script>&"'}}, {}, ctx), 'fermi-cashflow-debt-reason');
});

test('flow readout + triage renderers escape hostile lever labels (labels are hardcoded engine vocabulary today; hostile-ified here so future free text can\'t slip through)', async () => {
  const {simulate, wipSweep, kneeWip, leverTriage} = await import('../flow/engine.js');
  const {renderReadout, renderTriage, renderExpedite, renderDice} = await import('../flow/render.js');
  const {expediteSensitivity} = await import('../flow/expedite.js');
  const {diceGame} = await import('../flow/dice.js');
  const params = {demandPerWeek: 5, itemDays: 4, team: 3, wipLimit: 6, cov: 'high'};
  const result = simulate(params, {trace: true});
  const sweep = wipSweep(params);
  const knee = kneeWip(sweep);
  const triage = leverTriage(params, {initialBacklog: 40, knee});
  triage.levers = triage.levers.map((l, i) => ({...l, label: EVIL[i % EVIL.length] + ' — ' + l.label}));
  assertClean(renderReadout(result, sweep, knee, params, ctx), 'flow-readout');
  assertClean(renderTriage(triage, params, 40, ctx), 'flow-triage');
  assertClean(renderExpedite(expediteSensitivity(params, {expeditePerWeek: 1}), ctx), 'flow-expedite');
  assertClean(renderDice(diceGame({seed: 4}), ctx), 'flow-dice');
});

test('alarm renderers stay well-formed under extreme numeric params (no user strings here — the surface is degenerate params, not labels)', async () => {
  const {renderDistributions, renderBox} = await import('../alarm/render.js');
  for(const p of [{baseRate: 0.001, dprime: 0, t: -3}, {baseRate: 0.5, dprime: 4, t: 6},
    {baseRate: 0.02, dprime: 2, t: 1.2}])
    assertClean(renderDistributions(p, ctx.colors, {w: 900, h: 220}), 'alarm-dist');
  assertClean(renderBox({tp: 10, fp: 990, tn: 0, fn: 0}, ctx.colors), 'alarm-box');
});

test('signal-vs-noise renderers stay well-formed — names come from a fixed constant, but prove esc() covers a hostile names array (grid + narrow + wide collapse verdict)', async () => {
  const {makeScenario, AUTHORED_SEED} = await import('../signal-vs-noise/engine.js');
  const {renderGrid, renderCollapse} = await import('../signal-vs-noise/render.js');
  const s = {...makeScenario(AUTHORED_SEED), names: EVIL.slice()};   // hostile names into every txt()/verdict/aria-label path
  const calls = [{person: 0, quarter: 3}, {person: 1, quarter: 6}, {person: s.signalPerson, quarter: 7}];
  assertClean(renderGrid(s, ctx.colors, {turn: 4, calls}), 'signal-noise-grid');
  assertClean(renderGrid(s, ctx.colors, {turn: 4, calls, cols: 1}), 'signal-noise-grid-narrow');
  assertClean(renderCollapse(s, ctx.colors, calls), 'signal-noise-collapse');
  assertClean(renderCollapse(s, ctx.colors, calls, {width: 1088}), 'signal-noise-collapse-wide');
  assertClean(renderCollapse(s, ctx.colors, calls, {width: 356}), 'signal-noise-collapse-narrow');
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
  const opportunity = {...newEntry(EVIL[1]), kind: 'opportunity', essential: true,
    actions: [{text: EVIL[0], owner: EVIL[2], done: false, votes: 1}]};
  const preParade = {...doc, mode: 'success', entries: [opportunity, ...board]};
  for(const phase of ['FRAME', 'COLLECT', 'CLUSTER', 'SCORE', 'ACTIONS', 'VOTE'])
    assertClean(renderPhase({...preParade, phase}), 'pre-parade-' + phase);
  assertClean(renderRegister(preParade, exposure([]), new Date()), 'pre-parade-register');
  assertClean(renderBoard(preParade, new Date(), board[1].id), 'pre-parade-board-promoting');
});

/* ---------- authored verdicts (2026-07-31, roadmap joined 2026-08-09) ----------
   `verdict: <text>` is a NEW path for author-supplied text straight into an SVG
   text node, on eight tools at once. It is exactly the shape of string that has
   broken exports twice before, so every tool that accepts the key gets the
   corpus run through it. One test, eight renderers, no per-tool memory needed. */
test('every tool accepting verdict: escapes a hostile authored line', async () => {
  const evil = EVIL.join(' ');   // one line carrying every hostile shape at once
  const v = 'verdict: ' + evil.replace(/\n/g, ' ') + '\n';

  const {parse: mparse} = await import('../map/parse.js');
  const {resolve: mresolve} = await import('../map/zones.js');
  const {readout: mreadout} = await import('../map/readout.js');
  const {render: mrender} = await import('../map/render.js');
  const mm = mparse(v + 'preset: assumptions\nA @ 20,80\nB @ 70,60');
  const mr = mresolve(mm);
  assertClean(mrender(mm, mr, mreadout(mm, mr), ctx), 'map verdict:');

  const {parse: wparse} = await import('../wardley/parse.js');
  const {layoutMap} = await import('../wardley/layout.js');
  const {renderMap} = await import('../wardley/render.js');
  const wm = wparse(v + 'anchor: Customer\nStorefront @ product\nCustomer -> Storefront');
  assertClean(renderMap(wm, layoutMap(wm), {...ctx, palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8']}), 'wardley verdict:');

  const {parse: tlparse} = await import('../timeline/parse.js');
  const {render: tlrender} = await import('../timeline/render.js');
  assertClean(tlrender(tlparse(v + 'Grid: Energisation 2027-02 .. 2027-06'), ctx), 'timeline verdict:');

  const {parse: trparse} = await import('../tree/parse.js');
  const {evaluate: trevaluate} = await import('../tree/engine.js');
  const {render: trrender} = await import('../tree/render.js');
  const trm = trparse(v + 'Root\n  Go: 100\n  Stop: 0');
  assertClean(trrender(trm, trevaluate(trm), ctx), 'tree verdict:');

  const {parse: gparse} = await import('../gauge/parse.js');
  const {sessionStats} = await import('../gauge/engine.js');
  const {renderOverlay} = await import('../gauge/render-overlay.js');
  const gm = gparse(v + 'Will it ship? :: prob');
  const gresp = [{values: gm.questions.map(() => 40)}, {values: gm.questions.map(() => 70)}];
  assertClean(renderOverlay(gm, sessionStats(gm, gresp), ctx), 'gauge verdict:');

  const {parse: cparse} = await import('../energy/cycles/parse.js');
  const {simulate: csimulate} = await import('../energy/cycles/engine.js');
  const {render: crender} = await import('../energy/cycles/render.js');
  const cm = cparse(v + 'battery: 100MW / 200MWh\nspread: 40..90\ncycles: 5000 over 15yr\nfade: 2..3\nrte: 85..88');
  assertClean(crender(cm, csimulate(cm), ctx), 'cycles verdict:');

  const {parse: rparse} = await import('../energy/risk/parse.js');
  const {simulate: rsimulate} = await import('../energy/risk/engine.js');
  const {render: rrender} = await import('../energy/risk/render.js');
  const rm = rparse(v + 'merchant: 40..90\nfloor: 55');
  assertClean(rrender(rm, rsimulate(rm), ctx), 'risk verdict:');

  const {parse: rdparse} = await import('../roadmap/parse.js');
  const {render: rdrender} = await import('../roadmap/render.js');
  const rdm = rdparse(v + 'NOW\nCore: Resume where you left off [doing]\nNEXT\nCore: Reading reminders');
  assertClean(rdrender(rdm, ctx), 'roadmap verdict:');
});

/* `headline:` reached only the deck until 2026-07-31 and `story:` is new — two
   author-supplied strings now landing in SVG text nodes on FOUR artefacts each.
   Same class as the authored verdict above, so same corpus treatment. */
test('roadmap escapes a hostile headline and story on every artefact', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {render} = await import('../roadmap/render.js');
  const {renderBoardLive} = await import('../roadmap/render-board.js');
  const {renderRegisterLive} = await import('../roadmap/render-register.js');
  const {renderFocusLive} = await import('../roadmap/render-focus.js');
  const evil = EVIL.join(' ').replace(/\n/g, ' ');
  const diff = {any: true, since: EVIL[1], badge: () => null, dropped: [EVIL[2]]};
  const doc = style => (style ? 'style: ' + style + '\n' : '') +
    'title: T\nheadline: ' + evil + '\nstory: ' + evil +
    '\nNOW\nCore: Resume where you left off [doing]\nNEXT\nCore: Reading reminders';
  assertClean(render(parse(doc()), {...ctx, diff}), 'roadmap headline+story');
  assertClean(render(parse(doc()), {...ctx, diff, width: 360}), 'roadmap headline+story narrow');
  assertClean(renderBoardLive(parse(doc('board')), {...ctx, diff}), 'board headline+story');
  assertClean(renderRegisterLive(parse(doc('register')), {...ctx, diff}), 'register headline+story');
  assertClean(renderFocusLive(parse(doc('focus')), {...ctx, diff}), 'focus headline+story');
});

/* ---------- conditional roadmap (A6) ----------
   Bet names themselves are `[a-z0-9-]+` (case-insensitive) — the parser refuses
   anything else, so a hostile payload can never ride a bet NAME. It rides the
   surrounding free text instead: lane/title/note on the bet-declaring item, the
   conditioned rider, and the dropped item's own title/note (the dropped capsule
   also splices in the bet's DISPLAY name, itself just the declared name's
   original casing — still [a-z0-9-]+, but exercised here as belt-and-braces).
   Two bet names sit at the grammar's shape boundaries: a single character ("x")
   and one using every allowed class at once (letters+digits+hyphens). Covers a
   WON bet (drops its own [unless] fallback) and a LOST bet (drops its own [if]
   rider) — the two dropped-tag wordings — across every live renderer + deck. */
test('roadmap CONDITIONAL escapes hostile titles/notes on bet/cond/dropped items, and hostile bet names at the grammar\'s shape boundary parse cleanly, across every live renderer + deck', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {render} = await import('../roadmap/render.js');
  const {renderBoardLive} = await import('../roadmap/render-board.js');
  const {renderRegisterLive} = await import('../roadmap/render-register.js');
  const {renderFocusLive} = await import('../roadmap/render-focus.js');
  const {renderBoardDeck} = await import('../roadmap/render-board.js');
  const {renderRegisterDeck} = await import('../roadmap/render-register.js');
  const {renderFocusDeck} = await import('../roadmap/render-focus.js');
  const {renderDeck} = await import('../roadmap/render-deck.js');
  const {paletteColors} = await import('../roadmap/render-deck.js');

  const doc = style => (style ? 'style: ' + style + '\n' : '') +
    'title: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL[1].replace(/:/g, ';') + ' lane: ' + label(1) + '\n' +
    'NEXT\n' +
    EVIL[2].replace(/:/g, ';') + ' lane: ' + label(2) + ' [bet: shipped-a1-b2] -- ' + EVIL[3] + '\n' +
    EVIL[4].replace(/:/g, ';') + ' lane: ' + label(4) + ' [if shipped-a1-b2] -- ' + EVIL[5] + '\n' +
    'Lane: ' + label(6) + ' won-item [bet: won-x won]\n' +
    EVIL[0].replace(/:/g, ';') + ' lane: ' + label(0) + ' [unless won-x] -- ' + EVIL[1] + '\n' +   // dropped: won -> unless drops
    'Lane: ' + label(2) + ' lost-item [bet: x lost]\n' +
    EVIL[3].replace(/:/g, ';') + ' lane: ' + label(3) + ' [if x] -- ' + EVIL[4];                    // dropped: lost -> if drops

  const m = parse(doc());
  // the parsed model must actually HAVE the subject this test claims to cover
  // — a bet, a dropped item — or a future refactor that silently broke the
  // fixture (grammar drift, a renamed key) would still pass every assertClean
  // call below on an EMPTY doc that escapes nothing because there's nothing to escape.
  assert.ok(m.bets['shipped-a1-b2'] && m.bets['won-x'] && m.bets.x, 'the fixture declares its three bets');
  assert.ok(m.items.some(i => i.worldState === 'dropped'), 'the fixture actually drops an item');
  assertClean(render(m, {...ctx, edit: true}), 'roadmap conditional');
  assertClean(render(m, {...ctx, edit: true, width: 360}), 'roadmap conditional narrow');
  assertClean(renderBoardLive(parse(doc('board')), {...ctx, edit: true}), 'board-live conditional');
  assertClean(renderRegisterLive(parse(doc('register')), {...ctx, edit: true}), 'register-live conditional');
  /* S4 (E10): group: outcome's section labels interpolate a bet's DISPLAY
     name straight into a txt() call ("Only if <bet> pays off") — same esc()
     path as every other label, but a new call site, so it gets its own
     hostile-name pass rather than riding on the lane-mode assertion above. */
  assertClean(renderRegisterLive(parse('group: outcome\n' + doc('register')), {...ctx, edit: true}), 'register-live conditional, group: outcome');
  assertClean(renderFocusLive(parse(doc('focus')), {...ctx, edit: true}), 'focus-live conditional');
  const boardM = parse(doc('board'));
  assertClean(renderBoardDeck(boardM, ctx, paletteColors(boardM, ctx)), 'roadmap-deck-board conditional');
  const registerM = parse(doc('register'));
  assertClean(renderRegisterDeck(registerM, ctx, paletteColors(registerM, ctx)), 'roadmap-deck-register conditional');
  const registerOutcomeM = parse('group: outcome\n' + doc('register'));
  assertClean(renderRegisterDeck(registerOutcomeM, ctx, paletteColors(registerOutcomeM, ctx)), 'roadmap-deck-register conditional, group: outcome');
  const focusM = parse(doc('focus'));
  assertClean(renderFocusDeck(focusM, ctx, paletteColors(focusM, ctx)), 'roadmap-deck-focus conditional');
  assertClean(renderDeck(m, ctx), 'roadmap-deck-grid conditional');
});
