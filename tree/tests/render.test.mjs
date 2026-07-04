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
  assert.ok(svg.includes('Recommendation:'));
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
  assert.ok(!svg2.includes('Recommendation:'));
});
