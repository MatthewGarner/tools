/* "Replay the maths" — the Galton pour. Canvas overlay animation + the pure, tested
   verdict. The pour pours the traceDraws grains from the all-medians spout through the
   ranked-driver rows into the existing histogram ("the pile IS the histogram"), then
   leaves a quotable verdict. Canvas + a DOM verdict — no SVG (not a render*.js file). */

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };

/* Which ranked row widens the pile most (IQR of its cumulative column), or the
   flat-model fallback. Widenings telescope (Σ === totalIqr), so "flat" is measured
   top-vs-RUNNER-UP, never top-vs-total (which can't fire for ≤3 rows). */
export function pourVerdict(trace, {names}){
  const {order, draws} = trace;
  if(!draws.length) return {text: '', topName: null};
  const iqrAt = i => { const col = draws.map(d => d.steps[i]); return q(col, .75) - q(col, .25); };
  const prev = i => i === 0 ? 0 : iqrAt(i - 1);        // the spout column is all-at-base → IQR 0 (honest)
  const widen = order.map((n, i) => ({n, w: iqrAt(i) - prev(i)}));
  const totalIqr = iqrAt(order.length - 1) || 1;
  const [t1, t2] = widen.slice().sort((a, b) => b.w - a.w);
  const nm = n => (names[n] || n).replace(/_/g, ' ');
  if(!t2 || (t1.w - t2.w) / totalIqr < 0.15)
    return {text: 'No single input dominates — the spread is shared across the drivers.', topName: null};
  return {text: 'Most of the spread is born at ' + nm(t1.n) + ' — the pile widens most as it crosses that row.', topName: t1.n};
}
