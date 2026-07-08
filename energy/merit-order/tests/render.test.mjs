import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStack, buildVerdict, toMarkdown, MERIT_PALETTE} from '../render.js';
import {buildStack} from '../stack.js';
import {dispatch} from '../engine.js';
import {DEFAULT_PARAMS, paramsFor} from '../scenarios.js';

const C = {bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#777', accent:'#c05621', err:'#b00'};
const measure = (t, f) => t.length * 7;   // deterministic stub
const ctx = {colors: C, measure, palette: MERIT_PALETTE.light};
const stateFor = p => ({generators: buildStack(p), demand: p.demand});

test('palette has both themes and all 8 families', () => {
  for(const theme of ['light','dark'])
    for(const fam of ['wind','solar','nuclear','biomass','thermal','storage','imports','other'])
      assert.ok(MERIT_PALETTE[theme][fam], `${theme}.${fam}`);
});

test('renders a contiguous 5-step gas staircase and a storage block', () => {
  const svg = renderStack(stateFor(DEFAULT_PARAMS), ctx);
  for(const b of ['CCGT 60%','CCGT 54%','CCGT 49%','OCGT 42%','OCGT 36%','BESS','Pumped storage'])
    assert.ok(svg.includes(b), b);   // each block name must actually be drawn (data-plant='<name>')
  assert.ok(/data-storage='1'/.test(svg), 'storage marker present');
});

test('axis label reads "GW offered", never "GW installed"', () => {
  const svg = renderStack(stateFor(DEFAULT_PARAMS), ctx);
  assert.ok(svg.includes('GW offered'));
  assert.ok(!svg.includes('GW installed'));
});

test('negative preset draws the negative band + words the clearing price', () => {
  const p = paramsFor('negative');
  const svg = renderStack({generators: buildStack(p), demand: p.demand}, ctx);
  assert.ok(svg.includes('negative-band'));
  assert.ok(/paying to generate/i.test(svg));
});

test('family-RUN labels appear in-place (not colour-only)', () => {
  const svg = renderStack(stateFor(DEFAULT_PARAMS), ctx);
  // only 'Gas' and 'Storage' are run labels distinct from any block name — so these
  // assertions prove a label was drawn, not merely that a block exists.
  for(const label of ['Gas','Storage'])
    assert.ok(svg.includes(label), label);
});

test('buildVerdict names the marginal plant + price; toMarkdown carries the table + URL', () => {
  const r = dispatch(buildStack(DEFAULT_PARAMS), DEFAULT_PARAMS.demand);
  const v = buildVerdict(r, stateFor(DEFAULT_PARAMS));
  assert.ok(v.includes('CCGT 60%') && v.includes('83'));
  const md = toMarkdown(stateFor(DEFAULT_PARAMS), r);
  assert.ok(md.includes('| Plant |') && md.includes('energy.matthewgarner.me/merit-order'));
});

test('storage dispatched inframarginal → verdict names the arbitrage spread', () => {
  const r = dispatch(buildStack(DEFAULT_PARAMS), DEFAULT_PARAMS.demand);
  const v = buildVerdict(r, stateFor(DEFAULT_PARAMS));
  assert.ok(/arbitrage spread/i.test(v));
});
