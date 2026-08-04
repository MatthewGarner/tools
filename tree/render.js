/* Public Tree render API. The verdict stays here because the editor, exports
   and renderer all need the identical authored/derived decision sentence. */
import {fmt} from '../assets/series.js';
import {resolveVerdict} from '../assets/verdict.js';
import {renderDensity} from './render-density.js';

export const TOKENS = {slideScale: 1.35};

export function treeVerdictParts(model, results){
  const none = {line: '', fig: ''};
  if(!model.root || model.root.kind !== 'decision') return resolveVerdict(model.verdict, none);
  const rec = results.policy.get(model.root);
  const st = results.stats.get(model.root);
  if(!rec || !st) return resolveVerdict(model.verdict, none);
  const cur = model.currency || '£';
  const money = value => (value < 0 ? '−' : '') + cur + fmt(Math.abs(value));
  const fig = money(st.mean);
  return resolveVerdict(model.verdict, {line: 'Choose ' + rec.label + ' — expected value ' + fig, fig});
}

export function render(model, results, ctx){
  return renderDensity(model, results, ctx, treeVerdictParts);
}
