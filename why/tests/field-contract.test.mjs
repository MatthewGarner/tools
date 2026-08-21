/* Why Field contracts: these are the chosen visual system's observable
   behaviour, not a snapshot of its implementation.  Write them before the
   renderer so a familiar-but-wrong card/roadmap treatment cannot pass. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderCausalField as renderOst} from '../render-causal-field.js';
import {renderDeliveryLens as renderMap} from '../render-delivery-lens.js';
import {renderCausalPresentation as renderWhyPresentation} from '../causal-presentation.js';

const ctx = (extra = {}) => ({
  colors: {card:'#F4F4F1', border:'#D9D9D5', ink:'#111111', muted:'#6B6B68',
    accent:'#1F4FD8', accentInk:'#1A44C2', bg:'#FBFBFA', err:'#B3403A',
    status:{done:'#1D7A3E', doing:'#1F4FD8', risk:'#9A6A00', blocked:'#B3403A'},
    statusInk:{done:'#1C753C', doing:'#1A44C2', risk:'#8E6200', blocked:'#B3403A'}},
  measure: text => String(text || '').length * 7,
  today:'2026-08-21',
  ...extra,
});

const FIELD_DOC = [
  'title: Retention discovery',
  'outcome: Improve 90-day retention',
  '  Readers lose their place between sessions',
  '    Reading reminders [testing]',
  '      ? a mid-commute nudge is wanted [testing]',
  '      ? reading time is detectable [holds]',
  '    Resume where you left off [delivering]',
  '      ? abandoned books drive churn [broken]',
  '  Choosing the next book is work',
  '    Curated shelves [candidate]',
  '      ? a saved shelf will be revisited [untested]',
  '  Historical branch [shipped]',
  '  Paused branch [parked]',
  '  Orphan fix [delivering]',
].join('\n');

const render = (fn, source = FIELD_DOC, extra = {}) => {
  const model = parse(source);
  return fn(model, project(model), ctx(extra));
};

test('Causal Field names its four stages and retains every parsed source node by line identity', () => {
  const model = parse(FIELD_DOC);
  const svg = renderOst(model, project(model), ctx({edit:true}));
  assert.match(svg, /data-causal-field="why"/, 'this is the causal field, not a generic box tree');
  for(const stage of ['OUTCOME', 'OPPORTUNITY', 'SOLUTION', 'ASSUMPTION'])
    assert.match(svg, new RegExp('data-causal-stage="' + stage.toLowerCase() + '"'), stage + ' rail exists');
  for(const line of [1,2,3,4,5,6,7,8,9,10,11,12,13])
    assert.match(svg, new RegExp('data-causal-node="' + line + '"'), 'source line ' + (line + 1) + ' remains an individual claim');
  assert.match(svg, /data-causal-parent="1"[^>]*data-causal-node="2"|data-causal-node="2"[^>]*data-causal-parent="1"/,
    'a child retains explicit ancestry rather than relying on label matching');
});

test('Causal Field preserves all state words, while broken is the sole alert claim', () => {
  const svg = render(renderOst);
  for(const word of ['CANDIDATE', 'TESTING', 'DELIVERING', 'SHIPPED', 'PARKED', 'UNTESTED', 'HOLDS', 'BROKEN'])
    assert.match(svg, new RegExp('>' + word + '<'), word + ' remains legible as text');
  assert.match(svg, /data-causal-claim="broken"/, 'broken is a semantic alert, not a coloured decoration');
  assert.equal((svg.match(/data-causal-claim="broken"/g) || []).length, 1);
});

test('Causal Field phone layout is a source-order causal stack with named ancestry, not a scaled tree', () => {
  const svg = render(renderOst, FIELD_DOC, {width:390, edit:true});
  assert.match(svg, /data-causal-layout="stack"/);
  assert.match(svg, /data-causal-context="Improve 90-day retention"/, 'the rendered claim retains its named causal context');
  assert.match(svg, /data-causal-breadcrumb="PATH · Improve 90-day retention › Readers lose their place between sessions"/,
    'phone rows retain the full causal breadcrumb as one rendered reading unit');
  const breadcrumb = svg.match(new RegExp('<g data-causal-breadcrumb="PATH · Improve 90-day retention › Readers lose their place between sessions"[^>]*>([\\s\\S]*?)</g>'))[1];
  assert.ok(breadcrumb.includes('>PATH · Improve 90-day retention › Readers lose</text>') && breadcrumb.includes('>their place between sessions</text>'),
    'the complete breadcrumb is visibly wrapped into measured phone lines');
  assert.match(svg, /aria-label="More options: solution · Improve 90-day retention › Readers lose their place between sessions › Reading reminders · TESTING"/,
    'the phone menu target announces stage, full ancestry, label and state');
  assert.match(svg, /<g data-causal-node="3"[^>]*><rect data-edit="cardmenu-solution"[^>]*data-hit=""/, 'phone claim begins with its own contextual hit plane');
  const rect = edit => {
    const tag = svg.match(new RegExp('<rect(?=[^>]*data-edit="' + edit + '")(?=[^>]*data-line="3")[^>]*>'))?.[0];
    assert.ok(tag, edit + ' has a source-owned phone hit plane');
    const value = name => +tag.match(new RegExp(name + '="([\\d.]+)"'))?.[1];
    return {x:value('x'), y:value('y'), w:value('width'), h:value('height')};
  };
  const menu = rect('cardmenu-solution'), state = rect('status');
  const overlaps = menu.x < state.x + state.w && state.x < menu.x + menu.w && menu.y < state.y + state.h && state.y < menu.y + menu.h;
  assert.equal(overlaps, false, 'phone state and card-menu hit planes are physically disjoint, so coarse state taps cannot be menu-rerouted');
});

test('Delivery Lens is a derived readiness ledger, never a temporal roadmap', () => {
  const svg = render(renderMap, FIELD_DOC, {edit:true});
  assert.match(svg, /data-readiness-ledger="why"/);
  for(const heading of ['DELIVERING', 'TESTING', 'UNADDRESSED', 'NO WHY'])
    assert.match(svg, new RegExp('>' + heading + '<'), heading + ' has an explicit derived place');
  assert.doesNotMatch(svg, />NOW<|>NEXT<|>LATER</, 'derived readiness must not read as a delivery schedule');
  assert.match(svg, /data-readiness-excluded="candidate"/, 'candidate is honestly absent from readiness');
  assert.match(svg, /data-readiness-excluded="shipped"/, 'shipped is honestly absent from readiness');
  assert.match(svg, /data-readiness-excluded="parked"/, 'parked is honestly absent from readiness');
});

test('Delivery Lens phone wraps its factual path and keeps the non-temporal reading rule visible', () => {
  const source = [
    'title: A deliberately long discovery title that must wrap in the phone field',
    'outcome: Retention',
    '  A deliberately named opportunity needs enough words to wrap inside the narrow delivery lens',
    '    A working solution [testing]',
  ].join('\n');
  const svg = render(renderMap, source, {width:390});
  assert.match(svg, /data-readiness-layout="stack"/);
  assert.match(svg, /NOT DELIVERY TIME/);
  assert.ok(svg.includes('A deliberately named opportunity needs enough'));
  assert.ok(svg.includes('wrap inside the narrow delivery lens'));
  assert.doesNotMatch(svg, />A deliberately named opportunity needs enough words to wrap inside the narrow delivery lens<\/text>/,
    'the factual path is wrapped rather than clipped past the phone edge');
});

test('Delivery Lens keeps outcome ancestry and gives each rendered kind its truthful edit route', () => {
  const source = [
    'outcome: Retain readers',
    '  Choosing is work',
    '    Reading reminders [testing]',
    'outcome: Grow revenue',
    '  Choosing is work',
  ].join('\n');
  const model = parse(source), svg = renderMap(model, project(model), ctx({edit:true}));
  assert.match(svg, /Retain readers → Choosing is work/, 'a repeated opportunity is not detached from its outcome');
  assert.match(svg, /Grow revenue → Choosing is work/, 'the unaddressed opportunity retains its own outcome group');
  const solution = model.outcomes[0].children[0].children[0];
  const opportunity = model.outcomes[1].children[0];
  assert.match(svg, new RegExp('<g data-readiness-node="' + solution.srcLine + '"[^>]*><rect data-edit="cardmenu-solution"'), 'a solution keeps solution actions');
  assert.match(svg, new RegExp('<g data-readiness-node="' + opportunity.srcLine + '"[^>]*><rect data-edit="cardmenu-opportunity"'), 'an unaddressed opportunity cannot open solution status actions');
});

test('Delivery Lens names duplicate rows by their full causal path for keyboard and assistive-tech users', () => {
  const source = [
    'outcome: Retain readers',
    '  Choosing is work',
    '    Reading reminders [testing]',
    'outcome: Grow revenue',
    '  Choosing is work',
    '    Reading reminders [testing]',
  ].join('\n');
  const svg = render(renderMap, source, {edit:true});
  assert.match(svg, /aria-label="More options: solution · Retain readers › Choosing is work › Reading reminders · TESTING"/);
  assert.match(svg, /aria-label="More options: solution · Grow revenue › Choosing is work › Reading reminders · TESTING"/);
});

test('Causal Field assumption rows expose their own contextual edit route', () => {
  const svg = render(renderOst, FIELD_DOC, {edit:true});
  assert.match(svg, /<g data-causal-node="4"[^>]*><rect data-edit="cardmenu-assumption"[^>]*data-hit=""/);
  assert.match(svg, /<rect data-edit="astatus"[^>]*data-line="4"[^>]*height="44"/);
});

test('Causal presentation is exhaustive when it fits and honestly refuses a dense tree rather than selecting one path', () => {
  const model = parse(FIELD_DOC);
  const plate = renderWhyPresentation(model, ctx());
  assert.match(plate, /data-causal-presentation="plate"/);
  for(const label of ['Readers lose their place between sessions', 'Reading reminders', 'Resume where you left off', 'Choosing the next book is work', 'Orphan fix'])
    assert.ok(plate.includes(label), label + ' is not silently omitted from a fitting plate');
  assert.doesNotMatch(plate, /DEEPEST SOLUTION CHAIN|SHOWING OUTCOME/, 'presentation does not disguise a partial tree as a summary');

  const dense = ['title: Dense'];
  for(let o = 0; o < 12; o++){
    dense.push('outcome: Outcome ' + o + ' needs a long enough statement to exercise a real export boundary');
    for(let n = 0; n < 7; n++) dense.push('  Opportunity ' + o + '.' + n + ' needs enough words to wrap and consume physical plate height');
  }
  const refusal = renderWhyPresentation(parse(dense.join('\n')), ctx());
  assert.match(refusal, /data-causal-presentation="refusal"/);
  assert.match(refusal, /CANNOT FIT COMPLETE CAUSAL FIELD/);
  assert.ok(refusal.includes('Outcome 0'), 'the refusal names the authored content that requires the native/export route');
});

test('authored titles wrap in the live Field and make a Copy PNG refusal explicit when they cannot fit whole', () => {
  const title = 'A discovery title with enough authored wording to exceed the two-line presentation heading while remaining important source context '.repeat(5).trim();
  const source = 'title: ' + title + '\noutcome: Retention\n  Losing your place\n    Resume [delivering]';
  const model = parse(source), projection = project(model);
  const live = renderOst(model, projection, ctx());
  assert.equal(live.includes('>' + title + '<'), false, 'the native Field wraps the authored title instead of running it into the date');
  assert.match(renderWhyPresentation(model, ctx()), /data-causal-title-refusal/, 'the Causal Copy PNG does not quietly crop authored title context');
  assert.match(renderMap(model, projection, ctx({intent:'presentation'})), /data-readiness-title-refusal/, 'the Delivery Lens applies the same complete-or-refuse title policy');
});

test('all Why projections inherit the document palette without turning semantic state into ornament', () => {
  const model = parse('palette: ember\noutcome: Retention\n  Losing your place\n    Resume [delivering]');
  const projection = project(model);
  const field = renderOst(model, projection, ctx());
  const lens = renderMap(model, projection, ctx());
  const plate = renderMap(model, projection, ctx({intent:'presentation'}));
  for(const svg of [field, lens, plate]) assert.match(svg, /fill="#f7f2ef"/, 'the document paper follows the selected palette');
  assert.doesNotMatch(lens, /#B04E1E/, 'the accent is not promoted into readiness decoration');
});

test('Causal Field uses a reserved gutter for malformed same-stage nesting and bounds unbroken authored tokens', () => {
  const token = 'https://example.test/' + 'unbrokenidentifier'.repeat(18);
  const source = [
    'outcome: Retention',
    '  An unusually long nested opportunity parent whose second line must stay clear of the connector',
    '    Nested opportunity ' + token,
  ].join('\n');
  const svg = render(renderOst, source, {edit:true});
  assert.match(svg, /data-causal-link-mode="gutter"/, 'same-stage nesting uses its column gutter instead of crossing claim copy');
  assert.doesNotMatch(svg, new RegExp('>' + token + '<'), 'an unbroken authored token is split across measured lines, never allowed to escape the rail');
});

test('Causal Field routes valid backward-stage nesting through an outer return gutter', () => {
  const source = 'outcome: Retention\n  Losing your place\n    Reading reminders [testing]\n      A nested opportunity remains a source claim';
  const svg = render(renderOst, source);
  assert.match(svg, /data-causal-link-mode="return"/, 'a child returning from solution to opportunity never crosses through the Field rails');
});

test('Causal Field comparison copy wraps as part of the measured header and survives Copy PNG export', async () => {
  const first = 'A solution label with enough authored detail to make the comparison header physically wide in a serious discovery review';
  const second = 'A second solution label with enough authored detail to make the comparison header wrap rather than run through its rails';
  const oldSource = 'outcome: O\n  A\n    ' + first + ' [testing]\n  B\n    ' + second + ' [testing]';
  const nextSource = 'outcome: O\n  A\n    ' + first + ' [delivering]\n  B\n    ' + second + ' [delivering]';
  const oldModel = parse(oldSource), model = parse(nextSource);
  const {whyDiff, whyDiffView} = await import('../diff.js');
  const diff = whyDiffView(whyDiff(oldModel, model), 'a deliberately long prior discovery review label');
  const live = renderOst(model, project(model), ctx(), diff);
  const plate = renderWhyPresentation(model, ctx(), diff);
  assert.ok((live.match(/data-causal-narrative-line/g) || []).length > 1, 'comparison narrative is wrapped in the live Field header');
  assert.match(plate, /data-causal-presentation-diff/, 'Copy PNG retains the active comparison context');
});

test('Delivery Lens keeps active comparison facts as a factual receipt rather than silently reverting to current state', async () => {
  const oldSource = 'outcome: Retention\n  Losing your place\n    Resume reading [testing]';
  const nextSource = 'outcome: Retention\n  Losing your place\n    Resume reading [delivering]\n  Choosing is work';
  const oldModel = parse(oldSource), model = parse(nextSource);
  const {whyDiff, whyDiffView} = await import('../diff.js');
  const diff = whyDiffView(whyDiff(oldModel, model), 'Monday review');
  const live = renderMap(model, project(model), ctx(), diff);
  const plate = renderMap(model, project(model), ctx({intent:'presentation'}), diff);
  assert.match(live, /data-readiness-comparison/, 'the live Lens states that a comparison is active');
  assert.match(live, /WAS TESTING/, 'a changed solution retains its prior state in its own factual row');
  assert.match(plate, /data-readiness-presentation-diff/, 'Copy PNG retains the active comparison receipt');
});

test('Copy PNG refuses before Causal Field type falls below its physical reading floor', () => {
  const source = ['title: A complete causal export'];
  for(let i = 0; i < 4; i++) for(let j = 0; j < 4; j++) source.push(
    'outcome: Outcome ' + i,
    '  Opportunity ' + i + '.' + j,
    '    Solution ' + i + '.' + j + ' [testing]',
    '      ? Assumption ' + i + '.' + j + ' [holds]',
  );
  const plate = renderWhyPresentation(parse(source.join('\n')), ctx());
  assert.match(plate, /data-causal-presentation="refusal"/, 'the export refuses rather than scaling authored claims below the Field reading floor');
});
