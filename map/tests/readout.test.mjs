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

test('markdown export: title, verdict, per-zone lists, unplaced, flags', () => {
  const {m, ro} = run('preset: assumptions\ntitle: Habitat bets\nA @ 20,80\nB');
  const md = toMarkdown(ro, m);
  assert.ok(md.startsWith('## Habitat bets'));
  assert.ok(md.includes('**test first** (1)'));
  assert.ok(md.includes('- A'));
  assert.ok(md.includes('**Unplaced** (1)'));
  assert.ok(md.includes('**Flags**'));
});
