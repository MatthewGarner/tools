import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editTarget} from '../svg.js';
test('editTarget wraps inner with data-edit on the g and an invisible rect last', () => {
  const s = editTarget('<text>x</text>', {x: 10, y: 20, w: 44, h: 44, bg: '#fff'},
    {kind: 'axis', line: 3, raw: 'Effort <>'});
  assert.match(s, /^<g data-edit="axis" data-line="3" data-raw="Effort &lt;&gt;">/);
  assert.ok(s.indexOf('<text>x</text>') < s.lastIndexOf('<rect'));   // rect painted last
  assert.match(s, /<rect x="10" y="20" width="44" height="44" fill="#fff" fill-opacity="0"\/><\/g>$/);
});
test('editTarget passes extra attributes through', () => {
  assert.match(editTarget('', {x:0,y:0,w:44,h:44,bg:'#000'}, {kind:'field', line:1, raw:'', extra:'data-key="cost"'}),
    /data-edit="field"[^>]*data-key="cost"/);
});
