import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS, PRESET_NAMES, resolve, zoneFor, ruleHolds, zonePolygon, paintOrder, labelAnchors} from '../zones.js';

const blank = () => ({title:'', palette:'ocean', accent:null, preset:null,
  axes:{x:null, y:null}, grid:null, cellNames:[], ruleZones:[], items:[], warnings:[]});

test('four presets exist with axes, fields, advice, verdict', () => {
  assert.deepEqual(PRESET_NAMES, ['assumptions', 'stakeholders', 'futures', 'risk']);
  for(const p of Object.values(PRESETS)){
    assert.ok(p.axes.x.label && p.axes.y.label);
    assert.ok(typeof p.verdict === 'function' && typeof p.flag === 'function');
  }
});

test('rule evaluation: strict inequalities over x/y/x+y/x-y', () => {
  assert.ok(ruleHolds({expr:'x', op:'<', val:50}, 49, 0));
  assert.ok(!ruleHolds({expr:'x', op:'<', val:50}, 50, 0));   // boundary excluded
  assert.ok(ruleHolds({expr:'x+y', op:'>', val:120}, 70, 60));
  assert.ok(ruleHolds({expr:'x-y', op:'<', val:0}, 20, 80));
});

test('assumptions preset: corner rule wins, then band, then catch-all', () => {
  const r = resolve({...blank(), preset:'assumptions'});
  assert.equal(zoneFor(r, 20, 80).name, 'test first');
  assert.equal(zoneFor(r, 80, 80).name, 'keep an eye on');   // x+y>100, not corner
  assert.equal(zoneFor(r, 30, 30).name, 'safe enough');
  assert.equal(r.x.label, 'Evidence');
});

test('stakeholders preset: named 2x2 cells, 1,1 bottom-left', () => {
  const r = resolve({...blank(), preset:'stakeholders'});
  assert.equal(zoneFor(r, 20, 20).name, 'monitor');
  assert.equal(zoneFor(r, 80, 20).name, 'keep informed');
  assert.equal(zoneFor(r, 20, 80).name, 'keep satisfied');
  assert.equal(zoneFor(r, 80, 80).name, 'manage closely');
});

test('cell containment: right/top edges belong to the last cell', () => {
  const r = resolve({...blank(), grid:{cols:2, rows:2, srcLine:0}});
  assert.deepEqual([zoneFor(r, 100, 100).col, zoneFor(r, 100, 100).row], [2, 2]);
  assert.deepEqual([zoneFor(r, 0, 0).col, zoneFor(r, 0, 0).row], [1, 1]);
  assert.deepEqual([zoneFor(r, 50, 50).col, zoneFor(r, 50, 50).row], [2, 2]);
});

test('rules layered over a grid win; uncovered pure-grid points fall to cells', () => {
  const m = {...blank(), grid:{cols:2, rows:2, srcLine:0},
    ruleZones:[{name:'hot', rules:[{expr:'x+y', op:'>', val:150}], srcLine:1}]};
  const r = resolve(m);
  assert.equal(zoneFor(r, 90, 90).name, 'hot');
  assert.equal(zoneFor(r, 10, 10).kind, 'cell');
});

test('no grid, no rules → everything is unzoned', () => {
  const r = resolve(blank());
  assert.equal(zoneFor(r, 50, 50).kind, 'unzoned');
});

test('user rule zones replace a preset\'s rule zones wholesale', () => {
  const m = {...blank(), preset:'assumptions',
    ruleZones:[{name:'urgent', rules:[{expr:'y', op:'>', val:90}], srcLine:2}]};
  const r = resolve(m);
  assert.equal(zoneFor(r, 20, 95).name, 'urgent');
  assert.equal(zoneFor(r, 20, 80).kind, 'unzoned');   // preset zones gone
});

test('user grid overrides preset grid and drops preset cell names', () => {
  const m = {...blank(), preset:'stakeholders', grid:{cols:3, rows:3, srcLine:0}};
  const r = resolve(m);
  assert.equal(r.grid.cols, 3);
  assert.ok(r.zones.filter(z => z.kind === 'cell').every(z => z.anonymous));
});

test('user cell names merge over preset cell names per-cell', () => {
  const m = {...blank(), preset:'futures',
    cellNames:[{col:1, row:2, name:'Walled gardens', srcLine:3}]};
  const r = resolve(m);
  assert.equal(zoneFor(r, 20, 80).name, 'Walled gardens');
  assert.equal(zoneFor(r, 80, 80).name, 'Scenario B');
  assert.equal(zoneFor(r, 20, 80).srcLine, 3);
  assert.equal(zoneFor(r, 80, 80).srcLine, null);      // preset name → insert path for EIP
});

test('out-of-range and gridless cell names warn and are ignored', () => {
  const m1 = {...blank(), grid:{cols:2, rows:2, srcLine:0}, cellNames:[{col:3, row:1, name:'X', srcLine:1}]};
  assert.ok(resolve(m1).warnings.some(w => w.includes('outside')));
  const m2 = {...blank(), cellNames:[{col:1, row:1, name:'X', srcLine:0}]};
  assert.ok(resolve(m2).warnings.some(w => w.includes('grid')));
});

test('custom mode without axis labels warns and defaults', () => {
  const r = resolve(blank());
  assert.equal(r.x.label, 'X');
  assert.ok(r.warnings.some(w => w.includes('x:')));
});

test('anonymous cells are named by address and flagged anonymous', () => {
  const r = resolve({...blank(), grid:{cols:2, rows:1, srcLine:0}});
  const cells = r.zones.filter(z => z.kind === 'cell');
  assert.deepEqual(cells.map(c => c.name), ['1,1', '2,1']);
  assert.ok(cells.every(c => c.anonymous));
});

test('zone polygons: cells are rects, rules are clipped convex polys', () => {
  const rGrid = resolve({...blank(), grid:{cols:2, rows:2, srcLine:0}});
  const cell = rGrid.zones.find(z => z.kind === 'cell' && z.col === 1 && z.row === 1);
  assert.deepEqual(zonePolygon(rGrid, cell), [[0,0],[50,0],[50,50],[0,50]]);
  const rRule = resolve({...blank(), ruleZones:[{name:'band', rules:[{expr:'x+y', op:'>', val:150}], srcLine:0}]});
  const poly = zonePolygon(rRule, rRule.zones[0]);
  assert.equal(poly.length, 3);   // triangle in the top-right corner
  for(const [x, y] of poly) assert.ok(x + y >= 149.9);
});

test('empty rule regions yield no polygon', () => {
  const r = resolve({...blank(), ruleZones:[{name:'nowhere', rules:[{expr:'x', op:'>', val:200}], srcLine:0}]});
  assert.equal(zonePolygon(r, r.zones[0]), null);
});

test('paint order: cells first, then rules lowest-precedence-first', () => {
  const m = {...blank(), grid:{cols:2, rows:2, srcLine:0},
    ruleZones:[{name:'a', rules:[{expr:'x', op:'<', val:30}], srcLine:1},
               {name:'b', rules:[{expr:'y', op:'>', val:70}], srcLine:2}]};
  const order = paintOrder(resolve(m)).map(e => e.zone.kind === 'cell' ? 'cell' : e.zone.name);
  assert.deepEqual(order, ['cell', 'cell', 'cell', 'cell', 'b', 'a']);
});

test('label anchors land inside their own zone', () => {
  const r = resolve({...blank(), preset:'assumptions'});
  const anchors = labelAnchors(r);
  for(const z of r.zones.filter(z => z.kind === 'rule')){
    const [ax, ay] = anchors.get(z.id);
    assert.equal(zoneFor(r, ax, ay).id, z.id, z.name);
  }
});

test('duplicate rule-zone names warn', () => {
  const m = {...blank(), ruleZones:[
    {name:'dup', rules:[{expr:'x', op:'<', val:50}], srcLine:0},
    {name:'dup', rules:[{expr:'x', op:'>', val:50}], srcLine:1}]};
  assert.ok(resolve(m).warnings.some(w => w.includes('dup')));
});
