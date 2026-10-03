import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {renderPoster} from '../../dev/generate-embed-poster.mjs';
import {simulate} from '../v1/flow/model/engine.js';
import {DEFAULT_PARAMS} from '../v1/flow/state.js';

const example = params => ({tool:'flow', version:1, view:'waiting-time', params:{...DEFAULT_PARAMS, ...params}, seed:61709, controls:[]});

test('a non-default poster describes and marks its actual starting model', () => {
  const input = example({demandPerWeek:2, team:3, itemDays:5, wipLimit:3, cov:'high'});
  const {svg, alt, summary} = renderPoster(input);
  const expectedWait = Number(simulate(input.params).waitDays.toFixed(1));
  assert.ok(summary.startsWith(expectedWait + ' working day'));
  assert.match(summary, /at 2 items\/week/);
  assert.match(svg, /data-selected-demand="2" cx="192"/);
  assert.match(svg, /data-capacity="3"/);
  assert.match(alt, /3 people, average item 5 days, WIP 3, high variability/);
  assert.doesNotMatch(svg, /NaN|Infinity|at 8 items\/week/);
});

test('unstable starting demand is never labelled with a steady waiting estimate', () => {
  const {svg, summary, alt} = renderPoster(example({demandPerWeek:8, team:2}));
  assert.equal(summary, 'No stable waiting time at 8 items/week.');
  assert.match(alt, /Capacity: 5 items\/week/);
  assert.match(svg, /<line data-selected-demand="8"/);
  assert.match(svg, /data-wait-curve="true"/);
  assert.doesNotMatch(summary, /working days? waiting/);
});

test('capacity above the range has no false threshold; no stable points has no false curve', () => {
  const roomy = renderPoster(example({team:10, wipLimit:10, itemDays:1}));
  assert.match(roomy.alt, /Capacity: 50 items\/week \(above the plotted range\)/);
  assert.doesNotMatch(roomy.svg, /data-capacity=/);
  const overloaded = renderPoster(example({team:1, wipLimit:1, itemDays:15}));
  assert.match(overloaded.svg, /No stable demand in the plotted range/);
  assert.doesNotMatch(overloaded.svg, /data-wait-curve|NaN|Infinity|<circle/);
  assert.match(overloaded.summary, /^No stable waiting time/);
});

test('unsupported manifests and model values fail before producing a poster', () => {
  for(const input of [null, {}, {...example({}), tool:'rank'}, {...example({}), version:2},
    {...example({}), view:'lead-time'}, example({team:0}), {...example({}), seed:123}, {...example({}), controls:['team']}])
    assert.throws(() => renderPoster(input));
});

test('CLI reads a website manifest and preserves output when its input is invalid', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flow-poster-'));
  const manifest = join(directory, 'example.json'), output = join(directory, 'poster.svg');
  const script = new URL('../../dev/generate-embed-poster.mjs', import.meta.url);
  const run = args => spawnSync(process.execPath, [script.pathname, ...args], {encoding:'utf8'});
  try {
    writeFileSync(manifest, JSON.stringify({...example({demandPerWeek:3}), title:'Example', alt:'To be generated', image:'/images/example.svg'}));
    const generated = run(['--example', manifest, '--output', output]);
    assert.equal(generated.status, 0, generated.stderr);
    const valid = readFileSync(output, 'utf8');
    assert.match(valid, /data-selected-demand="3"/);
    assert.match(generated.stdout, /Suggested alt:/);
    assert.match(generated.stdout, /Suggested summary:/);
    writeFileSync(manifest, JSON.stringify({...example({}), tool:'tree'}));
    const refused = run(['--example', manifest, '--output', output]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /supports tool flow/);
    assert.equal(readFileSync(output, 'utf8'), valid);
    assert.notEqual(run(['--example', manifest]).status, 0);
  } finally { rmSync(directory, {recursive:true, force:true}); }
});
