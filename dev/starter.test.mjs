/* Every tool's "Start your own" skeleton, checked against that tool's REAL model.
   A starter is the on-ramp: if it warns, the first thing a new model does is scold you.
   Adding a tool to DSL_STARTERS / SHAPE_STARTERS is what wires it into this gate — a
   starter.js on disk that nobody lists here fails the coverage assertion below, so the
   invariant is self-enforcing rather than memory-enforced. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';

/* text DSLs: the starter is a string, gated by parsing it through the tool's parse.js */
const DSL_STARTERS = ['bets', 'case', 'gauge', 'map', 'paths', 'proxy', 'roadmap',
  'timeline', 'tree', 'wardley', 'why', 'energy/cycles', 'energy/risk'];

/* rank has no text DSL — its model is a scored item grid, so the starter is that shape */
const SHAPE_STARTERS = ['rank'];

/* Tools with a chip row but nothing to seed — their "start your own" is a different
   affordance that already exists, so they carry no starter:
     fermi     — the formula field is directly editable, so you type over it
     premortem — a "＋ New premortem" button
     duel      — "New line-up" plus a placeholder textarea */
const NO_STARTER = new Set(['fermi', 'premortem', 'duel', 'alarm', 'flow',
  'signal-vs-noise', 'home']);

for(const tool of DSL_STARTERS){
  test(`${tool}: the starter parses with no warnings`, async () => {
    const {STARTER} = await import(`../${tool}/starter.js`);
    const {parse} = await import(`../${tool}/parse.js`);
    assert.ok(STARTER.trim().length > 0, 'starter is not empty');
    const model = parse(STARTER);
    assert.deepEqual(model.warnings ?? [], [],
      `${tool} starter warns:\n${(model.warnings ?? []).join('\n')}`);
  });
}

/* iterated, not hardcoded to rank: a second entry in SHAPE_STARTERS would otherwise pass
   the existence-only coverage check while getting zero content validation. */
for(const tool of SHAPE_STARTERS){
test(`${tool}: the starter is a scorable grid that the weights can actually re-sort`, async () => {
  const {STARTER} = await import(`../${tool}/starter.js`);
  assert.ok(STARTER.items.length >= 3, 'at least three initiatives');
  assert.ok(Number.isInteger(STARTER.k) && STARTER.k >= 1 && STARTER.k < STARTER.items.length,
    'capacity picks some but not all');
  for(const [name, ...scores] of STARTER.items){
    assert.ok(name.trim().length > 0, 'every initiative is named');
    assert.equal(scores.length, 4, 'three criteria plus effort');
    for(const s of scores) assert.ok(Number.isInteger(s) && s >= 1 && s <= 10, `score ${s} in 1..10`);
  }
  /* identical rows never re-sort, so a flat skeleton would hide the mechanism */
  const cols = [0, 1, 2, 3].map(i => new Set(STARTER.items.map(r => r[i + 1])));
  assert.ok(cols.some(c => c.size > 1), 'scores vary across initiatives');
});
}

test('every starter.js on disk is covered by this gate', () => {
  const listed = [...DSL_STARTERS, ...SHAPE_STARTERS];
  const dirs = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(d => `energy/${d}`)];
  const onDisk = dirs.filter(d => existsSync(new URL(`../${d}/starter.js`, import.meta.url)));
  assert.deepEqual(onDisk.sort(), listed.sort(),
    'a starter.js exists that the gate does not list (or vice versa)');
});

test('no listed tool is also marked as having no starter', () => {
  const listed = [...DSL_STARTERS, ...SHAPE_STARTERS];
  assert.deepEqual(listed.filter(t => NO_STARTER.has(t)), []);
});
