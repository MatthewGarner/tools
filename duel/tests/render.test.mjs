import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDuel, renderOrder, renderLoops, markdown} from '../render.js';
const st = {q: 'Which first?', items: ['Alpha', 'Beta', 'Gamma'],
  duels: [{a:0,b:1,w:0}, {a:1,b:2,w:1}, {a:2,b:0,w:2}]};

test('duel view: two cards, escaped labels, progress', () => {
  const h = renderDuel({q: 'Q', items: ['<b>X</b>', 'Y'], duels: []}, [0, 1]);
  assert.ok(h.includes('data-pick="0"') && h.includes('data-pick="1"'));
  assert.ok(!h.includes('<b>X</b>') && h.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.match(h, /Duel 1 of/);
  assert.equal((h.match(/class="ckick"/g) || []).length, 2, 'a CONTENDER kicker on each card');
  assert.equal((h.match(/class="cpick"/g) || []).length, 2, 'a PICK affordance on each card');
});

test('progress meter: exact denominator + honest note at n ≤ 7, estimate above it', () => {
  // 3 items ⇒ full round robin, budget 3. Nothing fought yet ⇒ 0%.
  const start = renderDuel({q: 'Q', items: ['A', 'B', 'C'], duels: []}, [0, 1]);
  assert.match(start, /Duel 1 of 3 · every pair meets once/);
  assert.match(start, /0% complete/);
  assert.match(start, /class="pfill" style="width:0%"/);
  // two fought of three ⇒ 67%
  const mid = renderDuel({q: 'Q', items: ['A', 'B', 'C'], duels: [{a:0,b:1,w:0}, {a:1,b:2,w:1}]}, [0, 2]);
  assert.match(mid, /Duel 3 of 3/);
  assert.match(mid, /67% complete/);
  assert.match(mid, /width:67%/);
  // 10 items ⇒ budget is an estimate (~25), and the note must not claim a round robin
  const big = renderDuel({q: 'Q', items: Array.from({length: 10}, (_, i) => 'I' + i), duels: []}, [0, 1]);
  assert.match(big, /Duel 1 of ~25 · the most informative pairs first/);
  assert.ok(!big.includes('every pair meets once'));
});

test('progress percentage never leaves 0–100 when the budget is overrun', () => {
  // "Keep duelling" pushes past budget(3)=3; the meter must clamp, not overflow.
  const duels = [{a:0,b:1,w:0}, {a:1,b:2,w:1}, {a:2,b:0,w:2}, {a:0,b:1,w:1}];
  const h = renderDuel({q: 'Q', items: ['A', 'B', 'C'], duels}, [0, 1]);
  assert.match(h, /100% complete/);
  assert.match(h, /width:100%/);
});

test('order list ranks with tie classes', () => {
  const h = renderOrder(st);                       // perfect loop → all score 0, all tied
  assert.equal((h.match(/class="[^"]*tie/g) || []).length, 3);
  assert.match(h, /Neighbours compared/);
});

test('order list marks direct-neighbour evidence in words, not a legend', () => {
  const h = renderOrder({q: 'Q', items: ['A', 'B', 'C'], duels: [
    {a: 0, b: 1, w: 0}, {a: 1, b: 2, w: 1}, {a: 0, b: 2, w: 0},
  ]});
  assert.equal((h.match(/Neighbours compared/g) || []).length, 3);
  assert.ok(!h.includes('Needs direct comparison'));
});

test('loop report: cycle text, tag buttons, synthesis after tagging', () => {
  const h1 = renderLoops(st);
  assert.match(h1, /Alpha → Beta → Gamma → Alpha/);
  assert.equal((h1.match(/tagbtn/g) || []).length, 3);
  const tagged = {...st, duels: st.duels.map(x => ({...x, tag: 'cost'}))};
  assert.match(renderLoops(tagged), /criteria pretending to be one/);
  assert.match(renderLoops(tagged), /on cost/);
});

test('loop render and Markdown retain every directly observed edge of a triangle-free cycle', () => {
  const ring = {q: 'What first?', items: ['A', 'B', 'C', 'D'], duels: [
    {a: 0, b: 1, w: 0}, {a: 1, b: 2, w: 1}, {a: 2, b: 3, w: 2}, {a: 3, b: 0, w: 3},
  ]};
  const loop = renderLoops(ring);
  const exported = markdown(ring);

  assert.match(loop, /A → B → C → D → A/);
  assert.equal((loop.match(/class="tagbtn"/g) || []).length, 4, 'each observed cycle edge must remain taggable');
  assert.match(exported, /A → B → C → D → A/);
  assert.doesNotMatch(exported, /A → B → C → A/, 'Markdown must not invent a triangle edge that was never recorded');
});

test('markdown carries order, loops and the live link', () => {
  const md = markdown(st, 'https://example.com/#x');
  assert.match(md, /Alpha/);
  assert.match(md, /loop/i);
  assert.match(md, /No clean order/);
  assert.match(md, /neighbours compared/);
  assert.match(md, /example\.com/);
});

test('markdown calls a partial order provisional instead of exporting it as a settled list', () => {
  const md = markdown({q: 'What first?', items: ['A', 'B', 'C'], duels: [{a: 0, b: 1, w: 0}]});
  assert.match(md, /The order is still provisional/);
  assert.match(md, /## Current implied order/);
  assert.match(md, /needs a direct comparison/);
});
