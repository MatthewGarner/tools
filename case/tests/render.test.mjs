import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render, renderNarrow, caseReadout, toMarkdown, NARROW} from '../render.js';
import {planningRole} from '../planning-context.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6'},
  measure: t => t.length * 7,
  today: '2026-08-02',
};

const SRC = `title: Wexcombe augmentation
question: Augment in 2029, or run the fleet down?
status: decided
verdict: We augment — the warranty binds 3 years before the wear does
Money: Augment NPV model -> /fermi/#abc // the £ case
Money: Board options -> /tree/#def
Delivery: Plan of record -> /timeline/#ghi
Odd one -> https://example.com/x`;

const draw = (src = SRC, opts = {}, c = ctx) => render(parse(src), c, opts);
const planningModel = src => {
  const model = parse(src);
  return {...model, exhibits:model.exhibits.map(exhibit =>
    ({...exhibit, planning:planningRole(exhibit.url)}))};
};

test('cover carries title, question, lanes, pills, verdict and count', () => {
  const svg = draw();
  for(const s of ['Wexcombe augmentation', 'Augment in 2029', 'MONEY', 'DELIVERY',
    'FERMI', 'TREE', 'TIMELINE', 'We augment', 'DECIDED', '4 exhibits', '1 dead'])
    assert.ok(svg.includes(s), 'missing: ' + s);
});

test('dead exhibit renders as ghost (dashed), never a live link', () => {
  const svg = draw(SRC, {live: true});
  assert.ok(svg.includes('stroke-dasharray'));
  assert.ok(svg.includes('href="/fermi/#abc"'), 'live rows are links under opts.live');
  assert.ok(!svg.includes('href="https://example.com/x"'), 'a dead exhibit must never navigate');
});

test('each exhibit has one combined link/focus stop, separate from its edit targets', () => {
  for(const svg of [draw(SRC, {live: true, edit: true}),
    render(parse(SRC), {...ctx, width: 390}, {live: true, edit: true})]){
    const links = [...svg.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)];
    assert.equal(links.length, 3, 'one link/focus stop per live exhibit');
    for(const m of links){
      assert.ok(!m[1].includes('data-edit'), 'an edit target inside a link eats the tap: ' + m[1].slice(0, 80));
      assert.ok(m[1].includes('\u2197'), 'the one anchor owns the pill and trailing arrow');
    }
    assert.ok(svg.includes('\u2197'), 'the trailing open-arrow affordance exists');
    assert.ok(svg.includes('fill="transparent"'), 'links carry a real 44px hit rect');
  }
});

test('exports carry no links even for live exhibits', () => {
  assert.ok(!draw(SRC, {}).includes('<a '), 'URLs live in the doc, not the picture');
});

test('planning exhibits state their distinct claim roles on wide, narrow and markdown exports', () => {
  const src = 'Plan choices -> /paths/#x\nDelivery view -> /roadmap/#x\nDates -> /timeline/#x\nMoney -> /fermi/#x';
  const model = planningModel(src);
  for(const svg of [render(model, ctx), render(model, {...ctx, width:390})]){
    for(const text of [
      'DECISION PLAN · ALL OUTCOMES',
      'DELIVERY ROADMAP · COMMITMENT AND SHAPED WORK',
      'TIMING FORECAST · P50–P90 RANGES',
    ]) assert.ok(svg.includes(text), text);
    assert.equal((svg.match(/DECISION PLAN/g) || []).length, 1);
  }
  const markdown = toMarkdown(model, 'https://tools.matthewgarner.me/case/#x');
  assert.match(markdown, /Claim: Decision plan · All outcomes/);
  assert.match(markdown, /Claim: Timing forecast · P50–P90 ranges/);
  assert.doesNotMatch(markdown, /Money[^\n]*\n  - Claim:/, 'non-planning exhibits stay unchanged');
});

test('a delivery projection renders the complete known/assumed basis safely', () => {
  const model = planningModel('Projection -> /roadmap/#x');
  model.exhibits[0].planning = {
    kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{source:'Growth <review> & reset',
      known:[{key:'pricing', direction:'yes', date:'2026-08-03'}],
      assumed:[{key:'groups', direction:'no', date:'2026-08-12'}]},
  };
  for(const svg of [render(model, ctx), render(model, {...ctx, width:390})]){
    assert.ok(svg.includes('DELIVERY PROJECTION · ONE EXACT PATHS OUTCOME'));
    assert.ok(svg.includes('Known: pricing=yes @ 2026-08-03'));
    assert.ok(svg.includes('Assumed: groups=no @ 2026-08-12'));
    assert.ok(svg.includes('Growth &lt;review&gt; &amp; reset'));
    assert.ok(!svg.includes('<review>'));
  }
  const markdown = toMarkdown(model);
  assert.match(markdown, /Known: pricing=yes @ 2026-08-03/);
  assert.match(markdown, /Assumed: groups=no @ 2026-08-12/);
});

test('projection provenance is plain text in Markdown, never injected link syntax', () => {
  const model = planningModel('Projection -> /roadmap/#x');
  model.exhibits[0].planning = {
    kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{source:'Growth ](https://evil.example)', known:[], assumed:[{key:'groups', direction:'no', date:'2026-08-12'}]},
  };
  const markdown = toMarkdown(model);
  assert.ok(markdown.includes('From Paths: Growth \\]\\(https://evil\\.example\\)'));
  assert.doesNotMatch(markdown, /\[.*\]\(https:\/\/evil\.example\)/);
});

test('projection provenance escapes named entities in Markdown', () => {
  const model = planningModel('Projection -> /roadmap/#x');
  model.exhibits[0].planning = {
    kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{source:'&lt;script&gt; &lbrack;forged&rbrack;', known:[], assumed:[{key:'x', direction:'yes', date:'2026-08-12'}]},
  };
  assert.ok(toMarkdown(model).includes('\\&lt;script\\&gt; \\&lbrack;forged\\&rbrack;'));
});

test('caseReadout: authored wins; open case states its honest count', () => {
  assert.match(caseReadout(parse(SRC)).line, /^We augment/);
  const open = caseReadout(parse('status: open\nA -> /map/#x\nB -> /map/#y'));
  assert.equal(open.line, 'OPEN — 2 exhibits, no verdict yet');
  assert.equal(open.fig, '2');
  assert.equal(caseReadout(parse('verdict: off\nA -> /map/#x')).line, '');
});

test('edit mode exposes one honest target for every editable case field', () => {
  const e = draw(SRC, {edit: true});
  assert.ok(e.includes('data-edit="label"') && e.includes('data-edit="note"') &&
    e.includes('data-edit="question"') && e.includes('data-edit="status"') &&
    e.includes('data-edit="verdict"'));
  assert.equal((e.match(/data-edit="question"/g) || []).length, 1,
    'a wrapped question is one keyboard target, not one per line');
  const p = draw(SRC, {});
  assert.ok(!p.includes('data-edit='), 'goldens/exports stay chrome-free');
});

test('a note that wraps to 2+ IDENTICAL lines still gets exactly one keyboard target', () => {
  // a genuinely-wrapping fixture, unlike the question case above: the row()
  // boolean-vs-string-equality bug only shows up when two wrapped lines are
  // byte-identical, so a single repeated word is the adversarial case.
  const note = Array(100).fill('lorem').join(' ');
  const src = 'title: T\nA: Only item -> /map/#x // ' + note;
  const svg = draw(src, {edit: true});
  const noteLines = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map(m => m[1]).filter(t => /^lorem( lorem)*$/.test(t));
  assert.ok(noteLines.length >= 2, 'fixture must actually wrap the note to 2+ lines');
  assert.equal(noteLines[0], noteLines[1], 'the first two wrapped lines must be identical — the adversarial case');
  assert.equal((svg.match(/data-edit="note"/g) || []).length, 1,
    'a wrapped note is one keyboard target, not one per identical line');
});

test('missing question and notes get real edit targets; exhibit creation stays explicitly source-led', () => {
  const src = 'title: New case\nstatus: open\nBoard options -> /tree/#def';
  for(const svg of [draw(src, {edit: true}),
    render(parse(src), {...ctx, width: 390}, {edit: true, live: true})]){
    assert.match(svg, /data-edit="question"[^>]*data-raw=""/);
    assert.match(svg, /data-edit="note"[^>]*data-raw=""/);
    assert.ok(svg.includes('+ question') && svg.includes('+ note'));
    assert.ok(svg.includes('opacity="0.55"'), 'empty affordances are visibly secondary');
  }
  assert.ok(draw('title: New case', {edit: true}).includes('Add exhibits in the source panel'));
});

test('narrow relayout under the bucket; height follows content', () => {
  const svg = render(parse(SRC), {...ctx, width: 390});
  assert.match(svg, /width="390"/);
  assert.ok(svg.includes('FERMI') && svg.includes('We augment'));
  const short = render(parse('title: T\nA -> /map/#x'), {...ctx, width: 390});
  const h = s => +s.match(/height="(\d+)"/)[1];
  assert.ok(h(short) < h(svg), 'fewer exhibits, shorter artefact');
  assert.ok(ctx.width === undefined && NARROW === 520);
});

test('hostile labels/notes escape (the injection corpus is the standing gate)', () => {
  const svg = draw('title: <script>x</script>\nMoney: "quo" & <b> -> /fermi/#x // <img src=x>');
  assert.ok(!svg.includes('<script>') && !svg.includes('<img') && !svg.includes('<b>'));
  assert.ok(svg.includes('&lt;script&gt;'), 'escaped, not dropped');
});

test('empty doc renders the teaching empty state', () => {
  const svg = draw('title: New case');
  assert.ok(svg.includes('Add exhibits in the source panel'));
});
