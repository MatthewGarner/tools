// Timing of simulateCashflow at the page's own run count (CF_N from fermi/seeds.js): median of 5 runs per case.
// Run: node dev/engine-audit/fermi/timing.mjs [n]   (n overrides CF_N, e.g. to time the old 10,000 against a new 40,000)
import {simulateCashflow} from '../../../fermi/cashflow.js';
import {CF_SEED, CF_N} from '../../../fermi/seeds.js';

const R = (lo, hi) => ({lo, hi});
const n = Number(process.argv[2]) || CF_N;
const invest = {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)], horizon: 5, grain: 'year', rate: R(8, 12)};
const runway = {periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 24, grain: 'month', rate: R(0, 0)};
const gearedPeriods = [R(-7.2e6, -6.8e6), ...Array(15).fill(R(880e3, 1.35e6))];
const debt = {dscr: 1.45, costOfDebt: 0.065, tenor: 9, sizingCase: 'central'};
const geared = {periods: gearedPeriods, horizon: 15, grain: 'year', rate: R(9, 11), debt};
const cases = [
  ['example: New feature investment (h5)', invest],
  ['example: Runway (h24, monthly)', runway],
  ['example: Geared build (h15, debt)', geared],
  ['horizon 20 (invest ranges)', {...invest, horizon: 20}],
  ['horizon 60 (invest ranges)', {...invest, horizon: 60}],
  ['horizon 20 with debt (geared ranges)', {...geared, periods: [gearedPeriods[0], ...Array(19).fill(R(880e3, 1.35e6))], horizon: 20}],
];
const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('n = ' + n.toLocaleString('en-GB'));
for(const [name, spec] of cases){
  simulateCashflow(spec, {seed: CF_SEED, n});                       // warm-up, not counted
  const ms = [];
  for(let i = 0; i < 5; i++){ const t = performance.now(); simulateCashflow(spec, {seed: CF_SEED, n}); ms.push(performance.now() - t); }
  console.log(name.padEnd(42) + String(Math.round(median(ms))).padStart(6) + ' ms');
}
