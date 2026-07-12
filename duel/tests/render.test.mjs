import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDuel, renderOrder, renderLoops, markdown} from '../render.js';
const st = {q: 'Which first?', items: ['Alpha', 'Beta', 'Gamma'],
  duels: [{a:0,b:1,w:0}, {a:1,b:2,w:1}, {a:2,b:0,w:2}]};

test('duel view: two cards, escaped labels, progress', () => {
  const h = renderDuel({q: 'Q', items: ['<b>X</b>', 'Y'], duels: []}, [0, 1]);
  assert.ok(h.includes('data-pick="0"') && h.includes('data-pick="1"'));
  assert.ok(!h.includes('<b>X</b>') && h.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.match(h, /duel 1 of/);
});

test('order list ranks with tie classes', () => {
  const h = renderOrder(st);                       // perfect loop → all score 0, all tied
  assert.equal((h.match(/class="[^"]*tie/g) || []).length, 3);
});

test('loop report: cycle text, tag buttons, synthesis after tagging', () => {
  const h1 = renderLoops(st);
  assert.match(h1, /Alpha → Beta → Gamma → Alpha/);
  assert.equal((h1.match(/tagbtn/g) || []).length, 3);
  const tagged = {...st, duels: st.duels.map(x => ({...x, tag: 'cost'}))};
  assert.match(renderLoops(tagged), /criteria pretending to be one/);
  assert.match(renderLoops(tagged), /on cost/);
});

test('markdown carries order, loops and the live link', () => {
  const md = markdown(st, 'https://example.com/#x');
  assert.match(md, /Alpha/);
  assert.match(md, /loop/i);
  assert.match(md, /example\.com/);
});
