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
import {layoutCausalTree} from '../causal-tree.js';
import {causalDims} from '../causal-shared.js';

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

test('Causal Tree retains four semantic stages and every parsed source node by line identity', () => {
  const model = parse(FIELD_DOC);
  const svg = renderOst(model, project(model), ctx({edit:true}));
  assert.match(svg, /data-causal-tree="why"/, 'this is the rooted Causal Tree, not a generic box tree');
  for(const stage of ['OUTCOME', 'OPPORTUNITY', 'SOLUTION', 'ASSUMPTION'])
    assert.match(svg, new RegExp('data-causal-stage="' + stage.toLowerCase() + '"'), stage + ' rail exists');
  for(const line of [1,2,3,4,5,6,7,8,9,10,11,12,13])
    assert.match(svg, new RegExp('data-causal-node="' + line + '"'), 'source line ' + (line + 1) + ' remains an individual claim');
  assert.match(svg, /data-causal-parent="1"[^>]*data-causal-node="2"|data-causal-node="2"[^>]*data-causal-parent="1"/,
    'a child retains explicit ancestry rather than relying on label matching');
});

test('Causal Tree restores direct parent-to-child geometry with ruled assumption bands', () => {
  const svg = render(renderOst, FIELD_DOC, {edit:true});
  assert.match(svg, /data-causal-tree="why"/, 'the discovery view is a rooted Causal Tree, not a four-rail text field');
  const card = line => {
    const tag = svg.match(new RegExp('<g data-causal-node="' + line + '"[^>]*data-causal-card=""[^>]*'))?.[0];
    assert.ok(tag, 'source line ' + (line + 1) + ' owns a measured tree card');
    const value = name => +tag.match(new RegExp(name + '="([\\d.]+)"'))?.[1];
    return {x:value('data-causal-x'), y:value('data-causal-y'), w:value('data-causal-w'), h:value('data-causal-h')};
  };
  const outcome = card(1), opportunity = card(2), solution = card(3);
  assert.ok(outcome.x < opportunity.x && opportunity.x < solution.x,
    'every direct authored child occupies the next tree depth to its parent’s right');
  assert.match(svg, /data-causal-link="1:2"/, 'the outcome-to-opportunity ancestry is drawn as one explicit connector');
  assert.match(svg, /data-causal-link="2:3"/, 'the opportunity-to-solution ancestry is drawn as one explicit connector');
  assert.match(svg, /data-causal-assumption-band="3"/, 'solution assumptions remain distinct source claims inside a ruled card band');
});

test('Causal Tree shifts a long root fully into its native canvas instead of clipping its first line', () => {
  const source = 'outcome: A deliberately long outcome whose authored label needs several measured lines in a narrow root card\n  Need\n    Fix [testing]';
  const layout = layoutCausalTree(parse(source), ctx());
  assert.ok(Math.min(...layout.cards.map(entry => entry.y)) >= 0,
    'median-centred parents receive a measured top inset when they are taller than their first child');
  const svg = render(renderOst, source);
  const root = svg.match(/<g data-causal-node="0"[^>]*data-causal-y="([\d.]+)"/)?.[1];
  assert.ok(+root >= 0, 'the rendered root starts inside the SVG viewBox');
});

test('Causal Tree keeps malformed assumption descendants visible as real source claims', () => {
  const source = 'outcome: Retention\n  Losing your place\n    Resume reading [testing]\n      ? a direct evidence claim [testing]\n        ? a nested evidence claim [holds]';
  const model = parse(source), svg = render(renderOst, source, {edit:true});
  for(const node of [model.outcomes[0], ...model.outcomes[0].children, ...model.outcomes[0].children[0].children, ...model.outcomes[0].children[0].children[0].children, ...model.outcomes[0].children[0].children[0].children[0].children])
    assert.match(svg, new RegExp('data-causal-node="' + node.srcLine + '"'), 'malformed source line ' + (node.srcLine + 1) + ' is visibly retained');
  const nested = model.outcomes[0].children[0].children[0].children[0].children[0];
  assert.match(svg, new RegExp('data-causal-node="' + nested.srcLine + '"[^>]*data-causal-card=""[^>]*data-causal-w="(?!0(?:\"|\.))'),
    'a nested assumption becomes a measured standalone claim instead of a zero-width or omitted band row');
});

test('Causal Tree keeps direct and nested malformed assumptions as measured claims', () => {
  const source = [
    'outcome: Retention',
    '  ? a direct outcome claim [testing]',
    '  Losing your place',
    '    Resume reading [testing]',
    '      ? a direct evidence claim [testing]',
    '        ? a nested evidence claim [holds]',
  ].join('\n');
  const model = parse(source), svg = render(renderOst, source, {edit:true});
  const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
  for(const node of model.outcomes.flatMap(flatten))
    assert.match(svg, new RegExp('data-causal-node="' + node.srcLine + '"'), 'malformed source line ' + (node.srcLine + 1) + ' is visibly retained');
  const direct = model.outcomes[0].children.find(node => node.kind === 'assumption');
  const nested = model.outcomes[0].children.find(node => node.kind === 'opportunity').children[0].children[0].children[0];
  for(const node of [direct, nested])
    assert.match(svg, new RegExp('data-causal-node="' + node.srcLine + '"[^>]*data-causal-card=""[^>]*data-causal-w="[1-9]'),
      'malformed claim on source line ' + (node.srcLine + 1) + ' owns a non-zero physical card');
});

test('Causal Tree separates long sibling branches at every shared physical depth', () => {
  const source = [
    'outcome: Retention',
    '  A first deliberately long opportunity whose measured card must occupy more than one line',
    '    A first nested opportunity preserves a non-leaf branch',
    '      First leaf [testing]',
    '  A second deliberately long opportunity whose measured card must occupy more than one line',
    '    A second nested opportunity preserves a non-leaf branch',
    '      Second leaf [testing]',
    'outcome: A second long root whose measured label must not overlap the preceding outcome',
    '  A third deliberately long opportunity whose measured card must occupy more than one line',
    '    A third nested opportunity preserves a non-leaf branch',
    '      Third leaf [testing]',
  ].join('\n');
  const layout = layoutCausalTree(parse(source), ctx());
  for(const depth of new Set(layout.cards.map(entry => entry.depth))){
    const cards = layout.cards.filter(entry => entry.depth === depth).sort((a, b) => a.y - b.y);
    for(let i = 1; i < cards.length; i++){
      assert.ok(cards[i - 1].y + cards[i - 1].h + 14 <= cards[i].y,
        'depth ' + depth + ' cards preserve their measured 14px clearing interval');
      assert.ok(cards[i - 1].node.srcLine < cards[i].node.srcLine,
        'depth ' + depth + ' cards retain authored source order after separation');
    }
  }
  assert.ok(Math.min(...layout.cards.map(entry => entry.y)) >= 0 && Math.max(...layout.cards.map(entry => entry.y + entry.h)) <= layout.height,
    'the measured canvas encloses every shifted card without clipping');
});

test('Causal Tree preserves all state words, while broken is the sole alert claim', () => {
  const svg = render(renderOst);
  for(const word of ['CANDIDATE', 'TESTING', 'DELIVERING', 'SHIPPED', 'PARKED', 'UNTESTED', 'HOLDS', 'BROKEN'])
    assert.match(svg, new RegExp('>' + word + '<'), word + ' remains legible as text');
  assert.match(svg, /data-causal-claim="broken"/, 'broken is a semantic alert, not a coloured decoration');
  assert.equal((svg.match(/data-causal-claim="broken"/g) || []).length, 1);
});

test('Causal Tree phone layout is a source-order outline with named ancestry, not a scaled desktop tree', () => {
  const svg = render(renderOst, FIELD_DOC, {width:390, edit:true});
  assert.match(svg, /data-causal-layout="outline"/);
  assert.match(svg, /data-causal-breadcrumb="OUTCOME"/,
    'the root outcome retains a minimal visible stage context rather than becoming an unlabelled first card');
  assert.match(svg, /data-causal-context="Improve 90-day retention"/, 'the rendered claim retains its named causal context');
  assert.match(svg, /data-causal-breadcrumb="SOLUTION · Improve 90-day retention › Readers lose their place between sessions"/,
    'phone rows retain stage and full causal ancestry as one compact reading unit');
  const breadcrumb = svg.match(new RegExp('<g data-causal-breadcrumb="SOLUTION · Improve 90-day retention › Readers lose their place between sessions"[^>]*>([\\s\\S]*?)</g>'))[1];
  const visibleRoute = [...breadcrumb.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]).join(' ');
  assert.match(visibleRoute, /SOLUTION · Improve 90-day retention › Readers lose their place between sessions/);
  assert.ok((breadcrumb.match(/<text/g) || []).length > 1,
    'the complete stage-and-ancestry line is visibly wrapped without a separate PATH or stage label');
  assert.match(svg, /aria-label="More options: solution · Improve 90-day retention › Readers lose their place between sessions › Reading reminders · TESTING"/,
    'the phone menu target announces stage, full ancestry, label and state');
  assert.match(svg, /<g data-causal-node="3"[^>]*>[\s\S]*?<rect data-edit="cardmenu-solution"[^>]*data-hit=""/, 'phone claim retains its own contextual hit plane over its measured card');
  const rect = edit => {
    const tag = svg.match(new RegExp('<rect(?=[^>]*data-edit="' + edit + '")(?=[^>]*data-line="3")[^>]*>'))?.[0];
    assert.ok(tag, edit + ' has a source-owned phone hit plane');
    const value = name => +tag.match(new RegExp(name + '="([\\d.]+)"'))?.[1];
    return {x:value('x'), y:value('y'), w:value('width'), h:value('height')};
  };
  const menu = rect('cardmenu-solution'), state = rect('status');
  const overlaps = menu.x < state.x + state.w && state.x < menu.x + menu.w && menu.y < state.y + state.h && state.y < menu.y + menu.h;
  assert.equal(overlaps, false, 'phone state and card-menu hit planes are physically disjoint, so coarse state taps cannot be menu-rerouted');
  const hits = [...svg.matchAll(/<rect(?=[^>]*data-hit="")[^>]*>/g)].map(match => {
    const tag = match[0], value = name => +tag.match(new RegExp('(?:^|\\s)' + name + '="([\\d.]+)"'))?.[1];
    return {x:value('x'), y:value('y'), w:value('width'), h:value('height')};
  });
  for(let i = 0; i < hits.length; i++) for(let j = i + 1; j < hits.length; j++){
    const a = hits[i], b = hits[j];
    assert.equal(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, false,
      'every phone hit plane owns a distinct coarse tap area, including solution-assumption boundaries');
  }
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

test('Causal Tree assumption rows expose their own contextual edit route', () => {
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
  assert.match(refusal, /CANNOT FIT COMPLETE CAUSAL TREE/);
  assert.ok(refusal.includes('Outcome 0'), 'the refusal names the authored content that requires the native/export route');
});

test('Causal Tree Copy PNG refuses before any rendered source text falls below its physical reading floor', () => {
  const model = parse(FIELD_DOC), plate = renderWhyPresentation(model, ctx());
  assert.match(plate, /data-causal-presentation="plate"/);
  const chart = renderOst(model, project(model), ctx({bare:true}));
  const dims = causalDims(chart);
  const nested = plate.match(/<svg x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="[\d.]+" viewBox="0 0 [\d.]+ [\d.]+">/);
  assert.ok(nested, 'the complete native tree is embedded at one measurable plate scale');
  const scale = +nested[1] / dims.width;
  const minSourceSize = Math.min(...[...chart.matchAll(/font-size="([\d.]+)"/g)].map(match => +match[1]));
  assert.ok(minSourceSize * scale >= 9,
    'the plate either keeps every rendered source label at 9px or explicitly refuses it');
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

test('Causal Tree gives malformed nesting physical depth and bounds unbroken authored tokens', () => {
  const token = 'https://example.test/' + 'unbrokenidentifier'.repeat(18);
  const source = [
    'outcome: Retention',
    '  An unusually long nested opportunity parent whose second line must stay clear of the connector',
    '    Nested opportunity ' + token,
  ].join('\n');
  const svg = render(renderOst, source, {edit:true});
  const layout = layoutCausalTree(parse(source), ctx());
  const [parent, child] = layout.cards.sort((a, b) => a.node.srcLine - b.node.srcLine).slice(1);
  assert.ok(child.x > parent.x + parent.w,
    'same-stage nesting becomes another real tree depth, leaving its parent copy and connector gutter separate');
  assert.match(svg, /data-causal-link="1:2"/, 'the unusual authored ancestry stays visible as a direct link');
  assert.doesNotMatch(svg, new RegExp('>' + token + '<'), 'an unbroken authored token is split across measured lines, never allowed to escape the rail');
});

test('Causal Tree preserves backward-stage nesting without drawing a false leftward relation', () => {
  const source = 'outcome: Retention\n  Losing your place\n    Reading reminders [testing]\n      A nested opportunity remains a source claim';
  const svg = render(renderOst, source);
  const layout = layoutCausalTree(parse(source), ctx());
  const solution = layout.cards.find(entry => entry.node.label === 'Reading reminders');
  const nested = layout.cards.find(entry => entry.node.label === 'A nested opportunity remains a source claim');
  assert.ok(nested.x > solution.x + solution.w,
    'the parser-retained opportunity becomes a genuine child to its parent’s right instead of a cross-rail return line');
  assert.match(svg, /data-causal-link="2:3"/);
});

test('Causal Tree comparison copy wraps as part of the measured header and survives Copy PNG export', async () => {
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

test('Copy PNG refuses before Causal Tree type falls below its physical reading floor', () => {
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
