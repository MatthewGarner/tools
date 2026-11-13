/* Engine audit 2026-11-12 fixes (Merit Order): F-MO-1..9. Each test names its finding. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../render.js';
import {buildStack, applyAdv} from '../stack.js';
import * as ST from '../stack.js';
import {dispatch} from '../engine.js';
import * as SC from '../scenarios.js';
import {WORLDS, DEFAULT_PARAMS, CONDITIONS, paramsFor} from '../scenarios.js';
import {encodeStateV2, decodeStateV2} from '../state.js';

const G = (name, capacity, cost, extra = {}) => ({name, capacity, cost, carbon: 0, mustRun: false, ...extra});

test('F-MO-1: rent is £k an hour — Markdown row and callout say so', () => {
  const gens = [G('A', 10, 10), G('B', 10, 30)];
  const r = dispatch(gens, 15);
  const md = R.toMarkdown({generators: gens, demand: 15}, r);
  assert.match(md, /\| A \| 10 \| 10 \| 0 \| £200k\/h \|/);
  assert.doesNotMatch(md, /Rent £\/h/);
  const line = R.calloutMath(gens[0], r.perPlant.A, null);
  assert.match(line, /rent £200k\/h/);
  assert.equal(R.fmtRent(6797.4), '£6,797k/h');
  assert.equal(R.fmtRent(0), '£0k/h');
  assert.equal(R.fmtRent(0.3), '<£1k/h');
});

test('F-MO-2: an edit pins only what was edited', () => {
  const W = WORLDS.gbToday, p = {...W.params};
  const name = 'CCGT 60%';
  let adv = ST.editAdv({}, name, 'capacity', 12);
  const hot = {...p, gas: 250};
  const fresh = buildStack(hot, W.catalogue).find(g => g.name === name);
  const live = applyAdv(buildStack(hot, W.catalogue), adv).find(g => g.name === name);
  assert.equal(live.capacity, 12, 'the pinned capacity stays as typed');
  assert.equal(live.cost, fresh.cost, 'the bid still follows the gas slider');
  adv = ST.editAdv({}, 'Wind', 'cost', 15);
  const w = applyAdv(buildStack({...p, wind: 0.8}, W.catalogue), adv).find(g => g.name === 'Wind');
  assert.equal(w.cost, 15, 'the pinned bid stays');
  assert.ok(Math.abs(w.capacity - 32 * 0.8) < 1e-9, 'the capacity still follows the wind slider');
  assert.deepEqual(ST.editAdv(ST.editAdv({}, name, 'capacity', 12), name, 'cost', 90)[name], [12, 90]);
  assert.deepEqual(applyAdv([G('X', 5, 7)], {X: [3, 9]})[0], G('X', 3, 9), 'a legacy [cap, cost] pair still pins both');
});

test('F-MO-3: "the wind has dropped" only when it has', () => {
  const W = WORLDS.ht, p = {...W.params, demand: 74, wind: 0.5, gas: 20, carbon: 100, solar: 0};
  const r = dispatch(buildStack(p, W.catalogue), p.demand);
  assert.equal(r.marginalName, 'Gas-CCS');
  const v = R.buildVerdict(r, {demand: p.demand, wind: p.wind});
  assert.doesNotMatch(v, /wind has dropped/);
  assert.match(v, /Demand has outrun the cheaper plant, so Gas-CCS/);
  const cold = paramsFor('ht', 'coldPeak');
  const rc = dispatch(buildStack(cold, W.catalogue), cold.demand);
  assert.match(R.buildVerdict(rc, {demand: cold.demand, wind: cold.wind}), /The wind has dropped/);
});

test('F-MO-4: a shortfall under 0.1 GW is printed in MW, never as 0 GW', () => {
  const W = WORLDS.ht, p = {...W.params, demand: 70, wind: 0.05, gas: 20, carbon: 20, solar: 0};
  const r = dispatch(buildStack(p, W.catalogue), p.demand);
  assert.ok(r.unmet > 0.04 && r.unmet < 0.06);
  const v = R.buildVerdict(r, {demand: p.demand, wind: p.wind});
  assert.doesNotMatch(v, /\b0 GW/);
  assert.match(v, /50 MW/);
});

test('F-MO-5: unmet demand has no clearing price — the verdict names the last offer and the shortfall', () => {
  const gens = [G('A', 10, 10), G('B', 10, 30), G('C', 10, 80)];
  const r = dispatch(gens, 35);
  const st = {generators: gens, demand: 35};
  const v = R.buildVerdict(r, st);
  assert.doesNotMatch(v, /clears at/);
  assert.match(v, /^No price clears: 35 GW of demand is more than the 30 GW offered\. The last offer is C at £80\/MWh, and 5 GW goes unmet\./);
  assert.equal(R.buildVerdictParts(r, st).fig, '', 'no clearing price, so no key figure');
  assert.doesNotMatch(R.toMarkdown(st, r), /Clears at £80/);
  assert.match(R.outcomeLine(r, st), /^No price clears · last offer C at £80\/MWh · 5 GW unmet/);
});

test('F-MO-6: a condition that leaves the price unchanged says why', () => {
  const n = SC.conditionNote('ht', 'gasSpike');
  assert.equal(n, 'Gas spike changes nothing in this world: gas is not setting the price — Nuclear is (£5/MWh).');
  assert.equal(SC.conditionNote('gbToday', 'gasSpike'), '', 'gas sets the price in GB today, so it moves');
  assert.equal(SC.conditionNote('gbToday', 'coldPeak'), '');
  assert.equal(SC.conditionNote('ht', null), '');
});

test('F-MO-7: hash params — bad values take the default, numbers clamp to the control', () => {
  const d = decodeStateV2({v: 2, params: {demand: 'abc', wind: -5, gas: 1e9, carbon: null, solar: '', mustRunOn: 'yes', imports: [1], storageAvail: 7, bogus: 1, demandMax: 5, mustRunDepth: '30'}, adv: {CCGT: [null, 'x'], Wind: [999, -999], junk: 5}});
  assert.equal('demand' in d.params, false, 'non-numeric demand is dropped, so the world default applies');
  assert.equal(d.params.wind, 0);
  assert.equal(d.params.gas, 300);
  assert.equal('carbon' in d.params, false);
  assert.equal('solar' in d.params, false);
  assert.equal('mustRunOn' in d.params, false);
  assert.equal('imports' in d.params, false);
  assert.equal(d.params.storageAvail, 1);
  assert.equal(d.params.mustRunDepth, 30);
  assert.equal('bogus' in d.params, false);
  assert.equal('demandMax' in d.params, false, 'world constants cannot be set from a link');
  assert.deepEqual(d.adv, {Wind: [90, -200]});
  assert.equal(decodeStateV2({v: 2, w: 'fb', params: {demand: 1e6}}).params.demand, WORLDS.fb.params.demandMax, 'demand clamps to the world ceiling');
});

test('F-MO-8: every printed GW figure goes through the formatter', () => {
  const gens = [G('A', 13.360000000000001, 10)];
  const st = {generators: gens, demand: 13.360000000000001};
  const r = dispatch(gens, st.demand);
  assert.doesNotMatch(R.outcomeLine(r, st), /\d\.\d{3,}/);
  assert.match(R.outcomeLine(r, st), /demand 13\.4 GW/);
  const lines = R.receiptLines(st, {worldLabel: 'GB today', gas: 100, carbon: 50});
  assert.ok(lines.every(l => !/\d\.\d{3,}/.test(l)), lines.join(' | '));
  assert.match(lines[0], /demand 13\.4 GW/);
});

test('F-MO-9: the cold-peak imports value is documented for what it is', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../scenarios.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /pins imports\s+LOW/);
  assert.equal(CONDITIONS.coldPeak.mutate.imports, 5, 'ruling: keep 5 GW');
  assert.ok(CONDITIONS.coldPeak.mutate.imports > DEFAULT_PARAMS.imports);
});

/* Second ruling: when demand is unmet no price clears, so there is no rent either. */
test('F-MO-5b: unmet demand shows no rent — shading, legend, sentences, callout and Markdown cell', () => {
  const gens = [G('A', 10, 10), G('B', 10, 30, {storage: true}), G('C', 10, 80)];
  const st = {generators: gens, demand: 35};
  const r = dispatch(gens, 35);
  assert.ok(r.unmet > 0 && r.totalRent > 0, 'the engine still computes rent at the last offer');
  const v = R.buildVerdict(r, st);
  assert.doesNotMatch(v, /Shaded plants earn/);
  assert.doesNotMatch(v, /shaded rent/);
  const ctx = {colors: {bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#777', accent:'#c05621', err:'#b00'}, measure: t => t.length * 7, palette: R.MERIT_PALETTE.light};
  const svg = R.renderStack(st, ctx);
  assert.doesNotMatch(svg, /class='rent'/, 'no rent overlay');
  assert.doesNotMatch(svg, /earns above running cost/, 'no rent legend');
  assert.match(R.calloutMath(gens[0], r.perPlant.A, null, false), /no price clears$/);
  assert.doesNotMatch(R.calloutMath(gens[0], r.perPlant.A, null, false), /rent|k\/h/);
  const md = R.toMarkdown(st, r);
  assert.match(md, /\| A \| 10 \| 10 \| 0 \| no price clears \|/);
  assert.doesNotMatch(md, /k\/h/);
});

test('F-MO-5b: a met demand still shows rent exactly as before', () => {
  const gens = [G('A', 10, 10), G('B', 10, 30)];
  const r = dispatch(gens, 15), st = {generators: gens, demand: 15};
  assert.match(R.buildVerdict(r, st), /Shaded plants earn/);
  assert.match(R.renderStack(st, {colors: {bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#777', accent:'#c05621', err:'#b00'}, measure: t => t.length * 7, palette: R.MERIT_PALETTE.light}), /class='rent'/);
  assert.match(R.calloutMath(gens[0], r.perPlant.A, null, true), /rent £200k\/h/);
});
