import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {resolve} from '../zones.js';
import {readout} from '../readout.js';
import {render, nudge} from '../render.js';

const ctx = {
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c', bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}},
  measure: t => t.length * 7,
};
const run = (src, extra = {}) => {
  const m = parse(src);
  const r = resolve(m);
  return render(m, r, readout(m, r), {...ctx, ...extra});
};

test('assumptions map renders zones, cards, axes, verdict', () => {
  const svg = run('preset: assumptions\ntitle: T\nA @ 20,80 :: test: interview five\nB @ 70,60\nC');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('data-plane'));
  assert.ok(svg.includes('TEST FIRST'));
  assert.ok(svg.includes('Evidence'));
  assert.ok(svg.includes('data-edit="label"'));
  assert.ok(svg.includes('sit in test first'));
  assert.ok(!svg.includes('NaN'));
});

test('unplaced items render in a tray with data-tray; tray absent when all placed', () => {
  const withTray = run('preset: assumptions\nA @ 20,80\nLegal sign-off');
  assert.ok(withTray.includes('UNPLACED'));
  assert.ok(withTray.includes('data-tray'));
  const without = run('preset: assumptions\nA @ 20,80');
  assert.ok(!without.includes('UNPLACED'));
});

test('grid hairlines and named-cell labels; anonymous cells unlabelled', () => {
  const svg = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: E\ny: V\nP @ 80,20');
  assert.ok(svg.includes('QUICK WINS'));
  assert.ok(!svg.includes('>1,1<'));      // anonymous cell gets no label text
});

test('zone-name edit targets: declared zones carry data-zone; preset rule zones do not', () => {
  const declared = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: E\ny: V');
  assert.ok(declared.includes('data-zone="c:1,2"'));
  const preset = run('preset: assumptions\nA @ 20,80');
  assert.ok(!preset.includes('data-zone="r:test first"'));
  const futures = run('preset: futures');
  assert.ok(futures.includes('data-zone="c:1,2"'));   // preset cells editable via insert path
});

test('axis edit targets carry data-axis and srcLine or -1', () => {
  const svg = run('x: Effort (low → high)\ny: Value\nA @ 10,10');
  assert.ok(svg.includes('data-axis="x"'));
  assert.ok(/<g data-edit="axis" data-line="0"[^>]*data-axis="x"/.test(svg));
  const preset = run('preset: risk\nA @ 10,10');
  assert.ok(/<g data-edit="axis" data-line="-1"[^>]*data-axis="x"/.test(preset));
});

test('escaping: labels with <, &, " render escaped', () => {
  const svg = run('preset: assumptions\nA <b> & "q" @ 20,80');
  assert.ok(svg.includes('A &lt;b&gt; &amp; &quot;q&quot;'));
  assert.ok(!svg.includes('<b>'));
});

test('slide variant scales up', () => {
  const base = run('preset: risk\nA @ 60,85');
  const slide = run('preset: risk\nA @ 60,85', {slide: true});
  const w = s => +s.match(/width="(\d+)"/)[1];
  assert.ok(w(slide) > w(base));
});

test('nudge separates overlapping boxes deterministically and clamps to bounds', () => {
  const boxes = [{x:10, y:10, w:60, h:20}, {x:12, y:12, w:60, h:20}];
  const out = nudge(boxes, 0, 0, 200, 100);
  const [a, b] = out;
  const overlap = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
                  Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  assert.ok(!overlap);
  assert.deepEqual(out, nudge(boxes, 0, 0, 200, 100));     // deterministic
  for(const o of out){ assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= 200 && o.y + o.h <= 100); }
  assert.deepEqual(nudge([{x:5, y:5, w:10, h:10}], 0, 0, 100, 100), [{x:5, y:5, w:10, h:10}]);
});

test('nudge: fixed obstacles never move; free boxes move off them', () => {
  const boxes = [{x:10, y:10, w:60, h:20, fixed:true}, {x:12, y:12, w:60, h:20}];
  const out = nudge(boxes, 0, 0, 200, 100);
  assert.deepEqual({x: out[0].x, y: out[0].y}, {x:10, y:10});   // fixed unchanged
  const [a, b] = out;
  const overlap = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
                  Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  assert.ok(!overlap);
});

test('zone labels are nudge obstacles: a card authored on a zone label moves off it', () => {
  /* futures: cell label sits at the cell centre; author a card exactly there */
  const svg = run('preset: futures\nx: A\ny: B\nSignal @ 25,25');
  const label = svg.match(/<g data-edit="zonename"[^>]*data-zone="c:1,1"[^>]*><text x="([\d.]+)" y="([\d.]+)"/);
  const cap = svg.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx=/);
  assert.ok(label && cap);
  /* capsule vertical span must not contain the label baseline */
  const [ly] = [+label[2]];
  const capY = +cap[2], capH = +cap[4];
  assert.ok(ly < capY - 2 || ly > capY + capH + 2, 'label baseline inside capsule');
});

test('authored positions unchanged by nudge: dots stay at exact coordinates', () => {
  /* two items at the same spot: capsules separate, both dots at the same cx/cy */
  const svg = run('x: A\ny: B\nOne @ 50,50\nTwo @ 50,50');
  const dots = [...svg.matchAll(/<circle[^>]*cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => m[1] + ',' + m[2]);
  assert.equal(new Set(dots).size, 1);
});

test('flagged items get the err stroke on the capsule', () => {
  const svg = run('preset: assumptions\nUntested bet @ 20,80');
  assert.ok(/<rect[^>]*stroke="#b33"/.test(svg));
});

test('placed cards carry data-edit="cardmenu" with a >=44px data-hit rect as the first child; tray items do not', () => {
  const svg = run('preset: assumptions\nPlaced one @ 20,80\nUnplaced one');
  const g = svg.match(/<g data-edit="cardmenu" data-line="1">(<rect data-hit=""[^>]*\/>)/);
  assert.ok(g, 'expected cardmenu group with a data-hit rect as its first child');
  const h = +g[1].match(/height="([\d.]+)"/)[1];
  assert.ok(h >= 44, 'hit rect must be at least 44px tall, got ' + h);
  /* the tray (unplaced) item keeps its plain data-line group, no cardmenu, no data-hit */
  const trayGroup = svg.match(/<g data-line="\d+" data-tray="1">[\s\S]*?<\/g>/);
  assert.ok(trayGroup, 'expected a tray group');
  assert.ok(!trayGroup[0].includes('cardmenu') && !trayGroup[0].includes('data-hit'),
    'tray items must stay menu-less (drag-to-place is their affordance)');
});

test('cardmenu hit rect is centred on the capsule, not the authored dot', () => {
  /* futures preset nudges cards off zone labels, so capsule != dot for this item */
  const svg = run('preset: futures\nx: A\ny: B\nSignal @ 25,25');
  const capsule = svg.match(/<g data-edit="cardmenu"[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="20" rx="10"/);
  const hit = svg.match(/<rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(capsule && hit);
  const capCentreY = +capsule[2] + 10;             // capsule height is 20
  const hitCentreY = +hit[2] + (+hit[4]) / 2;
  assert.ok(Math.abs(capCentreY - hitCentreY) < 0.5, 'hit rect must centre on the capsule centre');
  assert.equal(+hit[3], +capsule[3], 'hit rect spans the full capsule width');
});

test('plane-level widens: axis, zonename and additem targets get a >=44px invisible box, no data-hit', () => {
  const svg = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: Effort\ny: Value\nThing @ 20,80', {edit: true});
  for(const re of [
    /<g data-edit="axis" data-line="-?\d+" data-raw="[^"]*" data-axis="x">[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="(\d+)" height="(\d+)" fill="[^"]*" fill-opacity="0"\/>/,
    /<g data-edit="zonename"[^>]*>[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="(\d+)" height="(\d+)" fill="[^"]*" fill-opacity="0"\/>/,
    /<g data-edit="additem"[^>]*>[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="(\d+)" height="(\d+)" fill="[^"]*" fill-opacity="0"\/>/,
  ]){
    const m = svg.match(re);
    assert.ok(m, 'expected a widened invisible box for ' + re);
    assert.ok(+m[3] >= 44 && +m[4] >= 44, 'box must be >=44px, got ' + m[3] + 'x' + m[4]);
  }
  assert.ok(!/data-edit="axis"[\s\S]{0,400}?data-hit/.test(svg.match(/<g data-edit="axis"[\s\S]*?<\/g>/)[0]),
    'plane-level widens do not carry data-hit (only cardmenu cards do)');
});

test('axis y-label hit box is clamped so it never runs past x=0', () => {
  const svg = run('x: Effort\ny: Value\nA @ 50,50');
  const m = svg.match(/<g data-edit="axis" data-line="-?\d+" data-raw="Value" data-axis="y">[\s\S]*?<rect x="([-\d.]+)"/);
  assert.ok(m);
  assert.ok(+m[1] >= 0, 'y-axis hit box x must be clamped to >=0, got ' + m[1]);
});
