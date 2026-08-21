import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderCausalField as renderOst} from '../render-causal-field.js';
import {renderDeliveryLens as renderMap} from '../render-delivery-lens.js';

const ctx = (extra = {}) => ({
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c',
    bg:'#f7f8f6', err:'#b33', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}},
  measure: t => t.length * 7,
  ...extra,
});
const DOC = [
  'title: Q3 retention',
  'outcome: Improve 90-day retention',
  '  Readers lose their place between sessions',
  '    Reading reminders [testing]',
  '      ? users want to be interrupted',
  '    Resume where you left off [delivering]',
  '      ? freezes reduce churn [holds]',
  '  Choosing the next book is work',
  '  Orphan feature [delivering]',
].join('\n');
const run = (renderer, doc = DOC, extra = {}) => {
  const m = parse(doc);
  return renderer(m, project(m), ctx(extra));
};

test('Delivery Lens: derived readiness columns, audit facts, and no-why integrity stay explicit', () => {
  const svg = run(renderMap);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('DELIVERING') && svg.includes('TESTING') && svg.includes('UNADDRESSED'));
  assert.ok(svg.includes('Resume where you left off'));
  assert.ok(svg.includes('Choosing the next book is work'), 'unaddressed opportunity remains named');
  assert.ok(svg.includes('UNTESTED BET'), 'reading reminders flagged');
  assert.ok(svg.includes('NO WHY') && svg.includes('INTEGRITY EXCEPTION'), 'orphan remains a factual exception');
  assert.doesNotMatch(svg, /\bNOW\b|\bNEXT\b|\bLATER\b/, 'delivery readiness is not a timeline');
});

test('Delivery Lens: a deeper unaddressed opportunity keeps its authored identity', () => {
  const doc = [
    'outcome: O',
    '  Big need',
    '    Addressed sub',
    '      Fix [delivering]',
    '    Ignored sub',
  ].join('\n');
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('Ignored sub'), 'named row, never a generic placeholder');
  assert.match(svg, /data-readiness-column="unaddressed"/);
  assert.ok(svg.includes('Addressed sub'), 'its causal sibling remains represented in the path');
});

test('Delivery Lens: broken assumption stays an alert fact in error colour', () => {
  const doc = 'outcome: O\n  Need\n    Shaky [delivering]\n      ? belief [broken]';
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('BROKEN ASSUMPTION'));
  assert.ok(svg.includes('#b33'), 'err colour used');
});

test('Delivery Lens: broken-assumption solution stays a live, editable ledger row', () => {
  const doc = 'outcome: O\n  Need\n    Shaky [delivering]\n      ? belief [broken]';
  const svg = run(renderMap, doc, {edit: true});
  assert.ok(svg.includes('BROKEN ASSUMPTION'), 'badge stays legible');
  assert.ok(svg.includes('data-edit="cardmenu-solution"') && svg.includes('data-edit="label"'),
    'stays fully editable without turning a live claim into a ghost');
  assert.ok(!svg.includes('worldState'), 'never roadmap\'s worldState vocabulary');
});

test('Delivery Lens: healthy rows do not inherit broken-assumption alert treatment', () => {
  const svg = run(renderMap);   // DOC: testing+untested, delivering+holds, delivering+no-why — no broken assumption anywhere
  assert.ok(svg.includes('UNTESTED BET'));
  assert.ok(svg.includes('NO WHY'));
  assert.doesNotMatch(svg, /#b33/, 'no-why is an integrity fact; only a broken claim earns alert colour');
  assert.doesNotMatch(svg, /data-readiness-audit="broken assumption"/);
  assert.doesNotMatch(svg, /stroke-dasharray/, 'readiness remains a ruled ledger, not a ghost-card view');
});

test('Delivery Lens: no-why + broken-assumption composite keeps both facts', () => {
  const doc = 'outcome: O\n  Orphan [delivering]\n    ? belief [broken]';
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('NO WHY') && svg.includes('INTEGRITY EXCEPTION'));
  assert.ok(svg.includes('BROKEN ASSUMPTION'), 'BROKEN ASSUMPTION badge kept');
  assert.match(svg, /data-readiness-column="no-why"/);
});

test('Causal Tree: rooted cards retain claims and wrap authored long assumptions', () => {
  const svg = run(renderOst, DOC + '\n  Extra need\n    Extra fix [testing]\n      ? a deliberately long assumption whose authored words must wrap within the assumption rail');
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  for(const stage of ['outcome','opportunity','solution','assumption']) assert.ok(svg.includes('data-causal-stage="' + stage + '"'));
  assert.ok(svg.includes('DELIVERING') && svg.includes('TESTING') && svg.includes('HOLDS'));
  assert.ok(svg.includes('>a deliberately</text>'));
  assert.ok(svg.includes('>whose authored</text>'));
  assert.ok(svg.includes('>the assumption</text>'));
  assert.ok(!svg.includes('>a deliberately long assumption whose authored words must wrap within the assumption rail<'), 'row wrapped, not overflowing');
  assert.doesNotMatch(svg, /stroke-dasharray/, 'claims are connected by quiet rules, not dashed cards');
});

test('Causal Tree: state remains explicit in wide and phone layouts without ornamental fills', () => {
  const m = parse(DOC);
  for(const [name, extra] of [['wide', {}], ['phone', {width: 380}]]){
    const svg = renderOst(m, project(m), {...ctx(), ...extra});
    assert.ok(svg.includes('data-causal-state="delivering"'), name + ': delivering remains explicit');
    assert.ok(svg.includes('data-causal-state="holds"'), name + ': assumption claim remains explicit');
    assert.doesNotMatch(svg, /rx="0" fill="#[\da-fA-F]+1F"/, name + ': no decorative state tint');
  }
});

test('Causal Tree: state control has a separate full-height edit target', () => {
  const m = parse(DOC);
  const svg = renderOst(m, project(m), ctx({edit: true}));
  assert.match(svg, /<rect data-edit="status"[^>]*data-hit=""[^>]*height="44"/);
  assert.match(svg, /<text data-causal-state="testing"[^>]*>TESTING<\/text>/);
});

test('Causal Tree: minimal token contexts do not leak undefined paint', () => {
  const svg = run(renderOst);
  assert.ok(!svg.includes('undefined'));
  assert.ok(svg.includes('DELIVERING'));
});

test('Causal Tree: only a broken claim earns error colour', () => {
  const svg = run(renderOst, DOC, {colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667',
    accent:'#08c', bg:'#f7f8f6', err:'#b33',
    status:{done:'#3a3', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}}});
  assert.doesNotMatch(svg, /#3a3/);
  const broken = run(renderOst, 'outcome: O\n  N\n    S [delivering]\n      ? B [broken]');
  assert.match(broken, /fill="#b33"[^>]*>BROKEN<\/text>/);
});

test('Causal Tree: shipped claims stay legible and authored text escapes in both views', () => {
  const doc = 'outcome: O\n  Need & <more>\n    Old thing [shipped]\n    Live [delivering]';
  const ost = run(renderOst, doc);
  assert.ok(ost.includes('SHIPPED'));
  assert.ok(ost.includes('Need &amp; &lt;more&gt;'));
  assert.ok(run(renderMap, doc).includes('Need &amp; &lt;more&gt;'));
});

test('Delivery Lens: standard fixture retains its semantic columns and source-node rows', () => {
  const ctxBase = {
    colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
      err:'#b33', status:{done:'#1D7A3E',doing:'#1F4FD8',risk:'#9A6A00',blocked:'#B3403A'},
      statusInk:{done:'#1C753C',doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A'}, accentInk:'#0A6C94',
      brand:'#E2231A', brandText:'#D62015'},
    measure: (t) => t.length * 7,
  };
  const doc = 'title: T\noutcome: Retention\n  Losing your place\n    Reading reminders [testing]\n      ? wanted\n' +
    '    Resume where you left off [delivering]\n      ? works [holds]\n  Choosing is work\n  Orphan [delivering]';
  const m = parse(doc);
  const pr = project(m);
  const svg = renderMap(m, pr, {...ctxBase});
  for(const column of ['delivering', 'testing', 'unaddressed', 'no-why']) assert.match(svg, new RegExp('data-readiness-column="' + column + '"'));
  for(const item of [...pr.now, ...pr.next, ...pr.later, ...pr.noWhy]) assert.match(svg, new RegExp('data-readiness-node="' + item.node.srcLine + '"'));
});

test('palette shifts the paper for both projections while readiness stays semantically restrained', () => {
  const doc = 'palette: ember\noutcome: O\n  Need\n    Fix [delivering]';
  const field = run(renderOst, doc);
  const ledger = run(renderMap, doc);
  assert.ok(field.includes('fill="#f7f2ef"'));
  assert.ok(ledger.includes('fill="#f7f2ef"'));
  assert.doesNotMatch(field, /#B04E1E/);
  assert.doesNotMatch(ledger, /#B04E1E/);
});
