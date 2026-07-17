import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {render} from '../render.js';

const ctx = (extra = {}) => ({
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c',
    bg:'#f7f8f6', err:'#b33'},
  measure: t => t.length * 7,
  ...extra,
});
const BID = 'title: Bid decision\nRoot\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';

test('well-formed svg, no NaN, verdict present', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx());
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('RECOMMENDED'));
  assert.ok(svg.includes('% of simulations'));
});

test('policy path uses scheme accent; rejected branch fades', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('#0C7FAE'), 'ocean scheme accent on policy path (light)');
  assert.ok(svg.includes('opacity="0.42"'), 'rejected option faded');
});

test('money formatting: currency symbol, minus before symbol', () => {
  const m = parse('currency: $\nRoot\n  A: -150k\n    Out\n      W (p=0.5): 1M\n      L (p=rest): 0\n  B: 0');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('−$150k'));
  assert.ok(!svg.includes('$-'));
});

test('flip section renders', () => {
  const m = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.6): 2M\n      Lose (p=rest): 0\n  No bid: 0');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('WHAT WOULD FLIP THIS'));
  assert.ok(svg.includes('flips if p(Win) &lt; 0.08') || svg.includes('flips if p(Win) &lt; 0.07'));
});

test('escaping in labels', () => {
  const m = parse('Root\n  A & B <opt>: 10\n  C: 5');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('A &amp; B &lt;opt&gt;'));
});

test('slide mode scales wider; chance-only tree has no verdict', () => {
  const m = parse(BID);
  const r = evaluate(m);
  const wOf = svg => +svg.match(/width="(\d+)"/)[1];
  assert.ok(wOf(render(m, r, ctx({slide: true}))) > wOf(render(m, r, ctx())));
  const chanceOnly = parse('Weather\n  Sunny (p=0.7): 10\n  Rain (p=rest): -5');
  const svg2 = render(chanceOnly, evaluate(chanceOnly), ctx());
  assert.ok(!svg2.includes('RECOMMENDED'));
});

test('edit-in-place targets: tspans carry kind, line and raw source', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('data-edit="prob"') && svg.includes('data-raw="0.3-0.45"'));
  assert.ok(svg.includes('data-edit="value"') && svg.includes('data-raw="2M to 5M"'));
  assert.ok(svg.includes('data-edit="label"'));
});

/* B2: the priced-insistence walk's crossfade/hot-mark hooks. Doc has no
   title: line so srcLine matches the plan's canonical numbers directly —
   line 0 Root, line 1 Bid (root option), line 3 Win (the hot prob+value). */
const BID_NO_TITLE = 'Root\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';

test('B2: ctx.hot marks the named prob/value tspans data-hot="" (edit + hot only)', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({edit: true, hot: new Set(['prob:3', 'value:3'])}));
  assert.ok(svg.includes('data-hot=""'), 'bare data-hot="" attribute present');
  // both the Win probability tspan and the Win payoff tspan (line 3) are marked
  assert.equal((svg.match(/data-hot=""/g) || []).length, 2, 'both prob and value tspans on line 3 marked');
  assert.ok(/<line[^>]*stroke-dasharray/.test(svg), 'a dotted underline is drawn under the marked run(s)');
});

test('B2: root-child subtrees get data-opt="<srcLine>" (edit-gated crossfade addressing)', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({edit: true}));
  assert.ok(svg.includes('data-opt="1"'), 'Bid (root option, line 1) addressable');
  assert.ok(svg.includes('data-opt="5"'), 'No bid (root option, line 5) addressable');
});

test('B2: MC readouts stamped data-mc="" and the verdict band wrapped data-verdict="" (edit-gated)', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({edit: true}));
  assert.ok(svg.includes('data-mc=""'));
  assert.ok(svg.includes('data-verdict=""'));
});

test('B2: golden-safety — none of the edit-only marks appear when edit is falsy', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({hot: new Set(['prob:3', 'value:3'])}));   // hot present, edit absent
  assert.ok(!svg.includes('data-hot'));
  assert.ok(!svg.includes('data-opt'));
  assert.ok(!svg.includes('data-mc'));
  assert.ok(!svg.includes('data-verdict'));
});
