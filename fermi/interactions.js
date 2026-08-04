/* Small, pure interaction rules shared by the cashflow DOM shell and its tests. */

export function effectiveHorizon(value, periodCount){
  const minimum = Math.max(1, Math.min(60, Number(periodCount) - 1));
  const parsed = Number.parseInt(value, 10);
  const requested = Number.isFinite(parsed) ? parsed : minimum;
  return Math.max(minimum, Math.min(60, requested));
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
