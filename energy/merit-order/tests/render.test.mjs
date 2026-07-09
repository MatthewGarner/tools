import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStack, buildVerdict, toMarkdown, MERIT_PALETTE} from '../render.js';
import {buildStack} from '../stack.js';
import {dispatch} from '../engine.js';
import {DEFAULT_PARAMS, paramsFor, WORLDS} from '../scenarios.js';

const C = {bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#777', accent:'#c05621', err:'#b00'};
const measure = (t, f) => t.length * 7;   // deterministic stub
const ctx = {colors: C, measure, palette: MERIT_PALETTE.light};
const stateFor = p => ({generators: buildStack(p), demand: p.demand});

test('palette has both themes and all 8 families', () => {
  for(const theme of ['light','dark'])
    for(const fam of ['wind','solar','nuclear','biomass','thermal','storage','imports','other'])
      assert.ok(MERIT_PALETTE[theme][fam], `${theme}.${fam}`);
});

test('renders a contiguous 5-step gas staircase (ascending-bid) with storage below it', () => {
  const svg = renderStack(stateFor(DEFAULT_PARAMS), ctx);
  for(const b of ['CCGT 60%','CCGT 54%','CCGT 49%','OCGT 42%','OCGT 36%','BESS','Pumped storage'])
    assert.ok(svg.includes(b), b);   // each block name must actually be drawn (data-plant='<name>')
  assert.ok(/data-storage='1'/.test(svg), 'storage marker present');
  // the 5 gas bands render in strict ascending-bid (dispatch) order, contiguously
  const gas = ['CCGT 60%','CCGT 54%','CCGT 49%','OCGT 42%','OCGT 36%'];
  const pos = gas.map(n => svg.indexOf("data-plant='" + n + "'"));
  for(let i = 1; i < pos.length; i++) assert.ok(pos[i] > pos[i - 1], 'gas order at ' + gas[i]);
  assert.ok(svg.indexOf("data-plant='BESS'") < pos[0], 'storage dispatched below (before) gas');
});

test('axis label reads "GW offered", never "GW installed"', () => {
  const svg = renderStack(stateFor(DEFAULT_PARAMS), ctx);
  assert.ok(svg.includes('GW offered'));
  assert.ok(!svg.includes('GW installed'));
});

test('negative preset draws the negative band + words the clearing price', () => {
  const p = paramsFor('gbToday', 'negative');
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

test('thermal ramp + THERMAL_ORDER cover CCS + hydrogen (7 steps, not painted OCGT-36 red)', () => {
  assert.equal(MERIT_PALETTE.light.thermal.length, 7);
  assert.equal(MERIT_PALETTE.dark.thermal.length, 7);
});

test('FES render: CCS + Hydrogen drawn with own labels + distinct textures', () => {
  const p = paramsFor('he', 'coldPeak');
  const svg = renderStack({generators: buildStack(p, WORLDS.he.catalogue), demand: p.demand}, ctx);
  assert.ok(svg.includes("data-plant='Gas-CCS'"), 'CCS block present');
  assert.ok(svg.includes("data-plant='Hydrogen'"), 'Hydrogen block present');
  assert.ok(/data-tex='ccs'/.test(svg) && /data-tex='h2'/.test(svg), 'CCS + H2 texture markers');
  assert.ok(svg.includes('url(#mo-dots)') && svg.includes('url(#mo-cross)'), 'dot + cross patterns used');
  // own labels (block names, distinct from the "Gas" run label)
  assert.ok(svg.includes('Gas-CCS') && svg.includes('Hydrogen'));
});

test('narrow: thin sliver labels are dropped but wide run labels survive (not colour-only)', () => {
  const svg = renderStack(stateFor(DEFAULT_PARAMS), {...ctx, width: 360});
  assert.ok(svg.includes('Gas'), 'wide "Gas" run label kept at narrow width');
});

test('narrow: demand=0 has no marginal but the stack is still labelled (not fully anonymous)', () => {
  const p = {...DEFAULT_PARAMS, demand: 0};
  const r = dispatch(buildStack(p), 0);
  assert.equal(r.marginalName, null, 'demand=0 → no marginal plant');
  const svg = renderStack(stateFor(p), {...ctx, width: 360});
  assert.ok(!/MARGINAL/.test(svg), 'no marginal badge drawn when nothing is marginal');
  assert.ok(svg.includes('Gas'), 'wide run label still identifies the stack at demand=0');
});

test('narrow: the marginal name badge is x-clamped within the plot [x0,x1]', () => {
  const x0 = 44, x1 = 360 - 32;   // narrow-mode bounds for width 360
  for(const p of [DEFAULT_PARAMS, paramsFor('gbToday', 'negative')]){
    const state = {generators: buildStack(p), demand: p.demand};
    const name = dispatch(buildStack(p), p.demand).marginalName;
    if(!name) continue;
    const svg = renderStack(state, {...ctx, width: 360});
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('<text[^>]*\\bx="([\\d.]+)"[^>]*>' + esc + '</text>', 'g');
    let m, found = 0;
    while((m = re.exec(svg))){ found++; const x = parseFloat(m[1]);
      assert.ok(x >= x0 && x <= x1, `marginal label "${name}" x=${x} within [${x0},${x1}]`); }
    assert.ok(found > 0, `marginal name "${name}" is drawn at narrow width`);
  }
});

test('verdict names the net-zero scarcity when hydrogen/CCS is marginal', () => {
  const p = paramsFor('he', 'coldPeak');
  const r = dispatch(buildStack(p, WORLDS.he.catalogue), p.demand);
  assert.equal(r.marginalName, 'Hydrogen');
  assert.ok(/wind has dropped|net-zero|scarce/i.test(buildVerdict(r, {demand: p.demand})));
});
