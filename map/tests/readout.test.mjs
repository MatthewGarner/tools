import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {resolve} from '../zones.js';
import {readout, toMarkdown} from '../readout.js';

const run = src => { const m = parse(src); const r = resolve(m); return {m, r, ro: readout(m, r)}; };

test('assumptions: verdict counts test-first and missing tests; flags name the method prompts', () => {
  const {ro} = run([
    'preset: assumptions',
    'A @ 20,80 :: test: interview five users',
    'B @ 30,90', 'C @ 40,70', 'D @ 80,20', 'E',
  ].join('\n'));
  assert.equal(ro.verdict, '3 of 4 assumptions sit in test first; 2 have no test designed.');
  assert.equal(ro.flagged.length, 2);
  assert.ok(ro.flagged[0].msg.includes('no test designed'));
  assert.equal(ro.unplaced.length, 1);
});

test('zone lists follow precedence order with items sorted by srcLine by default', () => {
  const {ro} = run('preset: assumptions\nLate @ 30,90\nEarly @ 20,80');
  const tf = ro.zones.find(e => e.zone.name === 'test first');
  assert.deepEqual(tf.items.map(i => i.label), ['Late', 'Early']);   // srcLine order
  assert.ok(ro.zones.findIndex(e => e.zone.name === 'test first') <
            ro.zones.findIndex(e => e.zone.name === 'safe enough'));
  assert.equal(tf.advice, 'High importance, weak evidence — design a cheap test before building on these.');
});

test('risk: severity-ordered register (x+y desc within zone) and worst named in verdict', () => {
  const {ro} = run('preset: risk\nSmall slip @ 60,85\nBig slip @ 80,90\nQuiet @ 20,20');
  const sev = ro.zones.find(e => e.zone.name === 'severe');
  assert.deepEqual(sev.items.map(i => i.label), ['Big slip', 'Small slip']);
  assert.equal(ro.verdict, '2 of 3 risks sit in severe; worst: “Big slip”.');
});

test('stakeholders: high-power without attitude flagged', () => {
  const {ro} = run('preset: stakeholders\nCFO @ 30,85\nFan @ 80,80 :: attitude: champion');
  assert.equal(ro.flagged.length, 1);
  assert.equal(ro.flagged[0].item.label, 'CFO');
  assert.equal(ro.verdict, '1 stakeholder to manage closely; 1 high-power without an attitude read.');
});

test('futures: worlds counted', () => {
  const {ro} = run('preset: futures\nS1 @ 20,80\nS2 @ 80,80\nS3 @ 81,79');
  assert.equal(ro.verdict, '3 signals across 2 of 4 worlds.');
});

test('generic verdict for custom mode; unzoned counted when occupied', () => {
  const {ro} = run('x: A\ny: B\nzone hot: x > 50\nP @ 80,50\nQ @ 81,50\nR @ 20,20');
  assert.equal(ro.verdict, '2 of 3 items sit in hot.');
  const un = ro.zones.find(e => e.zone.kind === 'unzoned');
  assert.equal(un.items.length, 1);
});

test('empty map gets the nothing-placed verdict', () => {
  const {ro} = run('preset: assumptions\nOnly unplaced');
  assert.equal(ro.verdict, 'Nothing placed yet — drag assumptions onto the map.');
});

test('anonymous cells appear only when occupied; named zones always listed', () => {
  const {ro} = run('zones: grid 2x2\nzone 1,2: Quick wins\nP @ 80,20');
  const names = ro.zones.map(e => e.zone.name);
  assert.ok(names.includes('Quick wins'));       // named, empty → still listed
  assert.ok(names.includes('2,1'));              // anonymous, occupied
  assert.ok(!names.includes('1,1'));             // anonymous, empty → hidden
});

test('markdown export: method, axes, verdict, exact placement, zones, fields, and flags', () => {
  const {m, ro} = run('preset: assumptions\ntitle: Lantern bets\nA @ 20,80\nB');
  const md = toMarkdown(ro, m);
  assert.ok(md.startsWith('## Lantern bets'));
  assert.match(md, /\*\*Method:\*\* assumptions/);
  assert.match(md, /\*\*X axis:\*\* Evidence \(none → strong\)/);
  assert.match(md, /\*\*Y axis:\*\* Importance \(low → high\)/);
  assert.match(md, /\*\*Verdict:\*\* 1 of 1 assumption sit in test first/);
  assert.match(md, /- \*\*A\*\* — @ 20,80\n  - Zone: test first\n  - Fields: none\n  - Flag: no test designed/);
  assert.match(md, /- \*\*B\*\* — unplaced\n  - Zone: unplaced/);
  assert.match(md, /_Source: local Map source snapshot\._\n$/);
});

test('markdown export treats hostile authored and comparison text as literals', () => {
  const {m, ro} = run('preset: assumptions\ntitle: Safe\nClaim @ 20,80 :: note: value');
  const item = m.items[0];
  m.title = '# Title * [link](https://bad.test) <script> & end';
  item.label = 'Item * [link](https://bad.test) <img>';
  item.fields = [{key:'note_*', val:'[field](https://bad.test) | <tag>', srcLine:item.srcLine}];
  ro.axes.x = {label:'X * <axis>', low:'[low]', high:'high | end'};
  ro.zones.find(entry => entry.items.includes(item)).zone.name = 'Zone * [link](bad)';
  ro.flagged = [{item, msg:'Flag * [link](bad) <b>'}];
  const baseline = parse('preset: assumptions\nEarlier @ 30,70');
  baseline.items[0].label = 'Dropped [link](bad) <i>';
  const md = toMarkdown(ro, m, {
    comparison: {model: baseline, label:'# Prior * [link](https://bad.test) <frame>'},
  });
  assert.doesNotMatch(md, /<script>|<img>|<tag>|<frame>|\[link\]\(/);
  assert.match(md, /## # Title \\\*/);
  assert.match(md, /\\\[link\\\]\(https:\/\/bad\.test\)/);
  assert.match(md, /&lt;script&gt; &amp; end/);
  assert.match(md, /\*\*X axis:\*\* X \\\* &lt;axis&gt; \(\\\[low\\\] → high \\\| end\)/);
  assert.match(md, /Zone \\\* \\\[link\\\]\(bad\)/);
  assert.match(md, /### Comparison with # Prior \\\*/);
});

/* ---------- Swiss 6b: the verdict figure + the metrics counts ---------- */

test('verdictFig is the load-bearing ratio, verbatim inside the verdict', () => {
  const {ro} = run('preset: assumptions\nA @ 20,80\nB @ 30,90\nC @ 80,20\nD');
  assert.equal(ro.verdict, '2 of 3 assumptions sit in test first; 2 have no test designed.');
  assert.equal(ro.verdictFig, '2 of 3');
  assert.ok(ro.verdict.includes(ro.verdictFig));
});

test('an empty map names no figure (nothing to mark)', () => {
  const {ro} = run('preset: assumptions\nOnly unplaced');
  assert.equal(ro.verdictFig, '');
});

test('counts are the metrics row: placed of total, zones occupied, flagged', () => {
  const {ro} = run('preset: assumptions\nA @ 20,80\nB @ 30,90\nC @ 80,20\nD');
  assert.deepEqual(ro.counts, ['3 of 4 placed', '2 zones occupied', '2 flagged']);
});

test('counts drop the flagged segment when nothing is flagged, and stay singular at one', () => {
  const {ro} = run('preset: assumptions\nA @ 80,20 :: test: data pull');
  assert.deepEqual(ro.counts, ['1 of 1 placed', '1 zone occupied', '']);
});

test('a custom (presetless) map still gets a figure', () => {
  const {ro} = run('x: Value\ny: Effort\nzones: grid 2x2\nzone 2,2: Big bets\nA @ 80,80\nB @ 70,90');
  assert.equal(ro.verdictFig, '2 of 2');
  assert.ok(ro.verdict.includes('2 of 2'));
});
