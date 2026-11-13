/* What Fermi says about its results: pure sentence and format helpers, no DOM, no random
   stream. app.js and the renderers import these so every surface prints a figure the
   same way and the sentences can be tested in node. */
import {fmt, sig, ratioStr, effDist} from './engine.js';

/* a whole-number share: never "0%" or "100%" for a value that is neither */
export function pctWhole(p){
  if(!(p > 0)) return '0%';
  if(p >= 1) return '100%';
  const r = Math.round(p * 100);
  return r === 0 ? '<1%' : r === 100 ? '>99%' : r + '%';
}
/* IRR, wherever it appears: one decimal place */
export const pctOne = v => v == null ? '—' : (v < 0 ? '−' : '') + (Math.abs(v) * 100).toFixed(1) + '%';

/* the shape a range is really sampled with, in words */
export function shapeLabel(dist, lo){
  const d = effDist(dist, lo);
  if(dist === 'logn' && d !== 'logn') return 'normal (log-normal needs a range above zero)';
  return d === 'logn' ? 'log-normal' : d === 'uni' ? 'uniform (full range)' : 'normal';
}

/* a solved stretch: two figures, and a factor below 1 is a shrink */
export function stretchLabel(r){
  if(r.kind !== 'mult') return 'shifted ' + (r.delta >= 0 ? '+' : '−') + fmt(Math.abs(r.delta));
  const f = r.factor;
  const text = f >= 2 ? sig(f, 2)
    : f > 1 ? ratioStr(f)
    : f > 0.5 && f < 1 ? String(Number((1 - Number((1 - f).toPrecision(2))).toFixed(12)))
    : sig(f, 2);
  return '×' + text + (f < 1 ? ' shrink' : ' stretch');
}
