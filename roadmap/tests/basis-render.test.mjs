import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';
import {renderDeck} from '../render-deck.js';
import {renderBoardLive} from '../render-board.js';
import {renderRegisterLive} from '../render-register.js';
import {renderFocusLive} from '../render-focus.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+(?:\.\d+)?)px/.exec(String(f)) || [])[1] || 12) * 0.55;
const colors = {
  bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#666', accent:'#08c', accentInk:'#067', err:'#c00',
  status:{done:'#18753d', doing:'#08799f', risk:'#906300', blocked:'#b33c38'},
  statusInk:{done:'#18753d', doing:'#08799f', risk:'#906300', blocked:'#b33c38'},
};
const ctx = extra => ({colors, measure, today:'2026-08-12', dark:false, ...(extra || {})});
const DOC = [
  'title: Growth delivery',
  'basis: paths "Growth & retention"; answered pricing=yes@2026-08-03, retention=no@2026-08-09; assumed groups=no@2026-08-12',
  'headline: Keep shared work moving while the open choices resolve.',
  'NOW',
  'Core: Fix resume position',
  'NEXT',
  'Core: Improve invitations',
  'LATER',
  'Core: Deepen retention',
].join('\n');

function artefacts(){
  const model = parse(DOC);
  return [
    ['chart wide', render(model, ctx())],
    ['chart narrow', render(model, ctx({width:390}))],
    ['board live', renderBoardLive({...model, style:'board'}, ctx({edit:true}))],
    ['register live', renderRegisterLive({...model, style:'register'}, ctx({edit:true}))],
    ['focus live', renderFocusLive({...model, style:'focus'}, ctx({edit:true}))],
    ...['board', 'register', 'focus', 'grid'].map(style => [style + ' deck', renderDeck({...model, style}, ctx())]),
  ];
}

const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
function assertWellFormedTags(svg, label){
  for(const tag of svg.match(/<[^!/][^>]*>/g) || []) assert.match(tag, TAG, label + ': malformed ' + tag);
}

test('every standalone Roadmap SVG carries the Paths basis visibly, exactly once', () => {
  for(const [name, svg] of artefacts()){
    assert.equal((svg.match(/DELIVERY PROJECTION · FROM PATHS:/g) || []).length, 1, name);
    assert.ok(svg.includes('Growth &amp; retention'), name + ' keeps source provenance');
    assert.ok(svg.includes('Known:'), name + ' labels written answers as known');
    assert.ok(svg.includes('Assumed:'), name + ' labels planning assumptions separately');
    for(const value of ['pricing', 'yes', 'retention', 'no', 'groups'])
      assert.ok(svg.includes(value), name + ' does not elide ' + value);
    assertWellFormedTags(svg, name);
  }
});

test('each basis-bearing SVG describes dated provenance for assistive technology', () => {
  for(const [name, svg] of artefacts()){
    assert.equal((svg.match(/<desc>/g) || []).length, 1, name + ' has one root description');
    assert.match(svg, /pricing equals yes \(answered 2026-08-03\)/, name);
    assert.match(svg, /groups equals no \(assumed 2026-08-12\)/, name);
  }
});

test('Grid delegates the chart without duplicating the basis inside its frame', () => {
  const svg = renderDeck({...parse(DOC), style:'grid'}, ctx());
  assert.equal((svg.match(/DELIVERY PROJECTION · FROM PATHS:/g) || []).length, 1);
  assert.equal((svg.match(/<desc>/g) || []).length, 1);
});

test('ordinary Roadmaps gain no projection copy or description', () => {
  const plain = parse('title: Plain\nNOW\nCore: Work');
  for(const svg of [render(plain, ctx()), render(plain, ctx({width:390})), renderDeck(plain, ctx()),
    renderBoardLive(plain, ctx()), renderRegisterLive(plain, ctx()), renderFocusLive(plain, ctx())]){
    assert.ok(!svg.includes('DELIVERY PROJECTION'));
    assert.ok(!svg.includes('Delivery projection from Paths'));
  }
});

test('hostile-but-valid source labels are escaped in visible and machine copy', () => {
  const model = parse('basis: paths "Growth <review> & reset"; answered pricing=yes@2026-08-03\nNOW\nCore: Work');
  const svg = render(model, ctx());
  assert.ok(!svg.includes('Growth <review>'));
  assert.ok(svg.includes('Growth &lt;review&gt; &amp; reset'));
});

test('narrow basis keeps the longest permitted machine key without eliding it', () => {
  const key = 'pricing-' + 'expansion'.repeat(2) + 'invest';
  const model = parse('basis: paths "Growth"; assumed ' + key + '=no@2026-08-12\nNOW\nCore: Work');
  const svg = render(model, ctx({width:390}));
  const visible = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('');
  assert.ok(visible.includes(key), 'the key may split across text nodes but every character survives');
});

test('the largest valid provenance ledger still leaves deck content above its fixed footer', () => {
  const source = 'S'.repeat(80);
  const entries = Array.from({length:8}, (_, i) => 'k' + i + '-'+ 'x'.repeat(28) + '=yes@2026-08-12').join(', ');
  const model = parse('basis: paths "' + source + '"; answered ' + entries + '\nNOW\nCore: Work');
  assert.ok(model.basis, 'the documented maximum stays valid');
  const svg = renderDeck(model, ctx());
  const workY = Number((svg.match(/<text[^>]*\sy="([\d.]+)"[^>]*>Work<\/text>/) || [])[1]);
  assert.ok(Number.isFinite(workY) && workY < 1002, 'body work must remain above the deck footer');
});
