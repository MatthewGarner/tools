/* Small, pure interaction rules shared by the cashflow DOM shell and its tests. */
import {parseNum} from './engine.js';

export function effectiveHorizon(value, periodCount){
  const minimum = Math.max(1, Math.min(60, Number(periodCount) - 1));
  const parsed = Number.parseInt(value, 10);
  const requested = Number.isFinite(parsed) ? parsed : minimum;
  return Math.max(minimum, Math.min(60, requested));
}

// Cashflow amounts use Fermi's suffix grammar; percentage and ratio fields use
// the web form's decimal grammar. Keeping the two deliberately separate avoids
// treating a pasted amount such as 8k as an 8,000% discount rate.
export function parseCashflowScalar(value){
  return Number.parseFloat(String(value ?? '').trim());
}

export function normaliseCashflowRange(lower, upper, parser = parseNum){
  const a = parser(lower), b = parser(upper);
  return Number.isFinite(a) && Number.isFinite(b)
    ? {lo: Math.min(a, b), hi: Math.max(a, b)}
    : null;
}

export function parseCashflowTenor(value){
  const raw = String(value ?? '').trim();
  if(!raw) return {value: undefined, valid: true};
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 60
    ? {value: parsed, valid: true}
    : {value: undefined, valid: false};
}

// This is the scalar/range boundary used by the web cashflow form. Native
// Fermi projects the same source through it, rather than reinterpreting values
// with the broader amount grammar.
export function parseCashflowInputs({periods, horizon, grain, rateLower, rateUpper, debtEnabled = false, dscr, costOfDebt, tenor, sizingCase}){
  const rows = Array.isArray(periods) ? periods : [];
  const normalisedPeriods = rows.map(row => normaliseCashflowRange(row?.lo, row?.hi));
  const rate = normaliseCashflowRange(rateLower, rateUpper, parseCashflowScalar);
  const baseErrors = [];
  if(normalisedPeriods.some(range => !range)) baseErrors.push('Every cashflow period needs numeric lower and upper values.');
  if(!rate) baseErrors.push('Discount-rate bounds must be numeric percentages.');

  let debt;
  const debtErrors = [];
  if(debtEnabled) {
    const parsedDSCR = parseCashflowScalar(dscr);
    const parsedCostOfDebt = parseCashflowScalar(costOfDebt);
    const parsedTenor = parseCashflowTenor(tenor);
    if(!Number.isFinite(parsedDSCR) || !(parsedDSCR > 0)) debtErrors.push('DSCR must be a numeric value greater than zero.');
    if(!Number.isFinite(parsedCostOfDebt) || !(parsedCostOfDebt > -100)) debtErrors.push('Cost of debt must be a numeric percentage greater than −100%.');
    if(!parsedTenor.valid) debtErrors.push('Tenor must be a whole number from 1 to 60, or blank for the available operating life.');
    debt = {
      dscr: parsedDSCR,
      costOfDebt: parsedCostOfDebt / 100,
      tenor: parsedTenor.value,
      sizingCase: sizingCase === 'downside' ? 'downside' : 'central',
    };
  }

  const ready = !baseErrors.length && normalisedPeriods.length > 0 && rate;
  const debtError = debtErrors.join(' ');
  const spec = ready ? {periods: normalisedPeriods, horizon: effectiveHorizon(horizon, normalisedPeriods.length),
    grain: grain === 'month' ? 'month' : 'year', rate, debt: debtErrors.length ? undefined : debt} : null;
  if(spec && debtError) spec.debtError = debtError;
  return {
    periods: normalisedPeriods,
    rate,
    debt,
    horizon: effectiveHorizon(horizon, normalisedPeriods.length),
    baseErrors,
    debtErrors,
    errors: [...baseErrors, ...debtErrors],
    spec,
  };
}

export function cashflowHashState(cf, threshold = ''){
  const state = {m: 'cf', g: cf.grain, h: effectiveHorizon(cf.horizon, cf.periods.length),
    rl: cf.rlo, rh: cf.rhi, p: cf.periods.map(p => [p.lo, p.hi])};
  if(String(threshold).trim()) state.ct = String(threshold);
  if(cf.debtOn){
    state.d1 = 1; state.dscr = cf.dscr; state.rd = cf.rd; state.dcase = cf.sizingCase;
    if(cf.tenor) state.ten = cf.tenor;
  }
  return state;
}

export function cashflowTailNote(horizon, periodCount){
  const lastEntered = Math.max(0, periodCount - 1);
  return horizon > lastEntered
    ? `t${periodCount}…t${horizon} repeat the t${lastEntered} range`
    : 'Entered periods cover the full horizon';
}
