import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editTarget, btnAttrs} from '../svg.js';

test('btnAttrs emits the keyboard/AT triplet with the label escaped', () => {
  assert.equal(btnAttrs('Rename: A & B'),
    ' tabindex="0" role="button" aria-label="Rename: A &amp; B"');
});
test('editTarget uses btnAttrs verbatim for its label', () => {
  const s = editTarget('', {x:0,y:0,w:44,h:44,bg:'#000'}, {kind:'k', line:1, raw:'', label:'Go <x>'});
  assert.ok(s.includes(btnAttrs('Go <x>')));
});
test('editTarget omits data-raw when raw is undefined (menu triggers carry none)', () => {
  const s = editTarget('', {x:0,y:0,w:44,h:44,bg:'#000'}, {kind:'cardmenu', line:2, label:'More options: A'});
  assert.ok(!s.includes('data-raw'));
  assert.match(s, /^<g data-edit="cardmenu" data-line="2" tabindex=/);
});
test('editTarget keeps data-raw when raw is the empty string', () => {
  const s = editTarget('', {x:0,y:0,w:44,h:44,bg:'#000'}, {kind:'k', line:1, raw:''});
  assert.match(s, /<g data-edit="k" data-line="1" data-raw="">/);
});
test('editTarget marks the rect data-hit="" when hit is set', () => {
  const s = editTarget('', {x:5,y:6,w:44,h:44,bg:'#fff'}, {kind:'cardmenu-leaf', line:3, raw:'', label:'x', hit:true});
  assert.match(s, /<rect data-hit="" x="5" y="6" width="44" height="44" fill="#fff" fill-opacity="0"\/><\/g>$/);
});
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
